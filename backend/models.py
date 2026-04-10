import json
from datetime import datetime, date, timedelta
from sqlalchemy import String, Integer, Float, DateTime, Date, Boolean, Text, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from database import Base

DEFAULT_EXCLUDED_AIRLINES = json.dumps([
    "emirates", "etihad", "flydubai", "air arabia", "wizz air abu dhabi",
    "qatar", "kuwait", "gulf air",
    "saudia", "saudi arabian", "flynas", "flyadeal",
    "oman air", "royal jordanian", "iraqi airways",
    "iran air", "mahan air",
])


# ── Auth models ────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


# ── Flight models ──────────────────────────────────────────────────────────

class FlightOffer(Base):
    __tablename__ = "flight_offers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    route: Mapped[str] = mapped_column(String(10))          # e.g. "MAD-PEK"
    departure_date: Mapped[date] = mapped_column(Date)
    return_date: Mapped[date] = mapped_column(Date)
    price_eur: Mapped[float] = mapped_column(Float)
    airline_codes: Mapped[str] = mapped_column(String(100))  # comma-separated IATA codes
    airline_names: Mapped[str] = mapped_column(String(300))
    outbound_duration: Mapped[str] = mapped_column(String(20))
    return_duration: Mapped[str] = mapped_column(String(20))
    outbound_stops: Mapped[str] = mapped_column(Text)        # JSON list of {airport, city}
    return_stops: Mapped[str] = mapped_column(Text)
    outbound_segments: Mapped[str] = mapped_column(Text)     # JSON: full segment detail
    return_segments: Mapped[str] = mapped_column(Text)
    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    airline_logo: Mapped[str] = mapped_column(String(500), nullable=True)
    offer_id: Mapped[str] = mapped_column(String(100), nullable=True)

    def stops_list(self, leg: str) -> list:
        raw = self.outbound_stops if leg == "outbound" else self.return_stops
        try:
            return json.loads(raw)
        except Exception:
            return []

    def segments_list(self, leg: str) -> list:
        raw = self.outbound_segments if leg == "outbound" else self.return_segments
        try:
            return json.loads(raw)
        except Exception:
            return []


class SearchRun(Base):
    __tablename__ = "search_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    routes_searched: Mapped[int] = mapped_column(Integer, default=0)
    calls_made: Mapped[int] = mapped_column(Integer, default=0)
    offers_saved: Mapped[int] = mapped_column(Integer, default=0)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error_msg: Mapped[str] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[str] = mapped_column(String(20), default="scheduler")  # "scheduler" | "manual"


class AppConfig(Base):
    """Per-user search configuration."""
    __tablename__ = "app_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, unique=True, index=True)
    origin: Mapped[str] = mapped_column(String(10), default="MAD")
    destinations_json: Mapped[str] = mapped_column(
        Text, default='["PEK","PVG","CAN","SZX","HKG"]'
    )
    departure_date_start: Mapped[date] = mapped_column(Date, default=date(2026, 10, 9))
    departure_date_end: Mapped[date] = mapped_column(Date, default=date(2026, 10, 17))
    departure_date_step: Mapped[int] = mapped_column(Integer, default=2)
    stay_days: Mapped[int] = mapped_column(Integer, default=12)

    # ── Filter settings ─────────────────────────────────────────────────────
    max_stops: Mapped[int] = mapped_column(Integer, default=2)
    max_duration_hours: Mapped[int] = mapped_column(Integer, default=40)
    excluded_airlines_json: Mapped[str] = mapped_column(
        Text, default=DEFAULT_EXCLUDED_AIRLINES
    )

    def get_destinations(self) -> list[str]:
        return json.loads(self.destinations_json)

    def get_departure_dates(self) -> list[date]:
        dates: list[date] = []
        current = self.departure_date_start
        while current <= self.departure_date_end:
            dates.append(current)
            current = current + timedelta(days=self.departure_date_step)
        return dates

    def get_routes(self) -> list[tuple[str, str]]:
        return [(self.origin, dest) for dest in self.get_destinations()]

    def get_excluded_airlines(self) -> list[str]:
        try:
            return json.loads(self.excluded_airlines_json)
        except Exception:
            return []


class QuotaUsage(Base):
    __tablename__ = "quota_usage"
    __table_args__ = (UniqueConstraint("year_month"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year_month: Mapped[str] = mapped_column(String(7))  # "2026-03"
    calls_used: Mapped[int] = mapped_column(Integer, default=0)
    quota_limit: Mapped[int] = mapped_column(Integer, default=2000)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
