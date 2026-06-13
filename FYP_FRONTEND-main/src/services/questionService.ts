import { apiClient } from './api';

export type DifficultyUi = 'Easy' | 'Medium' | 'Hard';

/** Mirrors ``GeneratedQuestionItem`` from FYP-Backend ``app/schemas/question_schema.py`` (generate-questions / topic-set / jobs). */
export interface GeneratedQuestionItem {
  question_id: number;
  question_number: number;
  question: string;
  marks: number;
  answer: string;
  explanation?: string | null;
  /** MCQ: stem when API returns structured fields (optional if ``question`` embeds stem + A–D lines). */
  stem?: string | null;
  /** MCQ: map ``"A"|"B"|"C"|"D"`` → answer text (same as server ``options``). */
  options?: Record<string, string> | null;
  /** Alias some responses may use; normalized into ``options`` by ``normalizeGeneratedQuestionItem``. */
  mcq_options?: Record<string, string> | null;
}

/** Chunk previews returned with POST /questions/generate-questions/ (RAG transparency). */
export interface RetrievalSourceItem {
  chunk_index: number;
  preview: string;
  topic?: string | null;
  source_tag?: string | null;
}

export interface GenerateQuestionsResult {
  questions: GeneratedQuestionItem[];
  retrieval_sources: RetrievalSourceItem[];
  /** Present when server has AI generation turned off (app/.env). */
  feature_disabled_notice?: string | null;
  /** Present when server used timeout / placeholder fallback instead of full LLM output. */
  generation_fallback_notice?: string | null;
}

/** Use when `questions.length === 0` so alerts match the real cause. */
export function emptyGenerationUserMessage(result: {
  questions: GeneratedQuestionItem[];
  feature_disabled_notice?: string | null;
  generation_fallback_notice?: string | null;
}): string {
  const fd = (result.feature_disabled_notice ?? '').trim();
  if (fd) {
    return `${fd}\n\nOn the server (FYP-Backend-main/app/.env): set QUESTION_GENERATION_ENABLED=true and your LLM key, then restart the backend (e.g. python scripts/run_api_windows.py …).`;
  }
  const gf = (result.generation_fallback_notice ?? '').trim();
  if (gf) return gf;
  return 'No questions were returned. Try another topic, or confirm generation settings and your LLM key on the server.';
}

export interface GenerateTopicSetPayload {
  board: string;
  class_level: string;
  subject: string;
  topic: string;
  difficulty: DifficultyUi;
  exam_type?: 'board' | 'mdcat' | 'ecat';
}

export interface GenerateTopicSetResult {
  topic: string;
  subject: string;
  board: string;
  class_level: string;
  mcqs: GeneratedQuestionItem[];
  short_questions: GeneratedQuestionItem[];
  long_questions: GeneratedQuestionItem[];
  retrieval_sources: RetrievalSourceItem[];
  feature_disabled_notice?: string | null;
}

export function mergeRetrievalSources(...lists: RetrievalSourceItem[][]): RetrievalSourceItem[] {
  const seen = new Set<string>();
  const out: RetrievalSourceItem[] = [];
  for (const list of lists) {
    for (const s of list) {
      const k = `${s.chunk_index}:${(s.preview || '').slice(0, 64)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

export interface GenerateQuestionsPayload {
  board: string;
  class_level: string;
  subject: string;
  topic: string;
  difficulty: DifficultyUi;
  qtype: 'MCQ' | 'Short' | 'Long';
  exam_type?: 'board' | 'mdcat' | 'ecat';
  num_questions: number;
}

function difficultyToApi(d: DifficultyUi): 'easy' | 'medium' | 'hard' {
  if (d === 'Easy') return 'easy';
  if (d === 'Hard') return 'hard';
  return 'medium';
}

function qtypeToApi(q: 'MCQ' | 'Short' | 'Long'): string {
  if (q === 'MCQ') return 'mcq';
  if (q === 'Long') return 'long';
  return 'short';
}

/** First run often loads MiniLM + FAISS + LLM; 120s was too short and yielded empty UI. */
function questionGenerationTimeoutMs(): number {
  const raw = process.env.EXPO_PUBLIC_QUESTION_GEN_TIMEOUT_MS;
  const n = raw != null && raw.trim() !== '' ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 60000) return n;
  return 360000;
}

/** Grading can load SentenceTransformer on first short/long submit; default request timeout is too low. */
function submitAnswerTimeoutMs(): number {
  const raw = process.env.EXPO_PUBLIC_SUBMIT_ANSWER_TIMEOUT_MS;
  const n = raw != null && raw.trim() !== '' ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 30000) return n;
  return 120000;
}

function normalizeGeneratedQuestionItem(raw: GeneratedQuestionItem): GeneratedQuestionItem {
  let opts = raw.options ?? raw.mcq_options;
  if (typeof opts === 'string') {
    try {
      const parsed = JSON.parse(opts) as unknown;
      opts = parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : null;
    } catch {
      opts = null;
    }
  }
  const { mcq_options: _drop, ...rest } = raw;
  return { ...rest, options: opts ?? null };
}

async function fetchGenerateQuestions(
  payload: GenerateQuestionsPayload
): Promise<GenerateQuestionsResult> {
  const body = {
    board: payload.board,
    class_level: payload.class_level,
    subject: payload.subject,
    topic: payload.topic,
    difficulty: difficultyToApi(payload.difficulty),
    qtype: qtypeToApi(payload.qtype),
    exam_type: payload.exam_type ?? 'board',
    num_questions: payload.num_questions,
  };

  const res = await apiClient.postWithTimeout(
    '/questions/generate-questions/',
    body,
    questionGenerationTimeoutMs(),
    false
  );
  if (res == null || typeof res !== 'object') {
    throw new Error('Invalid response from question generator (empty or non-JSON body).');
  }
  const list = (res as { questions?: unknown }).questions;
  const rawSources = (res as { retrieval_sources?: unknown }).retrieval_sources;
  const retrieval_sources = Array.isArray(rawSources)
    ? (rawSources as RetrievalSourceItem[])
    : [];
  if (!Array.isArray(list)) {
    throw new Error(
      'Question generation returned an unexpected shape (missing questions array). Check server version and logs.'
    );
  }
  const questions = (list as GeneratedQuestionItem[]).map(normalizeGeneratedQuestionItem);
  const raw = res as Record<string, unknown>;
  const feature_disabled_notice =
    typeof raw.feature_disabled_notice === 'string' ? raw.feature_disabled_notice : null;
  const generation_fallback_notice =
    typeof raw.generation_fallback_notice === 'string' ? raw.generation_fallback_notice : null;
  return { questions, retrieval_sources, feature_disabled_notice, generation_fallback_notice };
}

async function fetchGenerateTopicSet(
  payload: GenerateTopicSetPayload
): Promise<GenerateTopicSetResult> {
  const body = {
    board: payload.board,
    class_level: payload.class_level,
    subject: payload.subject,
    topic: payload.topic,
    difficulty: difficultyToApi(payload.difficulty),
    exam_type: payload.exam_type ?? 'board',
  };

  const res = await apiClient.postWithTimeout(
    '/questions/generate-topic-set/',
    body,
    questionGenerationTimeoutMs(),
    false
  );
  if (res == null || typeof res !== 'object') {
    throw new Error('Invalid response from topic-set generator (empty or non-JSON body).');
  }
  const typed = res as Partial<GenerateTopicSetResult>;
  const mcqs = Array.isArray(typed.mcqs) ? typed.mcqs.map(normalizeGeneratedQuestionItem) : [];
  const short_questions = Array.isArray(typed.short_questions)
    ? typed.short_questions.map(normalizeGeneratedQuestionItem)
    : [];
  const long_questions = Array.isArray(typed.long_questions)
    ? typed.long_questions.map(normalizeGeneratedQuestionItem)
    : [];
  const retrieval_sources = Array.isArray(typed.retrieval_sources) ? typed.retrieval_sources : [];

  const fd =
    typeof typed.feature_disabled_notice === 'string' ? typed.feature_disabled_notice : null;

  return {
    topic: String(typed.topic ?? payload.topic),
    subject: String(typed.subject ?? payload.subject),
    board: String(typed.board ?? payload.board),
    class_level: String(typed.class_level ?? payload.class_level),
    mcqs,
    short_questions,
    long_questions,
    retrieval_sources,
    feature_disabled_notice: fd,
  };
}

export type GenerateQuestionsSafeResult =
  | ({ ok: true } & GenerateQuestionsResult)
  | {
      ok: false;
      error: string;
      questions: [];
      retrieval_sources: [];
      feature_disabled_notice?: null;
      generation_fallback_notice?: null;
    };

/**
 * Maps backend POST /questions/generate-questions/
 */
export const questionService = {
  generateQuestions: fetchGenerateQuestions,
  generateTopicSet: fetchGenerateTopicSet,

  /**
   * Same as generateQuestions but never throws — use when running MCQ + short + long in parallel
   * so one failing type does not discard the others.
   */
  generateQuestionsSafe: async (
    payload: GenerateQuestionsPayload
  ): Promise<GenerateQuestionsSafeResult> => {
    try {
      const data = await fetchGenerateQuestions(payload);
      return { ok: true, ...data };
    } catch (e: unknown) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Unknown error',
        questions: [],
        retrieval_sources: [],
      };
    }
  },

  /**
   * POST /questions/submit-answer/
   * Sends Bearer token only when logged in; guests get heuristic grading without progress save.
   */
  submitAnswer: async (params: {
    question_id: number;
    user_answer: string;
    time_taken?: number;
    mode?: 'auto' | 'key' | 'ai';
  }): Promise<QuestionAnswerResult> => {
    const token = await apiClient.getToken();
    const includeAuth = Boolean(token?.trim());
    return apiClient.postWithTimeout(
      '/questions/submit-answer/',
      {
        question_id: params.question_id,
        user_answer: params.user_answer.trim(),
        time_taken: params.time_taken,
        mode: params.mode ?? 'auto',
      },
      submitAnswerTimeoutMs(),
      includeAuth
    );
  },

  /** POST /questions/explain-answer/ — optional auth (guests still get fallback explanations). */
  explainAnswer: async (
    question_id: number,
    student_answer?: string
  ): Promise<ExplainAnswerResult> => {
    const token = await apiClient.getToken();
    const includeAuth = Boolean(token?.trim());
    return apiClient.postWithTimeout(
      '/questions/explain-answer/',
      {
        question_id,
        student_answer: student_answer?.trim() ? student_answer.trim() : null,
      },
      submitAnswerTimeoutMs(),
      includeAuth
    );
  },
};

export interface QuestionAnswerResult {
  is_correct: boolean;
  score_percentage: number;
  score_marks?: number | null;
  max_marks?: number | null;
  explanation?: string | null;
  correct_answer: string;
  gamification?: unknown;
}

export interface ExplainAnswerResult {
  question_id: number;
  model_answer: string;
  explanation: string;
  missing_points: string[];
}
