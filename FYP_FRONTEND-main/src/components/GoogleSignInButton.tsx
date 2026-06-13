import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import { getGoogleWebClientId } from '../utils/googleAuth';
import { colors, radii } from '../theme/colors';

WebBrowser.maybeCompleteAuthSession();

/** Native (Expo Go) can use the Web client ID when no Android/iOS OAuth client is set yet. */
function getAndroidClientId(): string | undefined {
  const env = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
  if (env) {
    return env;
  }
  return getGoogleWebClientId();
}

function getIosClientId(): string | undefined {
  const env = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (env) {
    return env;
  }
  return getGoogleWebClientId();
}

export interface GoogleUserProfile {
  id?: string;
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
}

type Variant = 'dark' | 'light';

interface GoogleSignInButtonProps {
  onSuccess: (user: GoogleUserProfile) => void;
  variant?: Variant;
}

function hasGoogleOAuthConfig(): boolean {
  if (Platform.OS === 'web') {
    return !!getGoogleWebClientId();
  }
  if (Platform.OS === 'android') {
    return !!getAndroidClientId();
  }
  if (Platform.OS === 'ios') {
    return !!getIosClientId();
  }
  return !!getGoogleWebClientId();
}

function useGoogleAuthRequest(onSuccess: (user: GoogleUserProfile) => void) {
  const redirectUri = makeRedirectUri({
    scheme: 'prepifyai',
    path: 'redirect',
  });

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: getAndroidClientId(),
    iosClientId: getIosClientId(),
    webClientId: getGoogleWebClientId(),
    redirectUri,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.accessToken) {
        fetch('https://www.googleapis.com/userinfo/v2/me', {
          headers: { Authorization: `Bearer ${authentication.accessToken}` },
        })
          .then((res) => res.json())
          .then(onSuccess)
          .catch((err) => console.error('Google userinfo:', err));
      }
    } else if (response?.type === 'error') {
      console.error('Google OAuth:', response.error);
    }
  }, [response, onSuccess]);

  return { promptAsync, request };
}

function GoogleSignInButtonInner({
  onSuccess,
  variant,
}: {
  onSuccess: (user: GoogleUserProfile) => void;
  variant: Variant;
}) {
  const { promptAsync, request } = useGoogleAuthRequest(onSuccess);
  const s = variant === 'dark' ? darkStyles : lightStyles;

  return (
    <TouchableOpacity
      disabled={!request}
      onPress={() => promptAsync()}
      style={[s.btn, !request && s.btnDisabled]}
      activeOpacity={0.85}
    >
      {!request ? (
        <ActivityIndicator color={variant === 'dark' ? colors.primary : '#4285F4'} />
      ) : (
        <>
          <Text style={s.g}>G</Text>
          <Text style={s.label}>Continue with Google</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/**
 * Renders Google sign-in only when OAuth client IDs exist for this platform.
 */
export default function GoogleSignInButton({ onSuccess, variant = 'dark' }: GoogleSignInButtonProps) {
  if (!hasGoogleOAuthConfig()) {
    return (
      <View style={webHintStyles.wrap}>
        <Text style={webHintStyles.text}>
          Add expo.extra.googleClientId in app.json, or set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and optional
          Android/iOS client IDs) for Google sign-in.
        </Text>
      </View>
    );
  }

  return <GoogleSignInButtonInner onSuccess={onSuccess} variant={variant} />;
}

const darkStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  btnDisabled: { opacity: 0.6 },
  g: { fontSize: 18, fontWeight: '800', color: '#4285F4' },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
});

const lightStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    gap: 10,
  },
  btnDisabled: { opacity: 0.6 },
  g: { fontSize: 18, fontWeight: '800', color: '#4285F4' },
  label: { color: '#111827', fontSize: 16, fontWeight: '600' },
});

const webHintStyles = StyleSheet.create({
  wrap: { paddingVertical: 8 },
  text: { fontSize: 12, color: colors.textSubtle, textAlign: 'center' },
});
