import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import DemoClient from './components/DemoClient';
import Auth from './components/Auth';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const token = localStorage.getItem('authToken');
      const userData = localStorage.getItem('user');
      if (token && userData) {
        const parsed = JSON.parse(userData);
        if (parsed && parsed.id) {
          setUser(parsed);
        }
      }
    } catch (e) {
      console.error('Error loading user:', e);
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
    }
    setLoading(false);
  }, []);

  const handleLogin = (token, userData) => {
    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('apiKey');
    localStorage.removeItem('userApiKey');
    localStorage.removeItem('userApiSecret');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <nav className="navbar">
        <div className="nav-brand">
          <h1>India Location API</h1>
          <span className="badge">BoldAnalytics</span>
        </div>
        {user && (
          <div className="nav-links">
            <span className="user-email">{user.email}</span>
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        )}
      </nav>
      {user ? (
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/demo" element={<DemoClient />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        <Auth onLogin={handleLogin} />
      )}
    </BrowserRouter>
  );
}

export default App;