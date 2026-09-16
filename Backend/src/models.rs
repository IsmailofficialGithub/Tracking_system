use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "user_role", rename_all = "snake_case")]
pub enum UserRole {
    SuperAdmin,
    Manager,
    Employee,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    #[serde(skip_serializing)]
    #[allow(dead_code)]
    pub password_hash: String,
    pub name: String,
    pub role: UserRole,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ShiftTemplate {
    pub id: Uuid,
    pub name: String,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
    pub grace_minutes: i32,
    pub timezone: String,
    pub created_at: DateTime<Utc>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct EmployeeShift {
    pub id: Uuid,
    pub employee_id: Uuid,
    pub shift_template_id: Uuid,
    pub effective_from: NaiveDate,
    pub effective_to: Option<NaiveDate>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "session_status", rename_all = "snake_case")]
pub enum SessionStatus {
    OnTime,
    Late,
    Interrupted,
    EndedEarly,
    Completed,
    Rejected,
    Flagged,
    HalfDay,
    Overtime,
    Absent,
    AutoCompleted,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Session {
    pub id: Uuid,
    pub employee_id: Uuid,
    pub shift_template_id: Uuid,
    pub check_in_at: DateTime<Utc>,
    pub check_out_at: Option<DateTime<Utc>>,
    pub status: SessionStatus,
    pub recording_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Recording {
    pub id: Uuid,
    pub session_id: Uuid,
    pub file_path: String,
    pub size_bytes: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::Type, PartialEq, Clone)]
#[sqlx(type_name = "session_event", rename_all = "snake_case")]
pub enum SessionEvent {
    CheckIn,
    Pause,
    Resume,
    CheckOut,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SessionLog {
    pub id: Uuid,
    pub session_id: Uuid,
    pub event_type: SessionEvent,
    pub event_time: DateTime<Utc>,
}
