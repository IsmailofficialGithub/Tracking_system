use axum::{
    body::Body,
    extract::Path,
    http::{header, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use reqwest::Client;
use serde::Serialize;
use std::env;
use crate::state::AppState;

#[derive(Serialize)]
pub struct AppInfoResponse {
    pub github_repo_url: String,
}

pub fn config_routes() -> Router<AppState> {
    Router::new()
        .route("/app-info", get(get_app_info))
        .route("/download/:tag", get(proxy_download))
}

async fn get_app_info() -> Json<AppInfoResponse> {
    let repo_url = env::var("GITHUB_REPO_URL")
        .unwrap_or_else(|_| "https://github.com/IsmailofficialGithub/Tracking_system".to_string());
    
    Json(AppInfoResponse {
        github_repo_url: repo_url,
    })
}

async fn proxy_download(Path(tag): Path<String>) -> impl IntoResponse {
    let repo_url = env::var("GITHUB_REPO_URL")
        .unwrap_or_else(|_| "https://github.com/IsmailofficialGithub/Tracking_system".to_string());
    
    // Convert github url to api url
    let api_url = repo_url.replace("github.com/", "api.github.com/repos/");
    let release_api_url = format!("{}/releases/tags/{}", api_url, tag);

    let client = Client::new();
    
    let release_resp = match client
        .get(&release_api_url)
        .header("User-Agent", "Axiomra-Backend")
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to fetch release info: {}", e)).into_response(),
    };

    if !release_resp.status().is_success() {
        return (StatusCode::NOT_FOUND, "Release not found").into_response();
    }

    let release_json: serde_json::Value = match release_resp.json().await {
        Ok(json) => json,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to parse release info").into_response(),
    };

    let asset_url = release_json["assets"]
        .as_array()
        .and_then(|assets| {
            assets.iter().find(|a| {
                a["name"]
                    .as_str()
                    .map(|n| n.ends_with(".exe"))
                    .unwrap_or(false)
            })
        })
        .and_then(|a| a["browser_download_url"].as_str())
        .map(|s| s.to_string());

    let asset_url = match asset_url {
        Some(url) => url,
        None => return (StatusCode::NOT_FOUND, "No executable asset found for this release").into_response(),
    };

    // Proxy the asset
    let asset_resp = match client.get(&asset_url).header("User-Agent", "Axiomra-Backend").send().await {
        Ok(resp) => resp,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to download asset: {}", e)).into_response(),
    };

    if !asset_resp.status().is_success() {
        return (StatusCode::BAD_GATEWAY, "Failed to proxy asset").into_response();
    }

    let mut headers = axum::http::HeaderMap::new();
    if let Some(content_length) = asset_resp.headers().get(reqwest::header::CONTENT_LENGTH) {
        headers.insert(header::CONTENT_LENGTH, content_length.clone());
    }
    headers.insert(header::CONTENT_TYPE, "application/octet-stream".parse().unwrap());
    headers.insert(
        header::CONTENT_DISPOSITION,
        format!("attachment; filename=\"Axiomra_Setup_{}.exe\"", tag).parse().unwrap(),
    );

    let stream = asset_resp.bytes_stream();
    let body = Body::from_stream(stream);

    (headers, body).into_response()
}
