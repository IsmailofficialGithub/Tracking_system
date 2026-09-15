import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import './Recordings.css';

interface Recording {
  id: string;
  session_id: string;
  employee_name: string;
  employee_email: string;
  file_path: string;
  size_bytes: number;
  created_at: string;
}

interface SessionLog {
  id: string;
  session_id: string;
  event_type: 'check_in' | 'pause' | 'resume' | 'check_out';
  event_time: string;
}

const Recordings: React.FC = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (playing) {
      api.get(`/admin/sessions/${playing.session_id}/logs`)
        .then(r => setSessionLogs(r.data))
        .catch(console.error);
    } else {
      setSessionLogs([]);
    }
  }, [playing]);

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  useEffect(() => {
    api.get('/admin/recordings')
      .then(r => setRecordings(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filtered = recordings.filter(r =>
    r.employee_name.toLowerCase().includes(filter.toLowerCase()) ||
    r.employee_email.toLowerCase().includes(filter.toLowerCase())
  );

  const videoUrl = (r: Recording) => {
    const token = localStorage.getItem('admin_token');
    return `${baseUrl}/employee/recordings/stream/${r.id}?token=${token}`;
  };

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1>Recordings</h1>
          <p className="text-muted">Browse and playback employee screen recordings</p>
        </div>
        <input
          className="input-field search-input"
          placeholder="Filter by employee..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      {playing && (
        <div className="modal-overlay" onClick={() => setPlaying(null)}>
          <div className="video-modal glass-panel" onClick={e => e.stopPropagation()}>
            <div className="video-modal-header">
              <div>
                <h3>{playing.employee_name}</h3>
                <p className="text-muted text-sm">{new Date(playing.created_at).toLocaleString()} · {formatSize(playing.size_bytes)}</p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <a 
                  className="btn btn-primary" 
                  href={`${baseUrl}/admin/recordings/download/${playing.session_id}?token=${localStorage.getItem('admin_token')}`}
                  download
                >
                  ⬇ Download Zip
                </a>
                <button className="btn btn-outline" onClick={() => setPlaying(null)}>✕ Close</button>
              </div>
            </div>
            <video
              key={playing.id}
              controls
              autoPlay
              className="recording-video"
              src={videoUrl(playing)}
            />
            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.1)' }}>
              <h4 style={{ marginBottom: '0.75rem' }}>Day Logs (Timeline)</h4>
              {sessionLogs.length === 0 ? (
                <p className="text-muted text-sm">No logs found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {sessionLogs.map(log => {
                    const eventColors: Record<string, string> = { check_in: '#10b981', pause: '#f59e0b', resume: '#3b82f6', check_out: '#ef4444' };
                    const eventLabels: Record<string, string> = { check_in: 'Checked In', pause: 'Paused Shift', resume: 'Resumed Shift', check_out: 'Checked Out' };
                    return (
                      <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: eventColors[log.event_type] || '#ccc' }} />
                          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{eventLabels[log.event_type] || log.event_type}</span>
                        </div>
                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>{new Date(log.event_time).toLocaleTimeString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading recordings...</div>
      ) : (
        <div className="recordings-grid">
          {filtered.map(r => (
            <div key={r.id} className="recording-card glass-panel" onClick={() => setPlaying(r)}>
              <div className="recording-thumb">
                <div className="play-icon">▶</div>
              </div>
              <div className="recording-info">
                <div className="td-name">{r.employee_name}</div>
                <div className="text-muted text-sm">{r.employee_email}</div>
                <div className="recording-meta">
                  <span className="text-muted text-sm">{new Date(r.created_at).toLocaleDateString()}</span>
                  <span className="badge">{formatSize(r.size_bytes)}</span>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-muted empty-row">No recordings found.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default Recordings;
