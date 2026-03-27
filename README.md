# Flight Tracker — MAD → China

Monitor round-trip flight prices from Madrid to Beijing, Shanghai, Guangzhou, Shenzhen and Hong Kong for October 2026. No API key required. Powered by `fast-flights`, a library that queries Google Flights' internal API directly.

## Features

- **5 routes**: MAD→PEK, MAD→PVG, MAD→CAN, MAD→SZX, MAD→HKG
- **5 departure dates**: Oct 9, 11, 13, 15, 17 — 12-day round trips
- **2 sweeps/day** at 08:00 and 20:00 UTC (25 searches each = 50/day, no limits)
- **Gulf carrier filter**: Emirates, Etihad, Qatar Airways, flydubai, Oman Air, Gulf Air, Saudia, Kuwait Airways…
- **Price history chart** with route/date filtering
- **No registration, no API key, no monthly cost**

## Quick Start

```bash
git clone https://github.com/sanlega/flight-planner.git
cd flight-planner
docker compose up -d --build
```

Open **http://localhost** and click **"Actualizar ahora"** for the first search.

That's it. No `.env` file needed.

---

## How it works

`fast-flights` reverse-engineers the Google Flights URL parameter (`?tfs=`), which encodes flight queries as Base64 Protobuf. The library constructs valid Protobuf queries and sends them directly to Google — no browser, no Playwright, just lightweight HTTP requests with TLS fingerprinting via `primp`.

For EU users: requests are routed through `fetch_mode="fallback"` (the library's hosted relay) to handle GDPR cookie consent transparently.

---

## Search schedule

| Parameter | Value |
|-----------|-------|
| Searches per sweep | 25 (5 routes × 5 dates) |
| HTTP calls per sweep | 50 (2 one-way per route+date) |
| Sweeps per day | 2 (08:00 + 20:00 UTC) |
| Delay between calls | 3 seconds |
| Time per sweep | ~3 minutes |
| Quota | Unlimited |

---

## Gulf/Arab carrier filter

Excluded by airline name keyword matching:

Emirates · Etihad · Qatar Airways · flydubai · Air Arabia · Oman Air · Gulf Air · Saudia · Kuwait Airways · flynas · flyadeal · Royal Jordanian · Iraqi Airways

---

## Development (without Docker)

**Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DB_PATH=../data/flights.db
uvicorn main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev   # proxies /api/* → localhost:8000
```

---

## Project structure

```
flight-planner/
├── backend/
│   ├── main.py              # FastAPI + lifespan
│   ├── scheduler.py         # APScheduler (2×/day)
│   ├── flights_client.py    # fast-flights wrapper
│   ├── filters.py           # Gulf airline + airport filters
│   ├── models.py            # SQLAlchemy models
│   ├── database.py          # SQLite engine
│   ├── routes.py            # REST endpoints
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── api/flights.ts
│   ├── nginx.conf
│   └── Dockerfile
├── data/                    # Volume (flights.db)
└── docker-compose.yml
```
