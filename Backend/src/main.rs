use axum::{routing::get, Router};
use std::env;

mod auth;
mod db;
mod models;
mod routes;
mod services;
mod state;

#[tokio::main]
async fn main() {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    // Connect to database
    let pool = db::establish_connection().await;
    let state = state::AppState::new(pool);

    let app = Router::new()
        .route("/health", get(health_check))
        .nest("/api/auth", routes::auth_api::auth_routes())
        .nest("/api/admin", routes::admin::admin_routes())
        .nest("/api/employee", routes::employee::employee_routes())
        .nest("/api/employee/recordings", routes::recordings::recordings_routes())
        .nest("/api/realtime", routes::realtime::realtime_routes())
        .with_state(state);

    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{}", port);
    
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("Server running on http://{}", addr);
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> &'static str {
    "OK"
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_health_check() {
        let app = Router::new().route("/health", get(health_check));

        let response = app
            .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), 200);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(&body[..], b"OK");
    }
}
