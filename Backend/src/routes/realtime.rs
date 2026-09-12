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

    // Mark user as online in memory map
    state.online_employees.insert(employee_id, true);

    // Optional: Broadcast to admins here (could use a broadcast channel in AppState in the future)
    let _ = sender
        .send(Message::Text("Connected to tracking session".into()))
        .await;

    // Await messages or connection close
    while let Some(msg) = receiver.next().await {
        if let Ok(Message::Close(_)) = msg {
            break;
        }
    }

    // Connection closed - perform auto check-out
    state.online_employees.remove(&employee_id);

    let now = Utc::now();

    // Execute database update directly (Auto check-out)
    let session_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        UPDATE public.sessions 
        SET check_out_at = $1, status = 'interrupted'
        WHERE employee_id = $2 AND check_out_at IS NULL
        RETURNING id
        "#,
    )
    .bind(now)
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await;

    match session_id {
        Ok(Some(sid)) => {
            println!("Auto check-out successful for employee {}", employee_id);
            // Insert log for timeline
            sqlx::query("INSERT INTO public.session_logs (session_id, event_type, event_time) VALUES ($1, 'check_out', $2)")
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
            eprintln!("Failed to auto check-out employee {}: {}", employee_id, e);
        }
    }
}
