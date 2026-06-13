export type McqOption = { letter: string; text: string };

export type ParsedMcq = { stem: string; options: McqOption[] };

const MCQ_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Display index 1–4 instead of A–D (matches numbered server MCQ blocks). */
export function mcqOrdinalLabel(letter: string): string {
  const i = MCQ_LETTERS.indexOf(letter as (typeof MCQ_LETTERS)[number]);
  return i >= 0 ? String(i + 1) : letter;
}

/** Arabic / Urdu script (rough) — used to split "English / اردو" without breaking ratios like "1/2". */
const ARABIC_URDU_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\ufb50-\ufdff\ufe70-\ufeff]/;

/**
 * Split option text into display lines: newline-separated bilingual, or "English / Urdu" when Urdu is in the second segment.
 */
export function splitBilingualOptionLines(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const nl = t
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (nl.length >= 2) return nl;
  const idx = t.indexOf(' / ');
  if (idx > 0) {
    const a = t.slice(0, idx).trim();
    const b = t.slice(idx + 3).trim();
    if (a && b && ARABIC_URDU_SCRIPT.test(b)) return [a, b];
  }
  return [t];
}

/** Detect backend/LLM placeholder labels — show a hint instead of "Option A" as the answer text. */
export function formatMcqOptionDisplay(text: string): string {
  const t = text.trim();
  if (!t) return '—';
  const low = t.toLowerCase();
  if (/^option\s+[abcd][\s.)]*$/i.test(t)) {
    return '— (regenerate: use real answer text, not “Option A”)';
  }
  if (/^choice\s+[abcd][\s.)]*$/i.test(t)) {
    return '— (regenerate: use real answer text, not “Choice A”)';
  }
  const segments = t.split(/[,;/]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (segments.length >= 2) {
    const onlyLabels = segments.every((s) => /^option\s*[abcd][\s.)]*$/.test(s) || /^choice\s*[abcd][\s.)]*$/.test(s));
    if (onlyLabels) {
      return '— (regenerate: don’t put multiple labels in one choice)';
    }
  }
  if (t.length < 180) {
    const hits = low.match(/\boption\s+[abcd]\b/g);
    if (hits && hits.length >= 2) {
      return '— (regenerate: invalid choice text)';
    }
  }
  return t;
}

function parseOptionLine(line: string): { letter: string; text: string } | null {
  const t = line.trim();
  let m = t.match(/^\(([A-Ea-e])\)\s*(.+)$/i);
  if (m) return { letter: m[1].toUpperCase(), text: m[2].trim() };
  m = t.match(/^([A-Ea-e])\)\s*(.+)$/i);
  if (m) return { letter: m[1].toUpperCase(), text: m[2].trim() };
  m = t.match(/^([A-Ea-e])\.\s*(.+)$/i);
  if (m) return { letter: m[1].toUpperCase(), text: m[2].trim() };
  m = t.match(/^([A-Ea-e])\s*:\s*(.+)$/i);
  if (m) return { letter: m[1].toUpperCase(), text: m[2].trim() };
  // Numbered choices (1–4) from server-shuffled MCQ blocks (maps to A–D slots).
  m = t.match(/^([1-4])[\)\.:]\s*(.+)$/);
  if (m) {
    const idx = parseInt(m[1], 10) - 1;
    return { letter: MCQ_LETTERS[idx] ?? 'A', text: m[2].trim() };
  }
  return null;
}

/** Lines of the stem before the first A)/B)… option line in a combined question block. */
export function extractStemBeforeOptions(full: string): string | null {
  const lines = full
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  let firstOptionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (parseOptionLine(lines[i])) {
      firstOptionIdx = i;
      break;
    }
  }
  if (firstOptionIdx <= 0) return null;
  return lines.slice(0, firstOptionIdx).join('\n').trim() || null;
}

/**
 * Prefer API `options` (A–D strings) whenever all four are present.
 * Use `stem` when set; otherwise derive stem from `question` text above the first option line.
 */
export function mcqFromGeneratedItem(item: {
  question: string;
  answer?: string;
  stem?: string | null;
  options?: Record<string, string> | null;
  mcq_options?: Record<string, string> | null;
}): ParsedMcq | null {
  const raw = item.options ?? item.mcq_options;
  if (raw && typeof raw === 'object') {
    const row = raw as Record<string, unknown>;
    const opts: McqOption[] = [];
    let complete = true;
    for (const L of MCQ_LETTERS) {
      const t = row[L] ?? row[L.toLowerCase()];
      if (t == null || !String(t).trim()) {
        complete = false;
        break;
      }
      opts.push({ letter: L, text: formatMcqOptionDisplay(String(t).trim()) });
    }
    if (complete && opts.length === 4) {
      const st = (item.stem ?? '').trim();
      if (st) return { stem: st, options: opts };
      const extracted = extractStemBeforeOptions(item.question);
      if (extracted) return { stem: extracted, options: opts };
      const lines = item.question
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const stemFallback = lines[0] ?? item.question.trim();
      return { stem: stemFallback || 'Question', options: opts };
    }
  }
  return parseMcqFromText(item.question);
}

/** Resolve correct A–D letter; `answer` from API is usually a single letter after shuffle. */
export function resolveMcqCorrectLetter(answerField: string | undefined, parsed: ParsedMcq | null): string | null {
  if (!parsed || parsed.options.length < 2) return null;
  const fromExtract = extractMcqCorrectLetter(answerField ?? '', parsed.options);
  if (fromExtract) return fromExtract;
  const a = (answerField ?? '').trim();
  if (/^[A-D]$/i.test(a)) return a.toUpperCase();
  return null;
}

/** Split stem + A–E options from generated MCQ question text. */
export function parseMcqFromText(full: string): ParsedMcq | null {
  const lines = full
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return null;

  let firstOptionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (parseOptionLine(lines[i])) {
      firstOptionIdx = i;
      break;
    }
  }
  if (firstOptionIdx < 0) return null;

  const options: McqOption[] = [];
  let i = firstOptionIdx;
  while (i < lines.length) {
    const o = parseOptionLine(lines[i]);
    if (!o) break;
    i += 1;
    let chunk = o.text;
    while (i < lines.length && !parseOptionLine(lines[i])) {
      chunk += `\n${lines[i]}`;
      i += 1;
    }
    options.push({ letter: o.letter, text: formatMcqOptionDisplay(chunk.trim()) });
  }
  if (options.length < 2) return null;

  const stem = lines.slice(0, firstOptionIdx).join('\n').trim();
  if (!stem) return null;

  return { stem, options };
}

/** Derive correct option letter from API `answer` field (aligns with server MCQ grading). */
export function extractMcqCorrectLetter(answer: string, options: McqOption[]): string | null {
  const a = (answer || '').trim();
  if (!a) return null;

  const letters = new Set(options.map((o) => o.letter));
  if (a.length === 1 && /^[A-E]$/i.test(a)) {
    const L = a.toUpperCase();
    return letters.has(L) ? L : null;
  }

  const firstWord = a.match(/^([A-E])(?:[\.\)]|$)/i);
  if (firstWord && letters.has(firstWord[1].toUpperCase())) {
    return firstWord[1].toUpperCase();
  }

  const anywhere = a.match(/\b([A-E])\b/i);
  if (anywhere && letters.has(anywhere[1].toUpperCase())) {
    return anywhere[1].toUpperCase();
  }

  const low = a.toLowerCase();
  for (const o of options) {
    const ot = o.text.toLowerCase();
    if (!ot || ot.startsWith('—')) continue;
    if (low === ot || low.includes(ot) || ot.includes(low)) {
      return o.letter;
    }
  }

  return null;
}
