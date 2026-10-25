
from sqlalchemy import ForeignKey, Integer, UniqueConstraint, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class CourseOffering(Base):
    __tablename__ = "course_offerings"

    __table_args__ = (
        UniqueConstraint(
            "class_id",
            "subject_id",
            name="uq_class_subject",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    class_id: Mapped[int] = mapped_column(
        ForeignKey("classes.id", ondelete="CASCADE"),
        nullable=False,
    )

    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"),
        nullable=False,
    )

    faculty_id: Mapped[int] = mapped_column(
        ForeignKey("faculty.id", ondelete="RESTRICT"),
        nullable=False,
    )

    weekly_periods: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    requires_lab: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
