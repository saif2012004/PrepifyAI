# PrepifyAI — AI-Powered Exam Preparation Platform

> Final Year Project — an AI study assistant for Pakistani students preparing for
> **FBISE Matric/FSc** board exams and entry tests (**MDCAT, ECAT**).

PrepifyAI turns a library of textbooks and past papers into a personalized prep
experience: it **generates practice questions** grounded in real syllabus content,
**predicts likely exam topics** from years of past papers, **answers student
questions** with a context-aware chatbot, and **adapts** what each student practices
next based on their performance.

---

## ✨ Key Features

| Area | What it does |
| --- | --- |
| 🧠 **AI question generation** | Retrieval-augmented generation (RAG) over textbook content produces grounded MCQs, short, and long questions with answer keys. |
| 🔮 **Topic prediction** | A fine-tuned **DistilBERT** model predicts likely exam topics by analyzing the full corpus of past papers. |
| 💬 **Study chatbot** | A context-aware assistant that answers concept questions and produces structured performance feedback. |
| 📊 **Adaptive practice** | Recommends the next best questions and a revision plan from each student's strengths and weak topics. |
| 📄 **Past paper pipeline** | OCR + parsing extracts questions from scanned past-paper PDFs and embeds them for semantic search. |
| 🏆 **Performance & gamification** | Analytics dashboards, progress tracking, streaks, and points. |
| 🛠️ **Admin tools** | Upload textbooks/past papers, manage the catalog, monitor prediction accuracy and system health. |

> **Deep dive:** the AI/ML system is documented separately in
> **[`docs/AI_ARCHITECTURE.md`](docs/AI_ARCHITECTURE.md)**.

---

## 🏗️ Architecture

```
┌──────────────────────────┐        REST/JSON         ┌───────────────────────────┐
│   Mobile + Web Frontend  │  ───────────────────▶    │      FastAPI Backend      │
│  React Native (Expo)     │   JWT auth, async API    │  layered: routes →        │
│  expo-router, TypeScript │  ◀───────────────────    │  services → repositories  │
└──────────────────────────┘                          └─────────────┬─────────────┘
                                                                     │
                          ┌──────────────────────────────────────────┼───────────────────────────┐
                          ▼                          ▼                ▼                             ▼
                  ┌───────────────┐        ┌──────────────────┐  ┌─────────────┐         ┌──────────────────┐
                  │ PostgreSQL +  │        │ FAISS + Sentence │  │ DistilBERT  │         │  Groq LLM        │
                  │ pgvector      │        │ Transformers     │  │ (topic pred)│         │ (Llama 3.1/3.3)  │
                  │ (app data +   │        │ (RAG retrieval)  │  │             │         │ question gen +   │
                  │ embeddings)   │        │                  │  │             │         │ chatbot          │
                  └───────────────┘        └──────────────────┘  └─────────────┘         └──────────────────┘
```

**Backend** is layered for testability: `routes/` (HTTP) → `services/` (business + AI
logic) → `repositories/` (data access) → `models/` (SQLAlchemy), with `schemas/`
(Pydantic) for validation and `core/` for config, security, and caching.

---

## 🧰 Tech Stack

**Frontend**
- React Native + **Expo** (SDK 54), **expo-router** (file-based routing)
- TypeScript, NativeWind / Tailwind, Recharts
- Runs on **Android, iOS, and Web**

**Backend**
- **FastAPI** (async) + Uvicorn
- **PostgreSQL** with **pgvector** for 384-d embeddings
- SQLAlchemy 2.0 (async) + Alembic migrations
- JWT auth (python-jose) + bcrypt, role-based access control

**AI / ML**
- **Groq** (Llama 3.1 8B / 3.3 70B) for generation and chat
- **sentence-transformers** (`all-MiniLM-L6-v2`) + **FAISS** for RAG retrieval
- **Hugging Face Transformers** — fine-tuned **DistilBERT** for topic prediction
- **PyTesseract** + **pdf2image / PyPDF2** for OCR of past-paper PDFs

**Tooling**
- Docker Compose (pgvector Postgres), GitHub Actions CI, `pytest` suite

---

## 📁 Repository Layout

```
PrepifyAI/
├── FYP-Backend-main/        # FastAPI backend + AI/ML services
│   ├── app/
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # business logic + AI (RAG, prediction, chatbot, OCR)
│   │   ├── repositories/    # data access
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── core/            # config, security, caching
│   │   └── alembic/         # database migrations
│   ├── scripts/             # ops + manual check scripts
│   └── tests/               # pytest suite (CI-run)
├── FYP_FRONTEND-main/       # React Native / Expo app
│   ├── app/                 # expo-router screens
│   └── src/                 # screens, services, components, context
├── docs/AI_ARCHITECTURE.md  # AI/ML deep dive
└── docker-compose.yml       # database + cache for local dev
```

---

## 🚀 Quick Start

> Full backend setup, Windows notes, and Android-emulator troubleshooting live in
> **[`FYP-Backend-main/README.md`](FYP-Backend-main/README.md)**.

### 1. Database
```bash
docker compose up -d
docker exec prepifyai_postgres psql -U postgres -d PrepifyAI_Main \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2. Backend
```bash
cd FYP-Backend-main
python -m venv venv && source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r app/requirements.txt
cp app/.env.example app/.env                          # add DATABASE_URL, SECRET_KEY, GROQ_API_KEY, ...
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```
API docs: <http://localhost:8001/docs>

### 3. Frontend
```bash
cd FYP_FRONTEND-main
npm install
npm run dev            # Expo; press a (Android), i (iOS), or w (web)
```
Point the app at the API via `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_API_PORT`
(and `EXPO_PUBLIC_ANDROID_EMULATOR_HOST` for emulators).

---

## ✅ Testing

```bash
cd FYP-Backend-main
python -m pytest tests/ -v          # automated suite (also runs in CI)
```
The suite covers auth & RBAC, past-paper upload/extraction, question management,
performance tracking, and prediction-service loading.

---

## 📌 Notes

- Secrets live only in `app/.env` (never committed); see `app/.env.example`.
- The DistilBERT weights (`pretrained/`) and large datasets are git-ignored —
  question generation gracefully falls back when the heavy stack is absent.
