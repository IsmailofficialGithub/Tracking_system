import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Video, LogOut, ClipboardList, Download } from 'lucide-react';
import './Layout.css';

const Layout: React.FC = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/login');
  };

  const link = ({ isActive }: { isActive: boolean }) => isActive ? 'nav-link active' : 'nav-link';

  return (
    <div className="app-container">
      <aside className="sidebar glass-panel">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-dot" />
            <h2>EMS Admin</h2>
          </div>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={link}>
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/employees" className={link}>
            <Users size={18} />
            <span>Employees</span>
          </NavLink>
          <NavLink to="/sessions" className={link}>
            <ClipboardList size={18} />
            <span>Session Logs</span>
          </NavLink>
          <NavLink to="/recordings" className={link}>
            <Video size={18} />
            <span>Recordings</span>
          </NavLink>
          <NavLink to="/download-tracker" className={link}>
            <Download size={18} />
            <span>Download Tracker</span>
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <button className="nav-link logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
