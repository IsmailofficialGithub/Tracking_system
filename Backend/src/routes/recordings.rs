use axum::{
    Router,
    body::Bytes,
    extract::{Path, Query, State},
    http::{StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
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
    pub live: Option<bool>,
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
        "SELECT EXISTS(SELECT 1 FROM public.sessions WHERE id = $1 AND employee_id = $2)",
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
        "#,
    )
    .bind(session_id)
    .bind(&file_path)
    .bind(size_bytes)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::CREATED)
}

use async_stream::stream;
use axum::body::Body;
use std::time::Duration;

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

    let db = state.db.clone();

    let stream = stream! {
        let mut last_created_at: Option<chrono::DateTime<chrono::Utc>> = None;
        let mut session_ended = false;
        let mut live_header_sent = false;
        
        loop {
            let status = sqlx::query_scalar::<_, String>(
                "SELECT status::text FROM public.sessions WHERE id = $1"
            )
            .bind(recording_id)
            .fetch_optional(&db)
            .await
            .unwrap_or(None);

            if let Some(s) = status {
                if s == "completed" {
                    session_ended = true;
                }
            } else {
                session_ended = true;
            }

            let is_live_mode = query.live.unwrap_or(false) && !session_ended;

            if is_live_mode && !live_header_sent {
                live_header_sent = true;
                let first_row = sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>)>(
                    "SELECT file_path, created_at FROM public.recordings WHERE session_id = $1 ORDER BY created_at ASC LIMIT 1"
                )
                .bind(recording_id)
                .fetch_optional(&db)
                .await
                .unwrap_or(None);

                if let Some((first_path, first_time)) = first_row {
                    if let Ok(mut file) = fs::File::open(&first_path).await {
                        let mut buf = Vec::new();
                        let _ = file.read_to_end(&mut buf).await;
                        let mut header_len = buf.len();
                        for i in 0..buf.len().saturating_sub(4) {
                            if buf[i] == 0x1F && buf[i+1] == 0x43 && buf[i+2] == 0xB6 && buf[i+3] == 0x75 {
                                header_len = i;
                                break;
                            }
                        }
                        
                        // Yield the WebM header
                        if header_len > 0 {
                            yield Ok::<_, std::io::Error>(axum::body::Bytes::copy_from_slice(&buf[..header_len]));
                        }

                        let latest_chunk_time = sqlx::query_scalar::<_, chrono::DateTime<chrono::Utc>>(
                            "SELECT created_at FROM public.recordings WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1"
                        )
                        .bind(recording_id)
                        .fetch_optional(&db)
                        .await
                        .unwrap_or(None);

                        if let Some(latest) = latest_chunk_time {
                            if latest == first_time {
                                // Session just started (only 1 chunk exists). Yield the rest of it.
                                if header_len < buf.len() {
                                    yield Ok::<_, std::io::Error>(axum::body::Bytes::copy_from_slice(&buf[header_len..]));
                                }
                                last_created_at = Some(first_time);
                            } else {
                                // Jump directly to the latest chunk, regardless of how old it is (handles paused sessions/drops)
                                let skip_time = latest - chrono::Duration::milliseconds(1);
                                last_created_at = Some(skip_time);
                            }
                        }
                    }
                } else {
                    // No chunks uploaded yet. Retry on next loop.
                    live_header_sent = false;
                }
                
                if !live_header_sent {
                    tokio::time::sleep(Duration::from_millis(1500)).await;
                }
                continue;
            }

            let rows = if let Some(last) = last_created_at {
                sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>)>(
                    "SELECT file_path, created_at FROM public.recordings WHERE (session_id = $1 OR id = $1) AND created_at > $2 ORDER BY created_at ASC"
                )
                .bind(recording_id)
                .bind(last)
                .fetch_all(&db)
                .await
                .unwrap_or_default()
            } else {
                sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>)>(
                    "SELECT file_path, created_at FROM public.recordings WHERE session_id = $1 OR id = $1 ORDER BY created_at ASC"
                )
                .bind(recording_id)
                .fetch_all(&db)
                .await
                .unwrap_or_default()
            };

            let got_new = !rows.is_empty();

            for (file_path, created_at) in rows {
                last_created_at = Some(created_at);
                if let Ok(mut file) = fs::File::open(&file_path).await {
                    let mut buf = vec![0; 65536];
                    while let Ok(n) = file.read(&mut buf).await {
                        if n == 0 { break; }
                        yield Ok::<_, std::io::Error>(axum::body::Bytes::copy_from_slice(&buf[..n]));
                    }
                }
            }

            if session_ended && !got_new {
                break;
            }

            if !got_new {
                tokio::time::sleep(Duration::from_millis(1500)).await;
            }
        }
    };

    let body = Body::from_stream(stream);
    ([(header::CONTENT_TYPE, "video/webm")], body).into_response()
}
