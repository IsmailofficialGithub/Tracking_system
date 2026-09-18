import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { getLogEventDetails } from '../utils/logFormatter';
import './Dashboard.css';

interface Session {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  check_in_at: string;
  check_out_at: string | null;
  status: string;
  recording_id?: string;
}

interface SessionLog {
  id: string;
  session_id: string;
  event_type: 'check_in' | 'pause' | 'resume' | 'check_out';
  event_time: string;
}

const LiveVideoPlayer: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    let isActive = true;
    const fetchLatest = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
        const res = await fetch(`${baseUrl}/admin/live/${sessionId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok && isActive) {
          const text = await res.text();
          if (text.startsWith('data:image')) {
            setImageSrc(text);
          }
        }
      } catch (err) {
        console.error('Failed to fetch live view', err);
      }
    };

    fetchLatest();
    const interval = setInterval(fetchLatest, 3000);
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  return (
    <div ref={containerRef} style={{ background: '#000', borderRadius: isFullscreen ? '0' : '12px', overflow: 'hidden', minHeight: '360px', height: isFullscreen ? '100vh' : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {!imageSrc ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', zIndex: 10, backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '1rem', color: 'white', fontWeight: 500 }}>Connecting to Live Feed...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          <img
            src={imageSrc}
            alt="Live Screen Feed"
            style={{ width: '100%', height: '100%', maxHeight: isFullscreen ? '100vh' : '420px', objectFit: 'contain' }}
          />
          <button 
            onClick={toggleFullscreen}
            style={{ position: 'absolute', bottom: '15px', right: '15px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', zIndex: 20, fontSize: '0.85rem' }}
          >
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen ⛶'}
          </button>
        </>
      )}
    </div>
  );
};

const Dashboard: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLiveSession, setSelectedLiveSession] = useState<Session | null>(null);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);

  useEffect(() => {
    if (selectedLiveSession) {
      api.get(`/admin/sessions/${selectedLiveSession.id}/logs`)
        .then(r => setSessionLogs(r.data))
        .catch(console.error);
    } else {
      setSessionLogs([]);
    }
  }, [selectedLiveSession]);

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

  const activeSessions = sessions
    .filter(s => {
      if (s.check_out_at) return false;
      const today = new Date().toDateString();
      return new Date(s.check_in_at).toDateString() === today;
    })
    // Sort descending so the most recent session is first!
    .sort((a, b) => new Date(b.check_in_at).getTime() - new Date(a.check_in_at).getTime())
    .filter((session, index, self) => 
      index === self.findIndex((t) => t.employee_id === session.employee_id)
    );
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
            <div className="section-header" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <h3 style={{ wordBreak: 'break-word' }}>📺 Live Screen: {selectedLiveSession.employee_name}</h3>
                <p className="text-muted text-sm" style={{ wordBreak: 'break-word' }}>{selectedLiveSession.employee_email} · Active: {duration(selectedLiveSession.check_in_at)}</p>
              </div>
              <button className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSelectedLiveSession(null)}>✕ Close</button>
            </div>
            
            <LiveVideoPlayer sessionId={selectedLiveSession.id} />

            <p className="text-muted text-sm" style={{ marginTop: '0.75rem', textAlign: 'center' }}>
              🔴 Real-time stream feed updates automatically as chunk data uploads from desktop client.
            </p>

            <div style={{ marginTop: '1.5rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
              <h4 style={{ marginBottom: '0.75rem' }}>Day Logs (Timeline)</h4>
              {sessionLogs.length === 0 ? (
                <p className="text-muted text-sm">No logs found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {sessionLogs.map((log: any) => {
                    const { color, label, description } = getLogEventDetails(log);
                    return (
                      <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'rgba(0,0,0,0.2)', padding: '0.6rem 0.8rem', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{label}</span>
                          </div>
                          {description && (
                            <span className="text-muted" style={{ fontSize: '0.8rem', paddingLeft: '1rem' }}>{description}</span>
                          )}
                        </div>
                        <span className="text-muted" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{new Date(log.event_time).toLocaleTimeString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
