from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, date
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, SportEvent, EventAnalysis, EventSubscription, AICallLog, EventReport
from app.models.schemas import PredictionOut

router = APIRouter(prefix="/api/predictions", tags=["predictions"])


@router.get("", response_model=list[PredictionOut])
async def get_predictions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get latest prediction for each subscribed event."""
    # Get subscribed event IDs
    sub_result = await db.execute(
        select(EventSubscription.event_id).where(EventSubscription.user_id == current_user.id)
    )
    event_ids = [row[0] for row in sub_result.fetchall()]

    predictions = []
    for event_id in event_ids:
        event = await db.get(SportEvent, event_id)
        if not event:
            continue

        # Get latest analysis
        result = await db.execute(
            select(EventAnalysis)
            .where(EventAnalysis.event_id == event_id)
            .order_by(EventAnalysis.created_at.desc())
            .limit(1)
        )
        analysis = result.scalar_one_or_none()
        if analysis:
            predictions.append(PredictionOut(
                event_id=event_id,
                event_name=event.name,
                prediction=analysis.prediction,
                confidence=analysis.confidence,
                trend=analysis.trend,
                created_at=analysis.created_at,
                actual_outcome=f"{event.home_score}-{event.away_score}" if event.status == "Final" else None,
            ))

    return sorted(predictions, key=lambda x: x.confidence, reverse=True)


@router.get("/model-accuracy")
async def model_accuracy(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bonus: real model call counts and Gemini prediction accuracy from EventReport.

    Groq generates live commentary — it does not make outcome predictions, so
    accuracy comparison against Gemini is not meaningful. Instead we return:
    - Real successful call counts per model from AICallLog (today)
    - Gemini prediction accuracy averaged from completed EventReports
    """
    today_start = datetime.combine(date.today(), datetime.min.time())

    # Count successful Groq calls today (model name starts with "groq/")
    groq_count_result = await db.execute(
        select(func.count())
        .select_from(AICallLog)
        .where(
            AICallLog.model.like("groq/%"),
            AICallLog.success == True,
            AICallLog.created_at >= today_start,
        )
    )
    groq_calls_today = groq_count_result.scalar() or 0

    # Count successful Gemini calls today (model name starts with "gemini-")
    gemini_count_result = await db.execute(
        select(func.count())
        .select_from(AICallLog)
        .where(
            AICallLog.model.like("gemini-%"),
            AICallLog.success == True,
            AICallLog.created_at >= today_start,
        )
    )
    gemini_calls_today = gemini_count_result.scalar() or 0

    # Average Gemini prediction accuracy from completed post-event reports
    reports_result = await db.execute(select(EventReport))
    reports = reports_result.scalars().all()
    gemini_accuracy = (
        round(sum(r.prediction_accuracy for r in reports) / len(reports), 3)
        if reports else None
    )

    return {
        "gemini_accuracy": gemini_accuracy,
        "groq_calls_today": groq_calls_today,
        "gemini_calls_today": gemini_calls_today,
        "total_events_evaluated": len(reports),
        "note": (
            "Groq (Llama 3.1) generates per-event live commentary — it does not produce "
            "outcome predictions, so direct accuracy comparison with Gemini is not possible. "
            "Gemini accuracy is derived from post-event reports comparing stored predictions "
            "against actual final scores. Call counts reflect successful API calls today."
        ),
    }
