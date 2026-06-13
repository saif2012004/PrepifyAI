import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Activity, Cpu, Target, ListOrdered } from 'lucide-react-native';
import {
  adminDashboardService,
  type AccuracyRunRow,
  type PredictionServiceStatus,
} from '../../services/adminDashboardService';
import { subjectService, type Subject } from '../../services/subjectService';

function avgF1(rows: AccuracyRunRow[]): number | null {
  const vals = rows.map((r) => r.f1).filter((x): x is number => typeof x === 'number' && !Number.isNaN(x));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export default function MonitorAccuracyScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<PredictionServiceStatus | null>(null);
  const [runs, setRuns] = useState<AccuracyRunRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const subjectName = useCallback(
    (id: number) => subjects.find((s) => s.subject_id === id)?.subject_name ?? `Subject #${id}`,
    [subjects]
  );

  const load = useCallback(async () => {
    setErr(null);
    const [st, runData, subj] = await Promise.all([
      adminDashboardService.getPredictionStatus(),
      adminDashboardService.getAccuracyRuns(50),
      subjectService.getSubjects(undefined, true),
    ]);
    setStatus(st);
    setRuns(runData.items ?? []);
    setSubjects(subj ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          await load();
        } catch (e) {
          if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
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
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const meanF1 = useMemo(() => avgF1(runs), [runs]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.push('/admin/dashboard');
  };

  const statCards = [
    {
      label: 'Service',
      value: status?.status ?? '—',
      sub: status?.prediction_mode?.replace(/_/g, ' ') ?? '',
      icon: Activity,
      color: '#3B82F6',
    },
    {
      label: 'Models loaded',
      value: status != null ? String(status.models_loaded) : '—',
      sub: status?.device ?? '',
      icon: Cpu,
      color: '#8B5CF6',
    },
    {
      label: 'Avg F1 (runs)',
      value: meanF1 != null ? `${(meanF1 * 100).toFixed(1)}%` : '—',
      sub: runs.length ? `${runs.length} evaluations` : 'No runs yet',
      icon: Target,
      color: '#10B981',
    },
    {
      label: 'Classes',
      value:
        status?.available_classes?.length != null
          ? String(status.available_classes.length)
          : '—',
      sub: (status?.available_classes ?? []).slice(0, 3).join(', ') || '—',
      icon: ListOrdered,
      color: '#F59E0B',
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Monitor accuracy</Text>
          <View style={styles.placeholder} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : err ? (
          <ScrollView contentContainerStyle={styles.center}>
            <Text style={styles.errText}>{err}</Text>
            <TouchableOpacity style={styles.retry} onPress={onRefresh}>
              <Text style={styles.retryTxt}>Retry</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <ScrollView
            style={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>Prediction engine</Text>
            <View style={styles.statsGrid}>
              {statCards.map((stat, index) => (
                <View key={index} style={styles.statCard}>
                  <View style={[styles.statIconContainer, { backgroundColor: `${stat.color}15` }]}>
                    <stat.icon size={24} color={stat.color} />
                  </View>
                  <Text style={styles.statValue} numberOfLines={2}>
                    {stat.value}
                  </Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                  {!!stat.sub && <Text style={styles.statSub}>{stat.sub}</Text>}
                </View>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Recent predictability runs</Text>
            <Text style={styles.hint}>
              Admin: POST /predictions/accuracy/evaluate records overlap (F1) between historical
              forecasts and a target paper. Rows appear below after evaluations.
            </Text>

            {runs.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No evaluation runs in the database yet.</Text>
              </View>
            ) : (
              <View style={styles.card}>
                {runs.map((r, i) => (
                  <View
                    key={`${r.subject_id}-${r.exam_year}-${r.created_at ?? i}`}
                    style={[styles.row, i < runs.length - 1 && styles.rowBorder]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{subjectName(r.subject_id)}</Text>
                      <Text style={styles.rowMeta}>
                        Year {r.exam_year ?? '—'} · paper #{r.target_paper_id ?? '—'}
                      </Text>
                      {r.created_at && (
                        <Text style={styles.rowTime}>{new Date(r.created_at).toLocaleString()}</Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.f1}>
                        {r.f1 != null ? `${(r.f1 * 100).toFixed(0)}%` : '—'}
                      </Text>
                      <Text style={styles.pr}>
                        P {r.precision != null ? (r.precision * 100).toFixed(0) : '—'} · R{' '}
                        {r.recall != null ? (r.recall * 100).toFixed(0) : '—'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { width: 40 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  placeholder: { width: 40 },
  content: { flex: 1, padding: 20 },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errText: { color: '#B91C1C', textAlign: 'center', marginBottom: 12 },
  retry: { backgroundColor: '#111827', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryTxt: { color: '#FFF', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  hint: { fontSize: 12, color: '#6B7280', marginBottom: 12, lineHeight: 18 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  statSub: { fontSize: 11, color: '#9CA3AF' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 8 },
  emptyCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyText: { color: '#6B7280', fontSize: 14 },
  row: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowMeta: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  rowTime: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  f1: { fontSize: 16, fontWeight: '700', color: '#059669' },
  pr: { fontSize: 11, color: '#6B7280', marginTop: 4 },
});
