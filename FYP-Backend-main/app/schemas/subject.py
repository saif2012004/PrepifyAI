
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional

class SubjectBase(BaseModel):
    class_level: str
    board: str
    subject_name: str
    book_version: str

class SubjectCreate(SubjectBase):
    pass

class SubjectUpdate(BaseModel):
    class_level: Optional[str] = Field(None, max_length=10)
    board: Optional[str] = Field(None, max_length=50)
    subject_name: Optional[str] = Field(None, max_length=100)
    book_version: Optional[str] = Field(None, max_length=20)

class SubjectResponse(SubjectBase):
    subject_id: int

    model_config = ConfigDict(from_attributes=True)
