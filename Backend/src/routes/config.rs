use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::env;
use crate::state::AppState;

#[derive(Serialize)]
pub struct AppInfoResponse {
    pub github_repo_url: String,
}

pub fn config_routes() -> Router<AppState> {
    Router::new().route("/app-info", get(get_app_info))
}

async fn get_app_info() -> Json<AppInfoResponse> {
    let repo_url = env::var("GITHUB_REPO_URL")
        .unwrap_or_else(|_| "https://github.com/IsmailofficialGithub/Tracking_system".to_string());
    
    Json(AppInfoResponse {
        github_repo_url: repo_url,
    })
}
