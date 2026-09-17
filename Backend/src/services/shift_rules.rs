use chrono::{DateTime, Duration, Utc, TimeZone};
use chrono_tz::Tz;
use std::str::FromStr;

use crate::models::{SessionStatus, ShiftTemplate};

pub fn get_logical_shift_times(now_local: DateTime<Tz>, shift: &ShiftTemplate) -> (DateTime<Tz>, DateTime<Tz>) {
    let tz = now_local.timezone();
    let current_date = now_local.date_naive();
    
    let crosses_midnight = shift.start_time >= shift.end_time;
    
    // Candidate 1: Today's logical shift
    let start_today = tz.from_local_datetime(&current_date.and_time(shift.start_time)).unwrap();
    let end_today = if crosses_midnight {
        tz.from_local_datetime(&current_date.succ_opt().unwrap().and_time(shift.end_time)).unwrap()
    } else {
        tz.from_local_datetime(&current_date.and_time(shift.end_time)).unwrap()
    };
    
    if crosses_midnight {
        // Candidate 2: Yesterday's logical shift (started yesterday, ends today)
        let start_yesterday = tz.from_local_datetime(&current_date.pred_opt().unwrap().and_time(shift.start_time)).unwrap();
        let end_yesterday = tz.from_local_datetime(&current_date.and_time(shift.end_time)).unwrap();
        
        if now_local < start_today - Duration::minutes(60) {
            (start_yesterday, end_yesterday)
        } else {
            (start_today, end_today)
        }
    } else {
        (start_today, end_today)
    }
}

pub fn evaluate_check_in_status(
    now_utc: DateTime<Utc>,
    shift: &ShiftTemplate,
) -> Result<SessionStatus, &'static str> {
    let tz = Tz::from_str(&shift.timezone).unwrap_or(Tz::UTC);
    let now_local = now_utc.with_timezone(&tz);
    
    let (start_dt, end_dt) = get_logical_shift_times(now_local, shift);
    
    let diff_minutes = now_local.signed_duration_since(start_dt).num_minutes();
    let shift_duration_mins = end_dt.signed_duration_since(start_dt).num_minutes();
    let half_shift = shift_duration_mins / 2;
    
    if diff_minutes < -60 {
        Ok(SessionStatus::Rejected)
    } else if diff_minutes <= shift.grace_minutes as i64 {
        Ok(SessionStatus::OnTime)
    } else if diff_minutes <= half_shift {
        Ok(SessionStatus::Late)
    } else if diff_minutes <= shift_duration_mins {
        Ok(SessionStatus::HalfDay)
    } else {
        Ok(SessionStatus::Rejected)
    }
}

pub fn evaluate_check_out_status(
    now_utc: DateTime<Utc>,
    shift: &ShiftTemplate,
    check_in_utc: DateTime<Utc>,
) -> SessionStatus {
    let tz = Tz::from_str(&shift.timezone).unwrap_or(Tz::UTC);
    let check_in_local = check_in_utc.with_timezone(&tz);
    let now_local = now_utc.with_timezone(&tz);
    
    let (_start_dt, end_dt) = get_logical_shift_times(check_in_local, shift);
    let diff_minutes = now_local.signed_duration_since(end_dt).num_minutes();
    
    if diff_minutes < 0 {
        SessionStatus::EndedEarly
    } else if diff_minutes <= 60 {
        SessionStatus::Completed
    } else {
        SessionStatus::Overtime
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{NaiveDate, NaiveTime};

    fn dummy_shift(start_h: u32, end_h: u32) -> ShiftTemplate {
        ShiftTemplate {
            id: uuid::Uuid::new_v4(),
            name: "Shift".to_string(),
            start_time: NaiveTime::from_hms_opt(start_h, 0, 0).unwrap(),
            end_time: NaiveTime::from_hms_opt(end_h, 0, 0).unwrap(),
            grace_minutes: 15,
            timezone: "America/New_York".to_string(),
            created_at: Utc::now(),
        }
    }

    #[test]
    fn test_overnight_check_in() {
        let shift = dummy_shift(17, 3); // 5 PM to 3 AM
        let tz: Tz = "America/New_York".parse().unwrap();
        
        // Check in at 2 AM the next morning
        let local_dt = tz.from_local_datetime(
            &NaiveDate::from_ymd_opt(2026, 10, 2).unwrap().and_hms_opt(2, 0, 0).unwrap(),
        ).unwrap();
        
        let status = evaluate_check_in_status(local_dt.with_timezone(&Utc), &shift);
        // 17:00 to 03:00 is 10 hours. Half shift is 5 hours.
        // 2 AM is 9 hours after 17:00 start. 9 hours > half shift. So HalfDay.
        assert_eq!(status, Ok(SessionStatus::HalfDay));
    }
    
    #[test]
    fn test_too_early() {
        let shift = dummy_shift(17, 3);
        let tz: Tz = "America/New_York".parse().unwrap();
        let local_dt = tz.from_local_datetime(
            &NaiveDate::from_ymd_opt(2026, 10, 1).unwrap().and_hms_opt(15, 0, 0).unwrap(),
        ).unwrap();
        let status = evaluate_check_in_status(local_dt.with_timezone(&Utc), &shift);
        assert_eq!(status, Ok(SessionStatus::Rejected));
    }
}
