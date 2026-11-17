
from sqlalchemy import Boolean, CheckConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ClassSection(Base):
    __tablename__ = "classes"

    __table_args__ = (
        UniqueConstraint(
            "department",
            "academic_year",
            "semester",
            "name",
            name="uq_class_dept_year_sem_name",
        ),
        CheckConstraint("semester BETWEEN 1 AND 8", name="chk_classes_semester_range"),
        CheckConstraint("academic_year BETWEEN 1 AND 4", name="chk_classes_academic_year_range"),
        CheckConstraint("student_count IS NULL OR student_count > 0", name="chk_classes_student_count_positive"),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    name: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    department: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    academic_year: Mapped[int] = mapped_column(
        Integer, nullable=False
    )
    semester: Mapped[int] = mapped_column(
        Integer, nullable=False
    )
    student_count: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
