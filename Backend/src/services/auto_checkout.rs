use crate::models::ShiftTemplate;
use crate::services::shift_rules::{get_logical_shift_times, parse_tz};
use crate::state::AppState;
use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

// Periodically inspects open sessions and automatically checks out sessions exceeding shift end time by 1+ hours
pub async fn process_stale_sessions(state: AppState) {
    let now_utc = Utc::now();

    // Query active sessions where check_out_at IS NULL
    let rows = sqlx::query_as::<_, (Uuid, Uuid, DateTime<Utc>, String, chrono::NaiveTime, chrono::NaiveTime, String)>(
        r#"
        SELECT 
            s.id,
            s.employee_id,
            s.check_in_at,
            st.timezone,
            st.start_time,
            st.end_time,
            st.name as shift_name
        FROM public.sessions s
        JOIN public.shift_templates st ON s.shift_template_id = st.id
        WHERE s.check_out_at IS NULL
        "#
    )
    .fetch_all(&state.db)
    .await;

    let unclosed_sessions = match rows {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Auto-checkout background job query error: {}", e);
            return;
        }
    };

    for (session_id, employee_id, check_in_utc, tz_str, start_time, end_time, shift_name) in unclosed_sessions {
        let tz = parse_tz(&tz_str);
        let check_in_local = check_in_utc.with_timezone(&tz);

        // Construct ShiftTemplate struct to compute logical shift end
        let shift = ShiftTemplate {
            id: Uuid::nil(),
            name: shift_name,
            start_time,
            end_time,
            grace_minutes: 15,
            timezone: tz_str,
            created_at: now_utc,
        };

        let (_start_dt, end_dt) = get_logical_shift_times(check_in_local, &shift);
        let end_utc = end_dt.with_timezone(&Utc);

        // Cutoff: 1 hour past the end of the scheduled shift
        let checkout_cutoff = end_utc + Duration::hours(1);

        if now_utc > checkout_cutoff {
            println!(
                "Auto-checkout triggered for employee {} (session {}). Shift ended at {}, cutoff was {}.",
                employee_id, session_id, end_utc, checkout_cutoff
            );

            // Execute auto check-out in DB
            let update_res = sqlx::query(
                r#"
                UPDATE public.sessions
                SET check_out_at = $1, status = 'auto_completed'::session_status
                WHERE id = $2 AND check_out_at IS NULL
                "#
            )
            .bind(end_utc) // Set check_out_at to exact shift end time
            .bind(session_id)
            .execute(&state.db)
            .await;

            if update_res.is_ok() {
                // Log auto_checkout event in timeline
                let note = format!("Shift automatically ended by system: shift end time ({}) exceeded by 1+ hour", end_utc.format("%Y-%m-%d %H:%M UTC"));
                sqlx::query(
                    "INSERT INTO public.session_logs (session_id, event_type, event_time, notes) VALUES ($1, 'auto_checkout', $2, $3)"
                )
                .bind(session_id)
                .bind(now_utc)
                .bind(note)
                .execute(&state.db)
                .await
                .ok();

                // Prune employee online status and cached screenshots
                state.online_employees.remove(&employee_id);
                state.live_screenshots.remove(&session_id);
            }
        }
    }
}
