"""
Two-layer Gulf / Arab carrier filter:

1. Name filter (passes_name_filter): used by the fast-flights client.
   Checks the airline name string returned by Google Flights.

2. Airport filter (passes_layover_filter): backup used when we have
   explicit stopover airport codes (e.g. from future API upgrades).
"""

# ── Name-based filter ────────────────────────────────────────────────────────

EXCLUDED_AIRLINE_KEYWORDS: list[str] = [
    # UAE
    "emirates",
    "etihad",
    "flydubai",
    "air arabia",
    "wizz air abu dhabi",
    # Qatar
    "qatar",
    # Kuwait
    "kuwait",
    # Bahrain
    "gulf air",
    # Saudi Arabia
    "saudia",
    "saudi arabian",
    "flynas",
    "flyadeal",
    # Oman
    "oman air",
    # Iraq / Jordan (routing hubs sometimes used)
    "royal jordanian",
    "iraqi airways",
    # Iran (just in case)
    "iran air",
    "mahan air",
]


def passes_name_filter(airline_name: str) -> bool:
    """
    Return True if the airline name does NOT match any excluded keyword.
    Case-insensitive substring check.
    """
    lower = airline_name.lower()
    return not any(kw in lower for kw in EXCLUDED_AIRLINE_KEYWORDS)


# ── Airport-code-based filter (backup) ───────────────────────────────────────

EXCLUDED_AIRPORTS: set[str] = {
    # UAE
    "DXB", "AUH", "SHJ", "DWC",
    # Qatar
    "DOH",
    # Kuwait
    "KWI",
    # Bahrain
    "BAH",
    # Saudi Arabia
    "RUH", "JED", "DMM", "MED", "TIF",
    # Oman
    "MCT", "SLL", "MNH",
    # Iraq
    "BGW", "BSR", "EBL",
    # Jordan
    "AMM",
    # Egypt
    "CAI",
}


def passes_layover_filter(stopover_codes: list[str]) -> bool:
    """Return True if none of the stopovers are in an excluded airport."""
    return not any(code in EXCLUDED_AIRPORTS for code in stopover_codes)
