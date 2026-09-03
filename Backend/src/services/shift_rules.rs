use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use std::str::FromStr;

use crate::models::{SessionStatus, ShiftTemplate};

pub fn evaluate_check_in_status(
    now_utc: DateTime<Utc>,
    shift: &ShiftTemplate,
) -> Result<SessionStatus, &'static str> {
    // Parse timezone from the shift template
    let tz = Tz::from_str(&shift.timezone).map_err(|_| "Invalid timezone in shift template")?;
    
    // Convert current UTC time to employee's local time
    let local_now = now_utc.with_timezone(&tz);
    let local_time = local_now.time();
    
    let shift_start = shift.start_time;
    // Calculate grace period end
    let grace_end = shift_start + chrono::Duration::minutes(shift.grace_minutes as i64);
    let shift_end = shift.end_time;

    // Simple bound checking assuming shifts don't cross midnight for MVP
    if local_time < shift_start {
        return Err("Too early to check in");
    } else if local_time <= grace_end {
        return Ok(SessionStatus::OnTime);
    } else if local_time <= shift_end {
        return Ok(SessionStatus::Late);
    }

    Err("Shift has already ended")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{NaiveDate, NaiveTime, TimeZone};

    fn dummy_shift() -> ShiftTemplate {
        ShiftTemplate {
            id: uuid::Uuid::new_v4(),
            name: "Morning Shift".to_string(),
            start_time: NaiveTime::from_hms_opt(8, 0, 0).unwrap(),
            end_time: NaiveTime::from_hms_opt(16, 0, 0).unwrap(),
            grace_minutes: 15,
            timezone: "America/New_York".to_string(),
            created_at: Utc::now(),
        }
    }

    #[test]
    fn test_on_time_check_in() {
        let shift = dummy_shift();
        // 8:10 AM EST is 12:10 PM UTC (or 13:10 depending on DST, but let's construct it precisely)
        let tz: Tz = "America/New_York".parse().unwrap();
        let local_dt = tz.from_local_datetime(&NaiveDate::from_ymd_opt(2026, 9, 3).unwrap().and_hms_opt(8, 10, 0).unwrap()).unwrap();
        let status = evaluate_check_in_status(local_dt.with_timezone(&Utc), &shift);
        assert_eq!(status, Ok(SessionStatus::OnTime));
    }

    #[test]
    fn test_late_check_in() {
        let shift = dummy_shift();
        let tz: Tz = "America/New_York".parse().unwrap();
        let local_dt = tz.from_local_datetime(&NaiveDate::from_ymd_opt(2026, 9, 3).unwrap().and_hms_opt(8, 16, 0).unwrap()).unwrap();
        let status = evaluate_check_in_status(local_dt.with_timezone(&Utc), &shift);
        assert_eq!(status, Ok(SessionStatus::Late));
    }

    #[test]
    fn test_too_early() {
        let shift = dummy_shift();
        let tz: Tz = "America/New_York".parse().unwrap();
        let local_dt = tz.from_local_datetime(&NaiveDate::from_ymd_opt(2026, 9, 3).unwrap().and_hms_opt(7, 59, 0).unwrap()).unwrap();
        let status = evaluate_check_in_status(local_dt.with_timezone(&Utc), &shift);
        assert_eq!(status, Err("Too early to check in"));
    }
}
