use axum::{
    extract::State,
    http::StatusCode,
    routing::get,
    Json, Router,
};
use crate::state::AppState;

use crate::auth::AuthUser;
use crate::models::{ShiftTemplate, User};

// DTOs
use serde::Deserialize;
use chrono::NaiveTime;

#[derive(Deserialize)]
pub struct CreateShiftTemplate {
    pub name: String,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
    pub grace_minutes: i32,
    pub timezone: String,
}

pub fn admin_routes() -> Router<AppState> {
    Router::new()
        .route("/users", get(list_users))
        .route("/shift-templates", get(list_shift_templates).post(create_shift_template))
}

async fn list_users(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Result<Json<Vec<User>>, StatusCode> {
    // In a real app, verify _auth.0.role == "super_admin" or "manager"
    let users = sqlx::query_as::<_, User>("SELECT * FROM public.users")
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(users))
}

async fn list_shift_templates(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Result<Json<Vec<ShiftTemplate>>, StatusCode> {
    let templates = sqlx::query_as::<_, ShiftTemplate>("SELECT * FROM public.shift_templates")
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(templates))
}

async fn create_shift_template(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(payload): Json<CreateShiftTemplate>,
) -> Result<(StatusCode, Json<ShiftTemplate>), StatusCode> {
    let template = sqlx::query_as::<_, ShiftTemplate>(
        r#"
        INSERT INTO public.shift_templates (name, start_time, end_time, grace_minutes, timezone)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
    )
    .bind(&payload.name)
    .bind(&payload.start_time)
    .bind(&payload.end_time)
    .bind(&payload.grace_minutes)
    .bind(&payload.timezone)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        eprintln!("DB Error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(template)))
}
