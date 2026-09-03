use dashmap::DashMap;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    /// Tracks online employees (Employee ID -> WebSocket Connection Status)
    pub online_employees: Arc<DashMap<Uuid, bool>>,
}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        Self {
            db,
            online_employees: Arc::new(DashMap::new()),
        }
    }
}
