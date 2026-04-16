# India Location API

A production-ready SaaS API platform providing structured access to India's village-level geographical data for B2B integration.

## Features

- **500,000+ villages** across 29 states
- **Normalized database** (3NF) for efficient querying
- **RESTful API** with search and autocomplete
- **API Key authentication** for B2B clients
- **Rate limiting** with tiered plans
- **Admin dashboard** with analytics

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL (NeonDB)
- **ORM**: Prisma
- **Frontend**: React + Vite + Recharts
- **Deployment**: Vercel

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your database URL
```

### 3. Set Up Database

```bash
npx prisma generate
npx prisma db push
npm run import:data
```

### 4. Run Server

```bash
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/states` | Get all states |
| GET | `/api/v1/states/:code/districts` | Get districts by state |
| GET | `/api/v1/districts/:code/subdistricts` | Get sub-districts |
| GET | `/api/v1/subdistricts/:code/villages` | Get villages |
| GET | `/api/v1/search?q=` | Search locations |
| GET | `/api/v1/autocomplete?q=` | Autocomplete suggestions |
| GET | `/api/v1/location/:code` | Get location by code |

## Authentication

Include your API key in the header:

```
X-API-Key: ak_live_your_api_key_here
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
├── src/
│   ├── index.js          # Express server
│   └── scripts/
│       └── importData.js  # Data import script
├── prisma/
│   └── schema.prisma     # Database schema
├── frontend/
│   └── src/
│       ├── components/   # React components
│       └── App.jsx       # Main app
└── package.json
```

## License

MIT
