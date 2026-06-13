import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.user_service import UserService
from app.schemas.user import UserCreate, UserUpdate
from app.models.user import User


@pytest.fixture
def mock_db():
    """Fixture to mock AsyncSession"""
    db = AsyncMock(spec=AsyncSession)
    return db


@pytest.fixture
def user_service(mock_db):
    """Fixture to create UserService with mocked db"""
    return UserService(mock_db)


@pytest.mark.asyncio
async def test_admin_register_success(user_service, mock_db):
    """Test admin registration"""

    admin_data = UserCreate(
        name="Admin User",
        email="admin@example.com",
        password="admin123",
        role="admin",
        class_level=None
    )

    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    # When user_service.create_user calls hashing function
    with patch("app.services.user_service.get_password_hash") as mock_hash:
        mock_hash.return_value = "hashed_pw"

        result = await user_service.create_user(admin_data)

        assert result.name == "Admin User"
        assert result.email == "admin@example.com"
        assert result.role == "admin"
        assert result.password_hash == "hashed_pw"

        mock_hash.assert_called_once_with("admin123")
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()

@pytest.mark.asyncio
@patch('app.services.user_service.verify_password')
async def test_admin_login_success(mock_verify_password, user_service, mock_db):
    """Test admin login with correct credentials"""
    email = "admin@example.com"
    password = "adminpassword123"
    hashed_password = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4fYwKjDX."  # Example hashed password for admin

    mock_admin_user = User(
        user_id=1,
        name="Admin User",
        email=email,
        password_hash=hashed_password,
        role="admin",
        class_level=None,
        is_active=1
    )

    # Mock get_user_by_email for admin
    user_service.get_user_by_email = AsyncMock(return_value=mock_admin_user)

    # Mock password verification to return True (successful authentication)
    mock_verify_password.return_value = True

    result = await user_service.authenticate_user(email, password)

    assert result == mock_admin_user  # The result should be the mock_admin_user
    user_service.get_user_by_email.assert_called_once_with(email)  # Ensure that the method was called with the correct email
    mock_verify_password.assert_called_once_with(password, hashed_password)  # Verify that the password was checked


@pytest.mark.asyncio
@patch('app.services.user_service.verify_password')
async def test_admin_login_invalid_password(mock_verify_password, user_service, mock_db):
    """Test admin login with incorrect password"""
    email = "admin@example.com"
    password = "wrongpassword"
    hashed_password = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4fYwKjDX."  # Example hashed password for admin

    mock_admin_user = User(
        user_id=1,
        name="Admin User",
        email=email,
        password_hash=hashed_password,
        role="admin",
        class_level=None,
        is_active=1
    )

    # Mock get_user_by_email for admin
    user_service.get_user_by_email = AsyncMock(return_value=mock_admin_user)

    # Mock password verification to return False (invalid password)
    mock_verify_password.return_value = False

    result = await user_service.authenticate_user(email, password)

    assert result is None  # The result should be None since the password is invalid
    user_service.get_user_by_email.assert_called_once_with(email)  # Ensure that the method was called with the correct email
    mock_verify_password.assert_called_once_with(password, hashed_password)



@pytest.mark.asyncio
async def test_create_user(user_service, mock_db):
    """Test creating a new user"""
    user_data = UserCreate(
        name="Test User",
        email="test@example.com",
        password="password123",
        role="student",
        class_level="10"
    )

    # Mock the db operations
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    # Mock the returned user after refresh
    mock_user = User(
        user_id=1,
        name=user_data.name,
        email=user_data.email,
        password_hash="hashed_password",
        role=user_data.role,
        class_level=user_data.class_level
    )
    mock_db.refresh.side_effect = lambda obj: setattr(obj, 'user_id', 1)

    result = await user_service.create_user(user_data)

    assert result.name == user_data.name
    assert result.email == user_data.email
    assert result.role == user_data.role
    assert result.class_level == user_data.class_level
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once()


@pytest.mark.asyncio
async def test_get_user_by_id(user_service, mock_db):
    """Test getting user by ID"""
    user_id = 1
    mock_user = User(
        user_id=user_id,
        name="Test User",
        email="test@example.com",
        password_hash="hashed_password",
        role="student",
        class_level="10"
    )

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_user
    mock_db.execute.return_value = mock_result

    result = await user_service.get_user_by_id(user_id)

    assert result == mock_user
    mock_db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_get_user_by_id_not_found(user_service, mock_db):
    """Test getting user by ID when not found"""
    user_id = 999

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    result = await user_service.get_user_by_id(user_id)

    assert result is None


@pytest.mark.asyncio
@patch('app.services.user_service.verify_password')
async def test_authenticate_user_success(mock_verify_password, user_service, mock_db):
    """Test successful user authentication"""
    email = "test@example.com"
    password = "password123"
    hashed_password = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4fYwKjDX."  # Valid bcrypt hash

    mock_user = User(
        user_id=1,
        name="Test User",
        email=email,
        password_hash=hashed_password,
        role="student",
        class_level="10"
    )

    # Mock get_user_by_email
    user_service.get_user_by_email = AsyncMock(return_value=mock_user)

    # Mock password verification
    mock_verify_password.return_value = True

    result = await user_service.authenticate_user(email, password)

    assert result == mock_user
    user_service.get_user_by_email.assert_called_once_with(email)
    mock_verify_password.assert_called_once_with(password, hashed_password)


@pytest.mark.asyncio
@patch('app.services.user_service.verify_password')
async def test_authenticate_user_invalid_password(mock_verify_password, user_service, mock_db):
    """Test authentication with invalid password"""
    email = "test@example.com"
    password = "wrong_password"
    hashed_password = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4fYwKjDX."  # Valid bcrypt hash

    mock_user = User(
        user_id=1,
        name="Test User",
        email=email,
        password_hash=hashed_password,
        role="student",
        class_level="10"
    )

    # Mock get_user_by_email
    user_service.get_user_by_email = AsyncMock(return_value=mock_user)

    # Mock password verification
    mock_verify_password.return_value = False

    result = await user_service.authenticate_user(email, password)

    assert result is None
    mock_verify_password.assert_called_once_with(password, hashed_password)


@pytest.mark.asyncio
async def test_update_user(user_service, mock_db):
    """Test updating user information"""
    user_id = 1
    update_data = UserUpdate(name="Updated Name", email="updated@example.com")

    mock_user = User(
        user_id=user_id,
        name="Old Name",
        email="old@example.com",
        password_hash="hashed_password",
        role="student",
        class_level="10"
    )

    # Mock get_user_by_id
    user_service.get_user_by_id = AsyncMock(return_value=mock_user)

    # Mock db operations
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    result = await user_service.update_user(user_id, update_data)

    assert result.name == "Updated Name"
    assert result.email == "updated@example.com"
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once()


@pytest.mark.asyncio
async def test_update_user_not_found(user_service, mock_db):
    """Test updating user that doesn't exist"""
    user_id = 999
    update_data = UserUpdate(name="Updated Name")

    # Mock get_user_by_id
    user_service.get_user_by_id = AsyncMock(return_value=None)

    result = await user_service.update_user(user_id, update_data)

    assert result is None


@pytest.mark.asyncio
async def test_get_users(user_service, mock_db):
    """Test getting list of users"""
    mock_users = [
        User(user_id=1, name="User 1", email="user1@example.com", password_hash="hash1", role="student", class_level="10"),
        User(user_id=2, name="User 2", email="user2@example.com", password_hash="hash2", role="student", class_level="10")
    ]

    # Mock the execute result
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = mock_users
    mock_db.execute.return_value = mock_result

    result = await user_service.get_users()

    assert len(result) == 2
    assert result == mock_users


@pytest.mark.asyncio
async def test_deactivate_user(user_service, mock_db):
    """Test deactivating a user"""
    user_id = 1

    mock_user = User(
        user_id=user_id,
        name="Test User",
        email="test@example.com",
        password_hash="hashed_password",
        role="student",
        class_level="10",
        is_active=1
    )

    # Mock get_user_by_id
    user_service.get_user_by_id = AsyncMock(return_value=mock_user)

    # Mock db operations
    mock_db.commit = AsyncMock()

    result = await user_service.deactivate_user(user_id)

    assert result is True
    assert mock_user.is_active == 0
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_deactivate_user_not_found(user_service, mock_db):
    """Test deactivating a user that doesn't exist"""
    user_id = 999

    # Mock get_user_by_id
    user_service.get_user_by_id = AsyncMock(return_value=None)

    result = await user_service.deactivate_user(user_id)

    assert result is False
