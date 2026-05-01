from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.user import PipelineStage
from app.core.redis_manager import publish_event_update

STAGE_DEFS = [
    (1, "Event Ingestion"),
    (2, "Stream Accumulation"),
    (3, "Groq Commentary"),
    (4, "Gemini Flash Analysis"),
    (5, "Redis Pub/Sub Publish"),
    (6, "WebSocket Push"),
    (7, "Alert Rule Evaluation"),
    (8, "Post-Event Report"),
]


async def init_pipeline_stages(event_id: str, db: AsyncSession):
    """Create all 8 pipeline stages for a new event as 'pending'."""
    # Delete existing stages for this event first
    await db.execute(delete(PipelineStage).where(PipelineStage.event_id == event_id))
    for num, name in STAGE_DEFS:
        stage = PipelineStage(
            event_id=event_id,
            stage_number=num,
            stage_name=name,
            status="pending",
        )
        db.add(stage)
    await db.commit()


async def set_stage_active(event_id: str, stage_number: int, db: AsyncSession):
    result = await db.execute(
        select(PipelineStage).where(
            PipelineStage.event_id == event_id,
            PipelineStage.stage_number == stage_number,
        )
    )
    stage = result.scalar_one_or_none()
    if stage:
        stage.status = "active"
        stage.started_at = datetime.utcnow()
        await db.commit()
        await _broadcast_stage_update(event_id, stage)


async def set_stage_done(event_id: str, stage_number: int, db: AsyncSession):
    result = await db.execute(
        select(PipelineStage).where(
            PipelineStage.event_id == event_id,
            PipelineStage.stage_number == stage_number,
        )
    )
    stage = result.scalar_one_or_none()
    if stage:
        stage.status = "done"
        stage.completed_at = datetime.utcnow()
        await db.commit()
        await _broadcast_stage_update(event_id, stage)


async def get_pipeline_stages(event_id: str, db: AsyncSession) -> list[PipelineStage]:
    result = await db.execute(
        select(PipelineStage)
        .where(PipelineStage.event_id == event_id)
        .order_by(PipelineStage.stage_number)
    )
    return list(result.scalars().all())


async def _broadcast_stage_update(event_id: str, stage: PipelineStage):
    try:
        await publish_event_update(event_id, {
            "type": "stage_update",
            "event_id": event_id,
            "stage_number": stage.stage_number,
            "stage_name": stage.stage_name,
            "status": stage.status,
            "started_at": stage.started_at.isoformat() if stage.started_at else None,
            "completed_at": stage.completed_at.isoformat() if stage.completed_at else None,
        })
    except Exception:
        pass  # Redis may not be ready
