use axum::{
    Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::IntoResponse,
    routing::get,
};
use chrono::Utc;
use futures_util::{sink::SinkExt, stream::StreamExt};
use std::time::Duration;
use tokio::time::timeout;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::state::AppState;

pub fn realtime_routes() -> Router<AppState> {
    Router::new().route("/ws", get(ws_handler))
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    auth: AuthUser,
) -> impl IntoResponse {
    let employee_id = match Uuid::parse_str(&auth.0.sub) {
        Ok(id) => id,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    ws.on_upgrade(move |socket| handle_socket(socket, state, employee_id))
}

async fn handle_socket(socket: WebSocket, state: AppState, employee_id: Uuid) {
    let (mut sender, mut receiver) = socket.split();

    // Connection established
    state.online_employees.insert(employee_id, true);

    // Restore interrupted sessions and log reconnected event if active session exists
    let active_session = sqlx::query_as::<_, (Uuid, chrono::DateTime<Utc>, Uuid)>(
        r#"
        SELECT s.id, s.check_in_at, s.shift_template_id 
        FROM public.sessions s 
        WHERE s.employee_id = $1 AND s.check_out_at IS NULL 
        LIMIT 1
        "#
    )
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    if let Some((sid, check_in_at, shift_template_id)) = active_session {
        let shift = sqlx::query_as::<_, crate::models::ShiftTemplate>(
            "SELECT * FROM public.shift_templates WHERE id = $1"
        )
        .bind(shift_template_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        let restored_status = if let Some(ref s) = shift {
            crate::services::shift_rules::evaluate_check_in_status(check_in_at, s)
                .unwrap_or(crate::models::SessionStatus::OnTime)
        } else {
            crate::models::SessionStatus::OnTime
        };

        sqlx::query("UPDATE public.sessions SET status = $1::session_status WHERE id = $2 AND status = 'interrupted'")
            .bind(restored_status)
            .bind(sid)
            .execute(&state.db)
            .await
            .ok();

        sqlx::query("INSERT INTO public.session_logs (session_id, event_type, notes) VALUES ($1, 'reconnected', 'Employee desktop app reconnected to server')")
            .bind(sid)
            .execute(&state.db)
            .await
            .ok();
    }

    // Optional: Broadcast to admins here (could use a broadcast channel in AppState in the future)
    let _ = sender
        .send(Message::Text("Connected to tracking session".into()))
        .await;

    // Await messages or connection close with a 90-second timeout
    loop {
        match timeout(Duration::from_secs(90), receiver.next()).await {
            Ok(Some(Ok(Message::Close(_)))) | Ok(None) | Err(_) => {
                // Connection closed or timed out
                break;
            }
            Ok(Some(Ok(msg))) => {
                // Maintain online state and restore session status if needed
                state.online_employees.insert(employee_id, true);

                if let Some((sid, check_in_at, shift_template_id)) = active_session {
                    let shift = sqlx::query_as::<_, crate::models::ShiftTemplate>(
                        "SELECT * FROM public.shift_templates WHERE id = $1"
                    )
                    .bind(shift_template_id)
                    .fetch_optional(&state.db)
                    .await
                    .ok()
                    .flatten();

                    let restored_status = if let Some(ref s) = shift {
                        crate::services::shift_rules::evaluate_check_in_status(check_in_at, s)
                            .unwrap_or(crate::models::SessionStatus::OnTime)
                    } else {
                        crate::models::SessionStatus::OnTime
                    };

                    sqlx::query("UPDATE public.sessions SET status = $1::session_status WHERE id = $2 AND status = 'interrupted'")
                        .bind(restored_status)
                        .bind(sid)
                        .execute(&state.db)
                        .await
                        .ok();
                }

                if let Message::Text(text) = msg {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                        let msg_type = val.get("type").and_then(|t| t.as_str());
                        if msg_type == Some("screenshot") {
                            if let Some(data) = val.get("data").and_then(|d| d.as_str()) {
                                // Fetch active session
                                if let Ok(Some(sid)) = sqlx::query_scalar::<_, Uuid>(
                                    "SELECT id FROM public.sessions WHERE employee_id = $1 AND check_out_at IS NULL ORDER BY check_in_at DESC LIMIT 1"
                                )
                                .bind(employee_id)
                                .fetch_optional(&state.db)
                                .await {
                                    state.live_screenshots.insert(sid, data.to_string());
                                }
                            }
                        } else if msg_type == Some("ping") {
                            let _ = sender.send(Message::Text(r#"{"type":"pong"}"#.into())).await;
                        }
                    }
                }
            }
            Ok(Some(Err(_))) => {
                // WebSocket error
                break;
            }
        }
    }

    // Connection closed - perform auto check-out / mark interrupted
    state.online_employees.remove(&employee_id);

    let now = Utc::now();

    // Execute database update directly (Auto check-out)
    let session_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        UPDATE public.sessions 
        SET status = 'interrupted'
        WHERE employee_id = $1 AND check_out_at IS NULL
        RETURNING id
        "#,
    )
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await;

    match session_id {
        Ok(Some(sid)) => {
            println!("Connection lost / interrupted for employee {}", employee_id);
            state.live_screenshots.remove(&sid);
            // Insert log for timeline
            sqlx::query("INSERT INTO public.session_logs (session_id, event_type, event_time, notes) VALUES ($1, 'connection_lost', $2, 'Internet connection lost or App closed / PC shut down')")
                .bind(sid)
                .bind(now)
                .execute(&state.db)
                .await
                .ok();
        },
        Ok(None) => {
            // No active session found
        },
        Err(e) => {
            eprintln!("Failed to mark session interrupted for employee {}: {}", employee_id, e);
        }
    }
}
