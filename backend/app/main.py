from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import init_db
from app.core.config import get_settings
from app.api import auth, events, websocket, admin, predictions, alerts, internal, weather
from app.services.scheduler import start_scheduler

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    # Seed initial events on startup
    try:
        from app.services.sports_service import fetch_events, normalize_event
        from app.services.pipeline_service import init_pipeline_stages
        from app.models.user import SportEvent
        from app.core.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            raw_events = await fetch_events()
            for raw in raw_events:
                normalized = normalize_event(raw)
                if not normalized["id"]:
                    continue
                existing = await db.get(SportEvent, normalized["id"])
                if not existing:
                    event = SportEvent(**normalized)
                    db.add(event)
                    await db.flush()
                    await init_pipeline_stages(normalized["id"], db)
            await db.commit()
        print(f"✅ Seeded {len(raw_events)} events from {'mock' if settings.use_mock else 'TheSportsDB'}")
    except Exception as e:
        print(f"⚠️  Seed warning: {e}")

    start_scheduler()
    yield
    # Shutdown
    from app.services.scheduler import scheduler
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Live Event Intelligence Platform",
    description="Real-time sports AI commentary and analysis platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(events.router)
app.include_router(predictions.router)
app.include_router(alerts.router)
app.include_router(admin.router)
app.include_router(websocket.router)
app.include_router(internal.router)
app.include_router(weather.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
