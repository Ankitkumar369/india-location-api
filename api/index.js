/**
 * India Location API - Vercel Serverless Function
 *
 * Handles API routes for Vercel deployment.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

const API_KEY_HEADER = 'x-api-key';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
};

function sendResponse(res, statusCode, data) {
  res.status(statusCode).json(data);
}

function handleError(res, error) {
  console.error('Error:', error);
  sendResponse(res, 500, { error: error.message || 'Internal server error' });
}

// Authenticate API Key
async function authenticate(req, res) {
  const apiKeyId = req.headers[API_KEY_HEADER];

  if (!apiKeyId) {
    sendResponse(res, 401, { error: 'API key required. Include X-API-Key header.' });
    return null;
  }

  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyId: apiKeyId },
      include: { user: true }
    });

    if (!apiKey || !apiKey.isActive) {
      sendResponse(res, 401, { error: 'Invalid or inactive API key.' });
      return null;
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    });

    return apiKey;
  } catch (error) {
    handleError(res, error);
    return null;
  }
}

// Health check - GET /api
async function handleHealth(req, res) {
  sendResponse(res, 200, {
    status: 'ok',
    message: 'India Location API is running',
    timestamp: new Date().toISOString()
  });
}

// Register - POST /api/auth/register
async function handleRegister(req, res) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return sendResponse(res, 400, { error: 'Email and password are required.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return sendResponse(res, 400, { error: 'User already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'USER'
      }
    });

    sendResponse(res, 201, { message: 'User created successfully.', userId: user.id });
  } catch (error) {
    handleError(res, error);
  }
}

// Login - POST /api/auth/login
async function handleLogin(req, res) {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return sendResponse(res, 401, { error: 'Invalid credentials.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return sendResponse(res, 401, { error: 'Invalid credentials.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback-secret-for-dev',
      { expiresIn: '24h' }
    );

    sendResponse(res, 200, { token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    handleError(res, error);
  }
}

// Authenticate JWT Token
async function authenticateJWT(req, res) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-for-dev');
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    return user;
  } catch (error) {
    return null;
  }
}

// Create API Key - POST /api/auth/api-key
async function handleCreateApiKey(req, res) {
  try {
    const user = await authenticateJWT(req, res);

    if (!user) {
      return sendResponse(res, 401, { error: 'Authentication required. Please login.' });
    }

    const { name, plan = 'FREE' } = req.body;

    const keyId = 'ak_live_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const keySecret = uuidv4();
    const hashedSecret = await bcrypt.hash(keySecret, 10);

    const apiKey = await prisma.apiKey.create({
      data: {
        keyId,
        keySecret: hashedSecret,
        name: name || 'My API Key',
        plan,
        rateLimit: getRateLimitForPlan(plan),
        userId: user.id
      }
    });

    sendResponse(res, 201, {
      keyId: apiKey.keyId,
      keySecret,
      name: apiKey.name,
      plan: apiKey.plan,
      rateLimit: apiKey.rateLimit
    });
  } catch (error) {
    handleError(res, error);
  }
}

function getRateLimitForPlan(plan) {
  const limits = { FREE: 100, STARTER: 1000, PREMIUM: 10000, UNLIMITED: 1000000 };
  return limits[plan] || 100;
}

// Extract route parameter from URL
function extractRouteParam(url, pattern) {
  const match = url.match(pattern);
  return match ? match[1] : null;
}

// Get States - GET /api/v1/states
async function handleGetStates(req, res) {
  const apiKey = await authenticate(req, res);
  if (!apiKey) return;

  try {
    const states = await prisma.state.findMany({
      include: { _count: { select: { districts: true } } },
      orderBy: { name: 'asc' }
    });

    sendResponse(res, 200, {
      count: states.length,
      data: states.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        districtCount: s._count.districts
      }))
    });
  } catch (error) {
    handleError(res, error);
  }
}

// Get Districts - GET /api/v1/states/:code/districts
async function handleGetDistricts(req, res) {
  const apiKey = await authenticate(req, res);
  if (!apiKey) return;

  const stateCode = extractRouteParam(req.url, /\/api\/v1\/states\/([^\/]+)\/districts/);

  if (!stateCode) {
    return sendResponse(res, 400, { error: 'State code is required.' });
  }

  try {
    const state = await prisma.state.findFirst({ where: { code: stateCode } });
    if (!state) {
      return sendResponse(res, 404, { error: 'State not found.' });
    }

    const districts = await prisma.district.findMany({
      where: { stateId: state.id },
      include: { _count: { select: { subDistricts: true } } },
      orderBy: { name: 'asc' }
    });

    sendResponse(res, 200, {
      state: state.name,
      stateCode: state.code,
      count: districts.length,
      data: districts.map(d => ({
        id: d.id,
        name: d.name,
        code: d.code,
        subDistrictCount: d._count.subDistricts
      }))
    });
  } catch (error) {
    handleError(res, error);
  }
}

// Get Sub-Districts - GET /api/v1/districts/:code/subdistricts
async function handleGetSubDistricts(req, res) {
  const apiKey = await authenticate(req, res);
  if (!apiKey) return;

  const districtCode = extractRouteParam(req.url, /\/api\/v1\/districts\/([^\/]+)\/subdistricts/);

  if (!districtCode) {
    return sendResponse(res, 400, { error: 'District code is required.' });
  }

  try {
    const district = await prisma.district.findFirst({ where: { code: districtCode } });
    if (!district) {
      return sendResponse(res, 404, { error: 'District not found.' });
    }

    const subDistricts = await prisma.subDistrict.findMany({
      where: { districtId: district.id },
      include: { _count: { select: { villages: true } } },
      orderBy: { name: 'asc' }
    });

    sendResponse(res, 200, {
      district: district.name,
      districtCode: district.code,
      count: subDistricts.length,
      data: subDistricts.map(sd => ({
        id: sd.id,
        name: sd.name,
        code: sd.code,
        villageCount: sd._count.villages
      }))
    });
  } catch (error) {
    handleError(res, error);
  }
}

// Get Villages - GET /api/v1/subdistricts/:code/villages
async function handleGetVillages(req, res) {
  const apiKey = await authenticate(req, res);
  if (!apiKey) return;

  const subDistrictCode = extractRouteParam(req.url, /\/api\/v1\/subdistricts\/([^\/]+)\/villages/);

  if (!subDistrictCode) {
    return sendResponse(res, 400, { error: 'Sub-district code is required.' });
  }

  try {
    const subDistrict = await prisma.subDistrict.findFirst({ where: { code: subDistrictCode } });
    if (!subDistrict) {
      return sendResponse(res, 404, { error: 'Sub-district not found.' });
    }

    const villages = await prisma.village.findMany({
      where: { subDistrictId: subDistrict.id },
      orderBy: { name: 'asc' }
    });

    sendResponse(res, 200, {
      subDistrict: subDistrict.name,
      subDistrictCode: subDistrict.code,
      count: villages.length,
      data: villages.map(v => ({
        id: v.id,
        name: v.name,
        code: v.code
      }))
    });
  } catch (error) {
    handleError(res, error);
  }
}

// Autocomplete - GET /api/v1/autocomplete
async function handleAutocomplete(req, res) {
  const apiKey = await authenticate(req, res);
  if (!apiKey) return;

  const { q, type = 'village' } = req.query;

  if (!q || q.length < 2) {
    return sendResponse(res, 200, { suggestions: [] });
  }

  const searchTerm = q.toUpperCase();
  const suggestions = [];

  try {
    if (type === 'village' || type === 'all') {
      const villages = await prisma.village.findMany({
        where: { name: { contains: searchTerm } },
        include: {
          subDistrict: {
            include: {
              district: { include: { state: true } }
            }
          }
        },
        take: 10,
        orderBy: { name: 'asc' }
      });

      suggestions.push(...villages.map(v => ({
        type: 'village',
        name: v.name,
        code: v.code,
        fullPath: `${v.name}, ${v.subDistrict.name}, ${v.subDistrict.district.name}, ${v.subDistrict.district.state.name}`
      })));
    }

    if (type === 'subdistrict' || type === 'all') {
      const subDistricts = await prisma.subDistrict.findMany({
        where: { name: { contains: searchTerm } },
        include: { district: { include: { state: true } } },
        take: 10,
        orderBy: { name: 'asc' }
      });

      suggestions.push(...subDistricts.map(sd => ({
        type: 'subdistrict',
        name: sd.name,
        code: sd.code,
        fullPath: `${sd.name}, ${sd.district.name}, ${sd.district.state.name}`
      })));
    }

    sendResponse(res, 200, { suggestions: suggestions.slice(0, 20) });
  } catch (error) {
    handleError(res, error);
  }
}

// Search - GET /api/v1/search
async function handleSearch(req, res) {
  const apiKey = await authenticate(req, res);
  if (!apiKey) return;

  const { q, type = 'all', limit = 20 } = req.query;

  if (!q || q.length < 2) {
    return sendResponse(res, 400, { error: 'Search query must be at least 2 characters.' });
  }

  const searchTerm = q.toUpperCase();
  const results = { villages: [], subDistricts: [], districts: [], states: [] };

  try {
    if (type === 'all' || type === 'village') {
      results.villages = await prisma.village.findMany({
        where: { name: { contains: searchTerm } },
        include: {
          subDistrict: {
            include: {
              district: { include: { state: true } }
            }
          }
        },
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      });
    }

    if (type === 'all' || type === 'subdistrict') {
      results.subDistricts = await prisma.subDistrict.findMany({
        where: { name: { contains: searchTerm } },
        include: { district: { include: { state: true } } },
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      });
    }

    if (type === 'all' || type === 'district') {
      results.districts = await prisma.district.findMany({
        where: { name: { contains: searchTerm } },
        include: { state: true },
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      });
    }

    if (type === 'all' || type === 'state') {
      results.states = await prisma.state.findMany({
        where: { name: { contains: searchTerm } },
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      });
    }

    sendResponse(res, 200, { query: q, data: results });
  } catch (error) {
    handleError(res, error);
  }
}

// Main handler
module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
    return res.status(200).send('');
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { url, method } = req;
  console.log(`${method} ${url}`);

  try {
    // Route handling
    if (url === '/api' || url === '/api/health') {
      return handleHealth(req, res);
    }

    if (url === '/api/auth/register' && method === 'POST') {
      return handleRegister(req, res);
    }

    if (url === '/api/auth/login' && method === 'POST') {
      return handleLogin(req, res);
    }

    if (url === '/api/auth/api-key' && method === 'POST') {
      return handleCreateApiKey(req, res);
    }

    if (url === '/api/v1/states' && method === 'GET') {
      return handleGetStates(req, res);
    }

    if (url.match(/^\/api\/v1\/states\/[^\/]+\/districts$/) && method === 'GET') {
      return handleGetDistricts(req, res);
    }

    if (url.match(/^\/api\/v1\/districts\/[^\/]+\/subdistricts$/) && method === 'GET') {
      return handleGetSubDistricts(req, res);
    }

    if (url.match(/^\/api\/v1\/subdistricts\/[^\/]+\/villages$/) && method === 'GET') {
      return handleGetVillages(req, res);
    }

    if (url.startsWith('/api/v1/autocomplete') && method === 'GET') {
      return handleAutocomplete(req, res);
    }

    if (url.startsWith('/api/v1/search') && method === 'GET') {
      return handleSearch(req, res);
    }

    sendResponse(res, 404, { error: 'Endpoint not found.' });

  } catch (error) {
    handleError(res, error);
  } finally {
    await prisma.$disconnect();
  }
};
