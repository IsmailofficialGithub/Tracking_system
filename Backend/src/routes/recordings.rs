use axum::{
    body::Bytes,
    extract::{Path, State},
    http::StatusCode,
    routing::post,
    Router,
};
use tokio::fs;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::state::AppState;

pub fn recordings_routes() -> Router<AppState> {
    Router::new().route("/upload/{session_id}", post(upload_chunk))
}

async fn upload_chunk(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(session_id): Path<Uuid>,
    body: Bytes,
) -> Result<StatusCode, StatusCode> {
    let employee_id = Uuid::parse_str(&auth.0.sub).map_err(|_| StatusCode::BAD_REQUEST)?;

    // 1. Verify session belongs to the user and is active
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

    // 2. Save to Local Storage
    let chunk_id = Uuid::new_v4();
    let dir_path = format!("uploads/recordings/{}/{}", employee_id, session_id);
    let file_path = format!("{}/{}.webm", dir_path, chunk_id);
    
    let size_bytes = body.len() as i64;

    // Create directories if they don't exist
    if let Err(e) = fs::create_dir_all(&dir_path).await {
        eprintln!("Failed to create directory {}: {}", dir_path, e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Write file
    if let Err(e) = fs::write(&file_path, &body).await {
        eprintln!("Failed to write file {}: {}", file_path, e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    
    // 3. Insert metadata into DB
    let _ = sqlx::query(
        r#"
        INSERT INTO public.recordings (session_id, file_path, size_bytes)
        VALUES ($1, $2, $3)
        "#
    )
    .bind(session_id)
    .bind(file_path)
    .bind(size_bytes)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::CREATED)
}
