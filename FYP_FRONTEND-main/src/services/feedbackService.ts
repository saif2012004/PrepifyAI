import { apiClient } from './api';

export type FeedbackType = 'quality' | 'difficulty' | 'clarity' | 'error';

export type FeedbackSubmitParams = {
  question_id: number;
  feedback_type: FeedbackType;
  feedback_text?: string;
  rating?: number | null;
};

export type FeedbackRecord = {
  feedback_id: number;
  user_id: number;
  question_id: number;
  feedback_type: string;
  feedback_text: string | null;
  rating: number | null;
  is_resolved: boolean;
  submitted_on: string;
};

export type AppFeedbackCategory = 'general' | 'bug' | 'suggestion' | 'content' | 'other';

export type AppFeedbackRecord = {
  app_feedback_id: number;
  user_id: number;
  category: string | null;
  body: string;
  rating: number | null;
  submitted_on: string;
};

export const feedbackService = {
  submitApp: async (params: {
    body: string;
    category?: AppFeedbackCategory | null;
    rating?: number | null;
  }): Promise<AppFeedbackRecord> => {
    return apiClient.post(
      '/feedback/app',
      {
        body: params.body.trim(),
        category: params.category ?? undefined,
        rating: params.rating ?? undefined,
      },
      true
    );
  },

  listAppMine: async (limit: number = 15): Promise<AppFeedbackRecord[]> => {
    return apiClient.get(`/feedback/app/me?limit=${encodeURIComponent(String(limit))}`, true);
  },

  submit: async (params: FeedbackSubmitParams): Promise<FeedbackRecord> => {
    return apiClient.post(
      '/feedback',
      {
        question_id: params.question_id,
        feedback_type: params.feedback_type,
        feedback_text: params.feedback_text?.trim() || undefined,
        rating: params.rating ?? undefined,
      },
      true
    );
  },

  listMine: async (limit: number = 30): Promise<FeedbackRecord[]> => {
    return apiClient.get(`/feedback/me?limit=${encodeURIComponent(String(limit))}`, true);
  },
};
