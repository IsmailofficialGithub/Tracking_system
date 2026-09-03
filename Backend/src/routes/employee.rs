use axum::{
    extract::State,
    http::StatusCode,
    routing::post,
    Json, Router,
};
use crate::state::AppState;
use chrono::Utc;
use uuid::Uuid;
use serde::Deserialize;

use crate::auth::AuthUser;
use crate::models::{Session, ShiftTemplate};
use crate::services::shift_rules::evaluate_check_in_status;

#[derive(Deserialize)]
pub struct CheckInPayload {
    pub shift_template_id: Uuid,
}

pub fn employee_routes() -> Router<AppState> {
    Router::new()
        .route("/check-in", post(check_in))
        .route("/check-out", post(check_out))
}

async fn check_in(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<CheckInPayload>,
) -> Result<(StatusCode, Json<Session>), StatusCode> {
    let employee_id = Uuid::parse_str(&auth.0.sub).map_err(|_| StatusCode::BAD_REQUEST)?;

    let shift = sqlx::query_as::<_, ShiftTemplate>(
        "SELECT * FROM public.shift_templates WHERE id = $1"
    )
    .bind(payload.shift_template_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let now = Utc::now();
    let status = evaluate_check_in_status(now, &shift).map_err(|_| {
        // e.g. "Too early" or "Shift ended"
        StatusCode::BAD_REQUEST
    })?;

    let session = sqlx::query_as::<_, Session>(
        r#"
        INSERT INTO public.sessions (employee_id, shift_template_id, check_in_at, status)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        "#
    )
    .bind(employee_id)
    .bind(payload.shift_template_id)
    .bind(now)
    .bind(status)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(session)))
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
        "#
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
