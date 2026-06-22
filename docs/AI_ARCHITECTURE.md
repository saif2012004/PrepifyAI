# PrepifyAI — AI / ML Architecture

This document describes the AI/ML systems that power PrepifyAI. There are five
cooperating subsystems:

1. [RAG question generation](#1-rag-question-generation) — Groq LLM grounded in textbook content
2. [Topic prediction](#2-topic-prediction) — fine-tuned DistilBERT over past papers
3. [Past-paper OCR & extraction](#3-past-paper-ocr--extraction) — turning scanned PDFs into embedded questions
4. [Study chatbot](#4-study-chatbot) — context-aware academic assistant
5. [Adaptive practice engine](#5-adaptive-practice-engine) — next-best-question selection

All embeddings are **384-dimensional** (`all-MiniLM-L6-v2`) and stored in
PostgreSQL via **pgvector**; an in-process **FAISS** index is used for fast
retrieval during generation.

---

## 1. RAG question generation

Generates MCQs, short, and long questions that are **grounded in real syllabus
content** rather than hallucinated, with graceful degradation when grounding is thin.

**Flow**

```
student request (subject, topic, type, count, difficulty)
        │
        ▼
retrieve_context_and_sources(topic, k)         ← app/utils/retriever.py
   • SentenceTransformer encodes the query
   • FAISS top-k over textbook chunks
   • in-memory TTL cache (RETRIEVAL_CACHE_TTL_SEC)
   • fallbacks: file/topic lookup if FAISS init fails
        │
        ▼
sync_generate_question_batch(...)              ← app/services/question_generation_pipeline.py
   • estimates max answerable questions from context size
   • splits large requests into LLM batches (MCQ_LLM_BATCH_SIZE)
   • dedupes across batches; backfills to honor requested count
        │
        ▼
generate_questions(...)                         ← app/services/generator.py
   • builds the Groq prompt (difficulty plan: Easy/Medium/Hard split)
   • Groq JSON mode (Llama 3.1 8B default / 3.3 70B for quality)
   • English-only sanitization (strips Urdu/Arabic + mojibake)
   • parses + validates the structured response
        │
        ▼
persist_generated_questions(...)               ← repositories/question_repository.py
   • writes GeneratedQuestion rows + source provenance
   • returns API response with generation metadata
```

**Graceful degradation.** The pipeline never hard-fails on weak grounding; it
records a `context_fallback_level` so the UI can be honest about quality:

| Level | Meaning |
| --- | --- |
| `default` | Retrieved textbook context was sufficient. |
| `expanded_rag` | Context was thin, so retrieval `k` was widened. |
| `conceptual_backfill` | Requested count exceeded grounded content; supplemental conceptual rounds were used. |
| `topic_stub` | Almost no grounding; falls back to a topic/subject conceptual prompt. |
| `disabled` | Generation feature flag is off. |

**Key configuration** (`app/core/config.py`, set in `app/.env`)

| Setting | Purpose |
| --- | --- |
| `QUESTION_GENERATION_ENABLED` | Master switch for Groq/RAG generation. |
| `GROQ_API_KEY` | Groq credentials (required for live generation). |
| `GROQ_QUESTION_MODEL` | `llama-3.1-8b-instant` (fast) or `llama-3.3-70b-versatile` (quality). |
| `GROQ_CONTEXT_MAX_CHARS` | Cap on textbook context sent to the LLM. |
| `MCQ_LLM_BATCH_SIZE` | Questions per LLM call when splitting large requests. |
| `QUESTION_GENERATION_CACHE_ENABLED` | Cache identical requests (needs Redis). |

**Performance notes**
- The SentenceTransformer + FAISS index are **warmed up once at startup**
  (`app/main.py` lifespan) so the first request isn't slow.
- Retrieval results are cached with a TTL; a single init lock prevents duplicate
  model loads under concurrency.
- Async generation jobs (`question_generation_job_runner.py`) run long batches
  off the request path.

---

## 2. Topic prediction

Predicts which syllabus **topics are most likely to appear** on an upcoming exam by
analyzing the full corpus of past-paper questions.

- **Model:** fine-tuned **DistilBERT** sequence classifiers, one per class level
  (9 / 10 / 11 / 12), loaded from `pretrained/` (`app/services/prediction_service.py`).
- **Inference:** a question (or batch) is tokenized and classified; the service
  returns ranked topics with confidence scores above a threshold.
- **Recommendations:** `POST /api/predictions/recommendations` aggregates
  predictions across *all* past papers for a subject to surface high-yield topics.
- **Fallback:** if the DistilBERT weights aren't present, the service degrades to
  **semantic similarity** (SentenceTransformer) and finally **keyword overlap**, so
  the endpoint still returns useful topics in a lightweight deployment.
- **Accuracy tracking:** `prediction_accuracy_service.py` plus the
  `prediction_tracking` table let admins monitor how predictions hold up over time.

**Endpoints** (`app/routes/predictions.py`)
- `GET  /api/predictions/status` — readiness check
- `POST /api/predictions/topics` — single question → topics
- `POST /api/predictions/batch` — many questions → topics
- `POST /api/predictions/recommendations` — exam-level topic recommendations
- `GET  /api/predictions/model-info` — info on the loaded models

---

## 3. Past-paper OCR & extraction

Converts scanned past-paper PDFs into clean, embedded, structured questions
(`app/services/embeddingsGen.py`, `RobustPastPaperProcessor`).

**Pipeline**
1. **Text extraction** — try `PyPDF2`; if the text is too short (scanned PDF),
   fall back to **OCR** (`pdf2image` → `pytesseract`).
2. **Cleaning** — strip Urdu/Arabic script and mojibake, fix common OCR artifacts
   (`@/&`→`A`, `€`→`C`, `8`→`B` in headers), remove instructions/boilerplate.
3. **Section detection** — OCR-robust regex finds Section **A** (MCQs),
   **B** (short), **C** (long), tolerating noisy headers.
4. **Per-section parsing** — type-specific extractors pull question stems, options,
   sub-parts, and **marks** (handles `3x11`, `2+3`, `(5 marks)`, etc.).
5. **Embeddings** — each question is embedded with `all-MiniLM-L6-v2`; `OR`
   alternatives are split into separate embedded questions.
6. **Persistence** — questions + embeddings are stored for semantic search and
   prediction.

Used live by the admin upload route (`app/services/past_paper_upload.py`); progress
and diagnostics are emitted through the standard module logger.

---

## 4. Study chatbot

A context-aware academic assistant (`app/services/chatbot_service.py`).

- **Model:** Groq `llama-3.1-8b-instant`.
- **Grounding:** retrieves textbook context for the student's subject/topic and
  instructs the model to use only provided data.
- **Structured feedback:** when given performance metrics, it returns a fixed
  report — Performance Summary, Weak Topic Identification, Mistake Analysis, a
  **360° Feedback Loop**, Next Best Actions, and Motivation — with a mandatory
  remediation loop for failing scores.

Endpoint: `POST /api/v1/chatbot` (`app/routes/chatbot.py`).

---

## 5. Adaptive practice engine

Decides what each student should practice next (`app/routes/adaptive.py`).

- Reads the student's `StudentPerformance` history to find weak vs. strong topics.
- Selects the **next best question** by topic priority and difficulty progression
  (easy → medium → hard as mastery improves).
- Powers a **revision planner** that schedules focused practice on weak areas,
  blending generated questions with relevant past-paper questions.

Endpoints under `/api/v1/adaptive` (next question + smart-practice session planning).

---

## Data & storage summary

| Concern | Technology |
| --- | --- |
| Embeddings (questions, chunks) | `pgvector`, 384-d, cosine similarity |
| Fast retrieval during generation | in-process FAISS index |
| Embedding model | `sentence-transformers/all-MiniLM-L6-v2` |
| Generation & chat LLM | Groq — Llama 3.1 8B / 3.3 70B |
| Topic classifier | fine-tuned DistilBERT (per class level) |
| OCR | PyTesseract + pdf2image / PyPDF2 |

## Design principles

- **Grounded over generative** — retrieval first; the LLM elaborates on real content.
- **Always degrade gracefully** — every AI path has a lighter fallback so the app
  stays usable without the full heavy stack or external API keys.
- **Warm once, serve fast** — heavy models are loaded at startup and cached.
- **Observable** — fallback levels, generation metadata, and prediction accuracy are
  tracked so quality is measurable, not assumed.
