"""
Configurable flight filters.

Filters are loaded from the AppConfig DB row and passed to the scraper.
All filter functions accept explicit parameters — nothing is hard-coded.
"""

import re
import logging

logger = logging.getLogger(__name__)


def passes_filters(
    airline_name: str,
    stops: int,
    duration_minutes: int,
    *,
    excluded_airlines: list[str] | None = None,
    max_stops: int = 2,
    max_duration_hours: int = 40,
) -> bool:
    """
    Return True if the flight passes ALL active filters.

    Parameters
    ----------
    airline_name : str
        Full airline name from the scraper (e.g. "Turkish Airlines").
    stops : int
        Number of stops (0 = direct).
    duration_minutes : int
        Total flight duration in minutes.
    excluded_airlines : list[str]
        Substrings to match against the airline name (case-insensitive).
    max_stops : int
        Maximum allowed stops. -1 means unlimited.
    max_duration_hours : int
        Maximum allowed duration in hours. 0 means unlimited.
    """
    # Airline exclusion
    if excluded_airlines:
        lower = airline_name.lower()
        if any(kw.lower().strip() in lower for kw in excluded_airlines if kw.strip()):
            return False

    # Max stops
    if max_stops >= 0 and stops > max_stops:
        return False

    # Max duration
    if max_duration_hours > 0 and duration_minutes > max_duration_hours * 60:
        return False

    return True


def parse_duration_minutes(duration_str: str) -> int:
    """Parse '14h 30m', '14 hr 30 min', '870' → minutes as integer."""
    if not duration_str:
        return 0
    # Pure numeric → already in minutes
    try:
        return int(duration_str)
    except (ValueError, TypeError):
        pass
    h_match = re.search(r"(\d+)\s*h", duration_str, re.IGNORECASE)
    m_match = re.search(r"(\d+)\s*m", duration_str, re.IGNORECASE)
    hours = int(h_match.group(1)) if h_match else 0
    minutes = int(m_match.group(1)) if m_match else 0
    return hours * 60 + minutes


# ── Airport-code-based filter (backup for future use) ───────────────────────

EXCLUDED_AIRPORTS: set[str] = {
    "DXB", "AUH", "SHJ", "DWC",  # UAE
    "DOH",                         # Qatar
    "KWI",                         # Kuwait
    "BAH",                         # Bahrain
    "RUH", "JED", "DMM", "MED",   # Saudi Arabia
    "MCT",                         # Oman
    "BGW", "BSR", "EBL",          # Iraq
    "AMM",                         # Jordan
}


def passes_layover_filter(stopover_codes: list[str]) -> bool:
    """Return True if none of the stopovers are in an excluded airport."""
    return not any(code in EXCLUDED_AIRPORTS for code in stopover_codes)
