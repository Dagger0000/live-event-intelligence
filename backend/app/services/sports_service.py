import json
import httpx
from pathlib import Path
from app.core.config import get_settings

settings = get_settings()

MOCK_FILE = Path(__file__).parent.parent.parent.parent / "workers" / "mock_livescore.json"
TSDB_BASE = "https://www.thesportsdb.com/api/v1/json"


async def fetch_events() -> list[dict]:
    """Fetch events from TheSportsDB or mock file."""
    if settings.use_mock:
        return _load_mock_events()
    return await _fetch_live_events()


def _load_mock_events() -> list[dict]:
    try:
        # Try local path first, then relative
        paths = [MOCK_FILE, Path("mock_livescore.json"), Path("../workers/mock_livescore.json")]
        for p in paths:
            if p.exists():
                with open(p) as f:
                    data = json.load(f)
                    return data.get("events", [])
    except Exception as e:
        print(f"Mock load error: {e}")
    return []


async def _fetch_live_events() -> list[dict]:
    """Fetch from TheSportsDB free tier (past events)."""
    key = settings.thesportsdb_api_key
    events = []
    sports = [
        f"{TSDB_BASE}/{key}/eventsday.php?d=2026-04-30&s=Soccer",
        f"{TSDB_BASE}/{key}/eventsday.php?d=2026-04-30&s=Basketball",
        f"{TSDB_BASE}/{key}/eventsday.php?d=2026-04-30&s=Baseball",
    ]
    async with httpx.AsyncClient(timeout=10) as client:
        for url in sports:
            try:
                resp = await client.get(url)
                data = resp.json()
                if data and data.get("events"):
                    events.extend(data["events"])
            except Exception as e:
                print(f"TSDB fetch error: {e}")
    return events


def normalize_event(raw: dict) -> dict:
    """Normalize raw API/mock event dict to our schema."""
    return {
        "id": str(raw.get("idEvent", "")),
        "name": raw.get("strEvent", "Unknown Event"),
        "sport": raw.get("strSport", "Unknown"),
        "league": raw.get("strLeague", "Unknown League"),
        "status": raw.get("strStatus", "Upcoming"),
        "home_team": raw.get("strHomeTeam", "Home"),
        "away_team": raw.get("strAwayTeam", "Away"),
        "home_score": _parse_score(raw.get("intHomeScore")),
        "away_score": _parse_score(raw.get("intAwayScore")),
        "venue": raw.get("strVenue"),
        "city": raw.get("strCity"),
        "country": raw.get("strCountry"),
        "date_event": raw.get("dateEvent"),
        "time_event": raw.get("strTime"),
    }


def _parse_score(val) -> int | None:
    if val is None or val == "" or val == "null":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None
