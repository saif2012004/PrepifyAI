from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

# Base for internal use (includes embedding)
class TextbookChunkBase(BaseModel):
    chapter_name: str
    topic_name: str
    text_content: str
    token_count: Optional[int] = None
    embedding: Optional[List[float]] = None

class TextbookChunkCreate(TextbookChunkBase):
    subject_id: int

class TextbookChunkUpdate(BaseModel):
    chapter_name: Optional[str] = None
    topic_name: Optional[str] = None
    text_content: Optional[str] = None
    token_count: Optional[int] = None
    embedding: Optional[List[float]] = None

# Response schema for API (embedding optional)
class TextbookChunkResponse(TextbookChunkBase):
    chunk_id: str
    subject_id: int
    added_on: datetime
    embedding: Optional[List[float]] = None

    model_config = ConfigDict(from_attributes=True)
