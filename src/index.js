/**
 * India Location API - Main Server
 *
 * Express.js server with all API endpoints for location data.
 * Supports B2B authentication via API keys.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// ============================================
// RATE LIMITING
// ============================================

const apiLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 100, // Default: 100 requests per day
  message: { error: 'Rate limit exceeded. Please upgrade your plan.' }
});

// ============================================
// AUTH MIDDLEWARE
// ============================================

async function authenticateApiKey(req, res, next) {
  const apiKeyId = req.headers['x-api-key'];

  if (!apiKeyId) {
    return res.status(401).json({ error: 'API key required. Include X-API-Key header.' });
  }

  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyId: apiKeyId },
      include: { user: true }
    });

    if (!apiKey || !apiKey.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive API key.' });
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return res.status(401).json({ error: 'API key has expired.' });
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    });

    req.apiKey = apiKey;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed.' });
  }
}

// ============================================
// VALIDATION SCHEMAS
// ============================================

const searchSchema = z.object({
  q: z.string().min(1).max(100),
  type: z.enum(['village', 'subdistrict', 'district', 'state', 'all']).optional(),
  state: z.string().optional(),
  district: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional()
});

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- AUTHENTICATION ----

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists.' });
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

    res.status(201).json({ message: 'User created successfully.', userId: user.id });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// Create API Key
app.post('/api/auth/api-key', authenticateApiKey, async (req, res) => {
  try {
    const name = req.body.name || 'My API Key';
    const plan = req.body.plan || 'FREE';

    const keyId = `ak_live_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const keySecret = uuidv4();
    const hashedSecret = await bcrypt.hash(keySecret, 10);

    const apiKey = await prisma.apiKey.create({
      data: {
        keyId,
        keySecret: hashedSecret,
        name: name || 'My API Key',
        plan,
        rateLimit: getRateLimitForPlan(plan),
        userId: req.apiKey.userId
      }
    });

    res.status(201).json({
      keyId: apiKey.keyId,
      keySecret, // Only shown once!
      name: apiKey.name,
      plan: apiKey.plan,
      rateLimit: apiKey.rateLimit
    });
  } catch (error) {
    console.error('API key creation error:', error);
    res.status(500).json({ error: 'Failed to create API key.' });
  }
});

// ---- LOCATION DATA ----

// Get all states
app.get('/api/v1/states', authenticateApiKey, async (req, res) => {
  try {
    const states = await prisma.state.findMany({
      include: {
        _count: {
          select: { districts: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json({
      count: states.length,
      data: states.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        districtCount: s._count.districts
      }))
    });
  } catch (error) {
    console.error('States error:', error);
    res.status(500).json({ error: 'Failed to fetch states.' });
  }
});

// Get districts by state
app.get('/api/v1/states/:stateCode/districts', authenticateApiKey, async (req, res) => {
  try {
    const { stateCode } = req.params;

    const state = await prisma.state.findFirst({
      where: { code: stateCode }
    });

    if (!state) {
      return res.status(404).json({ error: 'State not found.' });
    }

    const districts = await prisma.district.findMany({
      where: { stateId: state.id },
      include: {
        _count: {
          select: { subDistricts: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json({
      state: state.name,
      count: districts.length,
      data: districts.map(d => ({
        id: d.id,
        name: d.name,
        code: d.code,
        subDistrictCount: d._count.subDistricts
      }))
    });
  } catch (error) {
    console.error('Districts error:', error);
    res.status(500).json({ error: 'Failed to fetch districts.' });
  }
});

// Get sub-districts by district
app.get('/api/v1/districts/:districtCode/subdistricts', authenticateApiKey, async (req, res) => {
  try {
    const { districtCode } = req.params;

    const district = await prisma.district.findFirst({
      where: { code: districtCode },
      include: { state: true }
    });

    if (!district) {
      return res.status(404).json({ error: 'District not found.' });
    }

    const subDistricts = await prisma.subDistrict.findMany({
      where: { districtId: district.id },
      include: {
        _count: {
          select: { villages: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json({
      state: district.state.name,
      district: district.name,
      count: subDistricts.length,
      data: subDistricts.map(sd => ({
        id: sd.id,
        name: sd.name,
        code: sd.code,
        villageCount: sd._count.villages
      }))
    });
  } catch (error) {
    console.error('Sub-districts error:', error);
    res.status(500).json({ error: 'Failed to fetch sub-districts.' });
  }
});

// Get villages by sub-district
app.get('/api/v1/subdistricts/:subDistrictCode/villages', authenticateApiKey, async (req, res) => {
  try {
    const { subDistrictCode } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const subDistrict = await prisma.subDistrict.findFirst({
      where: { code: subDistrictCode },
      include: { district: { include: { state: true } } }
    });

    if (!subDistrict) {
      return res.status(404).json({ error: 'Sub-district not found.' });
    }

    const villages = await prisma.village.findMany({
      where: { subDistrictId: subDistrict.id },
      orderBy: { name: 'asc' },
      skip: offset,
      take: limit
    });

    const total = await prisma.village.count({ where: { subDistrictId: subDistrict.id } });

    res.json({
      state: subDistrict.district.state.name,
      district: subDistrict.district.name,
      subDistrict: subDistrict.name,
      total,
      limit,
      offset,
      data: villages.map(v => ({
        id: v.id,
        name: v.name,
        code: v.code
      }))
    });
  } catch (error) {
    console.error('Villages error:', error);
    res.status(500).json({ error: 'Failed to fetch villages.' });
  }
});

// Search endpoint
app.get('/api/v1/search', authenticateApiKey, async (req, res) => {
  try {
    const { q, type = 'all', state, district, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
    }

    const searchTerm = q.toUpperCase();
    const results = { villages: [], subDistricts: [], districts: [], states: [] };

    // Search villages
    if (type === 'all' || type === 'village') {
      const villageWhere = {
        name: { contains: searchTerm },
        ...(state && { subDistrict: { district: { state: { code: state } } } }),
        ...(district && { subDistrict: { district: { code: district } } })
      };

      results.villages = await prisma.village.findMany({
        where: villageWhere,
        include: {
          subDistrict: {
            include: {
              district: {
                include: { state: true }
              }
            }
          }
        },
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      });
    }

    // Search sub-districts
    if (type === 'all' || type === 'subdistrict') {
      const subWhere = {
        name: { contains: searchTerm },
        ...(state && { district: { state: { code: state } } })
      };

      results.subDistricts = await prisma.subDistrict.findMany({
        where: subWhere,
        include: { district: { include: { state: true } } },
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      });
    }

    // Search districts
    if (type === 'all' || type === 'district') {
      const distWhere = {
        name: { contains: searchTerm },
        ...(state && { state: { code: state } })
      };

      results.districts = await prisma.district.findMany({
        where: distWhere,
        include: { state: true },
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      });
    }

    // Search states
    if (type === 'all' || type === 'state') {
      results.states = await prisma.state.findMany({
        where: { name: { contains: searchTerm } },
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      });
    }

    res.json({
      query: q,
      data: results
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed.' });
  }
});

// Autocomplete endpoint
app.get('/api/v1/autocomplete', authenticateApiKey, async (req, res) => {
  try {
    const { q, type = 'village' } = req.query;

    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    const searchTerm = q.toUpperCase();
    const suggestions = [];

    if (type === 'village' || type === 'all') {
      const villages = await prisma.village.findMany({
        where: { name: { contains: searchTerm } },
        include: {
          subDistrict: {
            include: {
              district: {
                include: { state: true }
              }
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

    res.json({ suggestions: suggestions.slice(0, 20) });
  } catch (error) {
    console.error('Autocomplete error:', error);
    res.status(500).json({ error: 'Autocomplete failed.' });
  }
});

// Get location by code (any type)
app.get('/api/v1/location/:code', authenticateApiKey, async (req, res) => {
  try {
    const { code } = req.params;

    // Try to find village first
    let location = await prisma.village.findUnique({
      where: { code },
      include: {
        subDistrict: {
          include: {
            district: {
              include: { state: true }
            }
          }
        }
      }
    });

    if (location) {
      return res.json({
        type: 'village',
        data: {
          id: location.id,
          name: location.name,
          code: location.code,
          subDistrict: location.subDistrict.name,
          district: location.subDistrict.district.name,
          state: location.subDistrict.district.state.name
        }
      });
    }

    // Try sub-district
    location = await prisma.subDistrict.findUnique({
      where: { code },
      include: { district: { include: { state: true } } }
    });

    if (location) {
      return res.json({
        type: 'subdistrict',
        data: {
          id: location.id,
          name: location.name,
          code: location.code,
          district: location.district.name,
          state: location.district.state.name
        }
      });
    }

    // Try district
    location = await prisma.district.findUnique({
      where: { code },
      include: { state: true }
    });

    if (location) {
      return res.json({
        type: 'district',
        data: {
          id: location.id,
          name: location.name,
          code: location.code,
          state: location.state.name
        }
      });
    }

    // Try state
    location = await prisma.state.findUnique({
      where: { code }
    });

    if (location) {
      return res.json({
        type: 'state',
        data: {
          id: location.id,
          name: location.name,
          code: location.code
        }
      });
    }

    res.status(404).json({ error: 'Location not found.' });
  } catch (error) {
    console.error('Location error:', error);
    res.status(500).json({ error: 'Failed to fetch location.' });
  }
});

// ---- ADMIN ENDPOINTS ----

// Get API usage stats
app.get('/api/admin/stats', authenticateApiKey, async (req, res) => {
  if (req.apiKey.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  try {
    const totalUsers = await prisma.user.count();
    const totalApiKeys = await prisma.apiKey.count();
    const totalLogs = await prisma.apiLog.count();

    // Recent logs
    const recentLogs = await prisma.apiLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' }
    });

    // Logs by endpoint
    const logsByEndpoint = await prisma.$queryRaw`
      SELECT endpoint, COUNT(*) as count
      FROM api_log
      GROUP BY endpoint
      ORDER BY count DESC
      LIMIT 10
    `;

    res.json({
      totalUsers,
      totalApiKeys,
      totalRequests: totalLogs,
      recentLogs,
      logsByEndpoint
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function getRateLimitForPlan(plan) {
  const limits = {
    FREE: 100,
    STARTER: 1000,
    PREMIUM: 10000,
    UNLIMITED: 1000000
  };
  return limits[plan] || 100;
}

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`\n🏠 India Location API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n   Endpoints:`);
  console.log(`   - GET  /health`);
  console.log(`   - POST /api/auth/register`);
  console.log(`   - POST /api/auth/login`);
  console.log(`   - POST /api/auth/api-key`);
  console.log(`   - GET  /api/v1/states`);
  console.log(`   - GET  /api/v1/states/:code/districts`);
  console.log(`   - GET  /api/v1/districts/:code/subdistricts`);
  console.log(`   - GET  /api/v1/subdistricts/:code/villages`);
  console.log(`   - GET  /api/v1/search?q=...`);
  console.log(`   - GET  /api/v1/autocomplete?q=...`);
  console.log(`   - GET  /api/v1/location/:code`);
  console.log(`   - GET  /api/admin/stats\n`);
});

export default app;
