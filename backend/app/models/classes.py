
from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ClassSection(Base):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    name: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False
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
