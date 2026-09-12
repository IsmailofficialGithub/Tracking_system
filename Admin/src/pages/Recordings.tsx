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

const Recordings: React.FC = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [filter, setFilter] = useState('');

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
              <button className="btn btn-outline" onClick={() => setPlaying(null)}>✕ Close</button>
            </div>
            <video
              key={playing.id}
              controls
              autoPlay
              className="recording-video"
              src={videoUrl(playing)}
            />
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
