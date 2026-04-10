"""
APScheduler: 2 sweeps/day at 08:00 and 20:00 UTC.

Each sweep loads routes, dates, and filters from AppConfig (DB),
then searches Google Flights for round-trip offers.
Multi-user: scheduled sweeps run for ALL users; manual sweeps run for one user.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from flights_client import search_round_trip
from models import FlightOffer, SearchRun, AppConfig, User
from database import SessionLocal

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _sweep_for_user(db, user_id: int, triggered_by: str) -> dict:
    """Run a sweep for a single user's config."""
    cfg = db.query(AppConfig).filter(AppConfig.user_id == user_id).first()
    if cfg is None:
        cfg = AppConfig(user_id=user_id)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)

    routes = cfg.get_routes()
    dep_dates = cfg.get_departure_dates()
    stay_days = cfg.stay_days
    excluded_airlines = cfg.get_excluded_airlines()
    max_stops = cfg.max_stops
    max_duration_hours = cfg.max_duration_hours

    run = SearchRun(triggered_by=triggered_by, started_at=datetime.utcnow(), user_id=user_id)
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

                best = offers[0]
                fo = FlightOffer(
                    route=route_str,
                    departure_date=dep_date,
                    return_date=ret_date,
                    user_id=user_id,
                    **best,
                )
                db.add(fo)
                db.commit()
                total_saved += 1
                logger.info(
                    "Saved %s %s -> EUR%.0f (%s out / %s ret) [user=%d]",
                    route_str, dep_date,
                    best["price_eur"],
                    best["outbound_duration"],
                    best["return_duration"] or "n/a",
                    user_id,
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

    return {
        "searches": total_calls,
        "offers_saved": total_saved,
        "errors": errors,
        "finished_at": finished_at.isoformat(),
    }


async def run_sweep(triggered_by: str = "scheduler", user_id: Optional[int] = None) -> dict:
    """
    Run sweep. If user_id is given, sweep for that user only.
    If user_id is None (scheduled), sweep for ALL active users.
    """
    db = SessionLocal()
    try:
        if user_id is not None:
            result = await _sweep_for_user(db, user_id, triggered_by)
            logger.info("Sweep complete for user %d: %s", user_id, result)
            return result

        # Scheduled: sweep for all users who have a config
        users = db.query(User).filter(User.is_active == True).all()
        if not users:
            logger.info("No users found, skipping scheduled sweep")
            return {"searches": 0, "offers_saved": 0, "errors": [], "finished_at": datetime.utcnow().isoformat()}

        total_result = {"searches": 0, "offers_saved": 0, "errors": [], "finished_at": ""}
        for u in users:
            result = await _sweep_for_user(db, u.id, triggered_by)
            total_result["searches"] += result["searches"]
            total_result["offers_saved"] += result["offers_saved"]
            total_result["errors"].extend(result["errors"])
            total_result["finished_at"] = result["finished_at"]

        logger.info("Scheduled sweep complete for %d users: %s", len(users), total_result)
        return total_result
    finally:
        db.close()


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
