import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './api';

const PENDING_ATTEMPTS_KEY = 'offline_sync_attempts_v1';

export type PendingSyncAttempt = {
  question_id: number;
  user_answer: string;
  time_taken?: number | null;
  score_percentage?: number | null;
  is_correct?: boolean | null;
  attempted_on?: string;
};

export interface SyncPullResponse {
  questions: unknown[];
  performances: unknown[];
  server_time: string;
}

async function readPending(): Promise<PendingSyncAttempt[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ATTEMPTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingSyncAttempt[]) : [];
  } catch {
    return [];
  }
}

async function writePending(list: PendingSyncAttempt[]): Promise<void> {
  await AsyncStorage.setItem(PENDING_ATTEMPTS_KEY, JSON.stringify(list));
}

export const syncService = {
  pull: async (since?: string): Promise<SyncPullResponse> => {
    const q = since ? `?since=${encodeURIComponent(since)}` : '';
    return apiClient.get(`/sync/pull${q}`, true);
  },

  push: async (attempts: PendingSyncAttempt[]): Promise<{ accepted: number }> => {
    return apiClient.post('/sync/push', { attempts }, true);
  },

  getPendingAttempts: readPending,

  getPendingCount: async (): Promise<number> => {
    const list = await readPending();
    return list.length;
  },

  /** Queue when submit fails (e.g. offline); server accepts nullable grading fields. */
  appendPendingAttempt: async (attempt: PendingSyncAttempt): Promise<void> => {
    const list = await readPending();
    list.push({
      ...attempt,
      attempted_on: attempt.attempted_on ?? new Date().toISOString(),
    });
    await writePending(list);
  },

  clearPending: async (): Promise<void> => {
    await AsyncStorage.removeItem(PENDING_ATTEMPTS_KEY);
  },

  /** Push all queued attempts; clears queue only if every row was accepted. */
  flushPendingAttempts: async (): Promise<{ accepted: number; total: number }> => {
    const attempts = await readPending();
    if (attempts.length === 0) return { accepted: 0, total: 0 };
    const res = await syncService.push(attempts);
    if (res.accepted === attempts.length) {
      await writePending([]);
    }
    return { accepted: res.accepted, total: attempts.length };
  },
};
