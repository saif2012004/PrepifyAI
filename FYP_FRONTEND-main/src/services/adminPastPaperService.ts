import { apiClient } from './api';
import { appendPdfToFormData, type PickedPdf } from './adminPdfForm';

export type { PickedPdf };

/** Admin/student list row — matches backend PastPaperSummary. */
export type ManagedPastPaper = {
  paper_id: number;
  subject_id: number;
  year: number;
  board: string;
  /** false = draft after upload; students only see published papers. */
  is_published?: boolean;
  /** Server stored a copy of the uploaded PDF for student viewing. */
  has_pdf?: boolean;
};

export type PastPaperQuestionAdminItem = {
  question_id: number;
  paper_id: number;
  question_text: string;
  question_type: string;
  topic?: string | null;
  marks?: number | null;
};

export type PastPaperQuestionUpdateBody = {
  question_text?: string;
  question_type?: string;
  topic?: string | null;
  marks?: number;
};

export type PastPaperUploadResult = {
  paper_id?: number;
  subject_id?: number;
  is_published?: boolean;
  total_questions?: number;
  mcqs?: number;
  short_questions?: number;
  long_questions?: number;
};

export type BulkPastPaperUploadResult = {
  uploaded_count: number;
  failed_count: number;
  results: Array<{
    filename?: string;
    status: string;
    paper_id?: number;
    total_questions?: number;
    is_published?: boolean;
    error?: string;
  }>;
};

/** Single PDF — POST /past-papers/upload (OCR + optional extracted questions). */
export async function uploadPastPaperPdf(params: {
  file: PickedPdf;
  class_level: string;
  board: string;
  subject_name: string;
  year: number;
  /** When true, paper is published so students see it under Past papers (same as Manage catalog → Publish). */
  publishForStudents?: boolean;
}): Promise<PastPaperUploadResult> {
  const fd = new FormData();
  appendPdfToFormData(fd, 'file', params.file);
  fd.append('class_level', params.class_level.trim());
  fd.append('board', params.board.trim());
  fd.append('subject_name', params.subject_name.trim());
  fd.append('year', String(params.year));
  fd.append('publish_for_students', params.publishForStudents ? 'true' : 'false');
  return apiClient.postFormData('/past-papers/upload', fd, true);
}

/**
 * Same PDF pipeline as student books: validate header, stream to disk, no extraction.
 * POST /past-papers/library/upload
 */
export async function uploadPastPaperPdfLibraryOnly(params: {
  file: PickedPdf;
  class_level: string;
  board: string;
  subject_name: string;
  year: number;
  publishForStudents?: boolean;
}): Promise<PastPaperUploadResult> {
  const fd = new FormData();
  appendPdfToFormData(fd, 'file', params.file);
  fd.append('class_level', params.class_level.trim());
  fd.append('board', params.board.trim());
  fd.append('subject_name', params.subject_name.trim());
  fd.append('year', String(params.year));
  fd.append('publish_for_students', params.publishForStudents ? 'true' : 'false');
  return apiClient.postFormData('/past-papers/library/upload', fd, true);
}

/** Multiple PDFs — same class/board/subject/year (e.g. several variants); POST /past-papers/upload-multiple */
export async function uploadPastPaperPdfs(params: {
  files: PickedPdf[];
  class_level: string;
  board: string;
  subject_name: string;
  year: number;
  publishForStudents?: boolean;
}): Promise<BulkPastPaperUploadResult> {
  if (!params.files.length) {
    throw new Error('Select at least one PDF');
  }
  const fd = new FormData();
  for (const f of params.files) {
    appendPdfToFormData(fd, 'files', f);
  }
  fd.append('class_level', params.class_level.trim());
  fd.append('board', params.board.trim());
  fd.append('subject_name', params.subject_name.trim());
  fd.append('year', String(params.year));
  fd.append('publish_for_students', params.publishForStudents ? 'true' : 'false');
  return apiClient.postFormData('/past-papers/upload-multiple', fd, true);
}

function qp(params: Record<string, string | number | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** GET /past-papers/manage — list papers (auth). */
export async function listManagedPastPapers(filters?: {
  subject_id?: number;
  year?: number;
}): Promise<ManagedPastPaper[]> {
  const q = qp({ subject_id: filters?.subject_id, year: filters?.year });
  return apiClient.get(`/past-papers/manage${q}`, true);
}

/** PUT /past-papers/manage/{id} — admin. */
export async function updateManagedPastPaper(
  paperId: number,
  body: { year?: number; board?: string; is_published?: boolean }
): Promise<ManagedPastPaper> {
  return apiClient.put(`/past-papers/manage/${paperId}`, body, true);
}

/**
 * Remove past paper (admin).
 * Tries POST …/delete first (new API), then DELETE …/{id} so older servers / strict proxies still work.
 */
export async function deleteManagedPastPaper(paperId: number): Promise<{ message?: string } | unknown> {
  if (!Number.isFinite(paperId) || paperId < 1) {
    throw new Error('Invalid past paper id.');
  }
  try {
    return await apiClient.post(`/past-papers/manage/${paperId}/delete`, {}, true);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (
      /401|403|409|sign in|credentials|administrator|Could not delete this past paper|references it/i.test(m)
    ) {
      throw e;
    }
    try {
      return await apiClient.delete(`/past-papers/manage/${paperId}`, true);
    } catch (e2) {
      const m2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`${m}\n\nFallback DELETE also failed:\n${m2}`);
    }
  }
}

/** GET /past-paper-questions?paper_id= — auth. */
export async function listPastPaperQuestionsForPaper(paperId: number): Promise<PastPaperQuestionAdminItem[]> {
  const q = qp({ paper_id: paperId });
  return apiClient.get(`/past-paper-questions${q}`, true);
}

/** PUT /past-paper-questions/{id} — admin. */
export async function updatePastPaperQuestion(
  questionId: number,
  body: PastPaperQuestionUpdateBody
): Promise<unknown> {
  return apiClient.put(`/past-paper-questions/${questionId}`, body, true);
}

/** DELETE /past-paper-questions/{id} — admin. */
export async function deletePastPaperQuestion(questionId: number): Promise<unknown> {
  return apiClient.delete(`/past-paper-questions/${questionId}`, true);
}
