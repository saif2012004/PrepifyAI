import React, { useCallback, useMemo, useState } from 'react';
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
import {
  Upload,
  CheckCircle,
  TrendingUp,
  Activity,
  BookOpen,
  Users,
  AlertTriangle,
  Clock,
  LogOut,
  Database,
  Library,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import {
  adminDashboardService,
  type AccuracyRunRow,
  type AdminDashboardSummary,
} from '../../services/adminDashboardService';

const quickActions = [
  {
    title: 'Manage catalog',
    description: 'Subjects & student PDFs (edit / delete)',
    icon: Database,
    color: '#0EA5E9',
    route: '/admin/manage',
  },
  {
    title: 'Users',
    description: 'List accounts & deactivate',
    icon: Users,
    color: '#6366F1',
    route: '/admin/users',
  },
  {
    title: 'Upload past papers',
    description: 'Extract questions from past papers',
    icon: Upload,
    color: '#3B82F6',
    route: '/admin/upload-papers',
  },
  {
    title: 'Upload student books',
    description: 'PDF library only (admin books)',
    icon: Library,
    color: '#10B981',
    route: '/admin/upload-books',
  },
  {
    title: 'Validate AI Content',
    description: 'Review generated questions',
    icon: CheckCircle,
    color: '#10B981',
    route: '/admin/validate',
  },
  {
    title: 'Monitor Accuracy',
    description: 'Track AI performance',
    icon: TrendingUp,
    color: '#8B5CF6',
    route: '/admin/monitor',
  },
  {
    title: 'System Health',
    description: 'Check system status',
    icon: Activity,
    color: '#EF4444',
    route: '/admin/system',
  },
];

function formatInt(n: number): string {
  return n.toLocaleString();
}

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [runs, setRuns] = useState<AccuracyRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    const [s, r] = await Promise.all([
      adminDashboardService.getSummary(),
      adminDashboardService.getAccuracyRuns(8),
    ]);
    setSummary(s);
    setRuns(r.items ?? []);
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
            setLoadErr(e instanceof Error ? e.message : String(e));
            setSummary(null);
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
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const stats = useMemo(() => {
    const s = summary;
    const avgPct =
      s?.avg_predictability_score != null
        ? `${(s.avg_predictability_score * 100).toFixed(1)}%`
        : '—';
    return [
      {
        label: 'Library PDFs',
        value: s != null ? formatInt(s.library_pdf_count) : '—',
        icon: BookOpen,
        color: '#3B82F6',
      },
      {
        label: 'Pending validations',
        value: s != null ? formatInt(s.pending_ai_questions) : '—',
        icon: AlertTriangle,
        color: '#F59E0B',
      },
      {
        label: 'Avg predictability',
        value: avgPct,
        icon: TrendingUp,
        color: '#10B981',
      },
      {
        label: 'Active students',
        value: s != null ? formatInt(s.active_users) : '—',
        icon: Users,
        color: '#8B5CF6',
      },
    ];
  }, [summary]);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          logout();
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.name}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <LogOut size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>

        {loadErr ? (
          <Text style={styles.bannerErr}>{loadErr}</Text>
        ) : null}

        {loading && !summary ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.loadingTxt}>Loading dashboard…</Text>
          </View>
        ) : null}

        <View style={styles.statsGrid}>
          {stats.map((stat, index) => (
            <View key={index} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: `${stat.color}15` }]}>
                <stat.icon size={24} color={stat.color} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {quickActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.actionCard, { borderLeftColor: action.color }]}
                onPress={() => router.push(action.route as never)}
              >
                <View style={[styles.actionIcon, { backgroundColor: `${action.color}15` }]}>
                  <action.icon size={20} color={action.color} />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionDescription}>{action.description}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent predictability runs</Text>
            <Clock size={18} color="#9CA3AF" />
          </View>
          <View style={styles.activityList}>
            {runs.length === 0 ? (
              <View style={styles.activityItem}>
                <Text style={styles.activityDetails}>
                  No evaluation runs yet. Use POST /predictions/accuracy/evaluate or open Monitor.
                </Text>
              </View>
            ) : (
              runs.map((r, idx) => (
                <View key={`${r.subject_id}-${r.exam_year}-${r.created_at ?? idx}`} style={styles.activityItem}>
                  <View style={styles.activityIcon}>
                    <TrendingUp size={16} color="#6B7280" />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityAction}>
                      Subject #{r.subject_id} · Year {r.exam_year ?? '—'}
                    </Text>
                    <Text style={styles.activityDetails}>
                      F1 {r.f1 != null ? `${(r.f1 * 100).toFixed(0)}%` : '—'} · P{' '}
                      {r.precision != null ? `${(r.precision * 100).toFixed(0)}%` : '—'} · R{' '}
                      {r.recall != null ? `${(r.recall * 100).toFixed(0)}%` : '—'}
                    </Text>
                    <Text style={styles.activityTime}>
                      {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
  },
  bannerErr: {
    marginHorizontal: 20,
    marginBottom: 8,
    color: '#B91C1C',
    fontSize: 13,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  loadingTxt: { color: '#6B7280', fontSize: 13 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  greeting: {
    fontSize: 14,
    color: '#6B7280',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 4,
  },
  logoutButton: {
    padding: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  actionsGrid: {
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionContent: {
    flex: 1,
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 12,
    color: '#6B7280',
  },
  activityList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
  },
  activityItem: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  activityDetails: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  activityTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
});
