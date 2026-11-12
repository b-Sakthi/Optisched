from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class FacultyAvailability(Base):
    __tablename__ = "faculty_availability"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    faculty_id: Mapped[int] = mapped_column(
        ForeignKey("faculty.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g. "Monday"
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)  # e.g. "09:00"
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)  # e.g. "11:00"
    is_available: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )  # False = unavailable / blocked period
    reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
