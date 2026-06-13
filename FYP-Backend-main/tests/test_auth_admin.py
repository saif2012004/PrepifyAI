import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from app.core.security import (
    get_current_user,
    create_access_token,
    require_admin,
    user_has_admin_role,
)
from app.models.user import User


@pytest.fixture
def mock_db():
    """Fixture to mock AsyncSession"""
    return AsyncMock()


@pytest.fixture
def mock_admin_user():
    """Fixture for mock admin user"""
    return User(
        user_id=1,
        name="Admin User",
        email="admin@example.com",
        password_hash="hashed_password",
        role="admin",
        class_level=None,
        is_active=1
    )


@pytest.fixture
def mock_student_user():
    """Fixture for mock student user"""
    return User(
        user_id=2,
        name="Student User",
        email="student@example.com",
        password_hash="hashed_password",
        role="student",
        class_level="10",
        is_active=1
    )


def test_user_has_admin_role_case_insensitive(mock_admin_user):
    assert user_has_admin_role(mock_admin_user) is True
    mock_admin_user.role = "Admin"
    assert user_has_admin_role(mock_admin_user) is True
    mock_admin_user.role = " student "
    assert user_has_admin_role(mock_admin_user) is False


def test_create_access_token():
    """Test JWT token creation"""
    user_id = 123
    token = create_access_token(subject=user_id)
    
    assert token is not None
    assert isinstance(token, str)
    assert len(token) > 0


@pytest.mark.asyncio
async def test_get_current_user_valid_token(mock_db, mock_admin_user):
    """Test getting current user with valid token"""
    token = create_access_token(subject=mock_admin_user.user_id)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    
    # Mock UserService
    with patch('app.core.security.UserService') as mock_user_service:
        mock_service_instance = MagicMock()
        mock_service_instance.get_user_by_id = AsyncMock(return_value=mock_admin_user)
        mock_user_service.return_value = mock_service_instance
        
        user = await get_current_user(credentials, mock_db)
        
        assert user == mock_admin_user
        assert user.user_id == mock_admin_user.user_id
        assert user.role == "admin"


@pytest.mark.asyncio
async def test_get_current_user_invalid_token(mock_db):
    """Test getting current user with invalid token"""
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid_token")
    
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(credentials, mock_db)
    
    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Could not validate credentials" in exc_info.value.detail


@pytest.mark.asyncio
async def test_get_current_user_user_not_found(mock_db):
    """Test getting current user when user doesn't exist in database"""
    token = create_access_token(subject=999)  # Non-existent user
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    
    # Mock UserService to return None
    with patch('app.core.security.UserService') as mock_user_service:
        mock_service_instance = MagicMock()
        mock_service_instance.get_user_by_id = AsyncMock(return_value=None)
        mock_user_service.return_value = mock_service_instance
        
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials, mock_db)
        
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_require_admin_success(mock_admin_user):
    """Test admin user dependency with admin user"""
    result = await require_admin(mock_admin_user)

    assert result == mock_admin_user
    assert result.role == "admin"


@pytest.mark.asyncio
async def test_require_admin_forbidden_student(mock_student_user):
    """Test admin user dependency rejects student user"""
    with pytest.raises(HTTPException) as exc_info:
        await require_admin(mock_student_user)

    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert "Only administrators" in exc_info.value.detail


@pytest.mark.asyncio
async def test_require_admin_forbidden_non_admin():
    """Test admin user dependency rejects non-admin user"""
    non_admin_user = User(
        user_id=3,
        name="Teacher User",
        email="teacher@example.com",
        password_hash="hashed_password",
        role="teacher",  # Not admin
        class_level=None,
        is_active=1
    )

    with pytest.raises(HTTPException) as exc_info:
        await require_admin(non_admin_user)

    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_upload_endpoint_requires_admin(mock_db, mock_student_user):
    """Test that upload endpoint rejects non-admin users"""
    # This tests the full authentication flow
    token = create_access_token(subject=mock_student_user.user_id)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    
    # Mock UserService to return student
    with patch('app.core.security.UserService') as mock_user_service:
        mock_service_instance = MagicMock()
        mock_service_instance.get_user_by_id = AsyncMock(return_value=mock_student_user)
        mock_user_service.return_value = mock_service_instance
        
        # Get current user (should succeed)
        current_user = await get_current_user(credentials, mock_db)
        assert current_user.role == "student"
        
        # Try to use admin endpoint (should fail)
        with pytest.raises(HTTPException) as exc_info:
            await require_admin(current_user)

        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_upload_endpoint_allows_admin(mock_db, mock_admin_user):
    """Test that upload endpoint allows admin users"""
    token = create_access_token(subject=mock_admin_user.user_id)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    
    # Mock UserService to return admin
    with patch('app.core.security.UserService') as mock_user_service:
        mock_service_instance = MagicMock()
        mock_service_instance.get_user_by_id = AsyncMock(return_value=mock_admin_user)
        mock_user_service.return_value = mock_service_instance
        
        # Get current user (should succeed)
        current_user = await get_current_user(credentials, mock_db)
        assert current_user.role == "admin"
        
        # Try to use admin endpoint (should succeed)
        admin_user = await require_admin(current_user)
        assert admin_user == mock_admin_user
