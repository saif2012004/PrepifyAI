from typing import List, Optional
from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    role: str = Field(..., description="Role in chat history: user or assistant")
    content: str = Field(..., description="Message text")


class ChatbotRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Student message/question")
    subject: Optional[str] = Field(default=None, description="Optional subject hint, e.g. Biology")
    topic: Optional[str] = Field(default=None, description="Optional topic hint, e.g. Photosynthesis")
    history: List[ChatTurn] = Field(default_factory=list, description="Optional prior turns")


class ChatbotResponse(BaseModel):
    reply: str
    used_model: str = Field(..., description="groq_llm or fallback_context")
    context_used: Optional[str] = Field(default=None, description="Small context preview for transparency")
