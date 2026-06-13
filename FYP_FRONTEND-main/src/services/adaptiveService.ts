import { apiClient } from './api';
import type { GeneratedQuestionItem } from './questionService';

/** Smart-practice generation often exceeds the default 30s request timeout (LLM + RAG + long book context). */
function adaptiveNextQuestionTimeoutMs(): number {
  const raw = process.env.EXPO_PUBLIC_ADAPTIVE_NEXT_TIMEOUT_MS;
  const n = raw != null && raw.trim() !== '' ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 45000) return n;
  return 120000;
}

export interface AdaptiveNextQuestionResponse {
  question_id: number;
  question_text: string;
  question_type: string;
  difficulty_level: string;
  marks: number;
  options: unknown;
  /** MCQ: stem when server returns structured fields */
  stem?: string | null;
  correct_answer?: string;
  explanation?: string;
  source: string;
}

export interface RevisionPlanDayFocus {
  day_index: number;
  topic: string;
  priority: string;
  suggested_practice_questions: number;
  rationale: string;
}

export interface RevisionPlanResponse {
  subject_id: number;
  horizon_days: number;
  accuracy_percentage: number | null;
  recent_trend: string;
  weak_topics: string[];
  strong_topics: string[];
  daily_focus: RevisionPlanDayFocus[];
  maintenance_topics: { topic: string; suggested_practice_questions: number; priority: string }[];
  strategies: string[];
}

export interface SmartPracticeQuestionItem {
  question_id: number;
  question_text: string;
  question_type: string;
  difficulty_level: string;
  concept_tested: string;
  feedback_status: string;
  short_explanation: string;
  hint_on_incorrect: string;
}

export interface SmartPracticeSessionResponse {
  practice_goal: string;
  performance_context: {
    recent_score: number;
    attempts: number;
    mistakes: number;
    difficulty_flow: string;
  };
  topic_prioritization: {
    weak_topics: string[];
    moderate_topics: string[];
    strong_topics: string[];
    distribution: { weak: string; moderate: string; strong: string };
    question_counts: { weak: number; moderate: number; strong: number };
  };
  question_generation: {
    mix: { mcq: number; short: number; concept_based: number };
    syllabus_alignment: string;
    adaptive_difficulty: string;
    questions: SmartPracticeQuestionItem[];
  };
  adaptive_practice_flow: string[];
  weak_topic_reinforcement: {
    improved_topics_count: number;
    still_need_attention: string[];
  };
  next_best_actions: string[];
  next_step_recommendation: string;
  engagement: {
    progress_indicator: string;
    encouragement: string;
  };
}

export function mapAdaptiveToGeneratedItem(row: AdaptiveNextQuestionResponse): GeneratedQuestionItem {
  const opts =
    row.options && typeof row.options === 'object' && !Array.isArray(row.options)
      ? (row.options as Record<string, string>)
      : undefined;
  return {
    question_id: row.question_id,
    question_number: 1,
    question: row.question_text,
    marks: row.marks ?? 0,
    answer: row.correct_answer ?? '',
    stem: row.stem?.trim() || undefined,
    options: opts,
  };
}

export const adaptiveService = {
  getNextQuestion: async (
    subjectId: number,
    topicName?: string
  ): Promise<AdaptiveNextQuestionResponse> => {
    const q = new URLSearchParams({ subject_id: String(subjectId) });
    if (topicName?.trim()) q.set('topic_name', topicName.trim());
    return apiClient.get(`/adaptive/next-question?${q.toString()}`, false, adaptiveNextQuestionTimeoutMs());
  },

  getRevisionPlan: async (
    subjectId: number,
    horizonDays: number = 7
  ): Promise<RevisionPlanResponse> => {
    const q = new URLSearchParams({
      subject_id: String(subjectId),
      horizon_days: String(Math.min(30, Math.max(1, horizonDays))),
    });
    return apiClient.get(`/adaptive/revision-plan?${q.toString()}`, true);
  },

  getWholeBookRevisionPlan: async (
    classLevel: string,
    horizonDays: number = 7
  ): Promise<RevisionPlanResponse> => {
    const q = new URLSearchParams({
      class_level: classLevel.trim(),
      horizon_days: String(Math.min(30, Math.max(1, horizonDays))),
    });
    return apiClient.get(`/adaptive/revision-plan-whole-book?${q.toString()}`, true);
  },

  getSmartPracticeSession: async (params: {
    subjectId: number;
    totalQuestions?: number;
    recentScore?: number;
    weakTopics?: string[];
    moderateTopics?: string[];
    strongTopics?: string[];
  }): Promise<SmartPracticeSessionResponse> => {
    return apiClient.postWithTimeout(
      '/adaptive/smart-practice-session',
      {
        subject_id: params.subjectId,
        total_questions: params.totalQuestions ?? 12,
        recent_score: params.recentScore,
        weak_topics: params.weakTopics ?? [],
        moderate_topics: params.moderateTopics ?? [],
        strong_topics: params.strongTopics ?? [],
      },
      60000,
      true
    );
  },
};
