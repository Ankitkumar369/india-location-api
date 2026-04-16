import { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import './Dashboard.css';

const API_BASE = '';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

function Dashboard() {
  const [stats, setStats] = useState({ states: 0, districts: 0, subDistricts: 0, villages: 0 });
  const [stateData, setStateData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState(localStorage.getItem('apiKey') || '');

  useEffect(() => {
    fetchData();
  }, [apiKey]);

  const fetchData = async () => {
    if (!apiKey) {
      setLoading(false);
      return;
    }

    try {
      // Fetch states
      const statesRes = await axios.get(`${API_BASE}/api/v1/states`, {
        headers: { 'X-API-Key': apiKey }
      });

      const states = statesRes.data.data || [];
      setStateData(states);

      // Calculate totals
      const districtCount = states.reduce((sum, s) => sum + (s.districtCount || 0), 0);

      setStats({
        states: states.length,
        districts: districtCount,
        subDistricts: states.reduce((sum, s) => sum + (s.subDistrictCount || 0), 0),
        villages: 502016 // Approximate from import
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

  if (!apiKey) {
    return (
      <div className="dashboard">
        <div className="api-key-setup">
          <h2>Welcome to India Location API Dashboard</h2>
          <p>Enter your API key to view analytics and test the API.</p>
          <input
            type="text"
            placeholder="Enter API Key (ak_live_...)"
            value={apiKey}
            onChange={handleApiKeyChange}
            className="api-key-input"
          />
          <div className="api-key-help">
            <p>Don't have an API key?</p>
            <ol>
              <li>Register at /api/auth/register</li>
              <li>Login at /api/auth/login</li>
              <li>Create API key at /api/auth/api-key</li>
            </ol>
          </div>
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
          <span>API Key: {apiKey.substring(0, 15)}...</span>
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
            <div className="endpoint-item">
              <span className="method get">GET</span>
              <span>/api/v1/location/:code</span>
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
                        `curl -s "${API_BASE}/api/v1/states/${state.code}/districts" -H "X-API-Key: ${apiKey}"`
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
