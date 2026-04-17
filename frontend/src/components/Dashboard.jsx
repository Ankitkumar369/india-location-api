import { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './Dashboard.css';

const API_BASE = '';

function Dashboard() {
  const [stats, setStats] = useState({ states: 0, districts: 0, subDistricts: 0, villages: 0 });
  const [stateData, setStateData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState(localStorage.getItem('apiKey') || '');
  const [userApiKey, setUserApiKey] = useState(localStorage.getItem('userApiKey') || '');

  useEffect(() => {
    initializeApiKey();
  }, []);

  useEffect(() => {
    if (apiKey || userApiKey) {
      fetchData();
    }
  }, [apiKey, userApiKey]);

  const initializeApiKey = async () => {
    const token = localStorage.getItem('authToken');
    const existingUserApiKey = localStorage.getItem('userApiKey');

    if (token && !existingUserApiKey) {
      // Auto-create API key for logged-in user
      try {
        const res = await axios.post(`${API_BASE}/api/auth/api-key`, {
          name: 'Dashboard Auto-Generated Key'
        }, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const newKey = res.data.keyId;
        const newSecret = res.data.keySecret;

        localStorage.setItem('userApiKey', newKey);
        localStorage.setItem('userApiSecret', newSecret);
        setUserApiKey(newKey);

        // Also save to apiKey for dashboard use
        setApiKey(newKey);
      } catch (error) {
        console.error('Failed to create API key:', error);
      }
    } else if (existingUserApiKey) {
      setUserApiKey(existingUserApiKey);
      setApiKey(existingUserApiKey);
    } else {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    const key = apiKey || userApiKey;
    if (!key) {
      setLoading(false);
      return;
    }

    try {
      const statesRes = await axios.get(`${API_BASE}/api/v1/states`, {
        headers: { 'X-API-Key': key }
      });

      const states = statesRes.data.data || [];
      setStateData(states);

      const districtCount = states.reduce((sum, s) => sum + (s.districtCount || 0), 0);
      const subDistrictCount = states.reduce((sum, s) => sum + (s.subDistrictCount || 0), 0);

      setStats({
        states: states.length,
        districts: districtCount,
        subDistricts: subDistrictCount,
        villages: 502016
      });

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setLoading(false);
    }
  };

  const handleApiKeyChange = (e) => {
    const key = e.target.value;
    setApiKey(key);
    localStorage.setItem('apiKey', key);
  };

  const currentKey = apiKey || userApiKey;

  if (!currentKey) {
    return (
      <div className="dashboard">
        <div className="api-key-setup">
          <h2>Welcome to India Location API Dashboard</h2>
          <p>Please login to access the dashboard and API.</p>
          <p className="hint">Use the Login/Register form above to get started.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="dashboard loading">Loading dashboard data...</div>;
  }

  const topStates = [...stateData]
    .sort((a, b) => (b.districtCount || 0) - (a.districtCount || 0))
    .slice(0, 10);

  const chartData = topStates.map(s => ({
    name: s.name.length > 15 ? s.name.substring(0, 15) + '...' : s.name,
    districts: s.districtCount || 0
  }));

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>India Location API Dashboard</h1>
        <div className="api-key-display">
          <span>API Key: {currentKey.substring(0, 15)}...</span>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>States</h3>
          <p className="stat-number">{stats.states}</p>
        </div>
        <div className="stat-card">
          <h3>Districts</h3>
          <p className="stat-number">{stats.districts}</p>
        </div>
        <div className="stat-card">
          <h3>Sub-Districts</h3>
          <p className="stat-number">{stats.subDistricts}</p>
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
          <h3>API Endpoints Available</h3>
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
              <th>API Action</th>
            </tr>
          </thead>
          <tbody>
            {stateData.map(state => (
              <tr key={state.id}>
                <td>{state.name}</td>
                <td>{state.code}</td>
                <td>{state.districtCount || 0}</td>
                <td>
                  <button
                    className="api-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `curl -s "${API_BASE}/api/v1/states/${state.code}/districts" -H "X-API-Key: ${currentKey}"`
                      );
                    }}
                  >
                    Copy Curl
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
