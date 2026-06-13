# app/services/generator.py – PrepifyAI question/exam generator (Groq + FAISS context)
import json
import concurrent.futures
import re
import random
from typing import Any

from app.core.config import settings
from app.utils.retriever import retrieve_context

_client = None


def _mcq_difficulty_plan(num_questions: int) -> dict[str, int]:
    """Split requested MCQs as evenly as possible across Easy/Medium/Hard."""
    total = max(0, int(num_questions or 0))
    base = total // 3
    rem = total % 3
    return {
        "Easy": base + (1 if rem > 0 else 0),
        "Medium": base + (1 if rem > 1 else 0),
        "Hard": base,
    }


def _norm_text(v: str) -> str:
    return re.sub(r"\s+", " ", (v or "").strip().lower())


def _extract_keywords(topic: str) -> set[str]:
    return {w for w in re.findall(r"[a-zA-Z0-9]+", (topic or "").lower()) if len(w) >= 4}


def _to_chunk_docs(context: str, source_chunk_ids: list[str] | None = None) -> list[dict[str, str]]:
    parts = [p.strip() for p in re.split(r"\n\s*\n+", context or "") if p.strip()]
    docs: list[dict[str, str]] = []
    for i, text in enumerate(parts, 1):
        cid = (
            str(source_chunk_ids[i - 1]).strip()
            if source_chunk_ids and i - 1 < len(source_chunk_ids) and str(source_chunk_ids[i - 1]).strip()
            else f"chunk_{i}"
        )
        docs.append({"chunk_id": cid, "text": text})
    return docs


def _filter_context_docs(topic: str, docs: list[dict[str, str]]) -> list[dict[str, str]]:
    keys = _extract_keywords(topic)
    if not docs:
        return []
    if not keys:
        return docs[:6]
    kept: list[dict[str, str]] = []
    for d in docs:
        low = _norm_text(d.get("text", ""))
        score = sum(1 for k in keys if k in low)
        if score > 0:
            kept.append(d)
    return kept[:12]


def _difficulty_from_text(q: str) -> str:
    low = _norm_text(q)
    hard_triggers = ("calculate", "derive", "analyze", "compare", "justify", "evaluate", "numerical")
    medium_triggers = ("explain", "describe", "differentiate", "how", "why")
    if any(t in low for t in hard_triggers):
        return "Hard"
    if any(t in low for t in medium_triggers):
        return "Medium"
    return "Easy"


def _assign_source_chunk_id(item: dict[str, Any], docs: list[dict[str, str]]) -> str:
    raw = str(item.get("source_chunk_id", "")).strip()
    ids = {d["chunk_id"] for d in docs}
    if raw in ids:
        return raw
    qlow = _norm_text(str(item.get("question") or item.get("stem") or ""))
    for d in docs:
        dlow = _norm_text(d.get("text", ""))[:500]
        if dlow and any(tok in dlow for tok in re.findall(r"[a-zA-Z0-9]+", qlow)[:8]):
            return d["chunk_id"]
    return docs[0]["chunk_id"] if docs else "chunk_1"


def _dedupe_questions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for r in rows:
        key = _norm_text(str(r.get("question") or r.get("mcq_stem") or ""))
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def _format_existing_questions_for_prompt(rows: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for r in rows:
        q = str(r.get("question") or r.get("mcq_stem") or "").strip()
        if q:
            lines.append(f"- {q[:180]}")
    return "\n".join(lines[:20])


def _board_from_exam(exam: str) -> str:
    low = _norm_text(exam)
    if "fbise" in low:
        return "fbise"
    if "punjab" in low:
        return "punjab"
    return ""


def _get_client():
    global _client
    if _client is None:
        import os
        from groq import Groq
        key = (getattr(settings, "GROQ_API_KEY", None) or os.environ.get("GROQ_API_KEY") or "").strip()
        if not key:
            raise ValueError("GROQ_API_KEY not set. Add it to app/.env")
        _client = Groq(api_key=key)
    return _client


def _exam_prompt(exam_type: str, subject: str, topic: str, context: str, *, mcq: bool = False) -> str:
    et_lower = (exam_type or "").lower()
    if "mdcat" in et_lower:
        style = (
            "You are an expert MDCAT exam paper setter. "
            "Write conceptual, clinically-oriented single-best-answer MCQs "
            "that test deep understanding, not rote memorization."
        )
    elif "ecat" in et_lower:
        style = (
            "You are an expert ECAT (engineering entry test) paper setter. "
            "Write problem-solving, numerical and conceptual MCQs similar to real ECAT papers."
        )
    else:
        style = (
            "You are an expert board exam paper setter for Pakistani boards (Matric/FSc). "
            "Write questions similar to FBISE board exams."
        )

    common = f"""{style}
Exam: {exam_type} | Subject: {subject} | Topic: {topic}
Use the context below. Difficulty: Easy = recall/define; Medium = explain/reason; Hard = deep/multi-step.

Context:
{context}"""

    if mcq:
        return (
            common
            + "\n\nFollow the MCQ JSON shape in the next instruction block exactly (stem + options A–D + answer letter)."
        )

    return (
        common
        + '\n\nOutput valid JSON only: a single array of objects. Each object must have: "question_number" (integer), "question" (string), "marks" (integer), "answer" (string).'
    )

def _strict_policy_block(topic: str, exam_type: str, subject: str, difficulty: str) -> str:
    """Unified strict policy used for FBISE/Punjab/MDCAT/ECAT generation."""
    exam_upper = (exam_type or "").upper()
    diff = (difficulty or "medium").strip().lower()
    if diff == "easy":
        diff_rule = "Focus on basic definitions, direct concepts, and simple recall."
    elif diff == "hard":
        diff_rule = "Focus on analytical, tricky, and multi-step reasoning."
    else:
        diff_rule = "Focus on conceptual understanding with minor application."
    return (
        "\n\nSTRICT RULES:\n"
        "- All questions must be based on standard textbook concepts, not random or generic knowledge.\n"
        f"- Topic: \"{topic}\" is mandatory. Do not include unrelated concepts.\n"
        f"- Every generated question must directly test the topic \"{topic}\" using textbook concepts.\n"
        "- MCQ stems must mention or clearly indicate the topic; options must remain factual and syllabus-relevant.\n"
        "- If topic is empty, fail with: Error: Valid topic required.\n"
        f"- Subject is {subject}; keep scientific/mathematical correctness.\n"
        f"- Exam style must match {exam_upper}:\n"
        "  * FBISE/Punjab Board -> MCQs, short questions, and long questions are allowed.\n"
        "  * MDCAT -> MCQs only, conceptual entry-test style.\n"
        "  * ECAT -> MCQs only, analytical/numerical entry-test style.\n"
        f"- Difficulty policy: {diff_rule}\n"
        "- Avoid repetition and ambiguous options.\n"
        "- Every MCQ option must be a factual statement, definition, law, formula, or valid example.\n"
        "- Do NOT use placeholder wording like 'common statement', 'trap option', 'idea about', or 'unrelated concept'.\n"
        "- If a generated question drifts outside topic, discard/regenerate internally.\n"
    )


def _derive_mcq_answer_letter(answer_raw: str, defaults: dict[str, str]) -> str:
    """Map model answer string to one of A–D given current option texts."""
    a = (answer_raw or "").strip()
    if len(a) == 1 and a.upper() in defaults:
        return a.upper()
    m = re.search(r"\b([A-Da-d])\b", a)
    if m and m.group(1).upper() in defaults:
        return m.group(1).upper()
    low = a.lower()
    for k, v in defaults.items():
        vv = v.lower()
        if vv and (low == vv or low in vv or vv in low):
            return k
    return "A"


def _shuffle_mcq_display(
    stem: str, defaults: dict[str, str], ans_letter: str
) -> tuple[str, dict[str, str], str]:
    """Shuffle option order; return full question block, display A→text map, new correct letter."""
    option_pairs = [(k, defaults[k]) for k in ("A", "B", "C", "D")]
    random.shuffle(option_pairs)
    relabeled = {"A": option_pairs[0], "B": option_pairs[1], "C": option_pairs[2], "D": option_pairs[3]}

    new_answer = "A"
    for new_letter, (old_letter, _) in relabeled.items():
        if old_letter == ans_letter:
            new_answer = new_letter
            break

    display = {L: relabeled[L][1] for L in ("A", "B", "C", "D")}
    full_q = (
        f"{stem}\n"
        f"A) {display['A']}\n"
        f"B) {display['B']}\n"
        f"C) {display['C']}\n"
        f"D) {display['D']}"
    )
    return full_q, display, new_answer


def _coerce_options_dict(raw: Any) -> dict[str, str] | None:
    """Require four non-empty options labeled A–D (case-insensitive keys)."""
    if not isinstance(raw, dict):
        return None
    out: dict[str, str] = {}
    for k in ("A", "B", "C", "D"):
        v = raw.get(k) if k in raw else raw.get(k.lower())
        if v is None or not str(v).strip():
            return None
        out[k] = str(v).strip()
    return out


def _is_placeholder_like(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return True
    banned = (
        "common statement",
        "conceptually correct",
        "trap option",
        "idea about",
        "unrelated concept",
        "partially correct idea",
        "core textbook fact",
        "standard textbook explanation",
    )
    return any(b in t for b in banned)


def _mcq_options_high_quality(options: dict[str, str]) -> bool:
    vals = [str(options.get(k, "")).strip() for k in ("A", "B", "C", "D")]
    lowered = [v.lower() for v in vals]
    if len(set(lowered)) < 4:
        return False
    if any(_is_placeholder_like(v) for v in vals):
        return False
    return True


def _ensure_mcq_marks(item: dict[str, Any]) -> None:
    try:
        m = int(item.get("marks", 0) or 0)
    except (TypeError, ValueError):
        m = 0
    if m < 1:
        item["marks"] = 1


def _normalize_mcq_item(item: dict[str, Any]) -> dict[str, Any]:
    """Enforce exactly 4 options (A-D) and single-letter answer for MCQs."""
    q = str(item.get("question", "")).strip()
    a = str(item.get("answer", "")).strip()

    # Parse options written as A) ... / B) ... / C) ... / D) ...
    lines = [ln.strip() for ln in q.splitlines() if ln.strip()]
    stem_lines: list[str] = []
    parsed_opts: dict[str, str] = {}
    opt_re = re.compile(r"^([A-Da-d])[\)\.\:]\s*(.+)$")
    in_opts = False
    for ln in lines:
        m = opt_re.match(ln)
        if m:
            in_opts = True
            parsed_opts[m.group(1).upper()] = m.group(2).strip()
        elif not in_opts:
            stem_lines.append(ln)

    stem = "\n".join(stem_lines).strip() or q

    # Fill/trim to exactly A-D.
    defaults = {
        "A": parsed_opts.get("A", "Option A"),
        "B": parsed_opts.get("B", "Option B"),
        "C": parsed_opts.get("C", "Option C"),
        "D": parsed_opts.get("D", "Option D"),
    }

    ans_letter = _derive_mcq_answer_letter(a, defaults)
    full_q, display, new_answer = _shuffle_mcq_display(stem, defaults, ans_letter)

    item["question"] = full_q
    item["answer"] = new_answer
    item["mcq_stem"] = stem
    item["mcq_options"] = display
    item["explanation"] = str(item.get("explanation", "")).strip()
    _ensure_mcq_marks(item)
    return item


def _finalize_mcq_item(item: dict[str, Any], *, enforce_quality: bool = True) -> dict[str, Any]:
    """
    Prefer structured LLM output: stem + options object.
    Otherwise parse legacy single-block question text.
    """
    stem = str(item.get("stem", "")).strip()
    raw_opts = item.get("options")
    coerced = _coerce_options_dict(raw_opts) if stem else None
    if stem and coerced:
        if enforce_quality and not _mcq_options_high_quality(coerced):
            raise ValueError("MCQ options are too generic or placeholder-like.")
        ans_letter = _derive_mcq_answer_letter(str(item.get("answer", "")), coerced)
        full_q, display, new_ans = _shuffle_mcq_display(stem, coerced, ans_letter)
        item["question"] = full_q
        item["answer"] = new_ans
        item["mcq_stem"] = stem
        item["mcq_options"] = display
        _ensure_mcq_marks(item)
        return item

    q_extra = str(item.get("question", "")).strip()
    merged = f"{stem}\n{q_extra}" if stem and q_extra else (q_extra or stem)
    return _normalize_mcq_item({**item, "question": merged})


def _question_text_from_item(item: dict[str, Any]) -> str:
    for k in ("question", "question_text", "text", "prompt", "stem"):
        v = item.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def _answer_text_from_item(item: dict[str, Any]) -> str:
    for k in ("answer", "model_answer", "solution", "key", "correct_answer"):
        v = item.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def _build_question_rows(items: list[Any], num_questions: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, item in enumerate(items[:num_questions], 1):
        if isinstance(item, dict):
            mraw = item.get("marks")
            if mraw is None:
                mraw = item.get("mark")
            try:
                marks_int = int(mraw) if mraw is not None else 0
            except (TypeError, ValueError):
                marks_int = 0
            row: dict[str, Any] = {
                "question_number": item.get("question_number", i),
                "question": _question_text_from_item(item),
                "marks": marks_int,
                "answer": _answer_text_from_item(item),
            }
            explanation = item.get("explanation")
            if explanation is not None and str(explanation).strip():
                row["explanation"] = str(explanation).strip()
            st = item.get("stem")
            if isinstance(st, str) and st.strip():
                row["stem"] = st.strip()
            if isinstance(item.get("options"), dict):
                row["options"] = item["options"]
            out.append(row)
        else:
            out.append({"question_number": i, "question": "", "marks": 0, "answer": str(item)})
    return out


def _parse_json_questions(raw: str, num_questions: int) -> list[dict[str, Any]]:
    """Parse LLM JSON with light recovery for common malformed wrappers."""
    raw_in = (raw or "").strip()
    if not raw_in:
        raise ValueError("LLM returned empty content instead of JSON.")

    # Fast path: exact JSON payload.
    try:
        data = json.loads(raw_in)
    except json.JSONDecodeError as e:
        # Recovery path: models sometimes wrap JSON in prose or markdown fences.
        candidate = raw_in
        fence = re.search(r"```(?:json)?\s*(.*?)\s*```", raw_in, flags=re.IGNORECASE | re.DOTALL)
        if fence:
            candidate = fence.group(1).strip()

        # Extract likely top-level array/object region.
        if not candidate.startswith("[") and not candidate.startswith("{"):
            first_arr = candidate.find("[")
            first_obj = candidate.find("{")
            starts = [x for x in (first_arr, first_obj) if x >= 0]
            if starts:
                candidate = candidate[min(starts):].strip()

        if candidate.startswith("["):
            end = candidate.rfind("]")
            if end > 0:
                candidate = candidate[: end + 1]
        elif candidate.startswith("{"):
            end = candidate.rfind("}")
            if end > 0:
                candidate = candidate[: end + 1]

        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            raise ValueError("LLM output is not valid JSON.") from e

    # Normalize object-with-questions shape.
    if isinstance(data, dict) and isinstance(data.get("questions"), list):
        data = data["questions"]
    if not isinstance(data, list) or len(data) == 0:
        raise ValueError("LLM output must be a non-empty JSON array.")
    return _build_question_rows(data, num_questions)


def generate_questions(
    topic: str,
    subject: str,
    exam: str,
    difficulty: str,
    qtype: str,
    num_questions: int,
    *,
    context: str | None = None,
    source_chunk_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Generate questions using Groq LLM with FAISS context.
    If context is provided, skips an extra FAISS retrieval pass.
    Returns a list of {"question_number", "question", "marks", "answer"}.
    """
    topic = (topic or "").strip()
    if not topic:
        raise ValueError("Topic is required and cannot be empty.")
    board_norm = _board_from_exam(exam)
    if board_norm not in ("fbise", "punjab"):
        raise ValueError("UNSUPPORTED_BOARD")
    diff_norm = (difficulty or "").strip().lower()
    if diff_norm not in ("easy", "medium", "hard"):
        raise ValueError("INVALID_DIFFICULTY")

    if context is None:
        context = retrieve_context(topic, k=5)

    qtype_lower = (qtype or "short").strip().lower()
    docs = _filter_context_docs(topic, _to_chunk_docs(context or "", source_chunk_ids=source_chunk_ids))
    top_docs = docs[:5]
    if len(top_docs) < 3:
        raise ValueError("INSUFFICIENT_CONTEXT_FOR_REQUESTED_QUESTION_COUNT")

    ctx = "\n\n".join(f"[{d['chunk_id']}] {d['text']}" for d in top_docs)
    cap = int(getattr(settings, "GROQ_CONTEXT_MAX_CHARS", 5000) or 5000)
    if cap > 0 and len(ctx) > cap:
        ctx = ctx[:cap]

    model = "llama-3.1-8b-instant"
    client = _get_client()
    out_cap = int(getattr(settings, "GROQ_MAX_OUTPUT_TOKENS", 1400) or 1400)
    out_cap = max(512, min(out_cap, 1800))

    if qtype_lower in ("mcq", "mcqs", "multiple choice", "multiple choice questions"):
        type_rule = "All items must be MCQ."
    elif qtype_lower in ("short",):
        type_rule = "All items must be SHORT."
    elif qtype_lower in ("long", "long question", "long questions"):
        type_rule = "All items must be LONG."
    else:
        type_rule = "Use MIXED question types across MCQ, SHORT, and LONG."

    prompt = (
        "You are the FAST CORE QUESTION GENERATION ENGINE for PrepifyAI.\n"
        "Use ONLY the provided textbook chunks.\n"
        f"Board: {board_norm.upper()}\n"
        f"Subject: {subject}\n"
        f"Topic: {topic}\n"
        f"Difficulty: {diff_norm.capitalize()}\n"
        f"Generate exactly {num_questions} questions.\n"
        f"{type_rule}\n"
        "No external knowledge. No fallback text. No duplicate questions.\n"
        "Return JSON array only; each object must include: "
        "type, question, options (for MCQ), answer, explanation, difficulty, source_chunk_id, marks.\n"
        "Use only these chunk ids for source_chunk_id.\n\n"
        f"Context:\n{ctx}"
    )

    max_tokens = min(out_cap, 140 + max(num_questions, 1) * 170)
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=max_tokens,
        )
        raw = response.choices[0].message.content or ""
        parsed = _parse_json_questions(raw, num_questions)
    except Exception as e:
        raise ValueError(
            f"Groq request failed ({type(e).__name__}): {e}. Check GROQ_API_KEY and billing/limits."
        ) from e

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in parsed:
        q_text = str(row.get("question", "")).strip()
        q_type = str(row.get("type", "")).strip().upper()
        if not q_text:
            continue
        key = _norm_text(q_text)
        if not key or key in seen:
            continue
        seen.add(key)

        if qtype_lower in ("mcq", "mcqs", "multiple choice", "multiple choice questions"):
            q_type = "MCQ"
        elif qtype_lower == "short":
            q_type = "SHORT"
        elif qtype_lower in ("long", "long question", "long questions"):
            q_type = "LONG"
        elif q_type not in ("MCQ", "SHORT", "LONG"):
            q_type = "SHORT"

        normalized: dict[str, Any] = dict(row)
        normalized["type"] = q_type
        normalized["difficulty"] = diff_norm.capitalize()
        normalized["source_chunk_id"] = _assign_source_chunk_id(normalized, top_docs)
        normalized["explanation"] = str(normalized.get("explanation", "")).strip() or "Based on retrieved textbook context."

        if q_type == "MCQ":
            try:
                fin = _finalize_mcq_item(
                    {
                        "stem": normalized.get("stem") or normalized.get("question"),
                        "options": normalized.get("options"),
                        "answer": normalized.get("answer"),
                        "marks": normalized.get("marks", 1),
                        "explanation": normalized["explanation"],
                    },
                    enforce_quality=True,
                )
                normalized["question"] = fin.get("question", normalized.get("question", ""))
                normalized["answer"] = fin.get("answer", normalized.get("answer", ""))
                normalized["mcq_stem"] = fin.get("mcq_stem")
                normalized["mcq_options"] = fin.get("mcq_options")
                normalized["marks"] = 1
            except Exception:
                continue
        else:
            try:
                marks = int(normalized.get("marks", 0) or 0)
            except (TypeError, ValueError):
                marks = 0
            if marks < 1:
                normalized["marks"] = 9 if q_type == "LONG" else 3

        out.append(normalized)

    if len(out) != num_questions:
        raise ValueError("INSUFFICIENT_CONTEXT_FOR_REQUESTED_QUESTION_COUNT")

    for i, r in enumerate(out, 1):
        r["question_number"] = i
    return out
