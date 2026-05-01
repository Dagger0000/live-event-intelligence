"""
Bonus: Weather Injection
Uses Open-Meteo (free, no API key) to fetch venue weather and
inject it into Gemini analysis prompts.
"""
import httpx
from fastapi import APIRouter, Depends
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/weather", tags=["weather"])

# Venue coordinates lookup (city -> lat/lon)
CITY_COORDS = {
    "Manchester": (53.483, -2.200), "Madrid": (40.416, -3.703),
    "Los Angeles": (34.052, -118.243), "New York": (40.712, -74.005),
    "London": (51.507, -0.127), "Munich": (48.137, 11.576),
    "Paris": (48.853, 2.350), "Brooklyn": (40.678, -73.944),
    "Chicago": (41.878, -87.629), "Miami": (25.761, -80.191),
    "Boston": (42.360, -71.058), "Milwaukee": (43.038, -87.906),
    "Memphis": (35.149, -90.048), "Phoenix": (33.448, -112.073),
    "Turin": (45.070, 7.686), "Rome": (41.902, 12.496),
    "Milan": (45.464, 9.190), "Dortmund": (51.514, 7.468),
    "Leverkusen": (51.030, 6.984), "Valencia": (39.469, -0.376),
    "Houston": (29.760, -95.369), "San Francisco": (37.774, -122.419),
    "Atlanta": (33.748, -84.387), "Denver": (39.739, -104.984),
    "Minneapolis": (44.977, -93.265),
}


async def get_weather_for_city(city: str) -> dict | None:
    """Fetch current weather from Open-Meteo (free, no key)."""
    coords = CITY_COORDS.get(city)
    if not coords:
        return None
    lat, lon = coords
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,precipitation,wind_speed_10m,weather_code"
        f"&temperature_unit=celsius"
    )
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url)
            data = resp.json()
            current = data.get("current", {})
            code = current.get("weather_code", 0)
            condition = _weather_code_to_condition(code)
            return {
                "temperature_c": current.get("temperature_2m"),
                "precipitation_mm": current.get("precipitation"),
                "wind_speed_kmh": current.get("wind_speed_10m"),
                "condition": condition,
                "prompt_injection": (
                    f"Current weather at venue: {current.get('temperature_2m')}°C, "
                    f"{condition}, wind {current.get('wind_speed_10m')} km/h."
                ),
            }
    except Exception as e:
        print(f"Weather fetch error for {city}: {e}")
        return None


def _weather_code_to_condition(code: int) -> str:
    if code == 0: return "clear skies"
    if code in (1, 2, 3): return "partly cloudy"
    if code in (45, 48): return "foggy"
    if code in (51, 53, 55): return "light drizzle"
    if code in (61, 63, 65): return "rain"
    if code in (71, 73, 75): return "snow"
    if code in (80, 81, 82): return "rain showers"
    if code in (95, 96, 99): return "thunderstorm"
    return "overcast"


@router.get("/{city}")
async def get_weather(city: str, current_user: User = Depends(get_current_user)):
    weather = await get_weather_for_city(city)
    if not weather:
        return {"city": city, "available": False, "message": "Coordinates not found for this city"}
    return {"city": city, "available": True, **weather}
