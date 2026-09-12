import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import './Sessions.css';

interface Session {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  shift_template_id: string;
  check_in_at: string;
  check_out_at: string | null;
  status: string;
}

const Sessions: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.get('/admin/sessions')
      .then(r => setSessions(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = sessions.filter(s =>
    s.employee_name.toLowerCase().includes(filter.toLowerCase()) ||
    s.employee_email.toLowerCase().includes(filter.toLowerCase()) ||
    s.status.toLowerCase().includes(filter.toLowerCase())
  );

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      on_time: 'badge badge-success',
      late: 'badge badge-warning',
      completed: 'badge badge-success',
      interrupted: 'badge badge-danger',
      ended_early: 'badge badge-danger',
    };
    return map[status] || 'badge';
  };

  const duration = (checkIn: string, checkOut: string | null) => {
    if (!checkOut) return 'Active';
    const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1>Session Logs</h1>
          <p className="text-muted">All employee check-in / check-out history</p>
        </div>
        <input
          className="input-field search-input"
          placeholder="Filter by name or status..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading sessions...</div>
      ) : (
        <div className="table-card glass-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="td-name">{s.employee_name}</div>
                    <div className="text-muted text-sm">{s.employee_email}</div>
                  </td>
                  <td className="text-muted">{new Date(s.check_in_at).toLocaleString()}</td>
                  <td className="text-muted">{s.check_out_at ? new Date(s.check_out_at).toLocaleString() : <span className="live-dot">● Live</span>}</td>
                  <td className="text-muted">{duration(s.check_in_at, s.check_out_at)}</td>
                  <td><span className={statusBadge(s.status)}>{s.status.replace('_', ' ')}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="empty-row">No sessions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Sessions;
