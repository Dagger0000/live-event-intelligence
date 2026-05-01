"""
Internal endpoints consumed by BullMQ Node.js workers.
These are NOT authenticated with JWT — they are internal service-to-service calls.
In production, secure with a shared secret header or network policy.
"""
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, delete, func
from app.core.database import AsyncSessionLocal
from app.models.user import (
    SportEvent, EventStream, EventAnalysis, PipelineStage,
    AlertRule, Alert, EventReport, AICallLog
)
from app.services.sports_service import normalize_event
from app.services.pipeline_service import (
    init_pipeline_stages, set_stage_active, set_stage_done, get_pipeline_stages
)
from app.services.ai_service import (
    call_groq_commentary, call_gemini_analysis, call_gemini_report
)
from app.core.redis_manager import publish_event_update, manager as ws_manager

router = APIRouter(prefix="/api/internal", tags=["internal"])


@router.post("/ingest")
async def internal_ingest(payload: dict):
    """Stage 1: Upsert event from BullMQ ingestion worker."""
    raw = payload.get("event", {})
    normalized = normalize_event(raw)
    if not normalized["id"]:
        return {"ok": False}

    async with AsyncSessionLocal() as db:
        await set_stage_active(normalized["id"], 1, db)
        existing = await db.get(SportEvent, normalized["id"])
        if not existing:
            event = SportEvent(**normalized)
            db.add(event)
            await db.flush()
            await init_pipeline_stages(normalized["id"], db)
        else:
            for k, v in normalized.items():
                setattr(existing, k, v)
        await set_stage_done(normalized["id"], 1, db)
        await db.commit()
    return {"ok": True, "event_id": normalized["id"]}


@router.post("/stream")
async def internal_stream(payload: dict):
    """Stage 2: Append to rolling stream window."""
    event_id = payload.get("event_id")
    event_data = payload.get("event_data", {})
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id required")

    async with AsyncSessionLocal() as db:
        await set_stage_active(event_id, 2, db)

        stream_entry = EventStream(
            event_id=event_id,
            home_score=_parse_score(event_data.get("intHomeScore")),
            away_score=_parse_score(event_data.get("intAwayScore")),
            status=event_data.get("strStatus", "Upcoming"),
            raw_data=json.dumps(event_data),
        )
        db.add(stream_entry)
        await db.flush()

        # Trim to last 50
        result = await db.execute(
            select(EventStream.id)
            .where(EventStream.event_id == event_id)
            .order_by(EventStream.recorded_at.desc())
            .offset(50)
        )
        old_ids = [row[0] for row in result.fetchall()]
        if old_ids:
            await db.execute(delete(EventStream).where(EventStream.id.in_(old_ids)))

        await set_stage_done(event_id, 2, db)
        await db.commit()
    return {"ok": True}


@router.post("/commentary")
async def internal_commentary(payload: dict):
    """Stage 3: Generate Groq commentary, push via WebSocket."""
    event_id = payload.get("event_id")
    event_data = payload.get("event_data", {})
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id required")

    async with AsyncSessionLocal() as db:
        event = await db.get(SportEvent, event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        # Debounce check
        if event.last_commentary_at:
            elapsed = (datetime.utcnow() - event.last_commentary_at).total_seconds()
            if elapsed < 60:
                return {"skipped": True, "reason": "debounced"}

        await set_stage_active(event_id, 3, db)

        normalized_data = {
            "home_team": event.home_team, "away_team": event.away_team,
            "home_score": event.home_score, "away_score": event.away_score,
            "status": event.status, "sport": event.sport,
        }

        commentary, latency_ms = await call_groq_commentary(normalized_data)

        # Save to latest stream entry
        result = await db.execute(
            select(EventStream)
            .where(EventStream.event_id == event_id)
            .order_by(EventStream.recorded_at.desc())
            .limit(1)
        )
        stream_entry = result.scalar_one_or_none()
        if stream_entry:
            stream_entry.commentary = commentary

        event.last_commentary_at = datetime.utcnow()
        db.add(AICallLog(model="groq/llama-3.1-8b-instant", event_id=event_id, latency_ms=latency_ms, success=True))
        await set_stage_done(event_id, 3, db)
        await db.commit()

    # Push via WebSocket
    await publish_event_update(event_id, {
        "type": "commentary",
        "event_id": event_id,
        "commentary": commentary,
        "timestamp": datetime.utcnow().isoformat(),
    })

    return {"ok": True, "commentary": commentary, "latency_ms": latency_ms}


@router.post("/analysis")
async def internal_analysis(payload: dict):
    """Stages 4-6: Gemini analysis + Redis pub/sub + WebSocket push."""
    event_id = payload.get("event_id")
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id required")

    async with AsyncSessionLocal() as db:
        event = await db.get(SportEvent, event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        # Stage 4
        await set_stage_active(event_id, 4, db)
        stream_result = await db.execute(
            select(EventStream)
            .where(EventStream.event_id == event_id)
            .order_by(EventStream.recorded_at.desc())
            .limit(50)
        )
        stream = stream_result.scalars().all()
        stream_data = [
            {"home_score": s.home_score, "away_score": s.away_score,
             "status": s.status, "commentary": s.commentary}
            for s in reversed(stream)
        ]

        event_data = {
            "home_team": event.home_team, "away_team": event.away_team,
            "home_score": event.home_score, "away_score": event.away_score,
            "status": event.status, "sport": event.sport,
        }

        analysis, latency_ms = await call_gemini_analysis(event_data, stream_data)

        record = EventAnalysis(
            event_id=event_id,
            updated_summary=analysis.updated_summary,
            key_moments=json.dumps(analysis.key_moments),
            trend=analysis.trend,
            prediction=analysis.prediction,
            confidence=analysis.confidence,
        )
        db.add(record)
        event.last_analysis_at = datetime.utcnow()
        db.add(AICallLog(model="gemini-1.5-flash", event_id=event_id, latency_ms=latency_ms, success=True))
        await set_stage_done(event_id, 4, db)
        await db.commit()

    # Stage 5: Redis pub/sub publish
    async with AsyncSessionLocal() as db:
        await set_stage_active(event_id, 5, db)

    payload_out = {
        "type": "analysis",
        "event_id": event_id,
        "summary": analysis.updated_summary,
        "key_moments": analysis.key_moments,
        "trend": analysis.trend,
        "prediction": analysis.prediction,
        "confidence": analysis.confidence,
        "timestamp": datetime.utcnow().isoformat(),
    }
    await publish_event_update(event_id, payload_out)

    async with AsyncSessionLocal() as db:
        await set_stage_done(event_id, 5, db)
        # Stage 6: WS push (handled by Redis subscriber in ws endpoint)
        await set_stage_active(event_id, 6, db)
        await set_stage_done(event_id, 6, db)
        await db.commit()

    return {"ok": True, "analysis": payload_out}


@router.post("/evaluate-alerts")
async def internal_evaluate_alerts(payload: dict):
    """Stage 7: Evaluate alert rules for an event."""
    event_id = payload.get("event_id")
    analysis = payload.get("analysis", {})
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id required")

    triggered_count = 0
    async with AsyncSessionLocal() as db:
        await set_stage_active(event_id, 7, db)

        event = await db.get(SportEvent, event_id)
        rules_result = await db.execute(
            select(AlertRule).where(AlertRule.event_id == event_id, AlertRule.is_active == True)
        )
        rules = rules_result.scalars().all()

        for rule in rules:
            config = rule.rule_config
            if isinstance(config, str):
                try:
                    config = json.loads(config)
                except Exception:
                    config = {}

            triggered = False
            matched_value = ""

            if rule.rule_type == "keyword_detected":
                keyword = config.get("keyword", "").lower()
                search_text = (
                    str(analysis.get("summary", "")) + " " +
                    " ".join(analysis.get("key_moments", [])) + " " +
                    str(analysis.get("prediction", ""))
                ).lower()
                if keyword and keyword in search_text:
                    triggered = True
                    matched_value = f"Keyword '{keyword}' found in AI analysis"

            elif rule.rule_type == "score_threshold":
                if event:
                    gap = abs((event.home_score or 0) - (event.away_score or 0))
                    threshold = config.get("threshold", 3)
                    if gap >= threshold:
                        triggered = True
                        matched_value = f"Score gap {gap} ≥ threshold {threshold}"

            elif rule.rule_type == "trend_change":
                target = config.get("trend", "reversal")
                if analysis.get("trend") == target:
                    triggered = True
                    matched_value = f"Trend is now '{analysis.get('trend')}'"

            if triggered:
                alert = Alert(rule_id=rule.id, matched_value=matched_value)
                db.add(alert)
                triggered_count += 1

                # Push WS alert directly to user
                await ws_manager.send_to_user(rule.user_id, {
                    "type": "alert",
                    "event_id": event_id,
                    "rule_type": rule.rule_type,
                    "matched_value": matched_value,
                    "timestamp": datetime.utcnow().isoformat(),
                })

        await set_stage_done(event_id, 7, db)
        await db.commit()

    return {"ok": True, "triggered_count": triggered_count}


@router.post("/report")
async def internal_report(payload: dict):
    """Stage 8: Generate post-event report."""
    event_id = payload.get("event_id")
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id required")

    async with AsyncSessionLocal() as db:
        existing = await db.execute(
            select(EventReport).where(EventReport.event_id == event_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Report already exists")

        await set_stage_active(event_id, 8, db)
        event = await db.get(SportEvent, event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        stream_result = await db.execute(
            select(EventStream).where(EventStream.event_id == event_id).order_by(EventStream.recorded_at)
        )
        history = [
            {"home_score": s.home_score, "away_score": s.away_score, "commentary": s.commentary}
            for s in stream_result.scalars().all()
        ]

        analyses_result = await db.execute(
            select(EventAnalysis).where(EventAnalysis.event_id == event_id)
        )
        predictions = [
            {"prediction": a.prediction, "confidence": a.confidence}
            for a in analyses_result.scalars().all()
        ]

        event_data = {
            "home_team": event.home_team, "away_team": event.away_team,
            "home_score": event.home_score, "away_score": event.away_score,
        }

        report_data, latency_ms = await call_gemini_report(event_data, history, predictions)
        db.add(AICallLog(model="gemini-1.5-flash-report", event_id=event_id, latency_ms=latency_ms, success=True))

        report = EventReport(
            event_id=event_id,
            narrative=report_data.get("narrative", ""),
            key_moments=json.dumps(report_data.get("key_moments", [])),
            prediction_accuracy=report_data.get("prediction_accuracy", 0.0),
            accuracy_notes=report_data.get("accuracy_notes"),
        )
        db.add(report)
        await set_stage_done(event_id, 8, db)
        await db.commit()

    await publish_event_update(event_id, {
        "type": "report_ready",
        "event_id": event_id,
        "timestamp": datetime.utcnow().isoformat(),
    })

    return {
        "ok": True,
        "prediction_accuracy": report_data.get("prediction_accuracy"),
    }


@router.get("/active-events")
async def internal_active_events():
    """Return active events for BullMQ analysis scheduler."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SportEvent).where(SportEvent.status.in_(["In Progress", "Final"]))
        )
        events = result.scalars().all()
        return {"events": [{"id": e.id, "status": e.status} for e in events]}


def _parse_score(val):
    if val is None or val == "" or val == "null":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None
