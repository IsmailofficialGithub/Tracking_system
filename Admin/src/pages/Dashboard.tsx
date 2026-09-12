import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import './Dashboard.css';

interface Session {
  id: string;
  employee_name: string;
  employee_email: string;
  check_in_at: string;
  check_out_at: string | null;
  status: string;
  recording_id?: string;
}

const Dashboard: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLiveSession, setSelectedLiveSession] = useState<Session | null>(null);

  useEffect(() => {
    const load = () => {
      api.get('/admin/sessions')
        .then(r => setSessions(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  const activeSessions = sessions.filter(s => !s.check_out_at);
  const lateSessions = activeSessions.filter(s => s.status === 'late');

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

  const duration = (checkIn: string) => {
    const ms = Date.now() - new Date(checkIn).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  const streamUrl = (session: Session) => {
    const token = localStorage.getItem('admin_token');
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    return `${baseUrl}/employee/recordings/stream/${session.id}?token=${token}`;
  };

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="text-muted">Real-time overview of your team</p>
      </div>

      <div className="stats-grid">
        <div className="card stat-card glass-panel">
          <h3>Active Now</h3>
          <div className="stat-value text-accent">{loading ? '–' : activeSessions.length}</div>
          {activeSessions.length > 0 && <span className="live-indicator">● Live</span>}
        </div>
        <div className="card stat-card glass-panel">
          <h3>Late Check-ins</h3>
          <div className="stat-value text-danger">{loading ? '–' : lateSessions.length}</div>
        </div>
        <div className="card stat-card glass-panel">
          <h3>Today's Sessions</h3>
          <div className="stat-value">{loading ? '–' : sessions.filter(s => {
            const today = new Date().toDateString();
            return new Date(s.check_in_at).toDateString() === today;
          }).length}</div>
        </div>
        <Link to="/sessions" className="card stat-card glass-panel link-card">
          <h3>View All Logs</h3>
          <div className="stat-value arrow-value">→</div>
        </Link>
      </div>

      {/* Live Sessions Modal for Live Screen View */}
      {selectedLiveSession && (
        <div className="modal-overlay" onClick={() => setSelectedLiveSession(null)}>
          <div className="modal glass-panel" style={{ maxWidth: '720px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="section-header" style={{ marginBottom: '1rem' }}>
              <div>
                <h3>📺 Live Screen Stream: {selectedLiveSession.employee_name}</h3>
                <p className="text-muted text-sm">{selectedLiveSession.employee_email} · Active for {duration(selectedLiveSession.check_in_at)}</p>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedLiveSession(null)}>✕ Close</button>
            </div>
            
            <div style={{ background: '#000', borderRadius: '12px', overflow: 'hidden', minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <video
                key={selectedLiveSession.id}
                controls
                autoPlay
                style={{ width: '100%', maxHeight: '420px', objectFit: 'contain' }}
                src={streamUrl(selectedLiveSession)}
                onError={(e) => {
                  console.log("Stream video loading or awaiting chunk...", e);
                }}
              />
            </div>
            <p className="text-muted text-sm" style={{ marginTop: '0.75rem', textAlign: 'center' }}>
              🔴 Real-time stream feed updates automatically as chunk data uploads from desktop client.
            </p>
          </div>
        </div>
      )}

      {/* Live Sessions List */}
      <div className="card glass-panel mt-2">
        <div className="section-header" style={{ marginBottom: '1rem' }}>
          <h3>Live Sessions {activeSessions.length > 0 && <span className="live-badge">● {activeSessions.length} active</span>}</h3>
          <Link to="/sessions" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>View All</Link>
        </div>
        {loading ? (
          <p className="text-muted">Loading...</p>
        ) : activeSessions.length === 0 ? (
          <p className="text-muted">No employees currently checked in.</p>
        ) : (
          <div className="live-sessions-list">
            {activeSessions.map(s => (
              <div key={s.id} className="live-session-row">
                <div className="live-dot-pulse" />
                <div className="live-session-info">
                  <span className="td-name">{s.employee_name}</span>
                  <span className="text-muted text-sm">{s.employee_email}</span>
                </div>
                <div className="live-session-meta" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="text-muted text-sm">{duration(s.check_in_at)}</span>
                  <span className={statusBadge(s.status)}>{s.status.replace('_', ' ')}</span>
                  <button className="btn btn-primary btn-sm" onClick={() => setSelectedLiveSession(s)}>
                    📺 View Screen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent sessions */}
      <div className="card glass-panel mt-2">
        <div className="section-header" style={{ marginBottom: '1rem' }}>
          <h3>Recent Activity</h3>
        </div>
        {loading ? (
          <p className="text-muted">Loading...</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted">No sessions yet. Check in from an employee account to see data here.</p>
        ) : (
          <div className="recent-list">
            {sessions.slice(0, 8).map(s => (
              <div key={s.id} className="recent-row">
                <div className="recent-info">
                  <span className="td-name">{s.employee_name}</span>
                  <span className="text-muted text-sm">{new Date(s.check_in_at).toLocaleString()}</span>
                </div>
                <span className={statusBadge(s.status)}>{s.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
