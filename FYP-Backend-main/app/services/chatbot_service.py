import os
from typing import Optional

from app.core.config import settings
from app.utils.retriever import retrieve_context


class ChatbotService:
    MODEL_NAME = os.environ.get("CHATBOT_GROQ_MODEL", "llama-3.1-8b-instant").strip()
    SYSTEM_PROMPT = (
        "You are an AI-powered academic performance assistant for Matric/FSc and entry test students.\n\n"
        "Core behavior:\n"
        "- Be clear, practical, and student-friendly.\n"
        "- Use only provided data/context; do not invent facts.\n"
        "- If data is incomplete, state assumptions briefly.\n\n"
        "When the user provides test-performance metrics (overall score, subject/topic accuracy, attempts, "
        "mistakes, difficulty), you MUST output a structured report with EXACT sections:\n"
        "1) Performance Summary\n"
        "2) Weak Topic Identification\n"
        "3) Mistake Analysis\n"
        "4) 360° Feedback Loop\n"
        "5) Next Best Actions\n"
        "6) Motivation + Guidance\n\n"
        "Section requirements:\n"
        "- Performance Summary: classify result (Excellent/Average/Needs Improvement), mention score and highlights.\n"
        "- Weak Topic Identification: weak <50%, moderate 50–75%, strong >75%.\n"
        "- Mistake Analysis: explain likely causes (conceptual misunderstanding, lack of practice, careless errors, time pressure).\n"
        "- 360° Feedback Loop:\n"
        "  * If score < 50 (FAIL): include mandatory loop steps:\n"
        "    Step 1 focused practice on weak topics\n"
        "    Step 2 targeted practice questions from weak topics\n"
        "    Step 3 revision of concepts\n"
        "    Step 4 re-attempt test with adaptive difficulty (easy -> medium)\n"
        "    Include this exact sentence: \"You need to reattempt after practice to improve your performance.\"\n"
        "  * If score >= 50 (PASS): provide improvement suggestions and optional practice.\n"
        "- Next Best Actions: provide 3–5 specific, measurable actions.\n"
        "- Motivation + Guidance: short supportive tone.\n\n"
        "Formatting:\n"
        "- Keep it structured, easy to read, and actionable.\n"
        "- Prefer concise bullets under each section."
    )

    @staticmethod
    def _get_groq_client():
        from groq import Groq

        key = (getattr(settings, "GROQ_API_KEY", None) or os.environ.get("GROQ_API_KEY") or "").strip()
        if not key:
            return None
        return Groq(api_key=key)

    @staticmethod
    def _build_query(message: str, subject: Optional[str], topic: Optional[str]) -> str:
        parts = []
        if subject:
            parts.append(f"Subject: {subject}")
        if topic:
            parts.append(f"Topic: {topic}")
        parts.append(f"Question: {message}")
        return " | ".join(parts)

    @staticmethod
    def ask(message: str, subject: Optional[str] = None, topic: Optional[str] = None, history=None) -> dict:
        query = ChatbotService._build_query(message, subject, topic)
        # Retrieve using full query (subject/topic/question) for better grounding quality.
        context = retrieve_context(query, k=5)
        context_preview = (context or "")[:700]
        has_meaningful_context = bool(context_preview.strip()) and "No indexed book chunks loaded" not in context_preview

        client = ChatbotService._get_groq_client()
        if client is None:
            fallback_reply = (
                "I can still help, but advanced chat is limited right now because the LLM key is not configured.\n\n"
                f"Your question: {message}\n"
                f"{'Context found:' if has_meaningful_context else 'Context is limited:'} {context_preview[:600]}\n\n"
                "Please ask a focused follow-up (topic + class) and I will give a clearer explanation."
            )
            return {
                "reply": fallback_reply,
                "used_model": "fallback_context",
                "context_used": context_preview,
            }

        messages = [
            {
                "role": "system",
                "content": ChatbotService.SYSTEM_PROMPT,
            }
        ]

        for turn in (history or [])[-6:]:
            role = (turn.get("role") or "").strip().lower()
            content = (turn.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

        messages.append(
            {
                "role": "user",
                "content": (
                    f"Student question: {message}\n"
                    f"Subject hint: {subject or 'Not provided'}\n"
                    f"Topic hint: {topic or 'Not provided'}\n\n"
                    f"Retrieved context (may be partial):\n{context_preview}\n\n"
                    "Give a concise, high-quality answer for a student. "
                    "Use short paragraphs or bullet points when helpful."
                ),
            }
        )

        resp = client.chat.completions.create(
            model=ChatbotService.MODEL_NAME,
            messages=messages,
            temperature=0.2,
            max_tokens=450,
        )
        reply = (resp.choices[0].message.content or "").strip()

        return {
            "reply": reply or "I could not generate a response.",
            "used_model": "groq_llm",
            "context_used": context_preview,
        }
