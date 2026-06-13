import { apiClient } from './api';

export interface PerformanceSummary {
  total_attempts: number;
  correct_answers: number;
  accuracy_percentage: number;
  average_time: number | null;
  strong_topics: string[];
  weak_topics: string[];
  subject_wise_performance: Record<string, number>;
  recent_trend: string;
}

export interface TopicPerformanceRow {
  topic_name: string;
  attempts: number;
  correct: number;
  accuracy: number;
  avg_score: number;
  avg_time: number;
}

export interface PerformanceByTopicResponse {
  topics: TopicPerformanceRow[];
}

export interface DailyPerformanceRow {
  date: string;
  attempts: number;
  correct: number;
  accuracy_percentage: number;
}

export interface RecentPerformanceDaysResponse {
  days: DailyPerformanceRow[];
}

export interface PracticeTimeSubjectRow {
  subject_id: number;
  subject_name: string;
  minutes: number;
}

export interface PracticeTimeBySubjectResponse {
  subjects: PracticeTimeSubjectRow[];
}

export const performanceService = {
  getSummary: async (subjectId?: number): Promise<PerformanceSummary> => {
    const q =
      subjectId !== undefined ? `?subject_id=${encodeURIComponent(String(subjectId))}` : '';
    return apiClient.get(`/performance/summary${q}`, true);
  },

  getByTopic: async (subjectId: number): Promise<PerformanceByTopicResponse> => {
    return apiClient.get(
      `/performance/by-topic?subject_id=${encodeURIComponent(String(subjectId))}`,
      true
    );
  },

  /** GET /performance/recent-days — daily attempts & accuracy (UTC days). */
  getRecentDays: async (days = 7, subjectId?: number): Promise<RecentPerformanceDaysResponse> => {
    const q = new URLSearchParams();
    q.set('days', String(days));
    if (subjectId != null) q.set('subject_id', String(subjectId));
    return apiClient.get(`/performance/recent-days?${q.toString()}`, true);
  },

  /** GET /performance/practice-time-by-subject — summed time_taken (seconds→minutes) per subject. */
  getPracticeTimeBySubject: async (): Promise<PracticeTimeBySubjectResponse> => {
    return apiClient.get('/performance/practice-time-by-subject', true);
  },
};
