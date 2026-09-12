use axum::{
    extract::State,
    http::StatusCode,
    routing::post,
    Json, Router,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::env;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::state::AppState;
use crate::auth::Claims;

pub fn auth_routes() -> Router<AppState> {
    Router::new()
        .route("/login", post(login_handler))
        .route("/register", post(register_handler))
}

#[derive(Deserialize)]
pub struct AuthRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub name: String,
}

async fn login_handler(
    State(state): State<AppState>,
    Json(payload): Json<AuthRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let user_record = sqlx::query!(
        "SELECT id, password_hash, role::text FROM users WHERE email = $1",
        payload.email
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let user = match user_record {
        Some(u) => u,
        None => return Err((StatusCode::UNAUTHORIZED, "Invalid email or password".to_string())),
    };

    let is_valid = verify(&payload.password, &user.password_hash)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if !is_valid {
        return Err((StatusCode::UNAUTHORIZED, "Invalid email or password".to_string()));
    }

    // Generate JWT
    let exp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize + 60 * 60 * 24; // 24 hours

    let claims = Claims {
        sub: user.id.to_string(),
        role: user.role,
        exp,
    };

    let jwt_secret = env::var("JWT_SECRET")
        .unwrap_or_else(|_| "super-secret-jwt-token-with-at-least-32-bytes-long".to_string());

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_ref()),
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(AuthResponse { token }))
}

async fn register_handler(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    // Hash password
    let password_hash = hash(&payload.password, DEFAULT_COST)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let user_record = sqlx::query!(
        "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'employee') RETURNING id, role::text",
        payload.email,
        password_hash,
        payload.name
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Generate JWT
    let exp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize + 60 * 60 * 24; // 24 hours

    let claims = Claims {
        sub: user_record.id.to_string(),
        role: user_record.role,
        exp,
    };

    let jwt_secret = env::var("JWT_SECRET")
        .unwrap_or_else(|_| "super-secret-jwt-token-with-at-least-32-bytes-long".to_string());

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_ref()),
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(AuthResponse { token }))
}
