import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db, AsyncSessionLocal
from app.core.security import get_ws_user
from app.core.redis_manager import manager, redis_subscriber, get_cached_updates

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/events/{event_id}")
async def websocket_event(websocket: WebSocket, event_id: str):
    async with AsyncSessionLocal() as db:
        user = await get_ws_user(websocket, db)

    user_id = user.id if user else None
    await manager.connect(websocket, event_id, user_id)

    # Send cached updates as catchup on reconnect
    try:
        cached = await get_cached_updates(event_id)
        if cached:
            await websocket.send_json({"type": "catchup", "updates": cached})
    except Exception:
        pass

    # Start Redis subscriber task
    sub_task = asyncio.create_task(redis_subscriber(event_id))

    try:
        while True:
            # Keep connection alive, listen for client pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        sub_task.cancel()
        manager.disconnect(websocket, event_id, user_id)
