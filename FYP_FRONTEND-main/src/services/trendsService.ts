import { apiClient } from './api';

export interface SubjectTrendItem {
  subject: string;
  question_count: number;
}

export interface TopicTrendItem {
  topic: string;
  question_count: number;
}

export const trendsService = {
  getSubjectTrends: async (): Promise<{ items: SubjectTrendItem[] }> => {
    return apiClient.get('/trends/past-paper/subject-trends', false);
  },

  getTopicTrends: async (subjectId?: number): Promise<{ items: TopicTrendItem[] }> => {
    const q =
      subjectId !== undefined
        ? `?subject_id=${encodeURIComponent(String(subjectId))}`
        : '';
    return apiClient.get(`/trends/past-paper/topic-trends${q}`, false);
  },
};
