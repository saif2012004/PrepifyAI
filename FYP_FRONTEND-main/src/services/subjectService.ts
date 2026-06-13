import { apiClient } from './api';

/**
 * Subject data from backend
 */
export interface Subject {
  subject_id: number;
  class_level: string;
  board: string;
  subject_name: string;
  book_version: string;
}

/**
 * Subject filters
 */
export interface SubjectFilters {
  class_level?: string;
  board?: string;
}

/**
 * Subject Service - Handles subject-related API calls
 */
export const subjectService = {
  /**
   * List subjects. With no `filters`, returns every row (all boards and class levels).
   * Pass `class_level` and/or `board` only when you need a narrowed list.
   */
  /**
   * @param includeAuth When true (e.g. admin Manage catalog), the API returns the full subject list.
   *  Students should use false so miscatalogued board rows stay hidden.
   */
  getSubjects: async (filters?: SubjectFilters, includeAuth = false): Promise<Subject[]> => {
    const params = new URLSearchParams();

    if (filters?.class_level) {
      params.append('class_level', filters.class_level);
    }
    if (filters?.board) {
      params.append('board', filters.board);
    }

    const qs = params.toString();
    const path = qs ? `/subjects?${qs}` : '/subjects';
    const maxAttempts = 3;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await apiClient.get(path, includeAuth);
      } catch (e: unknown) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        const retryable =
          /timed out|timeout|network request failed|failed to fetch|cannot reach|connection refused|503|502/i.test(
            msg
          );
        if (!retryable || attempt === maxAttempts) break;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Could not load subjects');
  },

  /**
   * Get subject by ID
   */
  getSubject: async (subjectId: number): Promise<Subject> => {
    return await apiClient.get(`/subjects/${subjectId}`, false);
  },

  /**
   * Full catalog (same as `getSubjects()` with no filters).
   */
  getSubjectsForUser: async (): Promise<Subject[]> => {
    return subjectService.getSubjects();
  },
};

