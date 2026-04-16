import { useState, useEffect } from 'react';
import axios from 'axios';
import './DemoClient.css';

const API_BASE = 'http://localhost:3000';

function DemoClient() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('demoApiKey') || '');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    state: '',
    district: '',
    subDistrict: '',
    village: '',
    address: ''
  });
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [subDistricts, setSubDistricts] = useState([]);
  const [villageSuggestions, setVillageSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (apiKey) {
      fetchStates();
    }
  }, [apiKey]);

  const fetchStates = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/states`, {
        headers: { 'X-API-Key': apiKey }
      });
      setStates(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch states:', error);
    }
  };

  const fetchDistricts = async (stateCode) => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/states/${stateCode}/districts`, {
        headers: { 'X-API-Key': apiKey }
      });
      setDistricts(res.data.data || []);
      setSubDistricts([]);
      setFormData(prev => ({ ...prev, district: '', subDistrict: '', village: '' }));
    } catch (error) {
      console.error('Failed to fetch districts:', error);
    }
  };

  const fetchSubDistricts = async (districtCode) => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/districts/${districtCode}/subdistricts`, {
        headers: { 'X-API-Key': apiKey }
      });
      setSubDistricts(res.data.data || []);
      setFormData(prev => ({ ...prev, subDistrict: '', village: '' }));
    } catch (error) {
      console.error('Failed to fetch sub-districts:', error);
    }
  };

  const handleVillageSearch = async (query) => {
    if (query.length < 2) {
      setVillageSuggestions([]);
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/api/v1/autocomplete?q=${query}&type=village`, {
        headers: { 'X-API-Key': apiKey }
      });
      setVillageSuggestions(res.data.suggestions || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Failed to search villages:', error);
    }
  };

  const handleVillageSelect = (village) => {
    setFormData(prev => ({
      ...prev,
      village: village.name,
      subDistrict: village.fullPath.split(', ')[1] || '',
      district: village.fullPath.split(', ')[2] || '',
      state: village.fullPath.split(', ')[3] || ''
    }));
    setShowSuggestions(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);

    // Simulate API submission
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      console.log('Form submitted:', formData);
    }, 1500);
  };

  if (!apiKey) {
    return (
      <div className="demo-client">
        <div className="api-key-setup">
          <h2>Demo: Village Autocomplete Form</h2>
          <p>Enter your API key to test the village autocomplete feature.</p>
          <input
            type="text"
            placeholder="Enter API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="api-key-input"
          />
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="demo-client">
        <div className="success-message">
          <h2>Form Submitted Successfully!</h2>
          <p>Thank you, {formData.name}!</p>
          <p>Your address has been saved with village: {formData.village}</p>
          <button onClick={() => setSubmitted(false)}>Submit Another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="demo-client">
      <div className="form-container">
        <h2>Demo: Address Form with Village Autocomplete</h2>
        <p className="subtitle">This demonstrates how B2B clients can integrate our API for address forms.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>State</label>
              <select
                value={formData.state}
                onChange={(e) => {
                  const state = states.find(s => s.name === e.target.value);
                  setFormData({ ...formData, state: e.target.value });
                  if (state) fetchDistricts(state.code);
                }}
              >
                <option value="">Select State</option>
                {states.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>District</label>
              <select
                value={formData.district}
                onChange={(e) => {
                  const district = districts.find(d => d.name === e.target.value);
                  setFormData({ ...formData, district: e.target.value });
                  if (district) fetchSubDistricts(district.code);
                }}
                disabled={!formData.state}
              >
                <option value="">Select District</option>
                {districts.map(d => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Sub-District</label>
              <select
                value={formData.subDistrict}
                onChange={(e) => setFormData({ ...formData, subDistrict: e.target.value })}
                disabled={!formData.district}
              >
                <option value="">Select Sub-District</option>
                {subDistricts.map(sd => (
                  <option key={sd.id} value={sd.name}>{sd.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group autocomplete">
            <label>Village (Autocomplete)</label>
            <input
              type="text"
              value={formData.village}
              onChange={(e) => {
                setFormData({ ...formData, village: e.target.value });
                handleVillageSearch(e.target.value);
              }}
              onFocus={() => formData.village.length >= 2 && setShowSuggestions(true)}
              placeholder="Start typing village name..."
              className="autocomplete-input"
            />
            {showSuggestions && villageSuggestions.length > 0 && (
              <ul className="suggestions-list">
                {villageSuggestions.map((s, i) => (
                  <li key={i} onClick={() => handleVillageSelect(s)}>
                    <strong>{s.name}</strong>
                    <span>{s.fullPath}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="form-group">
            <label>Full Address</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows="3"
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Form'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default DemoClient;
