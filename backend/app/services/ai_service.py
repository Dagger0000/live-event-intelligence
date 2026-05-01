import time
import json
import re
import asyncio
from typing import Optional
from app.core.config import get_settings
from app.models.schemas import GeminiAnalysis

settings = get_settings()

STAGE_NAMES = [
    "", "Event Ingestion", "Stream Accumulation", "Groq Commentary",
    "Gemini Flash Analysis", "Redis Pub/Sub Publish",
    "WebSocket Push", "Alert Rule Evaluation", "Post-Event Report"
]


async def call_groq_commentary(event_data: dict) -> tuple[str, int]:
    """
    Call Groq Llama 3.1 8B for fast commentary.
    Returns (commentary_text, latency_ms).
    """
    if not settings.groq_api_key:
        return _mock_commentary(event_data), 150

    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.groq_api_key)

    home = event_data.get("home_team", "Home")
    away = event_data.get("away_team", "Away")
    hs = event_data.get("home_score", 0)
    as_ = event_data.get("away_score", 0)
    status = event_data.get("status", "In Progress")
    sport = event_data.get("sport", "Sport")

    prompt = (
        f"You are a live {sport} commentator. Generate ONE punchy, exciting commentary "
        f"line (max 25 words) for: {home} {hs} - {as_} {away}. Status: {status}. "
        f"Be dramatic and specific. Do not repeat the score literally."
    )

    start = time.time()
    try:
        response = await client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=60,
            temperature=0.85,
        )
        latency = int((time.time() - start) * 1000)
        text = response.choices[0].message.content.strip()
        return text, latency
    except Exception as e:
        return f"Live action unfolding as {home} face {away}!", 0


async def call_gemini_analysis(event_data: dict, stream_window: list) -> tuple[GeminiAnalysis, int]:
    """
    Call Gemini 1.5 Flash for deep analysis.
    Returns (GeminiAnalysis, latency_ms).
    """
    if not settings.gemini_api_key:
        return _mock_analysis(event_data), 200

    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    home = event_data.get("home_team", "Home")
    away = event_data.get("away_team", "Away")
    sport = event_data.get("sport", "Sport")

    stream_summary = json.dumps(stream_window[-20:], indent=2) if stream_window else "[]"

    prompt = f"""You are an expert {sport} analyst. Analyze this live event data.

Event: {home} vs {away}
Current Score: {event_data.get('home_score', 0)}-{event_data.get('away_score', 0)}
Status: {event_data.get('status')}

Recent event stream (last 20 updates):
{stream_summary}

Respond ONLY with valid JSON (no markdown, no code blocks):
{{
  "updated_summary": "2-3 sentence match summary",
  "key_moments": ["moment 1", "moment 2", "moment 3"],
  "trend": "momentum|stable|reversal",
  "prediction": "1-2 sentence outcome prediction",
  "confidence": 0.0-1.0
}}
"""

    start = time.time()
    try:
        response = await asyncio.to_thread(model.generate_content, prompt)
        latency = int((time.time() - start) * 1000)
        text = response.text.strip()
        # Strip markdown fences if present
        text = re.sub(r"```(?:json)?", "", text).strip()
        data = json.loads(text)
        analysis = GeminiAnalysis(**data)
        return analysis, latency
    except Exception as e:
        return _mock_analysis(event_data), 0


async def call_gemini_report(event_data: dict, full_history: list, predictions: list) -> tuple[dict, int]:
    """Generate post-event report with Gemini."""
    if not settings.gemini_api_key:
        return _mock_report(event_data), 200

    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    home = event_data.get("home_team")
    away = event_data.get("away_team")
    final_score = f"{event_data.get('home_score', 0)}-{event_data.get('away_score', 0)}"

    prompt = f"""Write a comprehensive post-match report for: {home} vs {away}
Final Score: {final_score}
Full event history: {json.dumps(full_history[-30:], indent=2)}
AI Predictions made: {json.dumps(predictions, indent=2)}

Respond ONLY with valid JSON:
{{
  "narrative": "3-4 paragraph match narrative",
  "key_moments": ["moment 1", "moment 2", "moment 3", "moment 4", "moment 5"],
  "prediction_accuracy": 0.0-1.0,
  "accuracy_notes": "How accurate were the AI predictions?"
}}
"""

    start = time.time()
    try:
        response = await asyncio.to_thread(model.generate_content, prompt)
        latency = int((time.time() - start) * 1000)
        text = re.sub(r"```(?:json)?", "", response.text.strip()).strip()
        return json.loads(text), latency
    except Exception as e:
        return _mock_report(event_data), 0


def _mock_commentary(event_data: dict) -> str:
    home = event_data.get("home_team", "Home")
    away = event_data.get("away_team", "Away")
    hs = event_data.get("home_score", 0)
    as_ = event_data.get("away_score", 0)
    templates = [
        f"Incredible intensity here as {home} push forward with everything they've got!",
        f"The crowd is electric! {home} {hs} - {as_} {away} — neither side ready to yield.",
        f"What a contest! {away} fighting back with renewed urgency in this thrilling encounter.",
        f"Momentum shifting dramatically — {home} sensing a golden opportunity here!",
        f"This is breathtaking sport! The margin is razor-thin and every moment counts.",
    ]
    import random
    return random.choice(templates)


def _mock_analysis(event_data: dict) -> GeminiAnalysis:
    home = event_data.get("home_team", "Home")
    away = event_data.get("away_team", "Away")
    hs = event_data.get("home_score", 0) or 0
    as_ = event_data.get("away_score", 0) or 0
    import random
    trend = random.choice(["momentum", "stable", "reversal"])
    leading = home if hs >= as_ else away
    return GeminiAnalysis(
        updated_summary=f"{home} and {away} are engaged in a tightly contested match. "
                        f"The current score of {hs}-{as_} reflects the balanced nature of play. "
                        f"{leading} holds a slight psychological advantage.",
        key_moments=[
            f"{home} created their best chance in the opening phase",
            f"Tactical adjustment from {away} changed the match dynamic",
            f"Key defensive error nearly cost {leading} the lead",
        ],
        trend=trend,
        prediction=f"{leading} likely to maintain their edge with confidence at {random.uniform(0.55, 0.80):.0%}.",
        confidence=round(random.uniform(0.52, 0.82), 2),
    )


def _mock_report(event_data: dict) -> dict:
    home = event_data.get("home_team", "Home")
    away = event_data.get("away_team", "Away")
    hs = event_data.get("home_score", 0) or 0
    as_ = event_data.get("away_score", 0) or 0
    winner = home if hs > as_ else (away if as_ > hs else None)
    result_line = f"{winner} claimed victory" if winner else "The match ended in a draw"
    return {
        "narrative": f"In a fiercely contested match, {home} faced {away} in what proved to be a "
                     f"captivating encounter. The final scoreline of {hs}-{as_} tells only part of the story. "
                     f"{result_line} in a match full of drama and tactical nuance. "
                     f"Both sides showed tremendous character throughout.",
        "key_moments": [
            "Opening exchanges set a high-tempo tone",
            "First major tactical shift changed the match's direction",
            "Crucial defensive intervention preserved the scoreline",
            "Momentum swing in the second half proved decisive",
            f"Final whistle — {hs}-{as_} the definitive outcome",
        ],
        "prediction_accuracy": 0.72,
        "accuracy_notes": "AI predictions were broadly accurate, correctly identifying the match trend and likely winner.",
    }
