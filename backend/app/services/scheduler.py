import asyncio
import json
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.user import SportEvent, EventStream, PipelineStage, EventAnalysis, AICallLog, AlertRule, Alert, EventReport
from app.services.sports_service import fetch_events, normalize_event
from app.services.pipeline_service import init_pipeline_stages, set_stage_active, set_stage_done
from app.services.ai_service import call_groq_commentary, call_gemini_analysis, call_gemini_report
from app.core.redis_manager import publish_event_update, get_redis

scheduler = AsyncIOScheduler()


def start_scheduler():
    scheduler.add_job(ingest_events, "interval", seconds=60, id="ingest", replace_existing=True)
    scheduler.add_job(run_gemini_analysis_all, "interval", minutes=5, id="gemini_analysis", replace_existing=True)
    scheduler.start()
    print("✅ Scheduler started")


async def ingest_events():
    """Stage 1 & 2: Ingest events from TheSportsDB / mock."""
    print(f"[{datetime.utcnow().isoformat()}] 🔄 Ingesting events...")
    raw_events = await fetch_events()
    async with AsyncSessionLocal() as db:
        for raw in raw_events:
            normalized = normalize_event(raw)
            if not normalized["id"]:
                continue
            try:
                # Stage 1: Event ingestion
                existing = await db.get(SportEvent, normalized["id"])
                if not existing:
                    event = SportEvent(**normalized)
                    db.add(event)
                    await db.flush()
                    await init_pipeline_stages(normalized["id"], db)
                    await set_stage_active(normalized["id"], 1, db)
                    await set_stage_done(normalized["id"], 1, db)
                else:
                    for k, v in normalized.items():
                        setattr(existing, k, v)
                    await db.flush()

                # Stage 2: Stream accumulation
                await set_stage_active(normalized["id"], 2, db)
                stream_entry = EventStream(
                    event_id=normalized["id"],
                    home_score=normalized.get("home_score"),
                    away_score=normalized.get("away_score"),
                    status=normalized.get("status", "Upcoming"),
                    raw_data=json.dumps(normalized),
                )
                db.add(stream_entry)
                await db.flush()

                # Keep only last 50 per event
                result = await db.execute(
                    select(EventStream.id)
                    .where(EventStream.event_id == normalized["id"])
                    .order_by(EventStream.recorded_at.desc())
                    .offset(50)
                )
                old_ids = [row[0] for row in result.fetchall()]
                if old_ids:
                    await db.execute(delete(EventStream).where(EventStream.id.in_(old_ids)))

                await set_stage_done(normalized["id"], 2, db)
                await db.commit()

                # Stage 3: Groq commentary (async, debounced)
                asyncio.create_task(run_groq_commentary(normalized["id"]))

            except Exception as e:
                print(f"Ingest error for event {normalized.get('id')}: {e}")
                await db.rollback()


async def run_groq_commentary(event_id: str):
    """Stage 3: Generate Groq commentary."""
    async with AsyncSessionLocal() as db:
        event = await db.get(SportEvent, event_id)
        if not event:
            return

        # Debounce: skip if commentary in last 60s
        if event.last_commentary_at:
            if (datetime.utcnow() - event.last_commentary_at).total_seconds() < 60:
                return

        await set_stage_active(event_id, 3, db)
        event_data = {
            "home_team": event.home_team,
            "away_team": event.away_team,
            "home_score": event.home_score,
            "away_score": event.away_score,
            "status": event.status,
            "sport": event.sport,
        }

        start = datetime.utcnow()
        try:
            commentary, latency_ms = await call_groq_commentary(event_data)

            # Save to latest stream entry
            from sqlalchemy import select as sel
            result = await db.execute(
                sel(EventStream)
                .where(EventStream.event_id == event_id)
                .order_by(EventStream.recorded_at.desc())
                .limit(1)
            )
            stream_entry = result.scalar_one_or_none()
            if stream_entry:
                stream_entry.commentary = commentary
                await db.flush()

            # Update debounce timestamp
            event.last_commentary_at = datetime.utcnow()
            await db.flush()

            # Log AI call
            db.add(AICallLog(
                model="groq/llama-3.1-8b-instant",
                event_id=event_id,
                latency_ms=latency_ms,
                success=True,
            ))
            await set_stage_done(event_id, 3, db)
            await db.commit()

            # Publish commentary via WebSocket
            await publish_event_update(event_id, {
                "type": "commentary",
                "event_id": event_id,
                "commentary": commentary,
                "timestamp": datetime.utcnow().isoformat(),
            })

        except Exception as e:
            db.add(AICallLog(model="groq/llama-3.1-8b-instant", event_id=event_id, success=False, error=str(e)))
            await db.commit()
            print(f"Groq error for {event_id}: {e}")


async def run_gemini_analysis_all():
    """Stage 4: Run Gemini analysis for all active events."""
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select as sel
        result = await db.execute(sel(SportEvent).where(SportEvent.status == "In Progress"))
        active_events = result.scalars().all()

    for event in active_events:
        asyncio.create_task(run_gemini_analysis(event.id))


async def run_gemini_analysis(event_id: str):
    """Stage 4-8: Full Gemini analysis pipeline."""
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select as sel
        event = await db.get(SportEvent, event_id)
        if not event:
            return

        # Check 5-min cooldown
        if event.last_analysis_at:
            if (datetime.utcnow() - event.last_analysis_at).total_seconds() < 290:
                return

        await set_stage_active(event_id, 4, db)

        # Fetch rolling 50-event window
        stream_result = await db.execute(
            sel(EventStream)
            .where(EventStream.event_id == event_id)
            .order_by(EventStream.recorded_at.desc())
            .limit(50)
        )
        stream = stream_result.scalars().all()
        stream_data = [
            {"home_score": s.home_score, "away_score": s.away_score, "status": s.status, "commentary": s.commentary}
            for s in reversed(stream)
        ]

        event_data = {
            "home_team": event.home_team, "away_team": event.away_team,
            "home_score": event.home_score, "away_score": event.away_score,
            "status": event.status, "sport": event.sport,
        }

        try:
            analysis, latency_ms = await call_gemini_analysis(event_data, stream_data)
            db.add(AICallLog(model="gemini-1.5-flash", event_id=event_id, latency_ms=latency_ms, success=True))

            # Save analysis
            analysis_record = EventAnalysis(
                event_id=event_id,
                updated_summary=analysis.updated_summary,
                key_moments=json.dumps(analysis.key_moments),
                trend=analysis.trend,
                prediction=analysis.prediction,
                confidence=analysis.confidence,
            )
            db.add(analysis_record)
            event.last_analysis_at = datetime.utcnow()
            await set_stage_done(event_id, 4, db)
            await db.commit()

            # Stage 5: Publish to Redis
            await set_stage_active(event_id, 5, db)
            payload = {
                "type": "analysis",
                "event_id": event_id,
                "summary": analysis.updated_summary,
                "key_moments": analysis.key_moments,
                "trend": analysis.trend,
                "prediction": analysis.prediction,
                "confidence": analysis.confidence,
                "timestamp": datetime.utcnow().isoformat(),
            }
            await publish_event_update(event_id, payload)
            await set_stage_done(event_id, 5, db)

            # Stage 6: WebSocket push (done via Redis pub/sub above)
            await set_stage_active(event_id, 6, db)
            await set_stage_done(event_id, 6, db)
            await db.commit()

            # Stage 7: Alert rule evaluation
            asyncio.create_task(run_alert_evaluation(event_id, analysis, payload))

            # Stage 8: Post-event report if final
            if event.status == "Final":
                asyncio.create_task(run_post_event_report(event_id))

        except Exception as e:
            db.add(AICallLog(model="gemini-1.5-flash", event_id=event_id, success=False, error=str(e)))
            await db.commit()
            print(f"Gemini error for {event_id}: {e}")


async def run_alert_evaluation(event_id: str, analysis, payload: dict):
    """Stage 7: Evaluate alert rules."""
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select as sel
        await set_stage_active(event_id, 7, db)

        rules_result = await db.execute(
            sel(AlertRule).where(AlertRule.event_id == event_id, AlertRule.is_active == True)
        )
        rules = rules_result.scalars().all()

        for rule in rules:
            try:
                config = json.loads(rule.rule_config) if isinstance(rule.rule_config, str) else rule.rule_config
                triggered = False
                matched_value = ""

                if rule.rule_type == "keyword_detected":
                    keyword = config.get("keyword", "").lower()
                    text_to_search = (
                        analysis.updated_summary + " " +
                        " ".join(analysis.key_moments) + " " +
                        analysis.prediction
                    ).lower()
                    if keyword and keyword in text_to_search:
                        triggered = True
                        matched_value = f"Keyword '{keyword}' detected in analysis"

                elif rule.rule_type == "score_threshold":
                    event = await db.get(SportEvent, event_id)
                    if event:
                        hs = event.home_score or 0
                        as_ = event.away_score or 0
                        gap = abs(hs - as_)
                        threshold = config.get("threshold", 3)
                        if gap >= threshold:
                            triggered = True
                            matched_value = f"Score gap {gap} >= threshold {threshold}"

                elif rule.rule_type == "trend_change":
                    target_trend = config.get("trend", "reversal")
                    if analysis.trend == target_trend:
                        triggered = True
                        matched_value = f"Trend changed to '{analysis.trend}'"

                if triggered:
                    alert = Alert(rule_id=rule.id, matched_value=matched_value)
                    db.add(alert)
                    await db.flush()

                    # Push WS alert to rule owner
                    from app.core.redis_manager import manager as ws_manager
                    await ws_manager.send_to_user(rule.user_id, {
                        "type": "alert",
                        "event_id": event_id,
                        "rule_type": rule.rule_type,
                        "matched_value": matched_value,
                        "timestamp": datetime.utcnow().isoformat(),
                    })

            except Exception as e:
                print(f"Alert rule error: {e}")

        await set_stage_done(event_id, 7, db)
        await db.commit()


async def run_post_event_report(event_id: str):
    """Stage 8: Generate post-event report."""
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select as sel

        # Check if report already exists
        from app.models.user import EventReport
        existing = await db.execute(sel(EventReport).where(EventReport.event_id == event_id))
        if existing.scalar_one_or_none():
            return

        await set_stage_active(event_id, 8, db)
        event = await db.get(SportEvent, event_id)
        if not event:
            return

        stream_result = await db.execute(
            sel(EventStream).where(EventStream.event_id == event_id).order_by(EventStream.recorded_at)
        )
        history = [
            {"home_score": s.home_score, "away_score": s.away_score, "commentary": s.commentary}
            for s in stream_result.scalars().all()
        ]

        analyses_result = await db.execute(
            sel(EventAnalysis).where(EventAnalysis.event_id == event_id).order_by(EventAnalysis.created_at)
        )
        predictions = [{"prediction": a.prediction, "confidence": a.confidence} for a in analyses_result.scalars().all()]

        event_data = {"home_team": event.home_team, "away_team": event.away_team, "home_score": event.home_score, "away_score": event.away_score}

        try:
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
        except Exception as e:
            db.add(AICallLog(model="gemini-1.5-flash-report", event_id=event_id, success=False, error=str(e)))
            await db.commit()
            print(f"Report error for {event_id}: {e}")
