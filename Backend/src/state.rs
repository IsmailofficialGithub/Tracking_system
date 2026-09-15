use dashmap::DashMap;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    /// Tracks online employees (Employee ID -> WebSocket Connection Status)
    pub online_employees: Arc<DashMap<Uuid, bool>>,
    /// Caches the latest screenshot for live view (Session ID -> Base64 JPEG)
    pub live_screenshots: Arc<DashMap<Uuid, String>>,
}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        Self {
            db,
            online_employees: Arc::new(DashMap::new()),
            live_screenshots: Arc::new(DashMap::new()),
        }
    }
}
