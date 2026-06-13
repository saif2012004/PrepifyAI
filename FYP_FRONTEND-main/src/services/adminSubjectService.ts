import { apiClient } from './api';
import type { Subject } from './subjectService';

export interface SubjectCreatePayload {
  class_level: string;
  board: string;
  subject_name: string;
  book_version: string;
}

export interface SubjectUpdatePayload {
  class_level?: string;
  board?: string;
  subject_name?: string;
  book_version?: string;
}

/** Admin CRUD for catalog subjects (requires JWT with admin role). */
export const adminSubjectService = {
  create: async (body: SubjectCreatePayload): Promise<Subject> => {
    return apiClient.post('/subjects/', body, true);
  },

  update: async (subjectId: number, body: SubjectUpdatePayload): Promise<Subject> => {
    return apiClient.put(`/subjects/${subjectId}`, body, true);
  },

  remove: async (subjectId: number): Promise<{ message: string }> => {
    return apiClient.delete(`/subjects/${subjectId}`, true) as Promise<{ message: string }>;
  },
};
