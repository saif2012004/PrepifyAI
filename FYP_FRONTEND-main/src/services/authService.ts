import { apiClient } from './api';

/** Auth requests use a shorter ceiling than heavy API calls so sign-in fails fast on bad host/firewall. */
const authRequestTimeoutMs = (): number => {
  const n = Number(process.env.EXPO_PUBLIC_AUTH_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 45000;
};

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Registration data
 */
export interface RegisterData {
  name: string;
  email: string;
  password: string;
  role: 'student' | 'admin';
  class_level?: string;  // For students: "9", "10", "11", or "12"
}

/**
 * User data from backend
 */
export interface User {
  user_id: number;
  name: string;
  email: string;
  role: string;
  class_level?: string;
  created_at: string;
}

/**
 * Login / register response from backend (token + profile in one payload).
 */
export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

/**
 * Auth Service - Handles authentication with backend
 */
export const authService = {
  /**
   * Login user and store token
   */
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const timeoutMs = authRequestTimeoutMs();
    const maxAttempts = 2;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = (await apiClient.postWithTimeout(
          '/auth/login',
          credentials,
          timeoutMs,
          false
        )) as LoginResponse;
        if (response.access_token) {
          await apiClient.setToken(response.access_token);
        }
        return response;
      } catch (e: unknown) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (/incorrect email|401|unauthor/i.test(msg)) break;
        const timedOut = /timed out|Request timed out|timeout/i.test(msg);
        const retryable =
          timedOut ||
          /\b502\b|\b503\b|connection refused|failed to fetch|network request failed|cannot reach/i.test(msg);
        if (!retryable || attempt === maxAttempts) break;
        await new Promise((r) => setTimeout(r, 500 + 450 * attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Login failed');
  },

  /**
   * Register new user (returns token + user — no separate login call).
   */
  register: async (data: RegisterData): Promise<LoginResponse> => {
    const response = (await apiClient.postWithTimeout(
      '/auth/register',
      data,
      authRequestTimeoutMs(),
      false
    )) as LoginResponse;
    if (response.access_token) {
      await apiClient.setToken(response.access_token);
    }
    return response;
  },

  /**
   * Logout user and remove token
   */
  logout: async (): Promise<void> => {
    try {
      // Try to call backend logout endpoint
      await apiClient.post('/auth/logout', {}, true);
    } catch (error) {
      console.error('Logout error:', error);
      // Continue anyway - we'll remove the token
    } finally {
      // Always remove the token from storage
      await apiClient.removeToken();
    }
  },

  /**
   * Get current authenticated user (first call after app open may wait on cold DB / server — avoid 12s false timeouts).
   */
  getCurrentUser: async (timeoutMs?: number): Promise<User> => {
    const floor = Math.max(authRequestTimeoutMs(), 30000);
    const t =
      timeoutMs != null && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : floor;
    return await apiClient.get('/users/me', true, t);
  },

  /**
   * Update current user profile
   */
  updateUser: async (updates: Partial<User>): Promise<User> => {
    return await apiClient.put('/users/me', updates, true);
  },

  /**
   * Refresh access token
   */
  refreshToken: async (): Promise<LoginResponse> => {
    const response = await apiClient.post('/auth/refresh-token', {}, true);
    
    // Update stored token
    if (response.access_token) {
      await apiClient.setToken(response.access_token);
    }
    
    return response;
  },

  /**
   * Check if user has a valid token
   */
  hasToken: async (): Promise<boolean> => {
    const token = await apiClient.getToken();
    return !!token;
  },
};
