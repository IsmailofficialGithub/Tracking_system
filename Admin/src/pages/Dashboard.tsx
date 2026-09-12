import React from 'react';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  return (
    <div className="dashboard-container">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="text-muted">Overview of your team's activity</p>
      </div>

      <div className="stats-grid">
        <div className="card stat-card glass-panel">
          <h3>Active Now</h3>
          <div className="stat-value text-accent">0</div>
        </div>
        <div className="card stat-card glass-panel">
          <h3>Late Check-ins</h3>
          <div className="stat-value text-danger">0</div>
        </div>
        <div className="card stat-card glass-panel">
          <h3>Total Employees</h3>
          <div className="stat-value">0</div>
        </div>
      </div>

      <div className="card glass-panel mt-2">
        <h3>Recent Activity</h3>
        <p className="text-muted" style={{ marginTop: '1rem' }}>No recent activity to display.</p>
      </div>
    </div>
  );
};

export default Dashboard;
