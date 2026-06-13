import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, UserX } from 'lucide-react-native';
import { apiClient } from '../../services/api';

type UserRow = {
  user_id: number;
  name: string;
  email: string;
  role: string;
  class_level?: string | null;
  is_active?: number;
};

export default function AdminUsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const rows = (await apiClient.get('/users?limit=200&skip=0', true)) as UserRow[];
    setUsers(Array.isArray(rows) ? rows : []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          await load();
        } catch (e) {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : String(e);
            Alert.alert('Users', msg);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Users', msg);
    } finally {
      setRefreshing(false);
    }
  };

  const deactivate = (u: UserRow) => {
    if (u.is_active === 0) {
      Alert.alert('Already inactive', `${u.email} is already deactivated.`);
      return;
    }
    Alert.alert(
      'Deactivate user',
      `Deactivate ${u.name} (${u.email})? They will no longer be able to sign in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            setActingId(u.user_id);
            try {
              await apiClient.delete(`/users/${u.user_id}`, true);
              await load();
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              Alert.alert('Error', msg);
            } finally {
              setActingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin/dashboard'))}
          style={styles.back}
        >
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Users</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView
          scrollEnabled={users.length > 0}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={users.length === 0 ? styles.emptyWrap : styles.list}
        >
          {users.length === 0 ? (
            <Text style={styles.empty}>No users returned.</Text>
          ) : (
            users.map((u) => (
              <View key={u.user_id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{u.name}</Text>
                  <Text style={styles.email}>{u.email}</Text>
                  <Text style={styles.meta}>
                    {u.role}
                    {u.class_level ? ` · Class ${u.class_level}` : ''}
                    {u.is_active === 0 ? ' · Inactive' : ''}
                  </Text>
                </View>
                {u.is_active !== 0 && (
                  <TouchableOpacity
                    style={styles.deact}
                    disabled={actingId === u.user_id}
                    onPress={() => deactivate(u)}
                  >
                    {actingId === u.user_id ? (
                      <ActivityIndicator color="#B91C1C" />
                    ) : (
                      <UserX size={20} color="#B91C1C" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  back: { width: 40 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  empty: { color: '#6B7280', fontSize: 15 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  name: { fontSize: 16, fontWeight: '600', color: '#111827' },
  email: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  meta: { fontSize: 12, color: '#9CA3AF', marginTop: 6 },
  deact: { padding: 8, marginLeft: 8 },
});
