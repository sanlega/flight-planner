"""
FastAPI route definitions.
All endpoints are prefixed with /api.
"""

import json
import logging
from datetime import datetime, date, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from database import get_db
from models import FlightOffer, SearchRun, AppConfig
from flights_client import google_flights_url
from scheduler import run_sweep

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

AIRPORT_NAMES = {
    "PEK": "Beijing Capital",
    "PKX": "Beijing Daxing",
    "PVG": "Shanghai Pudong",
    "SHA": "Shanghai Hongqiao",
    "CAN": "Guangzhou Baiyun",
    "SZX": "Shenzhen Bao'an",
    "HKG": "Hong Kong Int'l",
    "MAD": "Madrid Barajas",
    "BCN": "Barcelona El Prat",
    "CTU": "Chengdu Tianfu",
    "XIY": "Xi'an Xianyang",
    "WUH": "Wuhan Tianhe",
    "NKG": "Nanjing Lukou",
    "TAO": "Qingdao Jiaodong",
    "HGH": "Hangzhou Xiaoshan",
    "CSX": "Changsha Huanghua",
    "NRT": "Tokyo Narita",
    "HND": "Tokyo Haneda",
    "ICN": "Seoul Incheon",
    "SIN": "Singapore Changi",
    "BKK": "Bangkok Suvarnabhumi",
    "KUL": "Kuala Lumpur",
    "TPE": "Taipei Taoyuan",
    "MNL": "Manila Ninoy Aquino",
    "SGN": "Ho Chi Minh City",
    "HAN": "Hanoi Noi Bai",
    "DEL": "Delhi Indira Gandhi",
    "BOM": "Mumbai",
    "LHR": "London Heathrow",
    "CDG": "Paris Charles de Gaulle",
    "FRA": "Frankfurt",
    "AMS": "Amsterdam Schiphol",
    "IST": "Istanbul",
    "FCO": "Rome Fiumicino",
    "MXP": "Milan Malpensa",
    "JFK": "New York JFK",
    "LAX": "Los Angeles",
    "ORD": "Chicago O'Hare",
    "SFO": "San Francisco",
}


def _serialize_offer(fo: FlightOffer) -> dict:
    origin, dest = fo.route.split("-")
    return {
        "id": fo.id,
        "route": fo.route,
        "destination_name": AIRPORT_NAMES.get(dest, dest),
        "departure_date": fo.departure_date.isoformat(),
        "return_date": fo.return_date.isoformat(),
        "price_eur": fo.price_eur,
        "airline_codes": fo.airline_codes,
        "airline_names": fo.airline_names,
        "airline_logo": fo.airline_logo or "",
        "outbound_duration": fo.outbound_duration,
        "return_duration": fo.return_duration,
        "outbound_stops": fo.stops_list("outbound"),
        "return_stops": fo.stops_list("return"),
        "outbound_segments": fo.segments_list("outbound"),
        "return_segments": fo.segments_list("return"),
        "scraped_at": fo.scraped_at.isoformat(),
        "google_flights_url": google_flights_url(
            origin, dest, fo.departure_date, fo.return_date
        ),
    }


# ─── Best current offers ────────────────────────────────────────────────────

@router.get("/offers")
def get_best_offers(
    route: Optional[str] = Query(None, description="Filter by route, e.g. MAD-PEK"),
    departure_date: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
):
    """Returns the cheapest offer per route+departure_date from the latest sweep."""
    latest_sq = (
        db.query(
            FlightOffer.route,
            FlightOffer.departure_date,
            func.max(FlightOffer.scraped_at).label("latest"),
        )
        .group_by(FlightOffer.route, FlightOffer.departure_date)
        .subquery()
    )

    q = (
        db.query(FlightOffer)
        .join(
            latest_sq,
            (FlightOffer.route == latest_sq.c.route)
            & (FlightOffer.departure_date == latest_sq.c.departure_date)
            & (FlightOffer.scraped_at == latest_sq.c.latest),
        )
        .order_by(FlightOffer.price_eur)
    )

    if route:
        q = q.filter(FlightOffer.route == route)
    if departure_date:
        try:
            parsed = date.fromisoformat(departure_date)
            q = q.filter(FlightOffer.departure_date == parsed)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid departure_date format")

    return [_serialize_offer(o) for o in q.limit(limit).all()]


# ─── Price history for charts ────────────────────────────────────────────────

@router.get("/history")
def get_price_history(
    route: Optional[str] = Query(None),
    departure_date: Optional[str] = Query(None),
    days: int = Query(30, le=90),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    since = since - timedelta(days=days)

    q = (
        db.query(
            FlightOffer.route,
            FlightOffer.departure_date,
            FlightOffer.scraped_at,
            func.min(FlightOffer.price_eur).label("min_price"),
        )
        .filter(FlightOffer.scraped_at >= since)
        .group_by(FlightOffer.route, FlightOffer.departure_date, FlightOffer.scraped_at)
        .order_by(FlightOffer.scraped_at)
    )

    if route:
        q = q.filter(FlightOffer.route == route)
    if departure_date:
        try:
            parsed = date.fromisoformat(departure_date)
            q = q.filter(FlightOffer.departure_date == parsed)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid departure_date format")

    by_route: dict[str, list] = {}
    for row in q.all():
        key = f"{row.route}|{row.departure_date}"
        if key not in by_route:
            by_route[key] = []
        by_route[key].append({
            "timestamp": row.scraped_at.isoformat(),
            "price": float(row.min_price),
        })

    return {
        "series": [
            {"route": k.split("|")[0], "departure_date": k.split("|")[1], "data": v}
            for k, v in by_route.items()
        ]
    }


# ─── Search statistics ───────────────────────────────────────────────────────

@router.get("/quota")
def get_search_stats(db: Session = Depends(get_db)):
    """Returns how many searches have been done this month."""
    month = datetime.utcnow().strftime("%Y-%m")
    since = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count = db.query(SearchRun).filter(SearchRun.started_at >= since, SearchRun.success == True).count()
    cfg = _get_or_create_config(db)
    n_routes = len(cfg.get_destinations())
    n_dates = len(cfg.get_departure_dates())
    return {
        "year_month": month,
        "sweeps_this_month": count,
        "searches_this_month": count * n_routes * n_dates,
        "source": "Google Flights (scraping)",
        "quota_limit": "unlimited",
        "last_updated": datetime.utcnow().isoformat(),
    }


# ─── Search runs history ─────────────────────────────────────────────────────

@router.get("/runs")
def get_search_runs(limit: int = Query(10, le=50), db: Session = Depends(get_db)):
    runs = db.query(SearchRun).order_by(desc(SearchRun.started_at)).limit(limit).all()
    return [
        {
            "id": r.id,
            "started_at": r.started_at.isoformat(),
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "routes_searched": r.routes_searched,
            "calls_made": r.calls_made,
            "offers_saved": r.offers_saved,
            "success": r.success,
            "error_msg": r.error_msg,
            "triggered_by": r.triggered_by,
        }
        for r in runs
    ]


# ─── Manual refresh ──────────────────────────────────────────────────────────

@router.post("/refresh")
async def manual_refresh():
    try:
        result = await run_sweep(triggered_by="manual")
        return result
    except Exception as exc:
        logger.exception("Manual refresh failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ─── Search settings (read + write) ─────────────────────────────────────────

class SettingsIn(BaseModel):
    origin: str
    destinations: List[str]
    departure_date_start: str
    departure_date_end: str
    departure_date_step: int
    stay_days: int
    max_stops: int = 2
    max_duration_hours: int = 40
    excluded_airlines: List[str] = []


def _get_or_create_config(db: Session) -> AppConfig:
    cfg = db.query(AppConfig).first()
    if cfg is None:
        cfg = AppConfig(id=1)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db)
    return {
        "origin": cfg.origin,
        "destinations": cfg.get_destinations(),
        "departure_date_start": cfg.departure_date_start.isoformat(),
        "departure_date_end": cfg.departure_date_end.isoformat(),
        "departure_date_step": cfg.departure_date_step,
        "stay_days": cfg.stay_days,
        "max_stops": cfg.max_stops,
        "max_duration_hours": cfg.max_duration_hours,
        "excluded_airlines": cfg.get_excluded_airlines(),
    }


@router.put("/settings")
def update_settings(body: SettingsIn, db: Session = Depends(get_db)):
    if not body.origin or len(body.origin) != 3:
        raise HTTPException(status_code=400, detail="Origin must be a 3-letter IATA code")
    if not body.destinations:
        raise HTTPException(status_code=400, detail="At least one destination required")
    if body.stay_days < 1 or body.stay_days > 60:
        raise HTTPException(status_code=400, detail="Stay days must be between 1 and 60")
    if body.departure_date_step < 1 or body.departure_date_step > 14:
        raise HTTPException(status_code=400, detail="Step must be between 1 and 14 days")

    try:
        start = date.fromisoformat(body.departure_date_start)
        end = date.fromisoformat(body.departure_date_end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date format") from exc

    if end < start:
        raise HTTPException(status_code=400, detail="End date must be after start date")

    cfg = _get_or_create_config(db)
    cfg.origin = body.origin.upper().strip()
    cfg.destinations_json = json.dumps([d.upper().strip() for d in body.destinations if d.strip()])
    cfg.departure_date_start = start
    cfg.departure_date_end = end
    cfg.departure_date_step = body.departure_date_step
    cfg.stay_days = body.stay_days
    cfg.max_stops = max(-1, min(body.max_stops, 5))
    cfg.max_duration_hours = max(0, min(body.max_duration_hours, 72))
    cfg.excluded_airlines_json = json.dumps(
        [a.strip().lower() for a in body.excluded_airlines if a.strip()]
    )
    db.commit()
    return {"ok": True}


# ─── Config metadata (used by frontend filters) ───────────────────────────────

@router.get("/config")
def get_config(db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db)
    routes = [f"{cfg.origin}-{dest}" for dest in cfg.get_destinations()]
    dep_dates = [d.isoformat() for d in cfg.get_departure_dates()]
    return {
        "routes": routes,
        "departure_dates": dep_dates,
        "airport_names": AIRPORT_NAMES,
    }
