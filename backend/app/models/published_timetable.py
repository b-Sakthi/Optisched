from datetime import datetime, timezone
from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class PublishedTimetable(Base):
    __tablename__ = "published_timetables"

    __table_args__ = (
        Index("ix_published_timetables_class_active", "class_id", "is_active"),
        Index("ix_published_timetables_dept_sem_active", "department", "semester", "is_active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    scope: Mapped[str] = mapped_column(String(50), nullable=False)  # class, section, semester, etc.
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id", ondelete="SET NULL"), nullable=True, index=True)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    semester: Mapped[int | None] = mapped_column(Integer, nullable=True)
    working_hours: Mapped[str] = mapped_column(String(50), default="09:00-16:00", nullable=False)
    solver_status: Mapped[str] = mapped_column(String(30), nullable=False)  # optimal, feasible
    solve_time_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    sections_scheduled: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    weekly_sessions_scheduled: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    validation_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    published_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    entries: Mapped[list["PublishedTimetableEntry"]] = relationship(
        "PublishedTimetableEntry", back_populates="timetable", cascade="all, delete-orphan"
    )


class PublishedTimetableEntry(Base):
    __tablename__ = "published_timetable_entries"

    __table_args__ = (
        Index("ix_published_entries_faculty_day", "faculty_id", "day", "start_time"),
        Index("ix_published_entries_class_day", "class_id", "day", "start_time"),
        Index("ix_published_entries_room_day", "room_id", "day", "start_time"),
        CheckConstraint("start_time < end_time", name="chk_published_entries_time_interval"),
        CheckConstraint("occurrence > 0", name="chk_published_entries_occurrence_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    timetable_id: Mapped[int] = mapped_column(
        ForeignKey("published_timetables.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day: Mapped[str] = mapped_column(String(20), nullable=False)
    period: Mapped[str] = mapped_column(String(50), nullable=False)
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)
    class_id: Mapped[int] = mapped_column(
        ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    class_name: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_code: Mapped[str] = mapped_column(String(20), nullable=False)
    subject_name: Mapped[str] = mapped_column(String(150), nullable=False)
    faculty_id: Mapped[int] = mapped_column(
        ForeignKey("faculty.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    faculty_name: Mapped[str] = mapped_column(String(100), nullable=False)
    room_id: Mapped[int] = mapped_column(
        ForeignKey("rooms.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    room_name: Mapped[str] = mapped_column(String(50), nullable=False)
    room_type: Mapped[str] = mapped_column(String(30), nullable=False)
    occurrence: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    timetable: Mapped[PublishedTimetable] = relationship("PublishedTimetable", back_populates="entries")
