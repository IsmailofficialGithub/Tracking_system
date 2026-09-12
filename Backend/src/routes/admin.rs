use crate::auth::AuthUser;
use crate::models::{ShiftTemplate, User};
use crate::state::AppState;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post},
};
use bcrypt::{DEFAULT_COST, hash};
use chrono::{NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct CreateShiftTemplate {
    pub name: String,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
    pub grace_minutes: i32,
    pub timezone: String,
}

#[derive(Deserialize)]
pub struct CreateEmployeeRequest {
    pub email: String,
    pub password: String,
    pub name: String,
    pub role: Option<String>,
}

#[derive(Deserialize)]
pub struct AssignShiftRequest {
    pub employee_id: Uuid,
    pub shift_template_id: Uuid,
    pub effective_from: Option<NaiveDate>,
}

#[derive(Serialize)]
pub struct SessionWithEmployee {
    pub id: Uuid,
    pub employee_id: Uuid,
    pub employee_name: String,
    pub employee_email: String,
    pub shift_template_id: Uuid,
    pub check_in_at: chrono::DateTime<chrono::Utc>,
    pub check_out_at: Option<chrono::DateTime<chrono::Utc>>,
    pub status: String,
}

#[derive(Serialize)]
pub struct RecordingWithEmployee {
    pub id: Uuid,
    pub session_id: Uuid,
    pub employee_name: String,
    pub employee_email: String,
    pub file_path: String,
    pub size_bytes: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub fn admin_routes() -> Router<AppState> {
    Router::new()
        // Users / Employees
        .route("/users", get(list_users).post(create_employee))
        .route("/users/{id}", delete(delete_user))
        // Shift Templates
        .route(
            "/shift-templates",
            get(list_shift_templates).post(create_shift_template),
        )
        .route("/shift-templates/{id}", delete(delete_shift_template))
        // Shift Assignments
        .route("/employee-shifts", post(assign_shift))
        // Sessions / Logs
        .route("/sessions", get(list_sessions))
        // Recordings
        .route("/recordings", get(list_recordings))
}

// ---- Users ----

async fn list_users(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Result<Json<Vec<User>>, StatusCode> {
    let users = sqlx::query_as::<_, User>("SELECT * FROM public.users ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(users))
}

async fn create_employee(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(payload): Json<CreateEmployeeRequest>,
) -> Result<(StatusCode, Json<User>), (StatusCode, String)> {
    let password_hash = hash(&payload.password, DEFAULT_COST)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let role = payload.role.unwrap_or_else(|| "employee".to_string());

    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO public.users (email, password_hash, name, role)
        VALUES ($1, $2, $3, $4::user_role)
        RETURNING *
        "#,
    )
    .bind(&payload.email)
    .bind(&password_hash)
    .bind(&payload.name)
    .bind(&role)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((StatusCode::CREATED, Json(user)))
}

async fn delete_user(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM public.users WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(StatusCode::NO_CONTENT)
}

// ---- Shift Templates ----

async fn list_shift_templates(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Result<Json<Vec<ShiftTemplate>>, StatusCode> {
    let templates = sqlx::query_as::<_, ShiftTemplate>(
        "SELECT * FROM public.shift_templates ORDER BY created_at DESC",
    )
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
    .bind(payload.start_time)
    .bind(payload.end_time)
    .bind(payload.grace_minutes)
    .bind(&payload.timezone)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(template)))
}

async fn delete_shift_template(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM public.shift_templates WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(StatusCode::NO_CONTENT)
}

// ---- Shift Assignments ----

async fn assign_shift(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(payload): Json<AssignShiftRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let effective_from = payload
        .effective_from
        .unwrap_or_else(|| chrono::Local::now().date_naive());

    // Close any existing active assignment for this employee
    sqlx::query(
        "UPDATE public.employee_shifts SET effective_to = $1 WHERE employee_id = $2 AND effective_to IS NULL"
    )
    .bind(effective_from)
    .bind(payload.employee_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Create new assignment
    sqlx::query(
        r#"
        INSERT INTO public.employee_shifts (employee_id, shift_template_id, effective_from)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(payload.employee_id)
    .bind(payload.shift_template_id)
    .bind(effective_from)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::CREATED)
}

// ---- Sessions / Logs ----

async fn list_sessions(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Result<Json<Vec<SessionWithEmployee>>, StatusCode> {
    let rows = sqlx::query_as::<
        _,
        (
            Uuid,
            Uuid,
            String,
            String,
            Uuid,
            chrono::DateTime<chrono::Utc>,
            Option<chrono::DateTime<chrono::Utc>>,
            String,
        ),
    >(
        r#"
        SELECT s.id, s.employee_id, u.name, u.email, s.shift_template_id,
               s.check_in_at, s.check_out_at, s.status::text
        FROM public.sessions s
        JOIN public.users u ON s.employee_id = u.id
        ORDER BY s.check_in_at DESC
        LIMIT 200
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let sessions = rows
        .into_iter()
        .map(
            |(
                id,
                employee_id,
                name,
                email,
                shift_template_id,
                check_in_at,
                check_out_at,
                status,
            )| {
                SessionWithEmployee {
                    id,
                    employee_id,
                    employee_name: name,
                    employee_email: email,
                    shift_template_id,
                    check_in_at,
                    check_out_at,
                    status,
                }
            },
        )
        .collect();

    Ok(Json(sessions))
}

// ---- Recordings ----

async fn list_recordings(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Result<Json<Vec<RecordingWithEmployee>>, StatusCode> {
    let rows = sqlx::query_as::<
        _,
        (
            Uuid,
            Uuid,
            String,
            String,
            String,
            i64,
            chrono::DateTime<chrono::Utc>,
        ),
    >(
        r#"
        SELECT r.id, r.session_id, u.name, u.email, r.file_path, r.size_bytes, r.created_at
        FROM public.recordings r
        JOIN public.sessions s ON r.session_id = s.id
        JOIN public.users u ON s.employee_id = u.id
        ORDER BY r.created_at DESC
        LIMIT 200
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let recordings = rows
        .into_iter()
        .map(
            |(id, session_id, name, email, file_path, size_bytes, created_at)| {
                RecordingWithEmployee {
                    id,
                    session_id,
                    employee_name: name,
                    employee_email: email,
                    file_path,
                    size_bytes,
                    created_at,
                }
            },
        )
        .collect();

    Ok(Json(recordings))
}
