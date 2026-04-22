import { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './Dashboard.css';

const API_BASE = '';

function Dashboard() {
  const [stats, setStats] = useState({ states: 0, districts: 0, subDistricts: 0, villages: 0 });
  const [stateData, setStateData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [manualKey, setManualKey] = useState('');

  useEffect(() => {
    const savedKey = localStorage.getItem('userApiKey') || localStorage.getItem('apiKey');
    if (savedKey) {
      setApiKey(savedKey);
    } else {
      initializeApiKey();
    }
  }, []);

  useEffect(() => {
    if (apiKey) {
      fetchData();
    }
  }, [apiKey]);

  const initializeApiKey = async () => {
    setLoading(true);
    const token = localStorage.getItem('authToken');

    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await axios.post(`${API_BASE}/api/auth/api-key`, {
        name: 'Dashboard Key'
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.data && res.data.keyId) {
        const newKey = res.data.keyId;
        localStorage.setItem('userApiKey', newKey);
        setApiKey(newKey);
      }
    } catch (err) {
      console.error('Failed to create API key:', err);
      setError('Failed to create API key. Please use manual key input below.');
      setLoading(false);
    }
  };

  const fetchData = async () => {
    if (!apiKey) return;

    setLoading(true);
    setError(null);

    try {
      const statesRes = await axios.get(`${API_BASE}/api/v1/states`, {
        headers: { 'X-API-Key': apiKey }
      });

      const states = statesRes.data.data || [];
      setStateData(states);

      const districtCount = states.reduce((sum, s) => sum + (s.districtCount || 0), 0);

      setStats({
        states: states.length,
        districts: districtCount,
        subDistricts: 0,
        villages: 502016
      });

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to fetch API data. Check your API key or try again.');
      setLoading(false);
    }
  };

  const handleManualKeySubmit = (e) => {
    e.preventDefault();
    if (manualKey.trim()) {
      localStorage.setItem('apiKey', manualKey.trim());
      setApiKey(manualKey.trim());
      setManualKey('');
    }
  };

  const retryFetch = () => {
    setError(null);
    fetchData();
  };

  if (!apiKey && !loading) {
    return (
      <div className="dashboard">
        <div className="api-key-setup">
          <h2>Welcome to India Location API Dashboard</h2>
          <p>No API key found. Enter your API key below to continue.</p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleManualKeySubmit} className="manual-key-form">
            <input
              type="text"
              placeholder="Enter your API Key (ak_live_...)"
              value={manualKey}
              onChange={(e) => setManualKey(e.target.value)}
            />
            <button type="submit">Use This Key</button>
          </form>

          <p className="hint">
            Login to automatically generate an API key for your account.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dashboard loading">
        <div className="loading-spinner"></div>
        <p>Loading dashboard data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="error-container">
          <h3>Error Loading Data</h3>
          <p>{error}</p>
          <button onClick={retryFetch} className="retry-btn">Retry</button>
          <form onSubmit={handleManualKeySubmit} className="manual-key-form">
            <input
              type="text"
              placeholder="Or enter a different API key"
              value={manualKey}
              onChange={(e) => setManualKey(e.target.value)}
            />
            <button type="submit">Use This Key</button>
          </form>
        </div>
      </div>
    );
  }

  const topStates = [...stateData]
    .sort((a, b) => (b.districtCount || 0) - (a.districtCount || 0))
    .slice(0, 10);

  const chartData = topStates.map(s => ({
    name: s.name.length > 12 ? s.name.substring(0, 12) + '...' : s.name,
    districts: s.districtCount || 0
  }));

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>India Location API Dashboard</h1>
        <div className="api-key-display">
          <span>API Key: {apiKey.substring(0, 12)}...</span>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>States</h3>
          <p className="stat-number">{stats.states}</p>
        </div>
        <div className="stat-card">
          <h3>Districts</h3>
          <p className="stat-number">{stats.districts.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <h3>Villages</h3>
          <p className="stat-number">{stats.villages.toLocaleString()}</p>
        </div>
      </div>

      <div className="charts-container">
        <div className="chart-card">
          <h3>Top 10 States by District Count</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="districts" fill="#0088FE" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>API Endpoints</h3>
          <div className="endpoints-list">
            <div className="endpoint-item">
              <span className="method get">GET</span>
              <span>/api/v1/states</span>
            </div>
            <div className="endpoint-item">
              <span className="method get">GET</span>
              <span>/api/v1/states/:code/districts</span>
            </div>
            <div className="endpoint-item">
              <span className="method get">GET</span>
              <span>/api/v1/districts/:code/subdistricts</span>
            </div>
            <div className="endpoint-item">
              <span className="method get">GET</span>
              <span>/api/v1/subdistricts/:code/villages</span>
            </div>
            <div className="endpoint-item">
              <span className="method get">GET</span>
              <span>/api/v1/search?q=...</span>
            </div>
            <div className="endpoint-item">
              <span className="method get">GET</span>
              <span>/api/v1/autocomplete?q=...</span>
            </div>
          </div>
        </div>
      </div>

      <div className="states-table">
        <h3>All States ({stateData.length})</h3>
        <table>
          <thead>
            <tr>
              <th>State Name</th>
              <th>Code</th>
              <th>Districts</th>
              <th>Test</th>
            </tr>
          </thead>
          <tbody>
            {stateData.map(state => (
              <tr key={state.id}>
                <td>{state.name}</td>
                <td><code>{state.code}</code></td>
                <td>{state.districtCount || 0}</td>
                <td>
                  <button
                    className="api-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `curl -s "${API_BASE}/api/v1/states/${state.code}/districts" -H "X-API-Key: ${apiKey}"`
                      );
                    }}
                  >
                    Copy
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;