use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use crate::state::AppState;
use crate::auth::AuthUser;
use crate::models::{Session, ShiftTemplate};
use crate::services::shift_rules::evaluate_check_in_status;
use chrono::Utc;
use uuid::Uuid;
use serde::Serialize;

#[derive(Serialize)]
pub struct CheckInResponse {
    pub session_id: Uuid,
}

#[derive(Serialize)]
pub struct MyShiftResponse {
    pub shift_template: ShiftTemplate,
}

pub fn employee_routes() -> Router<AppState> {
    Router::new()
        .route("/check-in", post(check_in))
        .route("/check-out", post(check_out))
        .route("/my-shift", get(my_shift))
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
          AND es.effective_from <= CURRENT_DATE
          AND (es.effective_to IS NULL OR es.effective_to >= CURRENT_DATE)
        ORDER BY es.effective_from DESC
        LIMIT 1
        "#,
    )
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| (StatusCode::BAD_REQUEST, "No active shift assigned. Contact your admin.".to_string()))?;

    let now = Utc::now();
    let status = evaluate_check_in_status(now, &shift)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

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

    Ok((StatusCode::CREATED, Json(CheckInResponse { session_id: session.id })))
}

async fn check_out(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<StatusCode, StatusCode> {
    let employee_id = Uuid::parse_str(&auth.0.sub).map_err(|_| StatusCode::BAD_REQUEST)?;
    let now = Utc::now();

    let result = sqlx::query(
        r#"
        UPDATE public.sessions
        SET check_out_at = $1, status = 'completed'
        WHERE employee_id = $2 AND check_out_at IS NULL
        "#,
    )
    .bind(now)
    .bind(employee_id)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(StatusCode::OK)
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
          AND es.effective_from <= CURRENT_DATE
          AND (es.effective_to IS NULL OR es.effective_to >= CURRENT_DATE)
        ORDER BY es.effective_from DESC
        LIMIT 1
        "#,
    )
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "No active shift assigned".to_string()))?;

    Ok(Json(MyShiftResponse { shift_template: shift }))
}
