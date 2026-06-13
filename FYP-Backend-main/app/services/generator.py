# app/services/generator.py – PrepifyAI question/exam generator (Groq + FAISS context)
import json
import concurrent.futures
import logging
import re
import random
from typing import Any

from app.core.config import settings
from app.utils.retriever import retrieve_context

_client = None
logger = logging.getLogger(__name__)

# Returned to clients when chunks cannot support grounded generation (see also Groq prompt).
NO_TEXTBOOK_CONTENT_DETAIL = "No content found"


def _groq_context_cap_chars() -> int:
    """Effective max characters sent to Groq for textbook context (smaller in FAST_MODE)."""
    cap = int(getattr(settings, "GROQ_CONTEXT_MAX_CHARS", 5000) or 5000)
    if bool(getattr(settings, "QUESTION_GENERATION_FAST_MODE", False)):
        fast_cap = int(getattr(settings, "GROQ_CONTEXT_FAST_MAX_CHARS", 8000) or 8000)
        cap = min(cap, fast_cap)
    return max(0, cap)


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


_URDU_ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
_NON_ASCII_PRINTABLE_RE = re.compile(r"[^\x20-\x7E]")


def _strip_non_english_lines(text: str) -> str:
    """
    Keep only lines without Urdu/Arabic script so API responses stay English-only.
    """
    raw = str(text or "")
    lines = [ln.strip() for ln in raw.splitlines()]
    kept: list[str] = []
    for ln in lines:
        if not ln:
            continue
        if _URDU_ARABIC_RE.search(ln):
            continue
        # Drop mojibake / corrupted non-ASCII lines to enforce clean English output.
        if _NON_ASCII_PRINTABLE_RE.search(ln):
            continue
        if not re.search(r"[A-Za-z]", ln):
            continue
        kept.append(ln)
    return "\n".join(kept).strip()


def _sanitize_mcq_english_only(item: dict[str, Any]) -> dict[str, Any]:
    item["question"] = _strip_non_english_lines(str(item.get("question", "")))
    item["stem"] = _strip_non_english_lines(str(item.get("stem", "")))
    item["explanation"] = _strip_non_english_lines(str(item.get("explanation", "")))
    opts = item.get("options")
    if isinstance(opts, dict):
        item["options"] = {str(k): _strip_non_english_lines(str(v)) for k, v in opts.items()}
    return item


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


def dedupe_raw_question_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """API-level dedupe across batches (stem + MCQ option text when present)."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for r in rows:
        q = str(r.get("question") or r.get("mcq_stem") or "").strip()
        if not q:
            continue
        key = _norm_text(q)
        if isinstance(r.get("options"), dict):
            od = r["options"]
            key = _norm_text(f"{q}|{od.get('A', '')}|{od.get('B', '')}|{od.get('C', '')}|{od.get('D', '')}")
        elif isinstance(r.get("mcq_options"), dict):
            od = r["mcq_options"]
            key = _norm_text(f"{q}|{od}")
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def _augment_docs_for_min_coverage(
    top_docs: list[dict[str, str]],
    chunk_docs: list[dict[str, str]],
    min_needed: int,
) -> list[dict[str, str]]:
    """Reuse / duplicate chunk text so the model always has enough grounding spans."""
    out = list(top_docs)
    if not out and chunk_docs:
        out = list(chunk_docs[: max(1, min(len(chunk_docs), min_needed))])
    base = chunk_docs or out
    if not base:
        return out
    i = 0
    safety = 0
    while len(out) < min_needed and safety < 48:
        safety += 1
        src = base[i % len(base)]
        dup = dict(src)
        cid = str(dup.get("chunk_id", "chunk"))
        dup["chunk_id"] = f"{cid}_aug{i}"
        t = (dup.get("text") or "").strip()
        dup["text"] = t + ("\n\n[Additional coverage from the same source material.]" if i else "")
        out.append(dup)
        i += 1
    return out[:40]


def _format_existing_questions_for_prompt(rows: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for r in rows:
        q = str(r.get("question") or r.get("mcq_stem") or "").strip()
        if q:
            lines.append(f"- {q[:180]}")
    return "\n".join(lines[:20])


def _board_from_exam(exam: str) -> str:
    """Normalised exam/board label for prompts (FBISE, Punjab, MDCAT, ECAT, etc.)."""
    low = _norm_text(exam)
    if "fbise" in low:
        return "fbise"
    if "punjab" in low:
        return "punjab"
    if "mdcat" in low:
        return "mdcat"
    if "ecat" in low:
        return "ecat"
    if "entry" in low and "test" in low:
        return "entry_test"
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
            + "\n\nFollow the MCQ JSON shape in the next instruction block exactly: "
            "stem; options as JSON keys \"A\"–\"D\" with real choice text only; answer as a single letter A–D. "
            "Do not put labels like \"Option A\" or \"Choice B\" inside any option value."
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
        "- English-only output: MCQ stem and all options must be in clear English only "
        "(no Urdu text, no Roman Urdu, no bilingual format).\n"
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
    raise ValueError("Cannot map model answer to one of A–D for this MCQ.")


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
    # Student-facing block: numbered choices (1–4), not A/B/C/D labels.
    full_q = (
        f"{stem}\n\n"
        f"1. {display['A']}\n"
        f"2. {display['B']}\n"
        f"3. {display['C']}\n"
        f"4. {display['D']}"
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
        "vague option",
        "placeholder",
        "generic option",
        "dummy option",
        "sample answer",
        "example option",
    )
    return any(b in t for b in banned)


def _is_generic_template_option(text: str) -> bool:
    """Reject short, exam-writer meta lines instead of real domain content (names, definitions, facts)."""
    t = (text or "").strip().lower()
    if not t or len(t) > 120:
        return False
    prefixes = (
        "the correct answer",
        "correct answer based",
        "based on textbook content",
        "an alternative option",
        "another option",
        "a different option",
        "none of the above",
        "all of the above",
        "both a and",
        "a related but",
        "related but imprecise",
        "a common misconception",
        "an idea that belongs",
        "belongs to a different",
        "does not answer",
        "incorrect; does not",
        "partially correct but",
        "choose the best answer",
        "select the best",
        "the definition or explanation that matches",
    )
    return any(t.startswith(p) for p in prefixes)


def _is_option_label_placeholder(text: str) -> bool:
    """Reject options that are only labels, e.g. 'Option A', 'Choice B' (not real content)."""
    t = (text or "").strip().lower()
    if not t:
        return True
    if t in ("a", "b", "c", "d"):
        return True
    # Bare label only (allow longer strings that merely mention "option a" in prose).
    if re.fullmatch(r"option\s*[abcd][\.\)\:]?\s*", t):
        return True
    if re.fullmatch(r"choice\s*[abcd][\.\)\:]?\s*", t):
        return True
    if re.fullmatch(r"answer\s*[abcd][\.\)\:]?\s*", t):
        return True
    collapsed = re.sub(r"[\s\.\)\:]+", "", t)
    if collapsed in ("optiona", "optionb", "optionc", "optiond", "choicea", "choiceb", "choicec", "choiced"):
        return True
    return False


def _is_comma_joined_option_labels_only(text: str) -> bool:
    """Reject one JSON value that is only 'Option A,Option B,...' or 'Option A; Option B' (not real answers)."""
    raw = re.sub(r'["\']', "", (text or "").strip().lower())
    raw = re.sub(r"\s+", " ", raw)
    segments = [s.strip() for s in re.split(r"[,;/]", raw) if s.strip()]
    if len(segments) < 2:
        return False
    one = re.compile(r"^option\s*[abcd][\.\)\:]?\s*$|^choice\s*[abcd][\.\)\:]?\s*$")
    return all(one.match(seg) for seg in segments)


def _has_multiple_option_placeholders_in_one_string(text: str) -> bool:
    """Reject short blobs that mention two+ 'option a' style tokens (model stuffed labels into one field)."""
    t = re.sub(r'["\']', "", (text or "").strip().lower())
    if len(t) > 180:
        return False
    found = re.findall(r"\boption\s*[abcd]\b", t)
    if len(found) >= 2:
        return True
    found_c = re.findall(r"\bchoice\s*[abcd]\b", t)
    return len(found_c) >= 2


def _norm_mcq_options_dict(raw: Any) -> dict[str, str]:
    """Normalize arbitrary key casing to A–D with non-empty string values."""
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k in ("A", "B", "C", "D"):
        v = raw.get(k) if k in raw else raw.get(k.lower())
        if v is not None and str(v).strip():
            out[k] = str(v).strip()
    return out


def _parse_mcq_option_line(ln: str) -> tuple[str, str] | None:
    """One option line → (A–D key, text). Supports A) / 1. / 1) styles."""
    m = re.match(r"^([A-Da-d])[\)\.\:]\s*(.+)$", ln)
    if m:
        return m.group(1).upper(), m.group(2).strip()
    m = re.match(r"^([1-4])[\)\.\:]\s*(.+)$", ln)
    if m:
        return "ABCD"[int(m.group(1)) - 1], m.group(2).strip()
    return None


def parse_mcq_options_from_question_block(text: str) -> tuple[str, dict[str, str] | None]:
    """Split stem and option lines (letters A–D or numbers 1–4) from a student-facing MCQ block."""
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    stem_lines: list[str] = []
    parsed_opts: dict[str, str] = {}
    in_opts = False
    current_key: str | None = None
    for ln in lines:
        parsed = _parse_mcq_option_line(ln)
        if parsed:
            in_opts = True
            current_key = parsed[0]
            parsed_opts[current_key] = parsed[1]
        elif not in_opts:
            stem_lines.append(ln)
        elif current_key:
            # Continuation lines (e.g. Urdu under English for the same option).
            prev = parsed_opts[current_key]
            parsed_opts[current_key] = f"{prev}\n{ln}".strip()
    stem = "\n".join(stem_lines).strip()
    if len(parsed_opts) < 4:
        return stem, None
    try:
        ordered = {k: parsed_opts[k] for k in ("A", "B", "C", "D")}
    except KeyError:
        return stem, None
    return stem, ordered


def repair_mcq_row_dict_before_persist(row: dict[str, Any]) -> None:
    """Ensure ``mcq_options`` / ``options`` hold four real choices; backfill from ``question`` text if needed."""
    cur = _norm_mcq_options_dict(row.get("mcq_options"))
    if len(cur) < 4:
        cur = _norm_mcq_options_dict(row.get("options"))
    if len(cur) == 4 and _mcq_options_high_quality(cur):
        row["mcq_options"] = cur
        row["options"] = cur
        return

    stem, parsed = parse_mcq_options_from_question_block(str(row.get("question", "") or ""))
    if parsed and _mcq_options_high_quality(parsed):
        row["mcq_options"] = parsed
        row["options"] = parsed
        if stem and not (row.get("mcq_stem") or "").strip():
            row["mcq_stem"] = stem
        return

    raise ValueError("MCQ is missing four valid option strings (check model output and question body).")


def coalesce_mcq_for_client_response(
    question_text: str,
    options_json: str | None,
    correct_answer: str | None,
) -> dict[str, Any]:
    """Build ``options`` / ``stem`` for APIs when DB JSON is missing or stale (never raises)."""
    loaded: Any = None
    if options_json:
        try:
            loaded = json.loads(options_json)
        except (json.JSONDecodeError, TypeError):
            loaded = None
    norm = _norm_mcq_options_dict(loaded)
    if len(norm) == 4 and _mcq_options_high_quality(norm):
        stem, _ = parse_mcq_options_from_question_block(question_text or "")
        return {"options": norm, "stem": stem or None, "correct_answer": correct_answer}
    stem, parsed = parse_mcq_options_from_question_block(question_text or "")
    if parsed and _mcq_options_high_quality(parsed):
        return {"options": parsed, "stem": stem or None, "correct_answer": correct_answer}
    return {"options": norm if len(norm) == 4 else None, "stem": None, "correct_answer": correct_answer}


def _mcq_options_high_quality(options: dict[str, str]) -> bool:
    vals = [str(options.get(k, "")).strip() for k in ("A", "B", "C", "D")]
    lowered = [v.lower() for v in vals]
    if len(set(lowered)) < 4:
        return False
    # Each option should be a complete phrase (domain term, definition, or concept) — not a one-token filler.
    if any(len(v) < 4 for v in vals):
        return False
    if any(_is_placeholder_like(v) for v in vals):
        return False
    if any(_is_option_label_placeholder(v) for v in vals):
        return False
    if any(_is_comma_joined_option_labels_only(v) for v in vals):
        return False
    if any(_has_multiple_option_placeholders_in_one_string(v) for v in vals):
        return False
    if any(_is_generic_template_option(v) for v in vals):
        return False
    # Prefer multi-word or substantial single-token domain text (not "maybe", "wrong").
    for v in vals:
        words = [w for w in re.split(r"\s+", v) if any(c.isalnum() for c in w)]
        if len(words) >= 2:
            continue
        # One-word but substantive (e.g. surnames, enzymes): allow from 10 chars.
        if len(v) >= 10:
            continue
        return False
    vague = (
        "it is related",
        "none of these",
        "none of the above",
        "all of the above",
        "both a and",
        "cannot be determined",
        "not enough information",
        "vague option",
        "not applicable",
        "same as above",
    )
    if any(any(p in x for p in vague) for x in lowered):
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

    stem, parsed_opts = parse_mcq_options_from_question_block(q)
    if not parsed_opts:
        raise ValueError("MCQ text must include four labeled options A–D with real content.")
    stem = stem.strip() or q

    defaults: dict[str, str] = {}
    for letter in ("A", "B", "C", "D"):
        raw_o = parsed_opts.get(letter)
        if raw_o is None or not str(raw_o).strip():
            raise ValueError("MCQ text must include four labeled options A–D with real content.")
        defaults[letter] = str(raw_o).strip()
    if not _mcq_options_high_quality(defaults):
        raise ValueError("MCQ options are too generic or placeholder-like.")

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
    coerced = _coerce_options_dict(raw_opts)
    if coerced is not None and not stem:
        stem = str(item.get("question", "")).strip()
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
    for k in ("answer", "correct_answer", "model_answer", "solution", "key"):
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


def _groq_llm_timeout_sec() -> float:
    """Per-completion timeout for Groq (seconds)."""
    sec = int(getattr(settings, "QUESTION_GENERATION_TIMEOUT_SEC", 180) or 180)
    return float(max(30, min(sec, 600)))


def _groq_chat_completions_create(client: Any, create_kwargs: dict[str, Any], timeout_sec: float) -> Any:
    """Run synchronous Groq SDK call with a hard timeout (avoids hanging workers)."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(lambda: client.chat.completions.create(**create_kwargs))
        try:
            return fut.result(timeout=timeout_sec)
        except concurrent.futures.TimeoutError as te:
            raise ValueError(
                f"Groq request timed out after {timeout_sec:.0f}s. "
                "Try fewer questions, increase QUESTION_GENERATION_TIMEOUT_SEC, or use async generation jobs."
            ) from te


def _groq_completions_text(client: Any, create_kwargs: dict[str, Any], timeout_sec: float) -> str:
    """
    Safe Groq call: up to 2 attempts (retry on empty/transport errors), timeout on each call,
    optional json_object mode with one fallback without response_format.
    """
    last_err: Exception | None = None
    for llm_try in range(2):
        try:
            kwargs = dict(create_kwargs)
            if bool(getattr(settings, "GROQ_JSON_OBJECT_MODE", True)):
                kwargs["response_format"] = {"type": "json_object"}
            try:
                response = _groq_chat_completions_create(client, kwargs, timeout_sec)
            except Exception as api_err:
                if kwargs.pop("response_format", None) is not None:
                    try:
                        response = _groq_chat_completions_create(client, kwargs, timeout_sec)
                    except Exception as e2:
                        raise ValueError(
                            f"Groq request failed ({type(e2).__name__}): {e2}. "
                            "Check GROQ_API_KEY and billing/limits."
                        ) from e2
                else:
                    raise ValueError(
                        f"Groq request failed ({type(api_err).__name__}): {api_err}. "
                        "Check GROQ_API_KEY and billing/limits."
                    ) from api_err
            raw = (response.choices[0].message.content or "").strip()
            if not raw:
                raise ValueError("Empty LLM response")
            return raw
        except Exception as e:
            last_err = e
            if llm_try == 1:
                raise e
    raise last_err if last_err else RuntimeError("Groq completion failed with no error")


def _safe_json_loads_llm(response: str) -> Any:
    """
    Parse LLM output: try json.loads, then recover a top-level {...} or [...] slice.
    On total failure, log and raise ValueError('LLM returned invalid JSON').
    """
    response = (response or "").strip()
    if not response:
        raise ValueError("Empty LLM response")
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        pass
    start = response.find("{")
    end = response.rfind("}")
    if start != -1 and end != -1 and end >= start:
        try:
            return json.loads(response[start : end + 1])
        except json.JSONDecodeError:
            pass
    a0, a1 = response.find("["), response.rfind("]")
    if a0 != -1 and a1 != -1 and a1 >= a0:
        try:
            return json.loads(response[a0 : a1 + 1])
        except json.JSONDecodeError:
            pass
    logger.warning("Invalid JSON from LLM (first 800 chars): %s", response[:800])
    raise ValueError("LLM returned invalid JSON")


def _looks_like_plaintext_refusal(text: str) -> bool:
    """Model returned prose / refusal instead of a JSON array (no brackets)."""
    s = (text or "").strip()
    if not s:
        return True
    if "[" in s or "{" in s:
        return False
    low = s.lower()
    if NO_TEXTBOOK_CONTENT_DETAIL.lower() in low or "no relevant textbook" in low:
        return True
    if any(
        p in low[:800]
        for p in (
            "cannot generate",
            "unable to generate",
            "cannot produce",
            "i cannot",
            "i'm sorry",
            "sorry,",
            "as an ai",
            "no json",
        )
    ):
        return True
    return False


def _parse_json_questions(raw: str, num_questions: int) -> list[dict[str, Any]]:
    """Parse LLM JSON with light recovery for common malformed wrappers."""
    raw_in = (raw or "").strip()
    if not raw_in:
        raise ValueError(
            "The model returned an empty message. Try fewer questions, increase GROQ_MAX_OUTPUT_TOKENS, or retry."
        )

    low_head = raw_in[:800].lower()
    if NO_TEXTBOOK_CONTENT_DETAIL.lower() in low_head or "no relevant textbook" in low_head:
        raise ValueError(NO_TEXTBOOK_CONTENT_DETAIL)

    try:
        data = _safe_json_loads_llm(raw_in)
    except ValueError as e:
        if _looks_like_plaintext_refusal(raw_in):
            raise ValueError(NO_TEXTBOOK_CONTENT_DETAIL) from e
        # Recovery path: models sometimes wrap JSON in prose or markdown fences.
        candidate = raw_in
        fence = re.search(r"```(?:json)?\s*(.*?)\s*```", raw_in, flags=re.IGNORECASE | re.DOTALL)
        if fence:
            candidate = fence.group(1).strip()

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
            data = _safe_json_loads_llm(candidate)
        except ValueError:
            probe = (candidate or raw_in)[:1200].lower()
            if NO_TEXTBOOK_CONTENT_DETAIL in probe or "no relevant textbook" in probe:
                raise ValueError(NO_TEXTBOOK_CONTENT_DETAIL) from e
            if _looks_like_plaintext_refusal(candidate) or _looks_like_plaintext_refusal(raw_in):
                raise ValueError(NO_TEXTBOOK_CONTENT_DETAIL) from e
            logger.warning("Invalid JSON from LLM after recovery (first 800 chars): %s", raw_in[:800])
            raise ValueError("LLM returned invalid JSON") from e

    if isinstance(data, str):
        dl = data.lower()
        if "no content found" in dl or "no relevant textbook" in dl:
            raise ValueError(NO_TEXTBOOK_CONTENT_DETAIL)
        raise ValueError("LLM returned a string instead of a JSON array.")

    # Normalize object-with-questions shape, or explicit "no content" error object.
    if isinstance(data, dict):
        if isinstance(data.get("questions"), list):
            data = data["questions"]
        elif isinstance(data.get("data"), list):
            data = data["data"]
        else:
            err = str(data.get("error") or data.get("message") or "").strip().lower()
            if err and ("no content found" in err or "no relevant textbook" in err):
                raise ValueError(NO_TEXTBOOK_CONTENT_DETAIL)
            if data.get("mcqs") or data.get("short_questions") or data.get("long_questions"):
                raise ValueError(
                    "LLM returned combined mcqs/short_questions/long_questions shape; "
                    "this endpoint expects a JSON array of question objects only."
                )
    if not isinstance(data, list):
        raise ValueError("LLM output must be a JSON array of question objects.")
    if len(data) == 0:
        raise ValueError(NO_TEXTBOOK_CONTENT_DETAIL)
    return _build_question_rows(data, num_questions)


def _generate_questions_groq(
    topic: str,
    subject: str,
    exam: str,
    difficulty: str,
    qtype: str,
    num_questions: int,
    *,
    context: str | None = None,
    source_chunk_ids: list[str] | None = None,
    subject_id: int | None = None,
) -> list[dict[str, Any]]:
    """
    Groq LLM + FAISS context (used only when QUESTION_GENERATION_ENABLED is true).
    If context is provided, skips an extra FAISS retrieval pass.
    Returns a list of {"question_number", "question", "marks", "answer"}.
    """
    topic = (topic or "").strip()
    if not topic:
        raise ValueError("Topic is required and cannot be empty.")
    board_norm = _board_from_exam(exam)
    if not board_norm:
        raise ValueError("UNSUPPORTED_BOARD")
    diff_norm = (difficulty or "").strip().lower()
    if diff_norm not in ("easy", "medium", "hard"):
        raise ValueError("INVALID_DIFFICULTY")

    if context is None:
        context = retrieve_context(topic, k=5)

    qtype_lower = (qtype or "short").strip().lower()
    chunk_docs = _to_chunk_docs(context or "", source_chunk_ids=source_chunk_ids)
    filtered = _filter_context_docs(topic, chunk_docs)
    topic_keys = _extract_keywords(topic)
    # Quality guard: when we can detect topic keywords, do not force unrelated chunks.
    # If nothing relevant is found, conceptual fallback below will take over.
    if topic_keys:
        docs = filtered
    else:
        docs = filtered if len(filtered) >= 3 else (chunk_docs if chunk_docs else filtered)
    # Pass as much retrieved chunk text as allowed by GROQ_CONTEXT_MAX_CHARS (applied below), not a tiny slice.
    top_docs = docs[: min(len(docs), 40)]
    min_chunks = max(1, min(3, len(chunk_docs))) if chunk_docs else 1
    if len(top_docs) < min_chunks and not (topic_keys and not filtered):
        top_docs = _augment_docs_for_min_coverage(top_docs, chunk_docs, min_chunks)

    total_grounding = sum(len((d.get("text") or "").strip()) for d in top_docs)
    min_ground = int(getattr(settings, "QUESTION_GENERATION_CONTEXT_MIN_CHARS", 80) or 80)
    conceptual_mode = total_grounding < min_ground
    if conceptual_mode:
        ref = "\n\n".join(f"[{d['chunk_id']}] {d.get('text', '')}" for d in top_docs) if top_docs else ""
        syn_lines = [
            f"Topic: {topic}.",
            f"Subject: {subject}.",
            f"Exam context: {(exam or '').strip()}",
            "Generate syllabus-aligned practice questions appropriate for this course level.",
            "When the reference excerpt is short, use standard high-school textbook knowledge for this topic.",
            "Each question must be distinct — do not repeat stems or duplicate ideas.",
        ]
        if ref.strip():
            syn_lines.append("Reference excerpt (may be partial):\n" + ref[:6000])
        top_docs = [{"chunk_id": "conceptual_synoptic", "text": "\n".join(syn_lines)}]
        logger.warning(
            "question_gen.context_fallback subject_id=%s topic=%r level=%s prior_grounding_chars=%s",
            subject_id,
            topic[:200],
            "conceptual",
            total_grounding,
        )

    ctx = "\n\n".join(f"[{d['chunk_id']}] {d['text']}" for d in top_docs)
    cap = _groq_context_cap_chars()
    if cap > 0 and len(ctx) > cap:
        ctx = ctx[:cap]

    available_context_size = len(ctx)
    logger.info(
        "question_gen.context subject_id=%s topic=%r available_context_size=%s requested_question_count=%s fallback=%s",
        subject_id,
        topic[:200],
        available_context_size,
        num_questions,
        "conceptual" if conceptual_mode else "chunk_grounded",
    )

    model = (getattr(settings, "GROQ_QUESTION_MODEL", None) or "llama-3.1-8b-instant").strip() or "llama-3.1-8b-instant"
    client = _get_client()
    # Respect GROQ_MAX_OUTPUT_TOKENS from settings (no silent 1800 cap — bilingual MCQ batches need 3k+).
    out_cap = int(getattr(settings, "GROQ_MAX_OUTPUT_TOKENS", 4096) or 4096)
    out_cap = max(512, min(out_cap, 8192))

    if qtype_lower in ("mcq", "mcqs", "multiple choice", "multiple choice questions"):
        type_rule = "All items must be MCQ."
        mcq_shape = (
            "ROLE: Expert teacher writing high-quality board-style MCQs for ANY subject named above "
            "(sciences, mathematics, languages, computer studies, social studies, Islamiyat, etc.). "
            "Match vocabulary, notation, and difficulty to that subject and the chunks — not only Physics.\n"
            "For EACH MCQ use keys: stem (single-line English question only), options as exactly "
            '{"A":"...","B":"...","C":"...","D":"..."}, '
            "answer as exactly one letter A, B, C, or D (the slot holding the only correct answer), explanation.\n"
            "STRICT MCQ RULES:\n"
            "1. Every question MUST have exactly four realistic options A–D; each value is REAL, MEANINGFUL text tied to the stem and textbook chunks.\n"
            "2. NEVER use placeholders: not 'Option A/B/C/D', not 'Choice A', not comma-joined labels, not single-letter labels as the answer text.\n"
            "3. NEVER put meta-instructions inside any option: no '(regenerate...)', no 'use real answer text', no editor notes, no parentheses that explain the format.\n"
            "4. Exactly ONE option is correct per the chunks; the other three are plausible distractors (common misconceptions or close but wrong ideas).\n"
            "5. Options may be short phrases OR full sentences (like real exam papers); they must be factual claims or statements students can judge, not labels.\n"
            "6. A, B, C, D are ONLY JSON keys (internal). Each value is real answer text — never prefix with 'Option A', 'A)', or 'Choice B' inside the string. "
            "The server saves student-facing blocks as numbered choices 1–4 (not A/B/C/D labels).\n"
            "7. English-only requirement: stem and all option values must be plain English only; do not include Urdu script, Roman Urdu, or bilingual lines.\n"
            "8. Keep wording concise, exam-style, and directly grounded in textbook chunks.\n"
            "9. Topic-lock: each MCQ stem must explicitly mention the given topic phrase or a direct concept from it (for example ATP, energy transfer, respiration for bioenergetics).\n"
            "STYLE EXAMPLE (Physics-style illustration only — for Biology, Chemistry, Math, etc., write in that subject using the chunks):\n"
            "Stem: According to Newton's first law of motion, an object at rest will remain at rest unless acted upon by an unbalanced force.\n"
            '{"A":"This statement is true and describes inertia.","B":"This statement is false because objects at rest always stay at rest.",'
            '"C":"This statement is true only for objects in space.","D":"This statement applies only to moving objects."}\n'
            "English-only example (shape only — adapt subject/topic to chunks):\n"
            'stem: "Being a biological research worker, you study Markhor; which branch of biology is it?"\n'
            '{"A":"Botany","B":"Zoology","C":"Palaeontology","D":"Parasitology"}\n'
            "BAD: {\"A\":\"Option A\",\"B\":\"Option B\"} or any option text that is only a letter label.\n"
            "Set answer to the letter of the correct slot; vary which letter is correct across questions; display order may be shuffled server-side.\n"
            "If the chunks do not support four strong options, return JSON {\"questions\": []}."
        )
    elif qtype_lower in ("short",):
        type_rule = "All items must be SHORT (exam-style: 1–3 line model answers)."
        mcq_shape = "Use key question (full line) and answer (concise, definitions/processes as appropriate)."
    elif qtype_lower in ("long", "long question", "long questions"):
        type_rule = "All items must be LONG (structured theory: steps/process, explanation, example if the chunks support it)."
        mcq_shape = "Use key question and answer (detailed but still only from chunks)."
    else:
        type_rule = "Use MIXED question types across MCQ, SHORT, and LONG."
        mcq_shape = "Follow the same grounding rules per type."

    exam_line = (exam or "").strip()
    if conceptual_mode:
        grounding_rules = (
            "3. Ground each question in the reference excerpt when possible; otherwise use widely accepted high-school syllabus knowledge for the topic (no trivia unrelated to the subject).\n"
            "4. EVERY question MUST clearly target the given topic and stay distinct from other items.\n"
        )
        chunk_footer = (
            "6. Prefer returning fewer high-quality questions over empty output if the topic is very thin — but try to fill the array when possible.\n\n"
        )
    else:
        grounding_rules = (
            "3. EVERY question and answer MUST be justified by the provided textbook chunks below.\n"
            "4. EVERY question MUST clearly target the given topic.\n"
        )
        chunk_footer = (
            "6. If the chunks do NOT contain enough substance to write faithful questions, return JSON "
            f'{{\"questions\": []}} (empty array), not the phrase {NO_TEXTBOOK_CONTENT_DETAIL!r} as plain text.\n\n'
        )
    prompt = (
        "You are an expert exam paper setter for FBISE, Punjab Board, MDCAT, and ECAT.\n\n"
        "CRITICAL RULES:\n"
        "1. NEVER invent fallback or generic questions.\n"
        "2. NEVER output vague stems or meaningless options. For MCQs: four realistic choices with real answer text only — no placeholders, no '(regenerate)' notes, no meta-comments inside options.\n"
        f"{grounding_rules}"
        "5. Match real exam tone: FBISE / Punjab matric–inter, or entry-test style when the exam line indicates MDCAT/ECAT.\n"
        f"{chunk_footer}"
        f"Exam context line: {exam_line}\n"
        f"Board/exam bucket (internal): {board_norm.upper()}\n"
        f"Subject: {subject}\n"
        f"Topic: {topic}\n"
        f"Class / level: infer from the exam line if present.\n"
        f"Difficulty: {diff_norm.capitalize()} — Easy = recall/definitions; Medium = concepts/links; Hard = application/reasoning.\n"
        f"Generate exactly {num_questions} questions.\n"
        f"{type_rule}\n"
        f"{mcq_shape}\n\n"
        "OUTPUT: Return valid JSON only (no markdown). The root MUST be a JSON object with exactly one key \"questions\" "
        f"whose value is an ARRAY of exactly {num_questions} objects. Each object has keys:\n"
        "type (MCQ|SHORT|LONG), question (full student-facing text for non-MCQ; for MCQ you may leave question minimal if stem+options are set), "
        "stem (MCQ only, optional if question embeds stem), "
        "options (MCQ only: keys A–D; each VALUE realistic answer text from the chunks — no placeholders, no '(regenerate)' or meta-notes inside options), "
        "answer, explanation, difficulty, "
        "source_chunk_id (must be one of the chunk ids shown in brackets in the context), marks (integer).\n"
        "If the chunks are insufficient, use {\"questions\": []} with an empty array (not plain text).\n"
        + (
            "Do not duplicate questions.\n\n"
            if conceptual_mode
            else "Do not duplicate questions. Do not cite knowledge outside the chunks.\n\n"
        )
        + f"TEXTBOOK CHUNKS (reference):\n{ctx}"
    )

    nq = max(num_questions, 1)
    if qtype_lower in ("mcq", "mcqs", "multiple choice", "multiple choice questions"):
        # Keep MCQ token budget leaner so synchronous API calls return faster.
        per_q = max(140, min(260, (out_cap - 120) // nq))
        base_max_tokens = min(out_cap, 80 + nq * per_q)
    else:
        base_max_tokens = min(out_cap, 160 + nq * 170)

    timeout_sec = _groq_llm_timeout_sec()
    logger.info(
        "question_gen.llm_before subject_id=%s topic=%r combined_text_len=%s qtype=%s",
        subject_id,
        topic[:200],
        len(ctx),
        (qtype or "").strip().lower(),
    )

    parsed: list[dict[str, Any]] | None = None
    raw = ""
    last_parse_err: Exception | None = None
    for attempt in range(2):
        max_tokens = min(out_cap, int(base_max_tokens * (1.1**attempt)))
        try:
            create_kwargs: dict[str, Any] = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": max_tokens,
            }
            raw = _groq_completions_text(client, create_kwargs, timeout_sec)
            logger.info(
                "question_gen.llm_after subject_id=%s topic=%r raw_response_preview=%r",
                subject_id,
                topic[:200],
                raw[:500],
            )
            head = raw[:500].lower()
            if (
                NO_TEXTBOOK_CONTENT_DETAIL.lower() in head
                or "no relevant textbook" in head
                or raw.strip() == NO_TEXTBOOK_CONTENT_DETAIL
            ):
                raise ValueError(NO_TEXTBOOK_CONTENT_DETAIL)
            parsed = _parse_json_questions(raw, num_questions)
            last_parse_err = None
            break
        except ValueError as e:
            msg = str(e).lower()
            if attempt == 0 and any(
                x in msg
                for x in (
                    "not valid json",
                    "truncated",
                    "empty message",
                    "empty llm response",
                    "model returned text",
                    "json array",
                    "llm returned invalid json",
                )
            ):
                last_parse_err = e
                continue
            raise
        except Exception as e:
            raise ValueError(
                f"Groq request failed ({type(e).__name__}): {e}. Check GROQ_API_KEY and billing/limits."
            ) from e

    if parsed is None:
        if last_parse_err is not None:
            raise last_parse_err
        raise RuntimeError("Groq MCQ generation produced no parsed questions.")

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    mcq_mode = qtype_lower in ("mcq", "mcqs", "multiple choice", "multiple choice questions")
    for row in parsed:
        q_text = str(row.get("question", "")).strip()
        stem_only = str(row.get("stem", "")).strip()
        if not q_text and mcq_mode and (stem_only or _coerce_options_dict(row.get("options"))):
            q_text = stem_only
        q_type = str(row.get("type", "")).strip().upper()
        if not q_text:
            continue
        key = _norm_text(q_text)
        if mcq_mode and isinstance(row.get("options"), dict):
            od = row["options"]
            key = _norm_text(
                f"{q_text}|{od.get('A','')}|{od.get('B','')}|{od.get('C','')}|{od.get('D','')}"
            )
        if not key or key in seen:
            continue
        seen.add(key)

        if mcq_mode:
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
        normalized["question"] = _strip_non_english_lines(str(normalized.get("question", "")))
        if isinstance(normalized.get("stem"), str):
            normalized["stem"] = _strip_non_english_lines(str(normalized.get("stem", "")))
        normalized["answer"] = _strip_non_english_lines(str(normalized.get("answer", "")))
        normalized["explanation"] = _strip_non_english_lines(str(normalized.get("explanation", "")))

        if q_type == "MCQ":
            try:
                normalized = _sanitize_mcq_english_only(normalized)
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

    if len(out) > num_questions:
        out = out[:num_questions]
    if len(out) < num_questions:
        logger.warning(
            "question_gen.partial_output subject_id=%s topic=%r requested=%s generated=%s",
            subject_id,
            topic[:200],
            num_questions,
            len(out),
        )
    out = dedupe_raw_question_rows(out)
    if not out:
        return []

    for i, r in enumerate(out, 1):
        r["question_number"] = i
    return out


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
    subject_id: int | None = None,
) -> list[dict[str, Any]]:
    """Public entry: returns a single placeholder row when generation is disabled."""
    from app.services.question_generation_feature import DISABLED_MESSAGE, is_question_generation_enabled

    if not is_question_generation_enabled():
        return [
            {
                "question_number": 1,
                "question": DISABLED_MESSAGE,
                "marks": 1,
                "answer": "",
                "explanation": DISABLED_MESSAGE,
            }
        ]
    return _generate_questions_groq(
        topic,
        subject,
        exam,
        difficulty,
        qtype,
        num_questions,
        context=context,
        source_chunk_ids=source_chunk_ids,
        subject_id=subject_id,
    )
