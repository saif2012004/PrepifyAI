
# PrepifyAI Backend

AI-Powered Preparation Assistant for FBISE Matric FSc and Entry Tests (MDCAT, ECAT)

## Features

- **User Management**: Registration, authentication, and profile management
- **Past Paper Upload**: Admin-only PDF upload with automatic question extraction and embedding generation
- **Question Generation**: AI-powered question generation from textbook content
- **Performance Tracking**: Comprehensive analytics and progress monitoring
- **Feedback System**: Quality control and continuous improvement
- **Prediction Engine**: Topic prediction based on past paper analysis
- **Admin Dashboard**: Content management and system monitoring

## Tech Stack

- **FastAPI**: Modern Python web framework
- **PostgreSQL**: Primary database with pgvector extension
- **SQLAlchemy**: ORM with async support
- **Pinecone**: Vector database for semantic search
- **Tesseract**: OCR for document processing
- **sentence-transformers**: Embedding generation (all-MiniLM-L6-v2)
- **PyPDF2 & pdf2image**: PDF processing and text extraction
- **PyJWT**: JWT token authentication

## Setup

### Prerequisites

- Python 3.11+
- Docker & Docker Compose (for pgvector PostgreSQL)
- Redis (optional, for caching)

### Installation

1. Clone the repository
2. Create virtual environment: `python -m venv venv`
3. Activate: `source venv/bin/activate` (Linux/Mac) or `venv\Scripts\activate` (Windows)
4. Install dependencies: `pip install -r app/requirements.txt` (from repo root)
5. Set up environment: `cp .env.example .env` and edit with your settings
6. Start Docker database:
   ```bash
   docker-compose up -d
   docker exec prepifyai_postgres psql -U postgres -d PrepifyAI_Main -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```
7. Initialize database schema:
   ```bash
   cd app
   python ../app/init_db_docker.py
   ```
8. Run the API from repo root (parent of the `app` package), binding all interfaces so **Expo / Android emulator (`10.0.2.2`)** and LAN devices can connect:

   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
   ```

   Plain `uvicorn app.main:app --reload` defaults to **127.0.0.1:8000**, which does not match the mobile app’s default dev port (**8001**) and often causes **login timeouts** from the emulator. If you use another port, set the same value in the frontend `EXPO_PUBLIC_API_PORT` and `EXPO_PUBLIC_API_BASE_URL`.

### Docker Database

The project uses containerized PostgreSQL with pgvector extension:
- **Container**: `pgvector/pgvector:pg16`
- **Port**: 5433 (mapped from 5432)
- **Database**: PrepifyAI_Main
- **Extension**: pgvector enabled for 384-dimensional embeddings

### Android emulator: login times out to `http://10.0.2.2:8001/...` (or your `EXPO_PUBLIC_ANDROID_EMULATOR_HOST`)

The emulator reaches your PC via **`10.0.2.2`** by default (configurable in the frontend `.env` as **`EXPO_PUBLIC_ANDROID_EMULATOR_HOST`**). If the API works in a **PC browser** (`http://127.0.0.1:8001/docs`) but **Expo login times out** on the emulator, **Windows Firewall** is often blocking inbound TCP on the API port.

**Allow the port (recommended on Windows):** in an **elevated** PowerShell (right‑click PowerShell → **Run as administrator**). If you ran the script without elevation, it does nothing — check the script output.

```powershell
cd FYP-Backend-main
powershell -ExecutionPolicy Bypass -File .\scripts\allow-api-firewall.ps1
```

The script allows TCP **8001** on **Private, Domain, and Public** profiles (Wi‑Fi is often **Public**, which blocks rules that only allow Private).

Or manually: Windows Security → Firewall → Advanced settings → Inbound Rules → New Rule → Port → TCP **8001** → Allow → apply to **all** profiles you use.

**Verify LAN binding:** on a PC browser, open `http://<your-PC-LAN-IPv4>:8001/docs` (for example `http://192.168.18.157:8001/docs`). If that does not load while `http://127.0.0.1:8001/docs` works, fix Windows Firewall (above) or confirm you started Uvicorn with **`--host 0.0.0.0`** (not `127.0.0.1` only).

Keep **Docker Postgres** running (`docker compose up -d`). Run the API with **`--host 0.0.0.0`** and the same port as **`EXPO_PUBLIC_API_PORT`** in the frontend `.env`. Physical devices use **`EXPO_PUBLIC_DEV_LAN_HOST`** (PC IPv4 on the same Wi‑Fi).
## Unit Testing

### Running Tests
```bash
# Run all tests
python -m pytest tests/ -v

# Run specific test file
python -m pytest tests/test_past_paper_upload.py -v
python -m pytest tests/test_auth_admin.py -v

# Run specific test case
python -m pytest tests/test_auth_admin.py::test_get_admin_user_success -v

# Run with coverage
python -m pytest tests/ --cov=app --cov-report=html
```

### Test Files
- `test_auth_admin.py` - Authentication and admin authorization (9 tests)
- `test_past_paper_upload.py` - PDF upload, validation, embedding checks (11 tests)
- `test_past_paper_question.py` - Question management (7 tests)
- `test_past_paper_service.py` - Past paper service operations (11 tests)
- `test_user_service.py` - User authentication and management (13 tests)
- `test_performance_service.py` - Performance tracking (8 tests)

### Test Coverage
- **Total**: 61 tests, all passing 
- **Admin Auth**: JWT validation, role-based access control
- **Upload System**: Subject validation, embedding generation, file handling
- **Question Management**: CRUD operations for questions
- **Performance**: Analytics and tracking
- **Prediction Service**: DistilBERT topic prediction model loading and initialization


## API Documentation

- Swagger UI: http://localhost:8001/docs (dev default; use `--port` if you changed it)
- ReDoc: http://localhost:8001/redoc

## Key Endpoints

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login

### Past Papers (Admin Only)
- `POST /api/v1/past-papers/upload` - Upload past paper PDF (extracts questions with embeddings)
- `GET /api/v1/past-papers/manage` - Get all past papers
- `GET /api/v1/past-papers/manage/{paper_id}` - Get specific past paper
- `PUT /api/v1/past-papers/manage/{paper_id}` - Update past paper
- `DELETE /api/v1/past-papers/manage/{paper_id}` - Delete past paper

### Questions
- `GET /api/v1/past-paper-questions` - Get all questions
- `GET /api/v1/past-paper-questions/{question_id}` - Get specific question
- `PUT /api/v1/past-paper-questions/{question_id}` - Update question
- `DELETE /api/v1/past-paper-questions/{question_id}` - Delete question
- `POST /api/v1/questions/generate` - Generate questions
- `POST /api/v1/questions/answer` - Submit answer

### Performance
- `GET /api/v1/performance/analytics` - User analytics

### Predictions (Topic Recommendation Engine)
- `GET /api/predictions/status` - Check if prediction service is ready
- `POST /api/predictions/topics` - Predict topics for a single question
- `POST /api/predictions/batch` - Predict topics for multiple questions
- `POST /api/predictions/recommendations` - Get topic recommendations for upcoming exam (uses ALL past papers)
- `GET /api/predictions/model-info` - Get information about trained DistilBERT models

### Admin
- `POST /api/v1/admin/upload-textbook` - Upload content

### Windows (Psycopg + async)

On Windows, start the API with the selector loop **before** Uvicorn boots (plain `uvicorn` can break DB/auth with Proactor):

```powershell
cd FYP-Backend-main
.\venv\Scripts\Activate.ps1
python scripts/run_api_windows.py app.main:app --host 0.0.0.0 --port 8001 --reload
```

Put secrets only in **`app/.env`** (e.g. `GROQ_API_KEY`, `QUESTION_GENERATION_ENABLED`) — never in this README.
