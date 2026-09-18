import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../api/axios';
import { getLogEventDetails, type SessionLog } from '../utils/logFormatter';

interface Session {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  check_in_at: string;
  check_out_at: string | null;
  status: string;
}

const History: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Track which session has its logs expanded
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionLogs, setSessionLogs] = useState<Record<string, SessionLog[]>>({});
  const [logsLoading, setLogsLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    
    api.get(`/admin/sessions?employee_id=${id}`)
      .then(r => setSessions(r.data))
      .catch(err => {
        console.error("Failed to load employee history", err);
        setError("Failed to load employee history.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const toggleSessionLogs = async (sessionId: string) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      return;
    }

    setExpandedSessionId(sessionId);

    if (!sessionLogs[sessionId]) {
      setLogsLoading(prev => ({ ...prev, [sessionId]: true }));
      try {
        const res = await api.get(`/admin/sessions/${sessionId}/logs`);
        setSessionLogs(prev => ({ ...prev, [sessionId]: res.data }));
      } catch (err) {
        console.error("Failed to load session logs", err);
      } finally {
        setLogsLoading(prev => ({ ...prev, [sessionId]: false }));
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'on_time': return 'badge badge-success';
      case 'completed': return 'badge badge-success';
      case 'late': return 'badge badge-warning';
      case 'interrupted': return 'badge badge-danger';
      case 'ended_early': return 'badge badge-danger';
      case 'flagged': return 'badge badge-danger';
      case 'absent': return 'badge badge-danger';
      case 'rejected': return 'badge badge-danger';
      default: return 'badge badge-outline';
    }
  };

  if (loading) return <div className="page"><div className="loading">Loading history...</div></div>;

  const passedName = location.state?.employeeName as string | undefined;
  const employeeName = sessions.length > 0 ? sessions[0].employee_name : (passedName || 'Employee');

  return (
    <div className="page">
      {error && <div className="alert-error" onClick={() => setError('')}>{error} ✕</div>}
      
      <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button 
          className="btn" 
          style={{ background: 'transparent', border: 'none', padding: '4px' }} 
          onClick={() => navigate('/employees')} 
          title="Back to Employees"
        >
          <ArrowLeft size={24} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div>
          <h1>{employeeName}'s History</h1>
          <p className="text-muted">Detailed attendance logs and sessions</p>
        </div>
      </div>

      <div className="table-card glass-panel" style={{ marginTop: '20px' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => {
              const isExpanded = expandedSessionId === s.id;
              const dateStr = new Date(s.check_in_at).toLocaleDateString();
              const checkInTime = new Date(s.check_in_at).toLocaleTimeString();
              const checkOutTime = s.check_out_at ? new Date(s.check_out_at).toLocaleTimeString() : '--:--';
              
              return (
                <React.Fragment key={s.id}>
                  <tr style={{ cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }} onClick={() => toggleSessionLogs(s.id)}>
                    <td style={{ fontWeight: 500 }}>{dateStr}</td>
                    <td className="text-muted">{checkInTime}</td>
                    <td className="text-muted">{checkOutTime}</td>
                    <td><span className={getStatusBadge(s.status)}>{s.status.replace('_', ' ')}</span></td>
                    <td>
                      <button className="btn" style={{ background: 'transparent', border: 'none', padding: '4px', color: 'var(--text-muted)' }}>
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                    </td>
                  </tr>
                  
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} style={{ padding: '0' }}>
                        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <h4 style={{ marginBottom: '12px', fontSize: '0.95rem' }}>Detailed Logs</h4>
                          
                          {logsLoading[s.id] ? (
                            <div className="text-muted text-sm">Loading logs...</div>
                          ) : sessionLogs[s.id] && sessionLogs[s.id].length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {sessionLogs[s.id].map((log: SessionLog) => {
                                const { color, label, description } = getLogEventDetails(log);
                                return (
                                  <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', maxWidth: '600px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{label}</span>
                                      </div>
                                      {description && (
                                        <span className="text-muted" style={{ fontSize: '0.8rem', paddingLeft: '16px' }}>{description}</span>
                                      )}
                                    </div>
                                    <span className="text-muted" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{new Date(log.event_time).toLocaleTimeString()}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-muted text-sm">No detailed logs found.</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            
            {sessions.length === 0 && (
              <tr><td colSpan={5} className="empty-row text-muted">No sessions recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default History;
