from datetime import datetime, timezone
from sqlalchemy import CheckConstraint, String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
from app.core.ulid import generate_ulid


class User(Base):
    __tablename__ = "users"

    __table_args__ = (
        CheckConstraint("role IN ('admin', 'faculty', 'student')", name="chk_users_role_valid"),
    )

    id: Mapped[str] = mapped_column(
        String(26), primary_key=True, default=generate_ulid, autoincrement=False
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="student")
    name: Mapped[str] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
