from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import timedelta

from app.database import get_db
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token, AuthSessionResponse
from app.services.user_service import UserService
from app.core.security import create_access_token
from app.core.config import settings
from app.core.security import get_current_user
from app.models.user import User



router = APIRouter()

@router.post("/register", response_model=AuthSessionResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new user (student or admin).
    
    - **name**: Full name of the user
    - **email**: Valid email address (must be unique)
    - **password**: Password (min 8 characters)
    - **role**: 'student' or 'admin'
    - **class_level**: '9', '10', '11', or '12' (for students)

    Returns JWT and user profile so the client does not need a second login request.
    """
    user_service = UserService(db)
    
    existing_user = await user_service.get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    user = await user_service.create_user(user_data)
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.user_id, expires_delta=access_token_expires
    )
    return AuthSessionResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )

@router.post("/login", response_model=AuthSessionResponse)
async def login(
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """
    Login with email and password.
    
    Returns JWT and user profile (avoids a separate GET /users/me on mobile).
    """
    user_service = UserService(db)
    user = await user_service.authenticate_user(login_data.email, login_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.user_id, expires_delta=access_token_expires
    )
    
    return AuthSessionResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )

@router.post("/logout")
async def logout():
    """Logout current user (client-side token removal)."""
    return {"message": "Successfully logged out"}

@router.post("/refresh-token", response_model=Token)
async def refresh_token(
    current_user: User = Depends(get_current_user)
):
    """
    Refresh access token for authenticated user.
    """
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=current_user.user_id, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}
