import { apiClient } from './api';
import { appendPdfToFormData, type PickedPdf } from './adminPdfForm';

/** Admin list row — includes catalog subject fields for spotting wrong assignments. */
export type AdminLibraryPdfItem = {
  book_id: number;
  subject_id: number;
  class_level: string;
  board: string;
  subject_name: string;
  title: string;
  original_filename: string;
  file_size_bytes: number | null;
  added_on: string | null;
};

/** Admin: register a student-facing textbook PDF (no question extraction). */
export async function uploadStudentBookPdf(params: {
  file: PickedPdf;
  class_level: string;
  board: string;
  subject_name: string;
  title?: string;
}): Promise<{ book_id: number; subject_id: number; title: string; original_filename: string }> {
  const fd = new FormData();
  appendPdfToFormData(fd, 'file', params.file);
  fd.append('class_level', params.class_level.trim());
  fd.append('board', params.board.trim());
  fd.append('subject_name', params.subject_name.trim());
  const t = (params.title ?? '').trim();
  if (t) {
    fd.append('title', t);
  }
  return apiClient.postFormData('/admin/books/library/upload', fd, true);
}

/** Admin: list library PDFs; omit subjectId to return every subject (cleanup view). */
export async function listAdminLibraryPdfs(subjectId?: number | null): Promise<AdminLibraryPdfItem[]> {
  const q =
    subjectId != null && subjectId !== undefined
      ? `?subject_id=${encodeURIComponent(String(subjectId))}`
      : '';
  return apiClient.get(`/admin/books/library${q}`, true);
}

/** Admin: update display title and which catalog subject owns this PDF. */
export async function updateLibraryBookMeta(
  bookId: number,
  body: { title: string; subject_id: number }
): Promise<{ book_id: number; subject_id: number; title: string; original_filename: string }> {
  return apiClient.patch(`/admin/books/library/${bookId}`, body, true);
}

/**
 * Admin: remove a library PDF from the catalog and delete the file on the server.
 * Tries POST …/delete first, then DELETE …/{id} for older APIs / proxies.
 */
export async function deleteLibraryBook(bookId: number): Promise<{ message: string; book_id: number }> {
  if (!Number.isFinite(bookId) || bookId < 1) {
    throw new Error('Invalid book id.');
  }
  try {
    return (await apiClient.post(`/admin/books/library/${bookId}/delete`, {}, true)) as {
      message: string;
      book_id: number;
    };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/401|403|409|sign in|credentials|administrator|Could not delete book record/i.test(m)) {
      throw e;
    }
    try {
      return (await apiClient.delete(`/admin/books/library/${bookId}`, true)) as {
        message: string;
        book_id: number;
      };
    } catch (e2) {
      const m2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`${m}\n\nFallback DELETE also failed:\n${m2}`);
    }
  }
}

