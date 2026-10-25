
from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    name: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False
    )
    room_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # classroom, lab, lecture_hall
    capacity: Mapped[int] = mapped_column(
        Integer, nullable=False
    )
    building: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
