import { apiClient } from './api';

export type AdminDashboardSummary = {
  pending_ai_questions: number;
  generated_questions_total: number;
  generated_questions_approved: number;
  approval_rate_percent: number | null;
  total_users: number;
  active_users: number;
  library_pdf_count: number;
  avg_predictability_score: number | null;
};

export type PredictionServiceStatus = {
  status: string;
  available_classes: string[];
  device: string;
  models_loaded: number;
  prediction_mode: string;
};

export type AccuracyRunRow = {
  subject_id: number;
  exam_year: number | null;
  predictability_score: number | null;
  created_at: string | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  historical_paper_count: number | null;
  target_paper_id: number | null;
};

export const adminDashboardService = {
  getSummary: (): Promise<AdminDashboardSummary> =>
    apiClient.get('/admin/dashboard/summary', true),

  getPredictionStatus: (): Promise<PredictionServiceStatus> =>
    apiClient.get('/predictions/status', true),

  getAccuracyRuns: (limit = 40): Promise<{ items: AccuracyRunRow[] }> =>
    apiClient.get(`/predictions/accuracy/runs?limit=${limit}`, true),
};
