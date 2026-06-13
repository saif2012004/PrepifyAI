import Constants from 'expo-constants';

/**
 * OAuth Web Client ID for Google (used on web + as server-side client reference).
 * Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env, or `expo.extra.googleClientId` in app config.
 */
export function getGoogleWebClientId(): string | undefined {
  const env = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (env) {
    return env;
  }
  const raw = (Constants.expoConfig?.extra as { googleClientId?: string } | undefined)
    ?.googleClientId;
  const id = raw?.replace(/^\/+/, '').trim();
  return id || undefined;
}
