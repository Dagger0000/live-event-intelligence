from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import require_analyst
from app.models.user import User, Alert, AlertRule
from app.models.schemas import AlertOut

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("/history", response_model=list[AlertOut])
async def get_alert_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_analyst),
):
    """Get recent alert history for the current user."""
    result = await db.execute(
        select(Alert)
        .join(AlertRule, Alert.rule_id == AlertRule.id)
        .where(AlertRule.user_id == current_user.id)
        .order_by(Alert.triggered_at.desc())
        .limit(50)
    )
    return result.scalars().all()
