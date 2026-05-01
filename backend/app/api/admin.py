from datetime import datetime, date
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import require_analyst
from app.models.user import User, SportEvent, AICallLog
from app.models.schemas import AdminStats, AICallLogOut
from app.core.redis_manager import manager

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
async def get_stats(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_analyst)):
    total_events = (await db.execute(select(func.count()).select_from(SportEvent))).scalar()
    live_events = (await db.execute(
        select(func.count()).where(SportEvent.status == "In Progress")
    )).scalar()

    today = datetime.combine(date.today(), datetime.min.time())
    ai_calls = (await db.execute(
        select(func.count()).where(AICallLog.created_at >= today)
    )).scalar()

    return AdminStats(
        active_ws_connections=manager.get_connection_count(),
        total_events=total_events,
        live_events=live_events,
        ai_calls_today=ai_calls,
    )


@router.get("/ai-logs", response_model=list[AICallLogOut])
async def get_ai_logs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_analyst),
):
    result = await db.execute(
        select(AICallLog).order_by(AICallLog.created_at.desc()).limit(100)
    )
    return result.scalars().all()


@router.get("/queues-info")
async def queues_info(current_user: User = Depends(require_analyst)):
    """Proxy info about BullMQ queues via Redis."""
    try:
        from app.core.redis_manager import get_redis
        redis = await get_redis()
        keys = await redis.keys("bull:*:waiting")
        queue_info = {}
        for key in keys:
            queue_name = key.split(":")[1]
            count = await redis.llen(key)
            queue_info[queue_name] = {"waiting": count}
        return {"queues": queue_info, "bull_board_url": "/admin/queues"}
    except Exception as e:
        return {"queues": {}, "error": str(e)}
