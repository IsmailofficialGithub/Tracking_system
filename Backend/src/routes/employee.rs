use crate::auth::AuthUser;
use crate::models::{Session, ShiftTemplate};
use crate::services::shift_rules::{evaluate_check_in_status, evaluate_check_out_status};
use crate::state::AppState;
use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use chrono::Utc;
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
pub struct CheckInResponse {
    pub session_id: Uuid,
}

#[derive(Serialize)]
pub struct MyShiftResponse {
    pub shift_template: ShiftTemplate,
}

#[derive(Serialize)]
pub struct CurrentSessionResponse {
    pub session_id: Uuid,
    pub status: String,
}

pub fn employee_routes() -> Router<AppState> {
    Router::new()
        .route("/check-in", post(check_in))
        .route("/check-out", post(check_out))
        .route("/pause", post(pause))
        .route("/resume", post(resume))
        .route("/my-shift", get(my_shift))
        .route("/current-session", get(current_session))
}

// Auto-look up the employee's assigned shift and check in
async fn check_in(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<(StatusCode, Json<CheckInResponse>), (StatusCode, String)> {
    let employee_id = Uuid::parse_str(&auth.0.sub)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid user ID".to_string()))?;

    // Look up the employee's currently active shift assignment
    let shift = sqlx::query_as::<_, ShiftTemplate>(
        r#"
        SELECT st.* FROM public.shift_templates st
        JOIN public.employee_shifts es ON es.shift_template_id = st.id
        WHERE es.employee_id = $1
          AND (es.effective_to IS NULL OR es.effective_to >= CURRENT_DATE)
        ORDER BY es.created_at DESC
        LIMIT 1
        "#,
    )
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "No active shift assigned. Contact your admin.".to_string(),
        )
    })?;

    // Check if there is an ongoing session that hasn't been checked out today
    let existing_session = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT id FROM public.sessions 
        WHERE employee_id = $1 
          AND check_out_at IS NULL 
          AND check_in_at >= CURRENT_DATE
        LIMIT 1
        "#
    )
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(session_id) = existing_session {
        // Log resume event
        sqlx::query(
            "INSERT INTO public.session_logs (session_id, event_type) VALUES ($1, 'resume')"
        )
        .bind(session_id)
        .execute(&state.db)
        .await
        .ok();

        // Clear interrupted status if present
        sqlx::query(
            "UPDATE public.sessions SET status = 'on_time' WHERE id = $1 AND status = 'interrupted'"
        )
        .bind(session_id)
        .execute(&state.db)
        .await
        .ok();

        return Ok((
            StatusCode::OK,
            Json(CheckInResponse { session_id }),
        ));
    }

    let now = Utc::now();
    let status = evaluate_check_in_status(now, &shift)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    if status == crate::models::SessionStatus::Rejected {
        return Err((StatusCode::BAD_REQUEST, "Check-in time is not within a valid shift window.".to_string()));
    }

    let session = sqlx::query_as::<_, Session>(
        r#"
        INSERT INTO public.sessions (employee_id, shift_template_id, check_in_at, status)
        VALUES ($1, $2, $3, $4::session_status)
        RETURNING *
        "#,
    )
    .bind(employee_id)
    .bind(shift.id)
    .bind(now)
    .bind(status)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Log check_in event
    sqlx::query(
        "INSERT INTO public.session_logs (session_id, event_type) VALUES ($1, 'check_in')"
    )
    .bind(session.id)
    .execute(&state.db)
    .await
    .ok();

    Ok((
        StatusCode::CREATED,
        Json(CheckInResponse {
            session_id: session.id,
        }),
    ))
}

async fn check_out(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<StatusCode, StatusCode> {
    let employee_id = Uuid::parse_str(&auth.0.sub).map_err(|_| StatusCode::BAD_REQUEST)?;
    let now = Utc::now();

    let session = sqlx::query_as::<_, Session>(
        r#"
        SELECT *
        FROM public.sessions 
        WHERE employee_id = $1 AND check_out_at IS NULL
        LIMIT 1
        "#
    )
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let session = match session {
        Some(s) => s,
        None => return Err(StatusCode::NOT_FOUND),
    };

    let shift = sqlx::query_as::<_, ShiftTemplate>(
        "SELECT * FROM public.shift_templates WHERE id = $1"
    )
    .bind(session.shift_template_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let status = evaluate_check_out_status(now, &shift, session.check_in_at);

    sqlx::query(
        r#"
        UPDATE public.sessions
        SET check_out_at = $1, status = $2::session_status
        WHERE id = $3
        "#
    )
    .bind(now)
    .bind(status)
    .bind(session.id)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Log check_out event
    sqlx::query(
        "INSERT INTO public.session_logs (session_id, event_type) VALUES ($1, 'check_out')"
    )
    .bind(session.id)
    .execute(&state.db)
    .await
    .ok();
    
    Ok(StatusCode::OK)
}

async fn pause(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<StatusCode, StatusCode> {
    let employee_id = Uuid::parse_str(&auth.0.sub).map_err(|_| StatusCode::BAD_REQUEST)?;

    let session_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM public.sessions WHERE employee_id = $1 AND check_out_at IS NULL LIMIT 1"
    )
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(sid) = session_id {
        sqlx::query("INSERT INTO public.session_logs (session_id, event_type) VALUES ($1, 'pause')")
            .bind(sid)
            .execute(&state.db)
            .await
            .ok();
        Ok(StatusCode::OK)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn resume(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<StatusCode, StatusCode> {
    let employee_id = Uuid::parse_str(&auth.0.sub).map_err(|_| StatusCode::BAD_REQUEST)?;

    let session_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM public.sessions WHERE employee_id = $1 AND check_out_at IS NULL LIMIT 1"
    )
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(sid) = session_id {
        sqlx::query("INSERT INTO public.session_logs (session_id, event_type) VALUES ($1, 'resume')")
            .bind(sid)
            .execute(&state.db)
            .await
            .ok();
        Ok(StatusCode::OK)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// Returns the employee's current shift details so the Electron app can show shift info
async fn my_shift(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<MyShiftResponse>, (StatusCode, String)> {
    let employee_id = Uuid::parse_str(&auth.0.sub)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid user ID".to_string()))?;

    let shift = sqlx::query_as::<_, ShiftTemplate>(
        r#"
        SELECT st.* FROM public.shift_templates st
        JOIN public.employee_shifts es ON es.shift_template_id = st.id
        WHERE es.employee_id = $1
          AND (es.effective_to IS NULL OR es.effective_to >= CURRENT_DATE)
        ORDER BY es.created_at DESC
        LIMIT 1
        "#,
    )
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            "No active shift assigned".to_string(),
        )
    })?;

    Ok(Json(MyShiftResponse {
        shift_template: shift,
    }))
}

async fn current_session(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Option<CurrentSessionResponse>>, (StatusCode, String)> {
    let employee_id = Uuid::parse_str(&auth.0.sub)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid user ID".to_string()))?;

    let session = sqlx::query_as::<_, (Uuid, Option<String>)>(
        r#"
        SELECT id, status::text as status
        FROM public.sessions 
        WHERE employee_id = $1 AND check_out_at IS NULL
        LIMIT 1
        "#,
    )
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some((id, status)) = session {
        Ok(Json(Some(CurrentSessionResponse {
            session_id: id,
            status: status.unwrap_or_default(),
        })))
    } else {
        Ok(Json(None))
    }
}
