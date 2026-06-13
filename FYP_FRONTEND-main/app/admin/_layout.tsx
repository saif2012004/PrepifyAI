import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, Redirect, usePathname } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/colors';

/**
 * Protects admin routes: only users with role admin (after Admin login) can access
 * dashboard, uploads, manage catalog, etc. Unauthenticated users go to /admin/login.
 */
export default function AdminLayout() {
  const { isLoading, isAuthenticated, isAdmin } = useAuth();
  const pathname = usePathname() ?? '';
  const atLogin = pathname.includes('/admin/login') || pathname.includes('admin/login');

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!atLogin && (!isAuthenticated || !isAdmin)) {
    return <Redirect href="/admin/login" />;
  }

  if (atLogin && isAuthenticated && isAdmin) {
    return <Redirect href="/admin/dashboard" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
});
