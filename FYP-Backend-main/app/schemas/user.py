
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    name: str
    email: EmailStr
    role: str = "student"
    class_level: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, description="At least 8 characters")

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    class_level: Optional[str] = None

class UserResponse(UserBase):
    user_id: int
    created_at: datetime
    is_active: int = 1

    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str


class AuthSessionResponse(Token):
    """JWT plus user profile (one round-trip for mobile login/register)."""

    user: UserResponse


class TokenData(BaseModel):
    user_id: Optional[int] = None
