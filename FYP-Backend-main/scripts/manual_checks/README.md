# Manual API check scripts

These are **manual, exploratory scripts** — not part of the automated `pytest` suite
(which lives in `FYP-Backend-main/tests/` and is what CI runs).

They hit a locally running API (`uvicorn app.main:app --port 8001`) and print the
results to the console. Use them for quick end-to-end smoke checks while developing.

| Script | Purpose |
| --- | --- |
| `test_question_api.py` | Calls the question-generation endpoint and prints the response. |
| `test_question_flow.py` | Walks through the question-generation flow step by step. |
| `test_question_generation.py` | Simple generation smoke test against a running server. |
| `test_question_generator.py` | Exercises the question-formatter utilities directly (no server). |

> Update the `BASE_URL` in each script to match your dev port before running.
