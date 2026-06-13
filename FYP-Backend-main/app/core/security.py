
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Union
from jose import jwt, JWTError
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database import get_db
from app.models.user import User
from app.services.user_service import UserService

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)


def user_has_admin_role(user: User) -> bool:
    """True if the account is an administrator (case-insensitive role string)."""
    return (user.role or "").strip().lower() == "admin"


def create_access_token(
    subject: Union[str, Any], expires_delta: timedelta = None
) -> str:
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user_service = UserService(db)
    user = await user_service.get_user_by_id(int(user_id))
    if user is None:
        raise credentials_exception
    return user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Bearer optional: no header or invalid token yields None (public reads)."""
    if credentials is None or not (credentials.credentials or "").strip():
        return None
    try:
        payload = jwt.decode(
            credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None
    user_service = UserService(db)
    user = await user_service.get_user_by_id(int(user_id))
    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Only users with role ``admin`` may upload, update, or delete past papers and related data."""
    if not user_has_admin_role(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can modify past papers",
        )
    return current_user


async def require_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """Admin-only guard for dashboards, approvals, and ingestion outside past-paper CRUD."""
    if not user_has_admin_role(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return current_user
