
from sqlalchemy import Boolean, CheckConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Room(Base):
    __tablename__ = "rooms"

    __table_args__ = (
        UniqueConstraint("building", "name", name="uq_room_building_name"),
        CheckConstraint("capacity > 0", name="chk_rooms_capacity_positive"),
        CheckConstraint("room_type IN ('classroom', 'lab', 'lecture_hall')", name="chk_rooms_type_valid"),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    name: Mapped[str] = mapped_column(
        String(50), nullable=False
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
