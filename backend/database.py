import os
import logging
import sqlite3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get("DB_PATH", "/data/flights.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_schema():
    """Add columns that may be missing from an older schema version."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Check if app_config table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='app_config'"
        )
        if not cursor.fetchone():
            conn.close()
            return  # Table will be created by create_all

        # Get existing columns
        cursor.execute("PRAGMA table_info(app_config)")
        existing = {row[1] for row in cursor.fetchall()}

        migrations = [
            ("max_stops", "INTEGER DEFAULT 2"),
            ("max_duration_hours", "INTEGER DEFAULT 40"),
            (
                "excluded_airlines_json",
                """TEXT DEFAULT '["emirates","etihad","flydubai","air arabia","wizz air abu dhabi","qatar","kuwait","gulf air","saudia","saudi arabian","flynas","flyadeal","oman air","royal jordanian","iraqi airways","iran air","mahan air"]'""",
            ),
        ]

        for col_name, col_def in migrations:
            if col_name not in existing:
                cursor.execute(
                    f"ALTER TABLE app_config ADD COLUMN {col_name} {col_def}"
                )
                logger.info("Migrated: added column app_config.%s", col_name)

        conn.commit()
        conn.close()
    except Exception as exc:
        logger.warning("Schema migration check failed (non-fatal): %s", exc)
