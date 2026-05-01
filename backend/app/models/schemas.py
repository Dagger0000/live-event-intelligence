from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, field_validator
import json


# ── Auth ──────────────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str
    role: str = "viewer"  # analyst | viewer
    notify_commentary: bool = True
    notify_analysis: bool = True
    notify_alerts: bool = True

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in ("analyst", "viewer"):
            raise ValueError("Role must be analyst or viewer")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: str
    username: str


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    role: str
    notify_commentary: bool
    notify_analysis: bool
    notify_alerts: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Events ────────────────────────────────────────────────────────────────────
class EventOut(BaseModel):
    id: str
    name: str
    sport: str
    league: str
    status: str
    home_team: str
    away_team: str
    home_score: Optional[int]
    away_score: Optional[int]
    venue: Optional[str]
    city: Optional[str]
    country: Optional[str]
    date_event: Optional[str]
    time_event: Optional[str]
    is_subscribed: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EventStreamOut(BaseModel):
    id: int
    event_id: str
    home_score: Optional[int]
    away_score: Optional[int]
    status: str
    commentary: Optional[str]
    recorded_at: datetime

    class Config:
        from_attributes = True


# ── Pipeline ──────────────────────────────────────────────────────────────────
class PipelineStageOut(BaseModel):
    id: int
    event_id: str
    stage_number: int
    stage_name: str
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Analysis ──────────────────────────────────────────────────────────────────
class GeminiAnalysis(BaseModel):
    updated_summary: str
    key_moments: List[str]
    trend: str  # momentum | stable | reversal
    prediction: str
    confidence: float

    @field_validator("confidence")
    @classmethod
    def clamp_confidence(cls, v):
        return max(0.0, min(1.0, v))

    @field_validator("trend")
    @classmethod
    def validate_trend(cls, v):
        if v not in ("momentum", "stable", "reversal"):
            return "stable"
        return v


class AnalysisOut(BaseModel):
    id: int
    event_id: str
    updated_summary: str
    key_moments: List[str]
    trend: str
    prediction: str
    confidence: float
    created_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_moments(cls, obj):
        moments = obj.key_moments
        if isinstance(moments, str):
            try:
                moments = json.loads(moments)
            except Exception:
                moments = [moments]
        return cls(
            id=obj.id, event_id=obj.event_id,
            updated_summary=obj.updated_summary,
            key_moments=moments, trend=obj.trend,
            prediction=obj.prediction, confidence=obj.confidence,
            created_at=obj.created_at,
        )


# ── Alerts ────────────────────────────────────────────────────────────────────
class AlertRuleCreate(BaseModel):
    event_id: str
    rule_type: str  # keyword_detected | score_threshold | trend_change
    rule_config: dict

    @field_validator("rule_type")
    @classmethod
    def validate_rule_type(cls, v):
        if v not in ("keyword_detected", "score_threshold", "trend_change"):
            raise ValueError("Invalid rule type")
        return v


class AlertRuleOut(BaseModel):
    id: int
    user_id: int
    event_id: str
    rule_type: str
    rule_config: dict
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_parsed(cls, obj):
        config = obj.rule_config
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except Exception:
                config = {}
        return cls(
            id=obj.id, user_id=obj.user_id, event_id=obj.event_id,
            rule_type=obj.rule_type, rule_config=config,
            is_active=obj.is_active, created_at=obj.created_at,
        )


class AlertOut(BaseModel):
    id: int
    rule_id: int
    matched_value: str
    triggered_at: datetime

    class Config:
        from_attributes = True


# ── Subscriptions ─────────────────────────────────────────────────────────────
class SubscriptionOut(BaseModel):
    id: int
    user_id: int
    event_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Reports ───────────────────────────────────────────────────────────────────
class ReportOut(BaseModel):
    id: int
    event_id: str
    narrative: str
    key_moments: List[str]
    prediction_accuracy: float
    accuracy_notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_parsed(cls, obj):
        moments = obj.key_moments
        if isinstance(moments, str):
            try:
                moments = json.loads(moments)
            except Exception:
                moments = [moments]
        return cls(
            id=obj.id, event_id=obj.event_id, narrative=obj.narrative,
            key_moments=moments, prediction_accuracy=obj.prediction_accuracy,
            accuracy_notes=obj.accuracy_notes, created_at=obj.created_at,
        )


# ── Admin ─────────────────────────────────────────────────────────────────────
class AdminStats(BaseModel):
    active_ws_connections: int
    total_events: int
    live_events: int
    ai_calls_today: int


class AICallLogOut(BaseModel):
    id: int
    model: str
    event_id: Optional[str]
    latency_ms: Optional[int]
    success: bool
    error: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Predictions ───────────────────────────────────────────────────────────────
class PredictionOut(BaseModel):
    event_id: str
    event_name: str
    prediction: str
    confidence: float
    trend: str
    created_at: datetime
    actual_outcome: Optional[str] = None
