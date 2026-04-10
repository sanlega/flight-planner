"""
Google Flights client using the `fast-flights` library.

Searches round-trip first (real round-trip prices are typically 20-40% cheaper
than combining two one-way fares). Falls back to two one-way searches if the
round-trip query fails.

All filters (max stops, max duration, excluded airlines) are accepted as
parameters — loaded from AppConfig by the scheduler/route layer.
"""

import re
import time
import logging
import json
from datetime import datetime, date, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

from fast_flights import FlightData, Passengers, get_flights, Result

from filters import passes_filters, parse_duration_minutes

# ── EU GDPR consent bypass ───────────────────────────────────────────────────
_SOCS_COOKIE = "CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LysBg"

try:
    import primp as _primp
    _orig_primp_get = _primp.Client.get

    def _primp_get_with_socs(self, url, **kwargs):
        if url and "google.com" in url:
            cookies = dict(kwargs.pop("cookies", None) or {})
            cookies.setdefault("SOCS", _SOCS_COOKIE)
            kwargs["cookies"] = cookies
        return _orig_primp_get(self, url, **kwargs)

    _primp.Client.get = _primp_get_with_socs
    logger.info("GDPR consent bypass (SOCS cookie) applied to primp client")
except Exception as _patch_err:
    logger.warning("Could not patch primp for GDPR bypass: %s", _patch_err)

# ── Airline name → IATA code mapping ────────────────────────────────────────

AIRLINE_NAME_TO_CODE: dict[str, str] = {
    "turkish airlines": "TK",
    "air china": "CA",
    "china eastern": "MU",
    "china eastern airlines": "MU",
    "china southern": "CZ",
    "china southern airlines": "CZ",
    "iberia": "IB",
    "iberia express": "I2",
    "vueling": "VY",
    "lufthansa": "LH",
    "klm": "KL",
    "klm royal dutch airlines": "KL",
    "air france": "AF",
    "austrian": "OS",
    "austrian airlines": "OS",
    "finnair": "AY",
    "singapore airlines": "SQ",
    "cathay pacific": "CX",
    "ana": "NH",
    "all nippon airways": "NH",
    "japan airlines": "JL",
    "swiss": "LX",
    "swiss international air lines": "LX",
    "british airways": "BA",
    "lot polish airlines": "LO",
    "hainan airlines": "HU",
    "xiamen airlines": "MF",
    "shenzhen airlines": "ZH",
    "sichuan airlines": "3U",
    "hong kong airlines": "HX",
    "hong kong express": "UO",
    "greater bay airlines": "HB",
    "aeroflot": "SU",
    "ethiopian airlines": "ET",
    "kenya airways": "KQ",
    "royal jordanian": "RJ",
    "thai airways": "TG",
    "eva air": "BR",
    "vietnam airlines": "VN",
    "air europa": "UX",
    "tap portugal": "TP",
    "tap air portugal": "TP",
    "scandinavian airlines": "SK",
    "sas": "SK",
    "korean air": "KE",
    "asiana airlines": "OZ",
    "air canada": "AC",
    "united airlines": "UA",
    "delta air lines": "DL",
    "american airlines": "AA",
}

# Seconds to wait between individual API calls
REQUEST_DELAY_SECS = 5


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_iso_dt(flight_date: date, time_str: str, extra_days: int = 0) -> str:
    """Convert fast-flights time string + date into ISO datetime string."""
    if not time_str or not str(time_str).strip():
        return ""
    ts = str(time_str).strip()
    for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M"):
        try:
            t = datetime.strptime(ts, fmt)
            combined = datetime.combine(flight_date + timedelta(days=extra_days), t.time())
            return combined.isoformat()
        except ValueError:
            continue
    return ""


def _parse_price(raw) -> Optional[float]:
    """Convert '€ 650', '650 €', '$650', 650 → 650.0"""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    cleaned = re.sub(r"[^\d.,]", "", str(raw)).replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _duration_str(raw) -> str:
    """Normalise duration to '14h 30m' format."""
    if isinstance(raw, int):
        h, m = divmod(raw, 60)
        return f"{h}h {m}m" if m else f"{h}h"
    s = str(raw).strip()
    if re.match(r"^\d+h \d+m$", s):
        return s
    h_m = re.findall(r"(\d+)\s*h", s)
    m_m = re.findall(r"(\d+)\s*m", s)
    h = int(h_m[0]) if h_m else 0
    m = int(m_m[0]) if m_m else 0
    if h and m:
        return f"{h}h {m}m"
    elif h:
        return f"{h}h"
    return f"{m}m"


def _get_iata_code(airline_name: str) -> str:
    """Map full airline name to 2-letter IATA code."""
    key = airline_name.lower().strip()
    if key in AIRLINE_NAME_TO_CODE:
        return AIRLINE_NAME_TO_CODE[key]
    for name, code in AIRLINE_NAME_TO_CODE.items():
        if name in key:
            return code
    return ""


def google_flights_url(origin: str, destination: str, dep_date: date, ret_date: date) -> str:
    """Generate a Google Flights round-trip URL."""
    try:
        from fast_flights import create_filter
        f = create_filter(
            flight_data=[
                FlightData(date=dep_date.isoformat(), from_airport=origin, to_airport=destination),
                FlightData(date=ret_date.isoformat(), from_airport=destination, to_airport=origin),
            ],
            trip="round-trip",
            seat="economy",
            passengers=Passengers(adults=1),
        )
        tfs = f.as_b64()
        if isinstance(tfs, bytes):
            tfs = tfs.decode("utf-8")
        return f"https://www.google.com/travel/flights?tfs={tfs}&hl=es&curr=EUR&tfu=EgQIABABIgA"
    except Exception:
        d1 = dep_date.strftime("%Y-%m-%d")
        d2 = ret_date.strftime("%Y-%m-%d")
        return (
            f"https://www.google.com/travel/flights"
            f"?q=flights+{origin}+to+{destination}+{d1}+return+{d2}&curr=EUR&hl=es"
        )


# ── Flight parsing ──────────────────────────────────────────────────────────

def _parse_flight(f, origin: str, destination: str, flight_date: date,
                   excluded_airlines: list[str], max_stops: int,
                   max_duration_hours: int) -> Optional[dict]:
    """Parse a single fast-flights result and apply filters. Returns None if filtered."""
    name = str(getattr(f, "name", "") or "")
    raw_price = getattr(f, "price", None)
    price = _parse_price(raw_price)
    if not price:
        return None

    dep_time = str(getattr(f, "departure", "") or "")
    arr_time = str(getattr(f, "arrival", "") or "")
    duration_raw = getattr(f, "duration", "") or ""
    _stops_raw = getattr(f, "stops", 0)
    try:
        stops = int(_stops_raw or 0)
    except (ValueError, TypeError):
        stops = 0
    ahead = str(getattr(f, "arrival_time_ahead", "") or "")

    duration = _duration_str(duration_raw)
    if not duration or duration == "0m":
        return None

    duration_minutes = parse_duration_minutes(duration)

    # Apply configurable filters
    if not passes_filters(
        name, stops, duration_minutes,
        excluded_airlines=excluded_airlines,
        max_stops=max_stops,
        max_duration_hours=max_duration_hours,
    ):
        logger.debug("Filtered out: %s (%d stops, %s)", name, stops, duration)
        return None

    # Parse arrival day offset
    ahead_days = 0
    if ahead:
        m = re.search(r"(\d+)", ahead)
        if m:
            ahead_days = int(m.group(1))

    dep_iso = _make_iso_dt(flight_date, dep_time)
    arr_iso = _make_iso_dt(flight_date, arr_time, ahead_days)

    iata_code = _get_iata_code(name)
    logo_url = (
        f"https://www.gstatic.com/flights/airline_logos/70px/{iata_code}.png"
        if iata_code else ""
    )

    segment = {
        "flightNumber": "",
        "carrier": name,
        "aircraft": "",
        "airline_logo": logo_url,
        "departure": {"iataCode": origin, "at": dep_iso, "terminal": ""},
        "arrival": {"iataCode": destination, "at": arr_iso, "terminal": ""},
        "duration": duration,
    }
    stop_list = [{"iataCode": "?", "at": ""} for _ in range(stops)]

    return {
        "price": price,
        "airline_name": name,
        "airline_iata": iata_code,
        "airline_logo": logo_url,
        "duration": duration,
        "stops": stops,
        "segments": [segment],
        "stop_list": stop_list,
    }


# ── Search strategies ───────────────────────────────────────────────────────

def _search_one_way(
    origin: str,
    destination: str,
    dep_date: date,
    excluded_airlines: list[str],
    max_stops: int,
    max_duration_hours: int,
    max_results: int = 15,
) -> list[dict]:
    """One-way search with configurable filters."""
    try:
        result: Result = get_flights(
            flight_data=[
                FlightData(
                    date=dep_date.isoformat(),
                    from_airport=origin,
                    to_airport=destination,
                )
            ],
            trip="one-way",
            seat="economy",
            passengers=Passengers(adults=1),
        )
    except Exception as exc:
        logger.warning("fast-flights one-way error %s->%s %s: %s", origin, destination, dep_date, exc)
        return []

    flights = []
    for f in (result.flights or [])[:max_results]:
        parsed = _parse_flight(
            f, origin, destination, dep_date,
            excluded_airlines, max_stops, max_duration_hours,
        )
        if parsed:
            flights.append(parsed)

    return flights


def _search_round_trip_direct(
    origin: str,
    destination: str,
    dep_date: date,
    ret_date: date,
    excluded_airlines: list[str],
    max_stops: int,
    max_duration_hours: int,
    max_results: int = 15,
) -> list[dict]:
    """
    Try a direct round-trip search. Returns offer dicts with round-trip prices.
    Returns empty list if the library doesn't support round-trip.
    """
    try:
        result: Result = get_flights(
            flight_data=[
                FlightData(date=dep_date.isoformat(), from_airport=origin, to_airport=destination),
                FlightData(date=ret_date.isoformat(), from_airport=destination, to_airport=origin),
            ],
            trip="round-trip",
            seat="economy",
            passengers=Passengers(adults=1),
        )
    except Exception as exc:
        logger.info("Round-trip search not supported or failed: %s", exc)
        return []

    if not result.flights:
        return []

    offers = []
    for f in result.flights[:max_results]:
        parsed = _parse_flight(
            f, origin, destination, dep_date,
            excluded_airlines, max_stops, max_duration_hours,
        )
        if not parsed:
            continue

        # In round-trip mode, price is already the total round-trip fare
        offers.append({
            "offer_id": "",
            "price_eur": parsed["price"],
            "airline_codes": parsed["airline_iata"] or parsed["airline_name"],
            "airline_names": parsed["airline_name"],
            "airline_logo": parsed["airline_logo"],
            "outbound_duration": parsed["duration"],
            "return_duration": "",
            "outbound_stops": json.dumps(parsed["stop_list"]),
            "return_stops": "[]",
            "outbound_segments": json.dumps(parsed["segments"]),
            "return_segments": "[]",
        })

    return sorted(offers, key=lambda o: o["price_eur"])


def search_round_trip(
    origin: str,
    destination: str,
    departure_date: date,
    return_date: date,
    excluded_airlines: list[str] | None = None,
    max_stops: int = 2,
    max_duration_hours: int = 40,
) -> list[dict]:
    """
    Search for round-trip flights.

    Strategy:
    1. Try direct round-trip search (gives real round-trip prices — usually cheaper).
    2. Fall back to two one-way searches combined.

    Returns offer dicts ready to be stored in FlightOffer.
    """
    if excluded_airlines is None:
        excluded_airlines = []

    logger.info("Searching %s->%s %s/%s (max_stops=%d, max_h=%d)",
                origin, destination, departure_date, return_date,
                max_stops, max_duration_hours)

    # Strategy 1: Direct round-trip
    rt_offers = _search_round_trip_direct(
        origin, destination, departure_date, return_date,
        excluded_airlines, max_stops, max_duration_hours,
    )
    if rt_offers:
        logger.info("Round-trip search returned %d offers", len(rt_offers))
        return rt_offers

    # Strategy 2: Two one-way searches combined
    logger.info("Falling back to two one-way searches")
    outbound_flights = _search_one_way(
        origin, destination, departure_date,
        excluded_airlines, max_stops, max_duration_hours, 15,
    )
    time.sleep(REQUEST_DELAY_SECS)
    return_flights = _search_one_way(
        destination, origin, return_date,
        excluded_airlines, max_stops, max_duration_hours, 15,
    )

    if not outbound_flights or not return_flights:
        return []

    # Try top outbound × top return combinations for cheapest total
    results = []
    seen_prices = set()
    for ob in outbound_flights[:8]:
        for ret in return_flights[:8]:
            total_price = ob["price"] + ret["price"]
            # Deduplicate by price+airlines
            key = (round(total_price, 2), ob["airline_name"], ret["airline_name"])
            if key in seen_prices:
                continue
            seen_prices.add(key)

            results.append({
                "offer_id": "",
                "price_eur": total_price,
                "airline_codes": ob["airline_iata"] or ob["airline_name"],
                "airline_names": ob["airline_name"],
                "airline_logo": ob["airline_logo"],
                "outbound_duration": ob["duration"],
                "return_duration": ret["duration"],
                "outbound_stops": json.dumps(ob["stop_list"]),
                "return_stops": json.dumps(ret["stop_list"]),
                "outbound_segments": json.dumps(ob["segments"]),
                "return_segments": json.dumps(ret["segments"]),
            })

    return sorted(results, key=lambda o: o["price_eur"])[:10]
