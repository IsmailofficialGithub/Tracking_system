use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use tokio::fs;
use tokio::io::AsyncReadExt;
use uuid::Uuid;

use crate::auth::{AuthUser, Claims};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct StreamQuery {
    pub token: Option<String>,
}

pub fn recordings_routes() -> Router<AppState> {
    Router::new()
        .route("/upload/{session_id}", post(upload_chunk))
        .route("/stream/{recording_id}", get(stream_recording))
}

async fn upload_chunk(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(session_id): Path<Uuid>,
    body: Bytes,
) -> Result<StatusCode, StatusCode> {
    let employee_id = Uuid::parse_str(&auth.0.sub).map_err(|_| StatusCode::BAD_REQUEST)?;

    // 1. Verify session belongs to the user
    let session_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM public.sessions WHERE id = $1 AND employee_id = $2)"
    )
    .bind(session_id)
    .bind(employee_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !session_exists {
        return Err(StatusCode::FORBIDDEN);
    }

    // 2. Save to local storage
    let chunk_id = Uuid::new_v4();
    let dir_path = format!("uploads/recordings/{}/{}", employee_id, session_id);
    let file_path = format!("{}/{}.webm", dir_path, chunk_id);
    let size_bytes = body.len() as i64;

    if let Err(e) = fs::create_dir_all(&dir_path).await {
        eprintln!("Failed to create directory {}: {}", dir_path, e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    if let Err(e) = fs::write(&file_path, &body).await {
        eprintln!("Failed to write file {}: {}", file_path, e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // 3. Insert metadata into DB
    sqlx::query(
        r#"
        INSERT INTO public.recordings (session_id, file_path, size_bytes)
        VALUES ($1, $2, $3)
        "#
    )
    .bind(session_id)
    .bind(&file_path)
    .bind(size_bytes)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::CREATED)
}

// Stream a recording file back to the admin browser
// Accepts token as query param since <video src> can't set Authorization headers
async fn stream_recording(
    State(state): State<AppState>,
    Path(recording_id): Path<Uuid>,
    Query(query): Query<StreamQuery>,
) -> impl IntoResponse {
    // Validate token from query param
    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "super-secret-jwt-token-with-at-least-32-bytes-long".to_string());

    let token = match query.token {
        Some(t) => t,
        None => return (StatusCode::UNAUTHORIZED, "Missing token").into_response(),
    };

    let token_data = jsonwebtoken::decode::<Claims>(
        &token,
        &jsonwebtoken::DecodingKey::from_secret(jwt_secret.as_ref()),
        &jsonwebtoken::Validation::default(),
    );

    if token_data.is_err() {
        return (StatusCode::UNAUTHORIZED, "Invalid token").into_response();
    }

    // Look up recording path
    let row = sqlx::query_as::<_, (String,)>(
        "SELECT file_path FROM public.recordings WHERE id = $1"
    )
    .bind(recording_id)
    .fetch_optional(&state.db)
    .await;

    let file_path = match row {
        Ok(Some((p,))) => p,
        _ => return (StatusCode::NOT_FOUND, "Recording not found").into_response(),
    };

    // Read file and send
    let mut file = match fs::File::open(&file_path).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found on disk").into_response(),
    };

    let mut contents = Vec::new();
    if file.read_to_end(&mut contents).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response();
    }

    (
        [(header::CONTENT_TYPE, "video/webm")],
        contents,
    ).into_response()
}
