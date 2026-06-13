import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const TOKEN_KEY = 'access_token';

type ConstantsExtras = {
  expoGoConfig?: { debuggerHost?: string };
  manifest?: { debuggerHost?: string; hostUri?: string };
  manifest2?: { extra?: { expoClient?: { debuggerHost?: string; hostUri?: string } } };
};

/** Host segment only (no scheme, path, or port). */
function parseHostnameFromEnv(raw: string): string {
  const s = raw.trim().replace(/^https?:\/\//i, '');
  const hostPart = s.split('/')[0]?.trim() || '';
  return hostPart.split(':')[0]?.trim() || '';
}

/**
 * Metro dev-server host hint (LAN). Used when `EXPO_PUBLIC_DEV_LAN_HOST` is unset on a physical Android device.
 */
function getDevMachineHost(): string | null {
  const C = Constants as typeof Constants & ConstantsExtras;
  const candidates: (string | undefined)[] = [
    Constants.expoConfig?.hostUri,
    C.expoGoConfig?.debuggerHost,
    C.manifest2?.extra?.expoClient?.debuggerHost,
    C.manifest2?.extra?.expoClient?.hostUri,
    C.manifest?.debuggerHost,
    C.manifest?.hostUri,
  ];

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const host = raw.split(':')[0]?.trim();
    if (host && host.length > 0) {
      return host;
    }
  }
  return null;
}

/**
 * True for Expo web and for any real browser tab (including Chrome on Android).
 * RN native sets `navigator.product === 'ReactNative'`; do not treat that as a browser.
 */
function isExpoOrDomWebRuntime(): boolean {
  if (Platform.OS === 'web') return true;
  if (typeof process !== 'undefined' && process.env?.EXPO_OS === 'web') return true;
  if (typeof window === 'undefined' || !window.location) return false;
  const proto = window.location.protocol;
  if (proto !== 'http:' && proto !== 'https:') return false;
  if (!window.location.hostname) return false;
  if (typeof navigator !== 'undefined' && (navigator as { product?: string }).product === 'ReactNative') {
    return false;
  }
  return true;
}

/** API port (`EXPO_PUBLIC_API_PORT`, default 8000). */
function getApiPort(): string {
  const p = process.env.EXPO_PUBLIC_API_PORT?.trim();
  return p && p.length > 0 ? p : '8000';
}

/**
 * Android emulator → dev PC (`EXPO_PUBLIC_ANDROID_EMULATOR_HOST`, default `10.0.2.2`).
 */
function getAndroidEmulatorApiHostname(): string {
  const fromEnv = process.env.EXPO_PUBLIC_ANDROID_EMULATOR_HOST?.trim();
  if (fromEnv) {
    const h = parseHostnameFromEnv(fromEnv);
    if (h) return h;
  }
  return '10.0.2.2';
}

/** When true, Android **emulator** uses the PC LAN hostname instead of rewriting to `10.0.2.2` (fixes some Windows/Hyper‑V NAT issues). */
function androidEmulatorUsesLanHost(): boolean {
  const v = process.env.EXPO_PUBLIC_ANDROID_EMULATOR_USE_LAN_HOST?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * LAN hostname for emulator when using LAN mode: `EXPO_PUBLIC_DEV_LAN_HOST`, else host from `EXPO_PUBLIC_API_BASE_URL`.
 */
function getLanHostnameForAndroidEmulator(): string | null {
  const lan = getDevLanHostname();
  if (lan) return lan;
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!base) return null;
  const h = parseHostnameFromEnv(base);
  return h || null;
}

/** Physical device: PC IPv4 (`EXPO_PUBLIC_DEV_LAN_HOST`). */
function getDevLanHostname(): string | null {
  const raw = process.env.EXPO_PUBLIC_DEV_LAN_HOST?.trim();
  if (!raw) return null;
  const h = parseHostnameFromEnv(raw);
  return h || null;
}

/** iOS Simulator (`EXPO_PUBLIC_IOS_SIMULATOR_API_HOST`, default `localhost`). */
function getIosSimulatorApiHostname(): string {
  const fromEnv = process.env.EXPO_PUBLIC_IOS_SIMULATOR_API_HOST?.trim();
  if (fromEnv) {
    const h = parseHostnameFromEnv(fromEnv);
    if (h) return h;
  }
  return 'localhost';
}

/**
 * If `EXPO_PUBLIC_API_PORT` is set, rewrite the origin port on `EXPO_PUBLIC_API_BASE_URL`
 * so the LAN URL and the port knob cannot drift (a common cause of emulator timeouts).
 */
function applyExpoPublicApiPortToOrigin(base: string): string {
  const trimmed = base.trim().replace(/\/$/, '');
  const port = process.env.EXPO_PUBLIC_API_PORT?.trim();
  if (!port) return trimmed;
  try {
    const u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    u.port = port;
    return u.origin;
  } catch {
    return trimmed;
  }
}

const getApiBaseUrl = (): string => {
  const port = getApiPort();

  // Web: same host as the page + API port (never hardcode LAN / emulator aliases in the browser).
  if (isExpoOrDomWebRuntime()) {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const h = window.location.hostname;
      if (h) {
        return `http://${h}:${port}`;
      }
    }
    return `http://localhost:${port}`;
  }

  if (process.env.EXPO_PUBLIC_API_BASE_URL?.trim()) {
    return applyExpoPublicApiPortToOrigin(process.env.EXPO_PUBLIC_API_BASE_URL.trim());
  }

  if (Platform.OS === 'android') {
    if (Constants.isDevice !== true) {
      if (androidEmulatorUsesLanHost()) {
        const lh = getLanHostnameForAndroidEmulator();
        if (lh) {
          return `http://${lh}:${port}`;
        }
      }
      return `http://${getAndroidEmulatorApiHostname()}:${port}`;
    }
    const lan = getDevLanHostname();
    if (lan) {
      return `http://${lan}:${port}`;
    }
    const metro = getDevMachineHost();
    if (metro) {
      const mh = metro.toLowerCase();
      if (mh !== 'localhost' && mh !== '127.0.0.1' && mh !== '0.0.0.0') {
        return `http://${metro.split(':')[0]}:${port}`;
      }
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[Dev] Physical Android: set EXPO_PUBLIC_DEV_LAN_HOST (or EXPO_PUBLIC_API_BASE_URL) to your PC IPv4. ' +
          'Using Android emulator host as fallback (wrong on a real phone).'
      );
    }
    return `http://${getAndroidEmulatorApiHostname()}:${port}`;
  }

  if (Platform.OS === 'ios') {
    if (Constants.isDevice !== true) {
      return `http://${getIosSimulatorApiHostname()}:${port}`;
    }
    const lan = getDevLanHostname();
    if (lan) {
      return `http://${lan}:${port}`;
    }
    return `http://${getIosSimulatorApiHostname()}:${port}`;
  }

  return `http://localhost:${port}`;
};

/**
 * Android emulator: rewrite LAN / loopback to `EXPO_PUBLIC_ANDROID_EMULATOR_HOST` (default `10.0.2.2`),
 * unless `EXPO_PUBLIC_ANDROID_EMULATOR_USE_LAN_HOST` is set — then keep `EXPO_PUBLIC_DEV_LAN_HOST` / base URL host.
 * Physical device: rewrite loopback / emulator alias to `EXPO_PUBLIC_DEV_LAN_HOST` when needed.
 */
function finalizeNativeApiBase(url: string): string {
  if (isExpoOrDomWebRuntime()) return url;
  if (Platform.OS !== 'android') return url;

  const emu = getAndroidEmulatorApiHostname();
  const emuLower = emu.toLowerCase();
  const lan = getDevLanHostname();

  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `http://${url}`;
    const u = new URL(normalized);
    const h = u.hostname.toLowerCase();

    if (Constants.isDevice === true) {
      const badForPhone =
        h === '127.0.0.1' ||
        h === 'localhost' ||
        h === '0.0.0.0' ||
        h === emuLower ||
        h === '10.0.2.2';
      if (lan && badForPhone && h !== lan.toLowerCase()) {
        u.hostname = lan;
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn(
            `[Dev] Physical Android: API host was ${h} → ${lan} (EXPO_PUBLIC_DEV_LAN_HOST / EXPO_PUBLIC_API_BASE_URL).`
          );
        }
        return u.origin;
      }
      return url;
    }

    if (androidEmulatorUsesLanHost()) {
      const lanEmulator = getLanHostnameForAndroidEmulator();
      if (lanEmulator) {
        const le = lanEmulator.toLowerCase();
        if (h === le) {
          return url;
        }
        const prev = h;
        u.hostname = lanEmulator;
        if (typeof __DEV__ !== 'undefined' && __DEV__ && prev !== le) {
          console.warn(
            `[Dev] Android emulator: API host ${prev} → ${lanEmulator} (EXPO_PUBLIC_ANDROID_EMULATOR_USE_LAN_HOST; avoids 10.0.2.2 NAT on some hosts).`
          );
        }
        return u.origin;
      }
    }

    if (h === emuLower) return url;
    const prev = h;
    u.hostname = emu;
    if (typeof __DEV__ !== 'undefined' && __DEV__ && prev !== emuLower) {
      console.warn(`[Dev] Android emulator: API host ${prev} → ${emu} (EXPO_PUBLIC_ANDROID_EMULATOR_HOST).`);
    }
    return u.origin;
  } catch {
    return url;
  }
}

const API_BASE_URL = finalizeNativeApiBase(getApiBaseUrl());
const API_PREFIX = process.env.EXPO_PUBLIC_API_PREFIX || '/api/v1';
export const FULL_API_URL = `${API_BASE_URL}${API_PREFIX}`;

console.log('Backend URL:', FULL_API_URL, '(Platform:', Platform.OS + ')');

function isLikelyNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return (
      m.includes('network request failed') ||
      m.includes('failed to fetch') ||
      m.includes('networkerror') ||
      m.includes('load failed') ||
      m.includes('connection refused')
    );
  }
  return false;
}

function networkFailureMessage(url: string): Error {
  const userSafe =
    "We couldn't reach the server. Check your internet connection and try again.";
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return new Error(userSafe);
  }
  const port = getApiPort();
  return new Error(
    `${userSafe}\n\n(Dev: cannot reach ${url})\n` +
      `• Start Docker (Postgres) and run the backend on your PC.\n` +
      `• Expo must use the same port as the backend (expected ${port}; see .env).\n` +
      `• On a real phone: same Wi‑Fi as the PC, set EXPO_PUBLIC_DEV_LAN_HOST to the PC’s IPv4.\n` +
      `• Android emulator: set EXPO_PUBLIC_ANDROID_EMULATOR_HOST (default 10.0.2.2).\n` +
      `• Allow the port in Windows Firewall.`
  );
}

async function requireAuthToken(): Promise<string> {
  const token = await apiClient.getToken();
  if (!token?.trim()) {
    throw new Error(
      'Not signed in. Log in first — for catalog changes use Admin login with an administrator account.'
    );
  }
  return token.trim();
}

async function apiFetch(
  endpoint: string,
  init: RequestInit,
  includeAuth: boolean,
  timeoutOverrideMs?: number
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (includeAuth) {
    const token = await requireAuthToken();
    headers.Authorization = `Bearer ${token}`;
  }
  const url = `${FULL_API_URL}${endpoint}`;
  const defaultTimeoutMs = Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS || 30000);
  const timeoutMs = timeoutOverrideMs ?? (Number.isFinite(defaultTimeoutMs) ? defaultTimeoutMs : 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 12000);
  try {
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (e) {
    if (isLikelyNetworkFailure(e)) {
      throw networkFailureMessage(url);
    }
    if (e instanceof Error && e.name === 'AbortError') {
      const hint =
        typeof __DEV__ !== 'undefined' && __DEV__
          ? `\n\n(Dev) Timeout usually means the device cannot reach your API. From FYP-Backend-main run:\n` +
            `  uvicorn app.main:app --reload --host 0.0.0.0 --port ${getApiPort()}\n` +
            `Match EXPO_PUBLIC_API_PORT / EXPO_PUBLIC_API_BASE_URL / EXPO_PUBLIC_DEV_LAN_HOST, start Postgres (docker compose), then retry.\n` +
            `• Android emulator: EXPO_PUBLIC_ANDROID_EMULATOR_HOST (default 10.0.2.2); if 10.0.2.2 times out on Windows, set EXPO_PUBLIC_ANDROID_EMULATOR_USE_LAN_HOST=true with EXPO_PUBLIC_DEV_LAN_HOST.\n` +
            `• Cleartext: app.json android.usesCleartextTraffic must stay true for http:// dev APIs.\n` +
            `• Physical Android: same Wi‑Fi as the PC; set EXPO_PUBLIC_DEV_LAN_HOST to the PC IPv4.`
          : '';
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}${hint}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const GENERIC_SERVER_ERROR = 'Something went wrong. Please try again in a moment.';

async function parseErrorResponse(response: Response): Promise<string> {
  const text = await response.text();
  const status = response.status;
  const devTag = (msg: string): string =>
    typeof __DEV__ !== 'undefined' && __DEV__ ? `[HTTP ${status}] ${msg}` : msg;
  if (!text) {
    return status >= 500 ? GENERIC_SERVER_ERROR : devTag(`Request failed (${status})`);
  }
  try {
    const data = JSON.parse(text) as { detail?: unknown; message?: string };
    if (typeof data.detail === 'string') {
      if (status === 401) {
        return devTag(data.detail + ' — sign in again (use Admin login for admin tools).');
      }
      if (status === 403) {
        return devTag(
          data.detail +
            ' This action needs an administrator account. Sign out, then use Admin login.'
        );
      }
      if (status >= 500 && data.detail === 'Internal Server Error') {
        return typeof __DEV__ !== 'undefined' && __DEV__
          ? devTag(`${GENERIC_SERVER_ERROR} (Dev: server returned 500 with no detail — check server logs.)`)
          : GENERIC_SERVER_ERROR;
      }
      return devTag(data.detail);
    }
    if (typeof data.message === 'string') {
      return devTag(data.message);
    }
    if (Array.isArray(data.detail)) {
      return devTag(
        data.detail
          .map((e: unknown) => {
            if (typeof e === 'object' && e !== null && 'msg' in e) {
              return String((e as { msg: string }).msg);
            }
            return typeof e === 'string' ? e : JSON.stringify(e);
          })
          .join(' ')
      );
    }
    return devTag(text.slice(0, 400));
  } catch {
    return devTag(text.slice(0, 280));
  }
}

export const apiClient = {
  getToken: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setToken: async (token: string): Promise<void> => {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  },

  removeToken: async (): Promise<void> => {
    await AsyncStorage.removeItem(TOKEN_KEY);
  },

  get: async (endpoint: string, includeAuth: boolean = false, timeoutMs?: number) => {
    const response = await apiFetch(endpoint, { method: 'GET' }, includeAuth, timeoutMs);
    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }
    return response.json();
  },

  post: async (endpoint: string, data: unknown, includeAuth: boolean = false) => {
    const response = await apiFetch(
      endpoint,
      { method: 'POST', body: JSON.stringify(data) },
      includeAuth
    );
    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }
    return response.json();
  },

  postWithTimeout: async (
    endpoint: string,
    data: unknown,
    timeoutMs: number,
    includeAuth: boolean = false
  ) => {
    const response = await apiFetch(
      endpoint,
      { method: 'POST', body: JSON.stringify(data) },
      includeAuth,
      timeoutMs
    );
    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }
    return response.json();
  },

  /**
   * multipart/form-data POST (e.g. past paper PDF upload). Do not set Content-Type manually.
   */
  postFormData: async (endpoint: string, formData: FormData, includeAuth: boolean = true) => {
    const headers: Record<string, string> = {};
    if (includeAuth) {
      const token = await requireAuthToken();
      headers.Authorization = `Bearer ${token}`;
    }
    const url = `${FULL_API_URL}${endpoint}`;
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', body: formData, headers });
    } catch (e) {
      if (isLikelyNetworkFailure(e)) {
        throw networkFailureMessage(url);
      }
      throw e;
    }
    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }
    return response.json();
  },

  patch: async (endpoint: string, data: unknown, includeAuth: boolean = false) => {
    const response = await apiFetch(
      endpoint,
      { method: 'PATCH', body: JSON.stringify(data ?? {}) },
      includeAuth
    );
    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  },

  put: async (endpoint: string, data: unknown, includeAuth: boolean = false) => {
    const response = await apiFetch(
      endpoint,
      { method: 'PUT', body: JSON.stringify(data) },
      includeAuth
    );
    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }
    return response.json();
  },

  delete: async (endpoint: string, includeAuth: boolean = false) => {
    const response = await apiFetch(endpoint, { method: 'DELETE' }, includeAuth);
    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }
    const text = await response.text();
    if (!text?.trim()) {
      return {} as Record<string, unknown>;
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  },
};
