"""
Google Flights client using the `fast-flights` library.

Reverse-engineers Google Flights' internal Protobuf API — no API key,
no account, no quota. Just HTTP requests with TLS fingerprinting (primp).

EU GDPR bypass: monkey-patches primp.Client.get to inject the SOCS consent
cookie on every google.com request, preventing the consent redirect entirely.
"""

import re
import time
import logging
import json
from datetime import datetime, date, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

from fast_flights import FlightData, Passengers, get_flights, Result

from filters import passes_name_filter

# ── EU GDPR consent bypass ───────────────────────────────────────────────────
# Google redirects EU IPs to consent.google.com before showing flight results.
# Injecting the SOCS cookie into every primp request signals that consent was
# already handled, bypassing the redirect entirely.
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
}


def google_flights_url(origin: str, destination: str, dep_date: date, ret_date: date) -> str:
    """Generate a working Google Flights round-trip URL using the same protobuf format."""
    try:
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
    except Exception as exc:
        logger.debug("Could not generate tfs URL: %s", exc)
        return (
            f"https://www.google.com/travel/flights"
            f"?q=vuelos+{origin}+{destination}+{dep_date}+{ret_date}"
        )


def _get_iata_code(airline_name: str) -> str:
    """Map full airline name to 2-letter IATA code."""
    key = airline_name.lower().strip()
    if key in AIRLINE_NAME_TO_CODE:
        return AIRLINE_NAME_TO_CODE[key]
    for name, code in AIRLINE_NAME_TO_CODE.items():
        if name in key:
            return code
    return ""


# ── Route / date configuration ──────────────────────────────────────────────

ROUTES = [
    ("MAD", "PEK"),
    ("MAD", "PVG"),
    ("MAD", "CAN"),
    ("MAD", "SZX"),
    ("MAD", "HKG"),
]

DEPARTURE_DATES = [
    date(2026, 10, 9),
    date(2026, 10, 11),
    date(2026, 10, 13),
    date(2026, 10, 15),
    date(2026, 10, 17),
]

STAY_DAYS = 12

# Seconds to wait between individual API calls (be polite to Google)
REQUEST_DELAY_SECS = 5


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_iso_dt(flight_date: date, time_str: str, extra_days: int = 0) -> str:
    """
    Convert fast-flights time string (e.g. '7:40 AM', '14:30') + date
    into a full ISO datetime string ('2026-10-13T07:40:00').
    """
    if not time_str or not str(time_str).strip():
        return ""
    ts = str(time_str).strip()
    for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M"):
        try:
            from datetime import datetime as _dt
            t = _dt.strptime(ts, fmt)
            combined = _dt.combine(flight_date + timedelta(days=extra_days), t.time())
            return combined.isoformat()
        except ValueError:
            continue
    return ""


def _parse_price(raw: str | int | float) -> Optional[float]:
    """
    Convert '€ 650', '650 €', '$650', 650 → 650.0
    Returns None if unparseable.
    """
    if isinstance(raw, (int, float)):
        return float(raw)
    cleaned = re.sub(r"[^\d.,]", "", str(raw)).replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _duration_str(raw: str | int) -> str:
    """
    Normalise duration: '14 hr 30 min', 870 (minutes), '14h30m' → '14h 30m'
    """
    if isinstance(raw, int):
        h, m = divmod(raw, 60)
        return f"{h}h {m}m" if m else f"{h}h"
    s = str(raw).strip()
    # already clean
    if re.match(r"^\d+h \d+m$", s):
        return s
    # '14 hr 30 min' or '14 hr'
    h_m = re.findall(r"(\d+)\s*h", s)
    m_m = re.findall(r"(\d+)\s*m", s)
    h = int(h_m[0]) if h_m else 0
    m = int(m_m[0]) if m_m else 0
    if h and m:
        return f"{h}h {m}m"
    elif h:
        return f"{h}h"
    return f"{m}m"


def _search_one_way(
    origin: str,
    destination: str,
    dep_date: date,
    max_results: int = 8,
) -> list[dict]:
    """
    Perform a one-way search and return a list of parsed flight dicts,
    filtered by Gulf airline name.
    """
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
        logger.warning("fast-flights error %s→%s %s: %s", origin, destination, dep_date, exc)
        return []

    flights = []
    for f in (result.flights or [])[:max_results]:
        name = str(getattr(f, "name", "") or "")
        if not passes_name_filter(name):
            logger.debug("Filtered Gulf airline: %s", name)
            continue

        raw_price = getattr(f, "price", None)
        price = _parse_price(raw_price) if raw_price is not None else None
        if not price:
            continue

        dep_time = str(getattr(f, "departure", "") or "")
        arr_time = str(getattr(f, "arrival", "") or "")
        duration_raw = getattr(f, "duration", "") or ""
        _stops_raw = getattr(f, "stops", 0)
        try:
            stops = int(_stops_raw or 0)
        except (ValueError, TypeError):
            stops = 0
        ahead = str(getattr(f, "arrival_time_ahead", "") or "")

        # Parse "+1" / "+2" day offset for next-day arrivals
        ahead_days = 0
        if ahead:
            m = re.search(r"(\d+)", ahead)
            if m:
                ahead_days = int(m.group(1))

        dep_iso = _make_iso_dt(dep_date, dep_time)
        arr_iso = _make_iso_dt(dep_date, arr_time, ahead_days)

        duration = _duration_str(duration_raw)
        if not duration or duration == "0m":
            continue  # skip flights where we couldn't parse the duration

        iata_code = _get_iata_code(name)
        logo_url = (
            f"https://www.gstatic.com/flights/airline_logos/70px/{iata_code}.png"
            if iata_code else ""
        )

        # Build a minimal segment for the UI
        segment = {
            "flightNumber": "",
            "carrier": name,
            "aircraft": "",
            "airline_logo": logo_url,
            "departure": {
                "iataCode": origin,
                "at": dep_iso,
                "terminal": "",
            },
            "arrival": {
                "iataCode": destination,
                "at": arr_iso,
                "terminal": "",
            },
            "duration": _duration_str(duration_raw),
        }

        # Stops (fast-flights only gives count, not intermediate airport codes)
        stop_list = [{"iataCode": "?", "at": ""} for _ in range(stops)]

        flights.append({
            "price": price,
            "airline_name": name,
            "airline_iata": iata_code,
            "airline_logo": logo_url,
            "duration": duration,
            "stops": stops,
            "segments": [segment],
            "stop_list": stop_list,
        })

    return flights


def search_round_trip(
    origin: str,
    destination: str,
    departure_date: date,
    return_date: date,
    max_results: int = 5,
) -> list[dict]:
    """
    Search outbound + return as two separate one-way queries, then combine.
    Returns offer dicts ready to be stored in FlightOffer.
    """
    logger.info("Searching %s→%s %s/%s", origin, destination, departure_date, return_date)

    outbound_flights = _search_one_way(origin, destination, departure_date, max_results)
    time.sleep(REQUEST_DELAY_SECS)
    return_flights = _search_one_way(destination, origin, return_date, max_results)

    if not outbound_flights or not return_flights:
        return []

    # Combine cheapest outbound + cheapest return into round-trip offers
    # We present the best outbound flight paired with the cheapest return
    best_return = min(return_flights, key=lambda f: f["price"])
    results = []

    for ob in outbound_flights:
        total_price = ob["price"] + best_return["price"]
        results.append({
            "offer_id": "",
            "price_eur": total_price,
            "airline_codes": ob["airline_iata"] or ob["airline_name"],
            "airline_names": ob["airline_name"],
            "airline_logo": ob["airline_logo"],
            "outbound_duration": ob["duration"],
            "return_duration": best_return["duration"],
            "outbound_stops": json.dumps(ob["stop_list"]),
            "return_stops": json.dumps(best_return["stop_list"]),
            "outbound_segments": json.dumps(ob["segments"]),
            "return_segments": json.dumps(best_return["segments"]),
        })

    return sorted(results, key=lambda o: o["price_eur"])
