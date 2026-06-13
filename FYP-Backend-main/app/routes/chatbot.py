from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.models.user import User
from app.schemas.chatbot import ChatbotRequest, ChatbotResponse
from app.services.chatbot_service import ChatbotService

router = APIRouter()


@router.get("/health")
async def chatbot_health():
    """Public health check for chatbot service."""
    return {"status": "ok", "service": "chatbot"}


@router.post("/ask", response_model=ChatbotResponse)
async def ask_chatbot(
    req: ChatbotRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Separate chatbot endpoint for students/users.
    Requires authentication.
    """
    try:
        payload = ChatbotService.ask(
            message=req.message,
            subject=req.subject,
            topic=req.topic,
            history=[t.model_dump() for t in req.history],
        )
        return ChatbotResponse(**payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chatbot failed: {str(e)}")
