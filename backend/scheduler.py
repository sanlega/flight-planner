"""
APScheduler: 2 sweeps/day at 08:00 and 20:00 UTC.

Each sweep loads routes, dates, and filters from AppConfig (DB),
then searches Google Flights for round-trip offers.
"""

import json
import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from flights_client import search_round_trip
from models import FlightOffer, SearchRun, AppConfig
from database import SessionLocal

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def run_sweep(triggered_by: str = "scheduler") -> dict:
    """
    Search all routes x all departure dates and persist the cheapest offer
    for each combination. Routes, dates, and filters loaded from AppConfig.
    """
    db = SessionLocal()

    # Load dynamic config; create default if missing
    cfg = db.query(AppConfig).first()
    if cfg is None:
        cfg = AppConfig(id=1)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)

    routes = cfg.get_routes()
    dep_dates = cfg.get_departure_dates()
    stay_days = cfg.stay_days

    # Load filter settings
    excluded_airlines = cfg.get_excluded_airlines()
    max_stops = cfg.max_stops
    max_duration_hours = cfg.max_duration_hours

    run = SearchRun(triggered_by=triggered_by, started_at=datetime.utcnow())
    db.add(run)
    db.commit()
    run_id = run.id

    total_calls = 0
    total_saved = 0
    errors: list[str] = []

    for origin, destination in routes:
        for dep_date in dep_dates:
            ret_date = dep_date + timedelta(days=stay_days)
            route_str = f"{origin}-{destination}"

            try:
                offers = search_round_trip(
                    origin=origin,
                    destination=destination,
                    departure_date=dep_date,
                    return_date=ret_date,
                    excluded_airlines=excluded_airlines,
                    max_stops=max_stops,
                    max_duration_hours=max_duration_hours,
                )
                total_calls += 1

                if not offers:
                    logger.debug("No offers (post-filter) for %s on %s", route_str, dep_date)
                    continue

                best = offers[0]  # already sorted by price
                fo = FlightOffer(
                    route=route_str,
                    departure_date=dep_date,
                    return_date=ret_date,
                    **best,
                )
                db.add(fo)
                db.commit()
                total_saved += 1
                logger.info(
                    "Saved %s %s -> EUR%.0f (%s out / %s ret)",
                    route_str, dep_date,
                    best["price_eur"],
                    best["outbound_duration"],
                    best["return_duration"] or "n/a",
                )

            except Exception as exc:
                msg = f"{route_str} {dep_date}: {exc}"
                logger.error("Error during search: %s", msg)
                errors.append(msg)

    finished_at = datetime.utcnow()
    run = db.query(SearchRun).get(run_id)
    run.routes_searched = len(routes)
    run.calls_made = total_calls
    run.offers_saved = total_saved
    run.success = len(errors) == 0
    run.error_msg = "; ".join(errors) if errors else None
    run.finished_at = finished_at
    db.commit()
    db.close()

    summary = {
        "searches": total_calls,
        "offers_saved": total_saved,
        "errors": errors,
        "finished_at": finished_at.isoformat(),
    }
    logger.info("Sweep complete: %s", summary)
    return summary


def start_scheduler():
    for job_id, hour in [("morning_sweep", 8), ("evening_sweep", 20)]:
        scheduler.add_job(
            run_sweep,
            CronTrigger(hour=hour, minute=0, timezone="UTC"),
            id=job_id,
            name=f"Price sweep ({hour:02d}:00 UTC)",
            replace_existing=True,
            kwargs={"triggered_by": "scheduler"},
        )
    scheduler.start()
    logger.info("Scheduler started: sweeps at 08:00 and 20:00 UTC")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
