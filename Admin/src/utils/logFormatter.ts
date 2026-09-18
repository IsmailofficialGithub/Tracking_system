export interface SessionLog {
  id: string;
  session_id: string;
  event_type: string;
  event_time: string;
  notes?: string;
}

export const getLogEventDetails = (log: SessionLog) => {
  const eventColors: Record<string, string> = {
    check_in: '#10b981',
    pause: '#f59e0b',
    resume: '#3b82f6',
    check_out: '#8b5cf6',
    connection_lost: '#ef4444',
    offline: '#f97316',
    reconnected: '#10b981',
    app_closed: '#6b7280',
    auto_checkout: '#dc2626',
  };

  const eventLabels: Record<string, string> = {
    check_in: '🟢 Checked In',
    pause: '⏸️ Paused Shift',
    resume: '▶️ Resumed Shift',
    check_out: '🏁 Checked Out',
    connection_lost: '🌐 Connection Disconnected',
    offline: '⚠️ Connection Lost (PC / Network)',
    reconnected: '🔄 App Reconnected',
    app_closed: '💻 App Closed or PC Shut Down',
    auto_checkout: '⏰ Auto Checkout (Inactivity)',
  };

  const defaultDescriptions: Record<string, string> = {
    check_in: 'Employee started shift and recording initialized',
    pause: 'Employee manually paused attendance',
    resume: 'Employee resumed attendance',
    check_out: 'Employee manually checked out and ended shift normally',
    connection_lost: 'Internet connection lost or desktop app was closed / PC turned off',
    offline: 'Network heartbeat was interrupted',
    reconnected: 'Desktop app reconnected to server and resumed status',
    app_closed: 'Employee desktop application was closed',
    auto_checkout: 'Shift automatically ended due to prolonged connection inactivity',
  };

  const color = eventColors[log.event_type] || '#3b82f6';
  const label = eventLabels[log.event_type] || log.event_type.replace('_', ' ');
  const description = log.notes || defaultDescriptions[log.event_type] || '';

  return { color, label, description };
};
