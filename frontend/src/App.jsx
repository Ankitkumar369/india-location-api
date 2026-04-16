import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import DemoClient from './components/DemoClient';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <nav className="navbar">
        <div className="nav-brand">
          <h1>India Location API</h1>
          <span className="badge">BoldAnalytics</span>
        </div>
        <div className="nav-links">
          <Link to="/" className="nav-link">Dashboard</Link>
          <Link to="/demo" className="nav-link">Demo Client</Link>
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
