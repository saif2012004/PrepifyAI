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
import { useRouter } from 'expo-router';
import { Shield } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import InputField from '../../components/InputField';
import PrimaryButton from '../../components/PrimaryButton';
import { FadeIn } from '../../components/animated';

export default function AdminLoginScreen() {
  const router = useRouter();
  const { loginAdmin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await loginAdmin(email, password);
      router.replace('/admin/dashboard');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Login failed';
      // Show the actual reason (wrong password vs role mismatch vs network).
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <FadeIn delay={60} direction="down" distance={20}>
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Shield size={48} color="#2563EB" strokeWidth={2} />
              </View>
              <Text style={styles.title}>Admin Login</Text>
              <Text style={styles.subtitle}>
                Sign in to access the admin panel
              </Text>
            </View>
          </FadeIn>

          {/* Form */}
          <FadeIn delay={180} direction="up" distance={22} style={styles.form}>
            <InputField
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="admin@prepifyai.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <InputField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
            />

            <PrimaryButton
              title={loading ? 'Signing in...' : 'Sign In'}
              onPress={handleLogin}
              disabled={loading}
            />
          </FadeIn>

          {/* Development Info */}
          <View style={styles.devInfo}>
            <Text style={styles.devInfoTitle}>Development Credentials:</Text>
            <Text style={styles.devInfoText}>Email: admin@prepifyai.com</Text>
            <Text style={styles.devInfoText}>Password: admin123</Text>
          </View>

          {/* Back to Student Login */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>
              ← Back to Student Login
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  form: {
    gap: 20,
    marginBottom: 24,
  },
  devInfo: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  devInfoTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  devInfoText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  backButton: {
    padding: 16,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '600',
  },
});

