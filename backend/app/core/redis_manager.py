import json
import asyncio
from typing import Dict, Set
import redis.asyncio as aioredis
from fastapi import WebSocket
from app.core.config import get_settings

settings = get_settings()

# Global redis pool
_redis: aioredis.Redis = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


class ConnectionManager:
    def __init__(self):
        # event_id -> set of websockets
        self.connections: Dict[str, Set[WebSocket]] = {}
        # user_id -> set of websockets (for user-specific alerts)
        self.user_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, event_id: str, user_id: int = None):
        await websocket.accept()
        if event_id not in self.connections:
            self.connections[event_id] = set()
        self.connections[event_id].add(websocket)
        if user_id:
            if user_id not in self.user_connections:
                self.user_connections[user_id] = set()
            self.user_connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, event_id: str, user_id: int = None):
        if event_id in self.connections:
            self.connections[event_id].discard(websocket)
        if user_id and user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)

    async def broadcast_to_event(self, event_id: str, message: dict):
        if event_id not in self.connections:
            return
        dead = set()
        for ws in self.connections[event_id].copy():
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.connections[event_id].discard(ws)

    async def send_to_user(self, user_id: int, message: dict):
        if user_id not in self.user_connections:
            return
        dead = set()
        for ws in self.user_connections[user_id].copy():
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.user_connections[user_id].discard(ws)

    def get_connection_count(self) -> int:
        return sum(len(v) for v in self.connections.values())


manager = ConnectionManager()


async def redis_subscriber(event_id: str):
    """Subscribe to Redis channel and broadcast to WS clients."""
    redis = await get_redis()
    pubsub = redis.pubsub()
    channel = f"event:{event_id}:updates"
    await pubsub.subscribe(channel)
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                await manager.broadcast_to_event(event_id, data)
    except asyncio.CancelledError:
        await pubsub.unsubscribe(channel)
    finally:
        await pubsub.close()


async def publish_event_update(event_id: str, payload: dict):
    redis = await get_redis()
    channel = f"event:{event_id}:updates"
    await redis.publish(channel, json.dumps(payload))
    # Cache last 10 updates
    cache_key = f"event:{event_id}:cache"
    await redis.lpush(cache_key, json.dumps(payload))
    await redis.ltrim(cache_key, 0, 9)
    await redis.expire(cache_key, 86400)


async def get_cached_updates(event_id: str) -> list:
    redis = await get_redis()
    cache_key = f"event:{event_id}:cache"
    items = await redis.lrange(cache_key, 0, -1)
    return [json.loads(i) for i in items]
