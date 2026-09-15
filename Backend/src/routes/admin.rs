use crate::auth::AuthUser;
use crate::models::{ShiftTemplate, User};
use crate::state::AppState;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post, put},
};
use bcrypt::{DEFAULT_COST, hash};
use chrono::{NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use axum::response::{IntoResponse, Response};
use axum::body::Body;
use axum::http::header;
use std::io::Write;
#[derive(Deserialize)]
pub struct CreateShiftTemplate {
    pub name: String,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
    pub grace_minutes: i32,
    pub timezone: String,
}

#[derive(Deserialize)]
pub struct UpdateShiftTemplate {
    pub name: Option<String>,
    pub start_time: Option<NaiveTime>,
    pub end_time: Option<NaiveTime>,
    pub grace_minutes: Option<i32>,
    pub timezone: Option<String>,
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
        .route(
            "/shift-templates/{id}",
            put(update_shift_template).delete(delete_shift_template),
        )
        // Shift Assignments
        .route("/employee-shifts", post(assign_shift))
        // Sessions / Logs
        .route("/sessions", get(list_sessions))
        .route("/sessions/{id}/logs", get(list_session_logs))
        // Recordings
        .route("/recordings", get(list_recordings))
        .route("/recordings/download/{session_id}", get(download_recording_zip))
        // Live View
        .route("/live/{session_id}", get(get_live_screenshot))
}

async fn get_live_screenshot(
    Path(session_id): Path<Uuid>,
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Result<String, StatusCode> {
    if let Some(data) = state.live_screenshots.get(&session_id) {
        Ok(data.clone())
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn download_recording_zip(
    Path(session_id): Path<Uuid>,
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Result<Response, StatusCode> {
    // Fetch employee_id to find the directory
    let employee_id = sqlx::query_scalar::<_, Uuid>("SELECT employee_id FROM public.sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let dir_path = format!("uploads/recordings/{}/{}", employee_id, session_id);
    
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let options = zip::write::FileOptions::<()>::default()
            .compression_method(zip::CompressionMethod::Stored);

        if let Ok(entries) = std::fs::read_dir(&dir_path) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    if metadata.is_file() {
                        let file_name = entry.file_name().to_string_lossy().to_string();
                        if let Ok(content) = std::fs::read(entry.path()) {
                            let _ = zip.start_file(file_name, options);
                            let _ = zip.write_all(&content);
                        }
                    }
                }
            }
        }
        zip.finish().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let body = Body::from(buf);
    let headers = [
        (header::CONTENT_TYPE, "application/zip"),
        (header::CONTENT_DISPOSITION, &format!("attachment; filename=\"session_{}.zip\"", session_id)),
    ];

    Ok((headers, body).into_response())
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

async fn update_shift_template(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateShiftTemplate>,
) -> Result<Json<ShiftTemplate>, StatusCode> {
    let template = sqlx::query_as::<_, ShiftTemplate>(
        r#"
        UPDATE public.shift_templates
        SET
            name = COALESCE($1, name),
            start_time = COALESCE($2, start_time),
            end_time = COALESCE($3, end_time),
            grace_minutes = COALESCE($4, grace_minutes),
            timezone = COALESCE($5, timezone)
        WHERE id = $6
        RETURNING *
        "#,
    )
    .bind(&payload.name)
    .bind(payload.start_time)
    .bind(payload.end_time)
    .bind(payload.grace_minutes)
    .bind(&payload.timezone)
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(template))
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

use crate::models::SessionLog;

async fn list_session_logs(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Vec<SessionLog>>, StatusCode> {
    let (is_composite, employee_id, date_str) = if id.contains('_') {
        let parts: Vec<&str> = id.split('_').collect();
        let emp_id = Uuid::parse_str(parts[0]).unwrap_or_default();
        (true, Some(emp_id), Some(parts[1].to_string()))
    } else {
        (false, None, None)
    };

    let logs = if is_composite {
        sqlx::query_as::<_, SessionLog>(
            "SELECT l.* FROM public.session_logs l JOIN public.sessions s ON l.session_id = s.id WHERE s.employee_id = $1 AND DATE(s.check_in_at) = $2::date ORDER BY l.event_time ASC"
        )
        .bind(employee_id.unwrap())
        .bind(date_str.as_ref().unwrap())
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    } else {
        let session_uuid = Uuid::parse_str(&id).map_err(|_| StatusCode::BAD_REQUEST)?;
        sqlx::query_as::<_, SessionLog>(
            "SELECT * FROM public.session_logs WHERE session_id = $1 ORDER BY event_time ASC"
        )
        .bind(session_uuid)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    };

    Ok(Json(logs))
}

// ---- Recordings ----

#[derive(Serialize)]
pub struct RecordingWithEmployeeDaily {
    pub id: String, // composite id
    pub session_id: String, // composite id alias
    pub employee_name: String,
    pub employee_email: String,
    pub file_path: String,
    pub size_bytes: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

async fn list_recordings(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Result<Json<Vec<RecordingWithEmployeeDaily>>, StatusCode> {
    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            i64,
            chrono::DateTime<chrono::Utc>,
        ),
    >(
        r#"
        SELECT 
            (u.id::text || '_' || TO_CHAR(DATE(s.check_in_at), 'YYYY-MM-DD')) as id, 
            u.name, 
            u.email, 
            COALESCE(SUM(r.size_bytes), 0)::bigint as size_bytes, 
            MIN(s.check_in_at) as created_at
        FROM public.sessions s
        JOIN public.users u ON s.employee_id = u.id
        JOIN public.recordings r ON r.session_id = s.id
        GROUP BY u.id, u.name, u.email, DATE(s.check_in_at)
        ORDER BY created_at DESC
        LIMIT 200
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let recordings = rows
        .into_iter()
        .map(
            |(id, name, email, size_bytes, created_at)| {
                RecordingWithEmployeeDaily {
                    id: id.clone(),
                    session_id: id,
                    employee_name: name,
                    employee_email: email,
                    file_path: "".to_string(),
                    size_bytes,
                    created_at,
                }
            },
        )
        .collect();

    Ok(Json(recordings))
}
