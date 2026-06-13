import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '../src/context/AuthContext';
import AppErrorBoundary from '../src/components/AppErrorBoundary';
import OfflineSyncBridge from '../src/components/OfflineSyncBridge';
import '../global.css';

export default function RootLayout() {
  useFrameworkReady();

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <OfflineSyncBridge />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/login" />
          <Stack.Screen name="auth/register" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="dashboard/question-generator" />
          <Stack.Screen name="profile/edit" />
          <Stack.Screen name="performance/index" />
          <Stack.Screen name="admin" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="light" />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
