# Flight Price Tracker

Monitor and track round-trip flight prices between any origin and a set of destinations. Prices are automatically fetched from Google Flights multiple times a day and stored historically so you can spot trends and find the best time to book.

No API key, no registration, no monthly cost. Fully self-hosted with Docker.

---

## Features

- **Fully configurable** — set any origin, destinations, departure date window, step and stay duration from the UI
- **Automatic price sweeps** — 2 searches per day (08:00 and 20:00 UTC), unlimited
- **Price history chart** — track how prices evolve over days and filter by route/date
- **Airline filters** — exclude carriers by name (e.g. Gulf/Arab airlines) on both outbound and return legs
- **Flight detail cards** — airline logo, departure/arrival times, duration, stop count and a direct link to Google Flights for that exact search
- **Manual refresh** — trigger an immediate sweep from the UI at any time
- **Zero external dependencies** — queries Google Flights' internal API directly via `fast-flights`

---

## Quick Start

```bash
git clone https://github.com/sanlega/flight-planner.git
cd flight-planner
docker compose up -d --build
```

Open **http://localhost** in your browser.

Click **"Actualizar ahora"** to run the first search, or wait for the automatic sweep.  
No `.env` file or API keys needed.

---

## Configuration

Click the **"Configurar"** button in the top-right corner to open the settings panel:

| Setting | Description |
|---------|-------------|
| **Origin** | Departure airport IATA code (e.g. `MAD`, `BCN`, `LHR`) |
| **Destinations** | Any number of destination IATA codes (add/remove as chips) |
| **Date window** | Start date, end date, and how many days between each checked departure |
| **Stay duration** | Number of days between outbound and return flight |

Changes take effect on the next sweep. Use **"Guardar y buscar"** to apply immediately and trigger a search.

The settings panel shows a live preview of all departure dates that will be searched and the total number of searches per sweep.

---

## How it works

[`fast-flights`](https://github.com/AWeirdDev/flights) reverse-engineers the Google Flights URL parameter (`?tfs=`), which encodes flight queries as Base64 Protobuf. The library constructs valid queries and sends them directly to Google — no browser, no Playwright, just lightweight HTTP requests with TLS fingerprinting via `primp`.

**EU/GDPR bypass**: a `SOCS` consent cookie is injected into every Google request at the HTTP level, preventing the GDPR redirect without requiring a headless browser.

Each round-trip is performed as two one-way searches (outbound + return), and the results are combined. Prices are stored in SQLite and served via a FastAPI REST API.

---

## Search schedule

| Parameter | Value |
|-----------|-------|
| Sweeps per day | 2 (08:00 + 20:00 UTC) |
| HTTP calls per search | 2 (one-way out + one-way return) |
| Delay between calls | 5 seconds |
| Quota | Unlimited |

The number of searches per sweep scales with your configuration: `destinations × departure_dates`.

---

## Airline filter

Flights operated by the following carriers (matched by name) are excluded from results:

Emirates · Etihad · Qatar Airways · flydubai · Air Arabia · Oman Air · Gulf Air · Saudia · Kuwait Airways · flynas · flyadeal · Royal Jordanian · Iraqi Airways

This list can be extended in `backend/filters.py`.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Data source | Google Flights via `fast-flights` (Protobuf + `primp`) |
| Backend | Python 3.11, FastAPI, APScheduler, SQLAlchemy, SQLite |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| Serving | Nginx (frontend) + Uvicorn (backend) |
| Deployment | Docker Compose |

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
│   ├── main.py              # FastAPI app + lifespan
│   ├── scheduler.py         # APScheduler (2×/day), reads config from DB
│   ├── flights_client.py    # fast-flights wrapper + GDPR bypass
│   ├── filters.py           # Airline name/airport exclusion filters
│   ├── models.py            # SQLAlchemy: FlightOffer, SearchRun, AppConfig
│   ├── database.py          # SQLite engine
│   ├── routes.py            # REST API endpoints (/api/*)
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      # Main layout + state
│   │   ├── components/
│   │   │   ├── FlightCard.tsx           # Flight result card
│   │   │   ├── PriceChart.tsx           # Price history chart
│   │   │   ├── RouteFilter.tsx          # Route + date filter sidebar
│   │   │   ├── SettingsModal.tsx        # Configuration panel
│   │   │   ├── StatsBar.tsx             # Best price + last run info
│   │   │   └── QuotaTracker.tsx         # Activity summary
│   │   └── api/flights.ts              # API client + TypeScript types
│   ├── nginx.conf
│   └── Dockerfile
├── data/                    # Docker volume — flights.db persisted here
└── docker-compose.yml
```

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/offers` | Best current offer per route+date |
| `GET` | `/api/history` | Price time-series for charts |
| `GET` | `/api/config` | Active routes and dates (for filters) |
| `GET` | `/api/settings` | Current search configuration |
| `PUT` | `/api/settings` | Update search configuration |
| `GET` | `/api/quota` | Sweep activity statistics |
| `GET` | `/api/runs` | Recent sweep history |
| `POST` | `/api/refresh` | Trigger an immediate sweep |
| `GET` | `/health` | Backend health check |
