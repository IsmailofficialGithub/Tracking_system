use axum::{
    Json,
    extract::FromRequestParts,
    http::{StatusCode, request::Parts},
    response::{IntoResponse, Response},
};
use jsonwebtoken::{DecodingKey, Validation, decode};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub role: Option<String>,
    pub exp: usize,
}

#[allow(dead_code)]
pub struct AuthUser(pub Claims);

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let token_str = if let Some(auth_header) = parts.headers.get(axum::http::header::AUTHORIZATION).and_then(|v| v.to_str().ok()) {
            if !auth_header.starts_with("Bearer ") {
                return Err(AuthError::InvalidToken);
            }
            auth_header["Bearer ".len()..].to_string()
        } else if let Some(query) = parts.uri.query() {
            let mut found = None;
            for pair in query.split('&') {
                if let Some(t) = pair.strip_prefix("token=") {
                    found = Some(t.to_string());
                    break;
                }
            }
            found.ok_or(AuthError::MissingCredentials)?
        } else {
            return Err(AuthError::MissingCredentials);
        };

        let token = &token_str;

        let jwt_secret = env::var("JWT_SECRET")
            .unwrap_or_else(|_| "super-secret-jwt-token-with-at-least-32-bytes-long".to_string());

        let validation = Validation {
            validate_aud: false,
            ..Default::default()
        };

        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(jwt_secret.as_ref()),
            &validation,
        )
        .map_err(|_| AuthError::InvalidToken)?;

        Ok(AuthUser(token_data.claims))
    }
}

pub enum AuthError {
    MissingCredentials,
    InvalidToken,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AuthError::MissingCredentials => {
                (StatusCode::UNAUTHORIZED, "Missing authorization header")
            }
            AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "Invalid or expired token"),
        };
        let body = Json(serde_json::json!({
            "error": error_message,
        }));
        (status, body).into_response()
    }
}
