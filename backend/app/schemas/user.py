from datetime import datetime
from typing import Literal
from pydantic import BaseModel, EmailStr, Field, field_validator
from app.core.security import MIN_PASSWORD_LENGTH, validate_password_policy


class UserBase(BaseModel):
    email: EmailStr
    role: Literal["admin", "faculty", "student"] = "student"
    name: str | None = None
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(
        min_length=MIN_PASSWORD_LENGTH,
        description=f"User password (minimum {MIN_PASSWORD_LENGTH} characters)",
    )

    @field_validator("password")
    @classmethod
    def validate_password_min_length(cls, v: str) -> str:
        validate_password_policy(v)
        return v


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    role: Literal["admin", "faculty", "student"] | None = None
    name: str | None = None
    is_active: bool | None = None
    password: str | None = Field(
        default=None,
        min_length=MIN_PASSWORD_LENGTH,
        description=f"User password (minimum {MIN_PASSWORD_LENGTH} characters)",
    )

    @field_validator("password")
    @classmethod
    def validate_password_min_length(cls, v: str | None) -> str | None:
        if v is not None:
            validate_password_policy(v)
        return v


class UserResponse(UserBase):
    id: str = Field(description="26-character Crockford Base32 ULID")
    id_str: str = Field(description="String representation of ULID")
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
