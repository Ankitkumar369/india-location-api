import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import DemoClient from './components/DemoClient';
import Auth from './components/Auth';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const handleLogin = (token, userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('apiKey');
    setUser(null);
  };

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!user) {
    return (
      <>
        <nav className="navbar">
          <div className="nav-brand">
            <h1>India Location API</h1>
            <span className="badge">BoldAnalytics</span>
          </div>
        </nav>
        <Auth onLogin={handleLogin} />
      </>
    );
  }

  return (
    <BrowserRouter>
      <nav className="navbar">
        <div className="nav-brand">
          <h1>India Location API</h1>
          <span className="badge">BoldAnalytics</span>
        </div>
        <div className="nav-links">
          <span className="user-email">{user.email}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/demo" element={<DemoClient />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
