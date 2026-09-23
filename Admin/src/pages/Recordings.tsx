import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import LiveVideoPlayer from '../components/LiveVideoPlayer';
import { getLogEventDetails } from '../utils/logFormatter';
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
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const employeeId = searchParams.get('employee_id');

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [filter, setFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeSessionsMap, setActiveSessionsMap] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'recording' | 'live'>('recording');

  const getEmployeeId = (r: Recording) => {
    if (r.id.includes('_')) return r.id.split('_')[0];
    return '';
  };

  const handleDelete = async (ids: string[]) => {
    if (!window.confirm(`Are you sure you want to delete ${ids.length} recording(s)?\n\nThis will permanently remove the video files from the server, but keep the time tracking session log intact.`)) return;
    try {
      const token = localStorage.getItem('admin_token');
      await api.delete('/admin/recordings', {
        headers: { 'Authorization': `Bearer ${token}` },
        data: { ids }
      });
      setRecordings(prev => prev.filter(r => !ids.includes(r.id)));
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    } catch (e) {
      console.error(e);
      alert('Failed to delete recordings.');
    }
  };

  useEffect(() => {
    // Check for active sessions across midnight
    api.get('/admin/sessions')
      .then(r => {
        const map: Record<string, string> = {};
        r.data.filter((s: any) => !s.check_out_at).forEach((s: any) => {
          map[s.employee_id] = s.id;
        });
        setActiveSessionsMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (playing) {
      setViewMode('recording');
      api.get(`/admin/sessions/${playing.session_id}/logs`)
        .then(r => setSessionLogs(r.data))
        .catch(console.error);
    } else {
      setSessionLogs([]);
    }
  }, [playing]);

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  useEffect(() => {
    setLoading(true);
    let url = `/admin/recordings?days=${timeFilter}`;
    if (employeeId) url += `&employee_id=${employeeId}`;

    api.get(url)
      .then(r => setRecordings(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [timeFilter, employeeId]);

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
    const empId = getEmployeeId(r);
    const isLive = Boolean(activeSessionsMap[empId]);
    return `${baseUrl}/employee/recordings/stream/${r.id}?token=${token}${isLive ? '&live=true' : ''}`;
  };

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1>{employeeId ? 'Employee Recordings' : 'All Recordings'}</h1>
          <p className="text-muted">Browse and playback employee screen recordings</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {selectedIds.length > 0 && (
            <button 
              className="btn btn-outline" 
              style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} 
              onClick={() => handleDelete(selectedIds)}
            >
              🗑 Delete ({selectedIds.length})
            </button>
          )}
          {employeeId && (
            <button 
              className="btn btn-outline" 
              onClick={() => navigate('/recordings')} 
              style={{ marginRight: '10px' }}
            >
              Clear Filter
            </button>
          )}
          <select 
            className="input-field" 
            value={timeFilter} 
            onChange={e => setTimeFilter(Number(e.target.value))}
            style={{ minWidth: '150px' }}
          >
            <option value={0}>All Time</option>
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>
          <input
            className="input-field search-input"
            placeholder="Filter by employee..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
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

            {/* Mode Toggle if user is currently active */}
            {activeSessionsMap[getEmployeeId(playing)] && (
              <div style={{ display: 'flex', gap: '8px', padding: '0 1rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <button 
                  className={`btn btn-sm ${viewMode === 'recording' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setViewMode('recording')}
                >
                  📼 Recorded Playback
                </button>
                <button 
                  className={`btn btn-sm ${viewMode === 'live' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setViewMode('live')}
                >
                  🔴 Live Screen Feed (Active Now)
                </button>
              </div>
            )}

            {viewMode === 'live' && activeSessionsMap[getEmployeeId(playing)] ? (
              <div style={{ padding: '1rem' }}>
                <LiveVideoPlayer sessionId={activeSessionsMap[getEmployeeId(playing)]} />
              </div>
            ) : (
              <video
                key={playing.id}
                controls
                autoPlay
                className="recording-video"
                src={videoUrl(playing)}
              />
            )}

            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.1)' }}>
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

      {loading ? (
        <div className="loading">Loading recordings...</div>
      ) : (
        <div className="recordings-grid">
          {filtered.map(r => {
            const isLiveNow = Boolean(activeSessionsMap[getEmployeeId(r)]);
            return (
              <div key={r.id} className="recording-card glass-panel" onClick={() => setPlaying(r)} style={{ position: 'relative' }}>
                <input
                  type="checkbox"
                  style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 10, width: '18px', height: '18px', cursor: 'pointer' }}
                  checked={selectedIds.includes(r.id)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(prev => [...prev, r.id]);
                    else setSelectedIds(prev => prev.filter(id => id !== r.id));
                  }}
                  onClick={e => e.stopPropagation()}
                />
                {isLiveNow && (
                  <span style={{ position: 'absolute', top: '10px', right: '45px', zIndex: 10, background: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span className="live-dot" style={{ margin: 0, width: '6px', height: '6px' }}>●</span> Live
                  </span>
                )}
                <button
                  className="btn btn-outline"
                  style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 10, padding: '4px 8px', border: 'none', background: 'rgba(255,0,0,0.1)', color: '#ff4d4d', borderRadius: '4px' }}
                  onClick={(e) => { e.stopPropagation(); handleDelete([r.id]); }}
                  title="Delete Recording"
                >
                  🗑
                </button>
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
            );
          })}
          {filtered.length === 0 && (
            <p className="text-muted empty-row">No recordings found.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default Recordings;
