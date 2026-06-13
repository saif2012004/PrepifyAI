
from pydantic import BaseModel
from typing import Optional, Generic, TypeVar, List

T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int
    pages: int

class MessageResponse(BaseModel):
    message: str
    success: bool = True

class ErrorResponse(BaseModel):
    detail: str
    error_code: Optional[str] = None

class FileUploadResponse(BaseModel):
    filename: str
    file_path: str
    file_size: int
    upload_success: bool
    message: str
