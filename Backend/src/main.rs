use axum::{Router, routing::get};
use std::env;
use std::time::{Duration, SystemTime};
use std::fs;

mod auth;
mod db;
mod models;
mod routes;
mod services;
mod state;

#[tokio::main]
async fn main() {
    // Install default crypto provider for rustls globally to prevent ANY panics from sqlx/reqwest/etc.
    rustls::crypto::ring::default_provider()
        .install_default()
        .ok(); // Ignore if already installed

    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    // Connect to database
    let pool = db::establish_connection().await;

    // Run migrations automatically
    println!("Running database migrations...");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run database migrations");

    let state = state::AppState::new(pool);

    let app = Router::new()
        .route("/health", get(health_check))
        .nest("/api/auth", routes::auth_api::auth_routes())
        .nest("/api/admin", routes::admin::admin_routes())
        .nest("/api/employee", routes::employee::employee_routes())
        .nest(
            "/api/employee/recordings",
            routes::recordings::recordings_routes(),
        )
        .nest("/api/realtime", routes::realtime::realtime_routes())
        .nest("/api/config", routes::config::config_routes())
        .with_state(state)
        .layer(axum::extract::DefaultBodyLimit::max(10 * 1024 * 1024))
        .layer(tower_http::cors::CorsLayer::permissive());

    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{}", port);

    // Spawn 30-day auto-purge background task
    tokio::spawn(async move {
        loop {
            // Wait 24 hours between checks
            tokio::time::sleep(Duration::from_secs(60 * 60 * 24)).await;
            println!("Running auto-purge for recordings older than 30 days...");
            let cutoff = SystemTime::now() - Duration::from_secs(30 * 24 * 60 * 60);
            
            // Iterate over all files in uploads/recordings
            let path = "uploads/recordings";
            if let Ok(entries) = walkdir::WalkDir::new(path)
                .into_iter()
                .collect::<Result<Vec<_>, _>>() 
            {
                for entry in entries.into_iter().filter(|e| e.file_type().is_file()) {
                    if let Ok(metadata) = entry.metadata() {
                        if let Ok(modified) = metadata.modified() {
                            if modified < cutoff {
                                if let Err(e) = fs::remove_file(entry.path()) {
                                    eprintln!("Failed to delete old recording {:?}: {}", entry.path(), e);
                                } else {
                                    println!("Deleted old recording: {:?}", entry.path());
                                }
                            }
                        }
                    }
                }
            }
        }
    });

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
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), 200);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(&body[..], b"OK");
    }
}
