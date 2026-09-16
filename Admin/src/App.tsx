import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Recordings from './pages/Recordings';
import Sessions from './pages/Sessions';
import DownloadTracker from './pages/DownloadTracker';
import History from './pages/History';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('admin_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<Employees />} />
          <Route path="employees/:id/history" element={<History />} />
          <Route path="recordings" element={<Recordings />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="download-tracker" element={<DownloadTracker />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
