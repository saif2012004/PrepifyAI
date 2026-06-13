import * as FileSystem from 'expo-file-system/legacy';
import {
  listManagedPastPapers,
  listPastPaperQuestionsForPaper,
  type ManagedPastPaper,
  type PastPaperQuestionAdminItem,
} from './adminPastPaperService';
import { apiClient, FULL_API_URL } from './api';

export type PastPaperSummary = ManagedPastPaper;
export type PastPaperQuestionItem = PastPaperQuestionAdminItem;

export async function listPastPapersForSubject(subjectId: number): Promise<PastPaperSummary[]> {
  return listManagedPastPapers({ subject_id: subjectId });
}

export async function getPastPaperQuestions(paperId: number): Promise<PastPaperQuestionItem[]> {
  return listPastPaperQuestionsForPaper(paperId);
}

/** GET /past-papers/manage/{id}/brief — has_pdf without loading all questions. */
export async function getPastPaperBrief(paperId: number): Promise<{
  paper_id: number;
  has_pdf: boolean;
  is_published: boolean;
}> {
  return apiClient.get(`/past-papers/manage/${paperId}/brief`, true);
}

/**
 * Download the original past-paper PDF (Bearer auth). Embeddings are never in this file or endpoint.
 */
export async function downloadPastPaperPdfToCache(paperId: number): Promise<string> {
  const token = await apiClient.getToken();
  if (!token) {
    throw new Error('Sign in to open this past paper.');
  }
  const url = `${FULL_API_URL}/past-papers/manage/${paperId}/pdf`;
  const base = FileSystem.cacheDirectory;
  if (!base) {
    throw new Error('Cache directory is not available on this device.');
  }
  const dest = `${base}past-paper-${paperId}.pdf`;
  const result = await FileSystem.downloadAsync(url, dest, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.status !== 200) {
    throw new Error(`Download failed (${result.status})`);
  }
  return result.uri;
}
