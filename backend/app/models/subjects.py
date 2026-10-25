
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )

    code: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=False
    )

    name: Mapped[str] = mapped_column(
        String(150), nullable=False
    )

    department: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
