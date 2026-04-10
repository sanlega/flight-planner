import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine, migrate_schema
from routes import router
from auth import router as auth_router
from scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    migrate_schema()
    logger.info("Starting scheduler...")
    start_scheduler()
    yield
    # Shutdown
    stop_scheduler()
    logger.info("Scheduler stopped.")


app = FastAPI(
    title="Flight Price Tracker",
    description="Self-hosted flight price monitor — Google Flights scraping, no API keys",
    version="2.0.0",
    lifespan=lifespan,
)

import os

_allowed_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:80,http://localhost").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(auth_router)
app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok"}
