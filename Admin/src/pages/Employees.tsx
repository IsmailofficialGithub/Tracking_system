import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, History, Video, Lock, Trash2, CalendarCheck, List } from 'lucide-react';
import api from '../api/axios';
import './Employees.css';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  timezone: string;
}

const Employees: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateShift, setShowCreateShift] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftTemplate | null>(null);
  const [showAssignShift, setShowAssignShift] = useState<string | null>(null); // employee id
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showChangePasswordId, setShowChangePasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const navigate = useNavigate();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'employee' });
  const [newShift, setNewShift] = useState({ name: '', start_time: '08:00', end_time: '17:00', grace_minutes: 15, timezone: 'UTC' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, shiftsRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/shift-templates'),
      ]);
      setUsers(usersRes.data);
      setShifts(shiftsRes.data);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', newUser);
      setNewUser({ name: '', email: '', password: '', role: 'employee' });
      setShowCreateUser(false);
      loadData();
    } catch (err: any) {
      setError(err.response?.data || 'Failed to create employee');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Delete this employee? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/users/${id}`);
      loadData();
    } catch {
      setError('Failed to delete employee');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showChangePasswordId) return;
    try {
      await api.put(`/admin/users/${showChangePasswordId}/password`, { password: newPassword });
      setSuccess('Password changed successfully');
      setShowChangePasswordId(null);
      setNewPassword('');
    } catch {
      setError('Failed to change password');
    }
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formattedShift = {
        ...newShift,
        start_time: newShift.start_time.length === 5 ? `${newShift.start_time}:00` : newShift.start_time,
        end_time: newShift.end_time.length === 5 ? `${newShift.end_time}:00` : newShift.end_time,
      };
      await api.post('/admin/shift-templates', formattedShift);
      setShowCreateShift(false);
      loadData();
    } catch {
      setError('Failed to create shift template');
    }
  };

  const handleUpdateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;
    try {
      const formattedShift = {
        name: editingShift.name,
        start_time: editingShift.start_time.length === 5 ? `${editingShift.start_time}:00` : editingShift.start_time,
        end_time: editingShift.end_time.length === 5 ? `${editingShift.end_time}:00` : editingShift.end_time,
        grace_minutes: Number(editingShift.grace_minutes),
        timezone: editingShift.timezone,
      };
      await api.put(`/admin/shift-templates/${editingShift.id}`, formattedShift);
      setEditingShift(null);
      loadData();
    } catch {
      setError('Failed to update shift template');
    }
  };

  const handleAssignShift = async (employeeId: string) => {
    if (!selectedShiftId) return;
    try {
      await api.post('/admin/employee-shifts', { employee_id: employeeId, shift_template_id: selectedShiftId });
      setShowAssignShift(null);
      setSelectedShiftId('');
    } catch {
      setError('Failed to assign shift');
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!confirm('Delete this shift template?')) return;
    try {
      await api.delete(`/admin/shift-templates/${id}`);
      loadData();
    } catch {
      setError('Failed to delete shift');
    }
  };

  const roleColor = (role: string) => {
    if (role === 'super_admin') return 'badge badge-danger';
    if (role === 'manager') return 'badge badge-warning';
    return 'badge badge-success';
  };

  return (
    <div className="page">
      {error && <div className="alert-error" onClick={() => setError('')}>{error} ✕</div>}
      {success && <div className="alert-success" onClick={() => setSuccess('')}>{success} ✕</div>}

      {/* Employees Section */}
      <div className="section-header">
        <div>
          <h1>Employees</h1>
          <p className="text-muted">Manage your team members</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateUser(true)}>+ Add Employee</button>
      </div>

      {showCreateUser && (
        <div className="modal-overlay" onClick={() => setShowCreateUser(false)}>
          <div className="modal glass-panel" onClick={e => e.stopPropagation()}>
            <h3>Add New Employee</h3>
            <form onSubmit={handleCreateUser}>
              <div className="input-group">
                <label className="input-label">Name</label>
                <input className="input-field" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} required placeholder="Full Name" />
              </div>
              <div className="input-group">
                <label className="input-label">Email</label>
                <input className="input-field" type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} required placeholder="email@example.com" />
              </div>
              <div className="input-group">
                <label className="input-label">Password</label>
                <input className="input-field" type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} required placeholder="Temporary password" />
              </div>
              <div className="input-group">
                <label className="input-label">Role</label>
                <select className="input-field" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateUser(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showChangePasswordId && (
        <div className="modal-overlay" onClick={() => setShowChangePasswordId(null)}>
          <div className="modal glass-panel" onClick={e => e.stopPropagation()}>
            <h3>Change Password</h3>
            <form onSubmit={handleChangePassword}>
              <div className="input-group">
                <label className="input-label">New Password</label>
                <input className="input-field" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="Enter new password" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowChangePasswordId(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Change Password</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="table-card glass-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, index) => (
                <tr key={u.id}>
                  <td className="td-name">{u.name}</td>
                  <td className="text-muted">{u.email}</td>
                  <td><span className={roleColor(u.role)}>{u.role}</span></td>
                  <td className="text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="action-row" style={{ position: 'relative' }}>
                      <button className="btn btn-sm btn-outline" onClick={() => { setShowAssignShift(u.id); setSelectedShiftId(''); }}>
                        <CalendarCheck size={14} /> Assign Shift
                      </button>
                      
                      {/* 3-Dot Menu */}
                      <button 
                        className="btn" 
                        style={{ background: 'transparent', border: 'none', padding: '4px' }} 
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === u.id ? null : u.id); }}
                      >
                        <MoreVertical size={20} style={{ color: 'var(--text-secondary)' }} />
                      </button>

                      {activeMenuId === u.id && (
                        <div 
                          className="dropdown-menu-solid"
                          style={{
                            ...(index >= users.length - 2 && users.length > 3 
                              ? { bottom: '100%', top: 'auto', marginBottom: '8px' } 
                              : { top: '100%', bottom: 'auto', marginTop: '8px' })
                          }}
                        >
                          <button className="dropdown-item-solid" onClick={() => navigate(`/employees/${u.id}/history`, { state: { employeeName: u.name } })}>
                            <History size={14} /> Detailed History
                          </button>
                          <button className="dropdown-item-solid" onClick={() => { setActiveMenuId(null); navigate(`/sessions?employee_id=${u.id}`); }}>
                            <List size={14} /> Session Logs
                          </button>
                          <button className="dropdown-item-solid" onClick={() => { setActiveMenuId(null); navigate(`/recordings?employee_id=${u.id}`); }}>
                            <Video size={14} /> Recordings
                          </button>
                          <button className="dropdown-item-solid" onClick={() => { setShowChangePasswordId(u.id); setActiveMenuId(null); }}>
                            <Lock size={14} /> Change Password
                          </button>
                          <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                          <button className="dropdown-item-solid" onClick={() => { handleDeleteUser(u.id); setActiveMenuId(null); }} style={{ color: '#ef4444' }}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                    {showAssignShift === u.id && (
                      <div className="assign-shift-inline">
                        <select className="input-field" value={selectedShiftId} onChange={e => setSelectedShiftId(e.target.value)}>
                          <option value="">Select shift...</option>
                          {shifts.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                          ))}
                        </select>
                        <button className="btn btn-primary btn-sm" onClick={() => handleAssignShift(u.id)}>Assign</button>
                        <button className="btn btn-outline btn-sm" onClick={() => setShowAssignShift(null)}>Cancel</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="empty-row">No employees yet. Add your first employee!</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Shift Templates Section */}
      <div className="section-header mt-4">
        <div>
          <h2>Shift Templates</h2>
          <p className="text-muted">Create reusable shift schedules</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateShift(true)}>+ Add Shift</button>
      </div>

      {showCreateShift && (
        <div className="modal-overlay" onClick={() => setShowCreateShift(false)}>
          <div className="modal glass-panel" onClick={e => e.stopPropagation()}>
            <h3>Create Shift Template</h3>
            <form onSubmit={handleCreateShift}>
              <div className="input-group">
                <label className="input-label">Shift Name</label>
                <input className="input-field" value={newShift.name} onChange={e => setNewShift({...newShift, name: e.target.value})} required placeholder="Morning Shift" />
              </div>
              <div className="form-row">
                <div className="input-group">
                  <label className="input-label">Start Time</label>
                  <input className="input-field" type="time" value={newShift.start_time} onChange={e => setNewShift({...newShift, start_time: e.target.value})} required />
                </div>
                <div className="input-group">
                  <label className="input-label">End Time</label>
                  <input className="input-field" type="time" value={newShift.end_time} onChange={e => setNewShift({...newShift, end_time: e.target.value})} required />
                </div>
              </div>
              <div className="form-row">
                <div className="input-group">
                  <label className="input-label">Grace Period (minutes)</label>
                  <input className="input-field" type="number" value={newShift.grace_minutes} onChange={e => setNewShift({...newShift, grace_minutes: parseInt(e.target.value) || 0})} required />
                </div>
                <div className="input-group">
                  <label className="input-label">Timezone</label>
                  <input className="input-field" value={newShift.timezone} onChange={e => setNewShift({...newShift, timezone: e.target.value})} placeholder="UTC" required />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateShift(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Shift</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingShift && (
        <div className="modal-overlay" onClick={() => setEditingShift(null)}>
          <div className="modal glass-panel" onClick={e => e.stopPropagation()}>
            <h3>Edit Shift Template</h3>
            <form onSubmit={handleUpdateShift}>
              <div className="input-group">
                <label className="input-label">Shift Name</label>
                <input className="input-field" value={editingShift.name} onChange={e => setEditingShift({...editingShift, name: e.target.value})} required />
              </div>
              <div className="form-row">
                <div className="input-group">
                  <label className="input-label">Start Time</label>
                  <input className="input-field" type="time" value={editingShift.start_time.slice(0, 5)} onChange={e => setEditingShift({...editingShift, start_time: e.target.value})} required />
                </div>
                <div className="input-group">
                  <label className="input-label">End Time</label>
                  <input className="input-field" type="time" value={editingShift.end_time.slice(0, 5)} onChange={e => setEditingShift({...editingShift, end_time: e.target.value})} required />
                </div>
              </div>
              <div className="form-row">
                <div className="input-group">
                  <label className="input-label">Grace Period (minutes)</label>
                  <input className="input-field" type="number" value={editingShift.grace_minutes} onChange={e => setEditingShift({...editingShift, grace_minutes: parseInt(e.target.value) || 0})} required />
                </div>
                <div className="input-group">
                  <label className="input-label">Timezone</label>
                  <input className="input-field" value={editingShift.timezone} onChange={e => setEditingShift({...editingShift, timezone: e.target.value})} required />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditingShift(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="shifts-grid">
        {shifts.map(s => (
          <div key={s.id} className="shift-card glass-panel">
            <div className="shift-card-header">
              <h4>{s.name}</h4>
              <div className="action-row">
                <button className="btn btn-sm btn-outline" onClick={() => setEditingShift(s)}>✎ Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDeleteShift(s.id)}>✕</button>
              </div>
            </div>
            <p className="text-muted">{s.start_time.slice(0, 5)} → {s.end_time.slice(0, 5)}</p>
            <p className="text-muted text-sm">Grace: {s.grace_minutes} mins · {s.timezone}</p>
          </div>
        ))}
        {shifts.length === 0 && <p className="text-muted">No shift templates yet.</p>}
      </div>
    </div>
  );
};

export default Employees;
