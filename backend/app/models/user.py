from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, Boolean, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class UserRole(str, enum.Enum):
    analyst = "analyst"
    viewer = "viewer"


class EventStatus(str, enum.Enum):
    upcoming = "Upcoming"
    in_progress = "In Progress"
    final = "Final"


class StageStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    done = "done"


class TrendEnum(str, enum.Enum):
    momentum = "momentum"
    stable = "stable"
    reversal = "reversal"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="viewer")
    notify_commentary: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_analysis: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_alerts: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    subscriptions: Mapped[list["EventSubscription"]] = relationship(back_populates="user")
    alert_rules: Mapped[list["AlertRule"]] = relationship(back_populates="user")


class SportEvent(Base):
    __tablename__ = "sport_events"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    sport: Mapped[str] = mapped_column(String(100))
    league: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(50), default="Upcoming")
    home_team: Mapped[str] = mapped_column(String(255))
    away_team: Mapped[str] = mapped_column(String(255))
    home_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    away_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    venue: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    date_event: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    time_event: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    last_commentary_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_analysis_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    stream: Mapped[list["EventStream"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    analyses: Mapped[list["EventAnalysis"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    pipeline_stages: Mapped[list["PipelineStage"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    report: Mapped[Optional["EventReport"]] = relationship(back_populates="event", uselist=False)
    subscriptions: Mapped[list["EventSubscription"]] = relationship(back_populates="event")
    alert_rules: Mapped[list["AlertRule"]] = relationship(back_populates="event")


class EventStream(Base):
    __tablename__ = "event_stream"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(50), ForeignKey("sport_events.id"))
    home_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    away_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(50))
    commentary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    event: Mapped["SportEvent"] = relationship(back_populates="stream")


class EventAnalysis(Base):
    __tablename__ = "event_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(50), ForeignKey("sport_events.id"))
    updated_summary: Mapped[str] = mapped_column(Text)
    key_moments: Mapped[str] = mapped_column(Text)  # JSON array
    trend: Mapped[str] = mapped_column(String(20))
    prediction: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    event: Mapped["SportEvent"] = relationship(back_populates="analyses")


class PipelineStage(Base):
    __tablename__ = "pipeline_stages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(50), ForeignKey("sport_events.id"))
    stage_number: Mapped[int] = mapped_column(Integer)
    stage_name: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/active/done
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    event: Mapped["SportEvent"] = relationship(back_populates="pipeline_stages")


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    event_id: Mapped[str] = mapped_column(String(50), ForeignKey("sport_events.id"))
    rule_type: Mapped[str] = mapped_column(String(50))  # keyword_detected|score_threshold|trend_change
    rule_config: Mapped[str] = mapped_column(Text)  # JSON
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="alert_rules")
    event: Mapped["SportEvent"] = relationship(back_populates="alert_rules")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="rule")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rule_id: Mapped[int] = mapped_column(Integer, ForeignKey("alert_rules.id"))
    matched_value: Mapped[str] = mapped_column(Text)
    triggered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    rule: Mapped["AlertRule"] = relationship(back_populates="alerts")


class EventSubscription(Base):
    __tablename__ = "event_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    event_id: Mapped[str] = mapped_column(String(50), ForeignKey("sport_events.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="subscriptions")
    event: Mapped["SportEvent"] = relationship(back_populates="subscriptions")


class EventReport(Base):
    __tablename__ = "event_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(50), ForeignKey("sport_events.id"), unique=True)
    narrative: Mapped[str] = mapped_column(Text)
    key_moments: Mapped[str] = mapped_column(Text)  # JSON array top 5
    prediction_accuracy: Mapped[float] = mapped_column(Float)
    accuracy_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    event: Mapped["SportEvent"] = relationship(back_populates="report")


class AICallLog(Base):
    __tablename__ = "ai_call_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model: Mapped[str] = mapped_column(String(100))
    event_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    prompt_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
