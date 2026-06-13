import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import InputField from '../../components/InputField';
import PrimaryButton from '../../components/PrimaryButton';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import { emailDomainTypoHint } from '../../utils/emailHints';
import { colors, radii } from '../../theme/colors';

export default function RegisterScreen() {
  const router = useRouter();
  const { register, loginWithGoogle } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSuccess = (profile: {
    id?: string;
    sub?: string;
    name?: string;
    email?: string;
    picture?: string;
  }) => {
    loginWithGoogle(profile);
    router.replace('/(tabs)');
  };

  const handleRegister = async () => {
    const emailTrimmed = email.trim();
    if (!name || !emailTrimmed || !password || !confirmPassword) {
      Alert.alert('Missing fields', 'Please fill in all fields');
      return;
    }
    const typo = emailDomainTypoHint(emailTrimmed);
    if (typo) {
      Alert.alert('Check your email', typo);
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Both password fields must match.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await register(name, emailTrimmed, password);
      Alert.alert(
        'Registered successfully',
        'Your account is ready and you are signed in.',
        [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }]
      );
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Registration failed. Please try again.';
      Alert.alert('Could not register', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, '#1e1b4b', colors.bg]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brand}>
              <LinearGradient colors={[colors.primary, colors.gradientEnd]} style={styles.brandIcon}>
                <Sparkles color="#fff" size={28} />
              </LinearGradient>
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.subtitle}>Join PrepifyAI on your phone</Text>
            </View>

            <View style={styles.card}>
              <InputField
                label="Full name"
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                autoComplete="off"
                textContentType="none"
                appearance="dark"
              />

              <InputField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@gmail.com"
                keyboardType="email-address"
                autoComplete="off"
                textContentType="none"
                appearance="dark"
              />

              <InputField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                autoComplete="off"
                textContentType="none"
                appearance="dark"
              />

              <InputField
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat password"
                secureTextEntry
                autoComplete="off"
                textContentType="none"
                appearance="dark"
              />

              <View style={{ marginTop: 8 }}>
                <PrimaryButton
                  title="Create account"
                  onPress={handleRegister}
                  loading={loading}
                  color={colors.success}
                />
              </View>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <GoogleSignInButton onSuccess={handleGoogleSuccess} variant="dark" />

              <View style={styles.footer}>
                <Text style={styles.footerMuted}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
                  <Text style={styles.link}>Sign in</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 24,
    paddingBottom: 40,
  },
  brand: { alignItems: 'center', marginBottom: 24 },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  card: {
    backgroundColor: 'rgba(22,24,50,0.92)',
    borderRadius: radii.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: 14, color: colors.textSubtle, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' },
  footerMuted: { color: colors.textMuted, fontSize: 14 },
  link: { color: colors.accent, fontSize: 14, fontWeight: '700' },
});
