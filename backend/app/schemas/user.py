from datetime import datetime
from typing import Literal
from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr
    role: Literal["admin", "faculty", "student"] = "student"
    name: str | None = None
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=6)


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    role: Literal["admin", "faculty", "student"] | None = None
    name: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6)


class UserResponse(UserBase):
    id: str = Field(description="26-character Crockford Base32 ULID")
    id_str: str = Field(description="String representation of ULID")
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
