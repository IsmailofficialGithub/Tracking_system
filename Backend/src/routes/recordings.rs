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
    Path(recording_id): Path<String>,
    Query(query): Query<StreamQuery>,
) -> impl IntoResponse {
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

    // Check if it's a composite daily ID (employeeUUID_YYYY-MM-DD)
    let (is_composite, employee_id, date_str) = if recording_id.contains('_') {
        let parts: Vec<&str> = recording_id.split('_').collect();
        let emp_id = Uuid::parse_str(parts[0]).unwrap_or_default();
        (true, Some(emp_id), Some(parts[1].to_string()))
    } else {
        (false, None, None)
    };

    let session_uuid = if !is_composite { Uuid::parse_str(&recording_id).ok() } else { None };

    let stream = stream! {
        let mut last_created_at: Option<chrono::DateTime<chrono::Utc>> = None;
        let mut session_ended = false;
        let mut live_header_sent = false;
        let mut is_first_chunk_ever = true;
        
        loop {
            // Check if active sessions exist
            if is_composite {
                let active = sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM public.sessions WHERE employee_id = $1 AND DATE(check_in_at) = $2::date AND check_out_at IS NULL"
                )
                .bind(employee_id.unwrap())
                .bind(date_str.as_ref().unwrap())
                .fetch_one(&db)
                .await
                .unwrap_or(0);
                if active == 0 { session_ended = true; }
            } else if let Some(sid) = session_uuid {
                let status = sqlx::query_scalar::<_, String>(
                    "SELECT status::text FROM public.sessions WHERE id = $1"
                )
                .bind(sid)
                .fetch_optional(&db)
                .await
                .unwrap_or(None);
                if let Some(s) = status {
                    if s == "completed" || s == "interrupted" || s == "ended_early" { session_ended = true; }
                } else {
                    session_ended = true;
                }
            }

            let is_live_mode = query.live.unwrap_or(false) && !session_ended;

            if is_live_mode && !live_header_sent {
                live_header_sent = true;
                let first_row = if is_composite {
                    sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>)>(
                        "SELECT r.file_path, r.created_at FROM public.recordings r JOIN public.sessions s ON r.session_id = s.id WHERE s.employee_id = $1 AND DATE(s.check_in_at) = $2::date ORDER BY r.created_at ASC LIMIT 1"
                    )
                    .bind(employee_id.unwrap())
                    .bind(date_str.as_ref().unwrap())
                    .fetch_optional(&db).await.unwrap_or(None)
                } else {
                    sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>)>(
                        "SELECT file_path, created_at FROM public.recordings WHERE session_id = $1 ORDER BY created_at ASC LIMIT 1"
                    )
                    .bind(session_uuid.unwrap())
                    .fetch_optional(&db).await.unwrap_or(None)
                };

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
                        
                        if header_len > 0 {
                            yield Ok::<_, std::io::Error>(axum::body::Bytes::copy_from_slice(&buf[..header_len]));
                        }

                        let latest_chunk_time = if is_composite {
                            sqlx::query_scalar::<_, chrono::DateTime<chrono::Utc>>(
                                "SELECT r.created_at FROM public.recordings r JOIN public.sessions s ON r.session_id = s.id WHERE s.employee_id = $1 AND DATE(s.check_in_at) = $2::date ORDER BY r.created_at DESC LIMIT 1"
                            )
                            .bind(employee_id.unwrap())
                            .bind(date_str.as_ref().unwrap())
                            .fetch_optional(&db).await.unwrap_or(None)
                        } else {
                            sqlx::query_scalar::<_, chrono::DateTime<chrono::Utc>>(
                                "SELECT created_at FROM public.recordings WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1"
                            )
                            .bind(session_uuid.unwrap())
                            .fetch_optional(&db).await.unwrap_or(None)
                        };

                        if let Some(latest) = latest_chunk_time {
                            if latest == first_time {
                                if header_len < buf.len() {
                                    yield Ok::<_, std::io::Error>(axum::body::Bytes::copy_from_slice(&buf[header_len..]));
                                }
                                last_created_at = Some(first_time);
                            } else {
                                // Jump to latest 30 seconds (fetch last few chunks so we get a keyframe)
                                let skip_time = latest - chrono::Duration::seconds(30);
                                last_created_at = Some(skip_time);
                            }
                        }
                    }
                } else {
                    live_header_sent = false;
                }
                
                if !live_header_sent {
                    tokio::time::sleep(Duration::from_millis(1500)).await;
                }
                continue;
            }

            let rows = if let Some(last) = last_created_at {
                if is_composite {
                    sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>)>(
                        "SELECT r.file_path, r.created_at FROM public.recordings r JOIN public.sessions s ON r.session_id = s.id WHERE s.employee_id = $1 AND DATE(s.check_in_at) = $2::date AND r.created_at > $3 ORDER BY r.created_at ASC"
                    )
                    .bind(employee_id.unwrap())
                    .bind(date_str.as_ref().unwrap())
                    .bind(last)
                    .fetch_all(&db).await.unwrap_or_default()
                } else {
                    sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>)>(
                        "SELECT file_path, created_at FROM public.recordings WHERE (session_id = $1 OR id = $1) AND created_at > $2 ORDER BY created_at ASC"
                    )
                    .bind(session_uuid.unwrap())
                    .bind(last)
                    .fetch_all(&db).await.unwrap_or_default()
                }
            } else {
                if is_composite {
                    sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>)>(
                        "SELECT r.file_path, r.created_at FROM public.recordings r JOIN public.sessions s ON r.session_id = s.id WHERE s.employee_id = $1 AND DATE(s.check_in_at) = $2::date ORDER BY r.created_at ASC"
                    )
                    .bind(employee_id.unwrap())
                    .bind(date_str.as_ref().unwrap())
                    .fetch_all(&db).await.unwrap_or_default()
                } else {
                    sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>)>(
                        "SELECT file_path, created_at FROM public.recordings WHERE session_id = $1 OR id = $1 ORDER BY created_at ASC"
                    )
                    .bind(session_uuid.unwrap())
                    .fetch_all(&db).await.unwrap_or_default()
                }
            };

            let got_new = !rows.is_empty();

            for (file_path, created_at) in rows {
                last_created_at = Some(created_at);
                if let Ok(mut file) = fs::File::open(&file_path).await {
                    let mut buf = Vec::new();
                    file.read_to_end(&mut buf).await.unwrap_or(0);

                    if buf.len() > 4 {
                        // Detect EBML Header (0x1A 0x45 0xDF 0xA3)
                        let has_header = buf[0] == 0x1A && buf[1] == 0x45 && buf[2] == 0xDF && buf[3] == 0xA3;
                        
                        if has_header {
                            // Find the first cluster (0x1F 0x43 0xB6 0x75)
                            let mut cluster_idx = 0;
                            for i in 0..buf.len().saturating_sub(4) {
                                if buf[i] == 0x1F && buf[i+1] == 0x43 && buf[i+2] == 0xB6 && buf[i+3] == 0x75 {
                                    cluster_idx = i;
                                    break;
                                }
                            }

                            if is_first_chunk_ever {
                                // For VOD, keep header for the very first chunk ever streamed
                                yield Ok::<_, std::io::Error>(axum::body::Bytes::copy_from_slice(&buf));
                            } else {
                                // Strip header! Only send the clusters
                                if cluster_idx > 0 {
                                    yield Ok::<_, std::io::Error>(axum::body::Bytes::copy_from_slice(&buf[cluster_idx..]));
                                }
                            }
                        } else {
                            // Normal chunk, just send it
                            yield Ok::<_, std::io::Error>(axum::body::Bytes::copy_from_slice(&buf));
                        }
                        
                        is_first_chunk_ever = false;
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
