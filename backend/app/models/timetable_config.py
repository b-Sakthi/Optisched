from datetime import datetime
from sqlalchemy import Boolean, DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class TimetableConfig(Base):
    __tablename__ = "timetable_configs"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    semester: Mapped[int] = mapped_column(
        Integer, unique=True, nullable=False, index=True
    )
    days: Mapped[list] = mapped_column(
        JSON, nullable=False
    )
    working_hours_start: Mapped[str | None] = mapped_column(
        String(10), nullable=True, default="09:00"
    )
    working_hours_end: Mapped[str | None] = mapped_column(
        String(10), nullable=True, default="16:00"
    )
    period_duration: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=50
    )
    transition_duration: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=5
    )
    breaks: Mapped[list | None] = mapped_column(
        JSON, nullable=True, default=list
    )
    lunch_break: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
