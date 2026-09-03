use axum::{
    body::Bytes,
    extract::{Path, State},
    http::StatusCode,
    routing::post,
    Router,
};
use reqwest::Client;
use std::env;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::state::AppState;

pub fn recordings_routes() -> Router<AppState> {
    Router::new().route("/upload/:session_id", post(upload_chunk))
}

async fn upload_chunk(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(session_id): Path<Uuid>,
    body: Bytes, // In-memory bytes for the chunk (typically < 5MB, very safe)
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

    // 2. Upload to Supabase Storage using Reqwest
    let supabase_url = env::var("SUPABASE_URL").map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let service_key = env::var("SUPABASE_SERVICE_ROLE_KEY").map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // Path: {employee_id}/{session_id}/{chunk_uuid}.webm
    let chunk_id = Uuid::new_v4();
    let file_path = format!("{}/{}/{}.webm", employee_id, session_id, chunk_id);
    let storage_url = format!("{}/storage/v1/object/recordings/{}", supabase_url, file_path);
    
    let size_bytes = body.len() as i64;

    let client = Client::new();
    let res = client.post(&storage_url)
        .header("Authorization", format!("Bearer {}", service_key))
        .header("apikey", service_key)
        .header("Content-Type", "video/webm")
        .body(body)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
        
    if !res.status().is_success() {
        eprintln!("Storage Error: {:?}", res.text().await);
        return Err(StatusCode::BAD_GATEWAY);
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
