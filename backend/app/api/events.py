import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from app.core.database import get_db
from app.core.security import get_current_user, require_analyst
from app.models.user import User, SportEvent, EventSubscription, EventStream, EventAnalysis, AlertRule, Alert
from app.models.schemas import EventOut, PipelineStageOut, EventStreamOut, AnalysisOut, AlertRuleCreate, AlertRuleOut, AlertOut, SubscriptionOut, ReportOut, PredictionOut
from app.services.pipeline_service import get_pipeline_stages
from app.services.sports_service import fetch_events, normalize_event
from app.services.pipeline_service import init_pipeline_stages
from app.core.redis_manager import get_cached_updates

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventOut])
async def list_events(
    status: Optional[str] = Query(None),
    sport: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(SportEvent)
    if status:
        q = q.where(SportEvent.status == status)
    if sport:
        q = q.where(SportEvent.sport == sport)
    q = q.order_by(SportEvent.updated_at.desc())
    result = await db.execute(q)
    events = result.scalars().all()

    # Get user subscriptions
    sub_result = await db.execute(
        select(EventSubscription.event_id).where(EventSubscription.user_id == current_user.id)
    )
    subscribed_ids = {row[0] for row in sub_result.fetchall()}

    out = []
    for e in events:
        d = EventOut.model_validate(e)
        d.is_subscribed = e.id in subscribed_ids
        out.append(d)
    return out


@router.get("/refresh")
async def refresh_events(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Manually trigger event ingestion from TheSportsDB/mock."""
    raw_events = await fetch_events()
    new_count = 0
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
            new_count += 1
        else:
            for k, v in normalized.items():
                setattr(existing, k, v)
    await db.commit()
    return {"message": f"Refreshed. {new_count} new events added.", "total": len(raw_events)}


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = await db.get(SportEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    sub = await db.execute(
        select(EventSubscription).where(
            EventSubscription.user_id == current_user.id,
            EventSubscription.event_id == event_id,
        )
    )
    d = EventOut.model_validate(event)
    d.is_subscribed = sub.scalar_one_or_none() is not None
    return d


@router.get("/{event_id}/stages", response_model=list[PipelineStageOut])
async def get_stages(event_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    stages = await get_pipeline_stages(event_id, db)
    return stages


@router.get("/{event_id}/stream", response_model=list[EventStreamOut])
async def get_stream(
    event_id: str,
    limit: int = Query(50, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EventStream)
        .where(EventStream.event_id == event_id)
        .order_by(EventStream.recorded_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{event_id}/analysis", response_model=list[AnalysisOut])
async def get_analysis(
    event_id: str,
    limit: int = Query(5, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EventAnalysis)
        .where(EventAnalysis.event_id == event_id)
        .order_by(EventAnalysis.created_at.desc())
        .limit(limit)
    )
    items = result.scalars().all()
    return [AnalysisOut.from_orm_with_moments(i) for i in items]


@router.get("/{event_id}/cache")
async def get_cached(event_id: str, current_user: User = Depends(get_current_user)):
    updates = await get_cached_updates(event_id)
    return {"updates": updates}


@router.get("/{event_id}/report", response_model=ReportOut)
async def get_report(event_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_analyst)):
    from app.models.user import EventReport
    result = await db.execute(select(EventReport).where(EventReport.event_id == event_id))  # noqa
    # Re-import cleanly
    from app.models.user import EventReport as ER
    r = await db.execute(select(ER).where(ER.event_id == event_id))
    report = r.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not yet generated")
    return ReportOut.from_orm_parsed(report)


# ── Subscriptions ─────────────────────────────────────────────────────────────
@router.post("/{event_id}/subscribe", response_model=SubscriptionOut)
async def subscribe(event_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check viewer subscription limit (max 3)
    if current_user.role == "viewer":
        sub_count = await db.execute(
            select(func.count()).select_from(EventSubscription).where(EventSubscription.user_id == current_user.id)
        )
        count = sub_count.scalar()
        if count >= 3:
            raise HTTPException(status_code=403, detail="Viewers can subscribe to max 3 events")

    event = await db.get(SportEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    existing = await db.execute(
        select(EventSubscription).where(
            EventSubscription.user_id == current_user.id,
            EventSubscription.event_id == event_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already subscribed")

    sub = EventSubscription(user_id=current_user.id, event_id=event_id)
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.delete("/{event_id}/subscribe")
async def unsubscribe(event_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await db.execute(
        delete(EventSubscription).where(
            EventSubscription.user_id == current_user.id,
            EventSubscription.event_id == event_id,
        )
    )
    await db.commit()
    return {"message": "Unsubscribed"}


# ── Alert Rules ───────────────────────────────────────────────────────────────
@router.get("/{event_id}/alerts/rules", response_model=list[AlertRuleOut])
async def get_alert_rules(event_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_analyst)):
    result = await db.execute(
        select(AlertRule).where(AlertRule.event_id == event_id, AlertRule.user_id == current_user.id)
    )
    return [AlertRuleOut.from_orm_parsed(r) for r in result.scalars().all()]


@router.post("/{event_id}/alerts/rules", response_model=AlertRuleOut)
async def create_alert_rule(
    event_id: str,
    payload: AlertRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_analyst),
):
    # Max 5 rules per event
    count = await db.execute(
        select(func.count()).where(AlertRule.event_id == event_id, AlertRule.user_id == current_user.id)
    )
    if count.scalar() >= 5:
        raise HTTPException(status_code=400, detail="Max 5 alert rules per event")

    rule = AlertRule(
        user_id=current_user.id,
        event_id=event_id,
        rule_type=payload.rule_type,
        rule_config=json.dumps(payload.rule_config),
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return AlertRuleOut.from_orm_parsed(rule)


@router.delete("/{event_id}/alerts/rules/{rule_id}")
async def delete_alert_rule(
    event_id: str, rule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_analyst),
):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id, AlertRule.user_id == current_user.id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()
    return {"message": "Rule deleted"}
