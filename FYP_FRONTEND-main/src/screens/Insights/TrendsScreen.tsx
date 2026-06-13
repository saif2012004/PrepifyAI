import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, BarChart2 } from 'lucide-react-native';
import { colors, radii } from '../../theme/colors';
import { subjectService, Subject } from '../../services/subjectService';
import { trendsService, SubjectTrendItem, TopicTrendItem } from '../../services/trendsService';

export default function TrendsScreen() {
  const router = useRouter();
  const [subjectTrends, setSubjectTrends] = useState<SubjectTrendItem[]>([]);
  const [topicTrends, setTopicTrends] = useState<TopicTrendItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filterSubjectId, setFilterSubjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, subs] = await Promise.all([
        trendsService.getSubjectTrends(),
        subjectService.getSubjects().catch(() => [] as Subject[]),
      ]);
      setSubjectTrends(st.items || []);
      setSubjects(subs);
      const topics = await trendsService.getTopicTrends(filterSubjectId ?? undefined);
      setTopicTrends(topics.items || []);
    } catch (e: unknown) {
      Alert.alert('Trends', e instanceof Error ? e.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [filterSubjectId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.5 }}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Past paper insights</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.lead}>
            Frequency of topics in uploaded past papers — helps you see exam emphasis.
          </Text>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/insights/topic-prediction' as never)}
            accessibilityRole="button"
            accessibilityLabel="Open topic forecast from past papers"
          >
            <Text style={styles.linkTxt}>Topic forecast (past papers) →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/insights/exam-topics' as never)}
            accessibilityRole="button"
            accessibilityLabel="Rank important topics from past papers"
          >
            <Text style={styles.linkTxt}>Important topics from past papers (ranked) →</Text>
          </TouchableOpacity>

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 32 }} />
          ) : (
            <>
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <BarChart2 size={20} color={colors.accent} />
                  <Text style={styles.cardTitle}>By subject</Text>
                </View>
                {subjectTrends.length === 0 ? (
                  <Text style={styles.muted}>No past-paper data yet.</Text>
                ) : (
                  subjectTrends.map((row) => (
                    <View key={row.subject} style={styles.metricRow}>
                      <Text style={styles.metricName}>{row.subject}</Text>
                      <Text style={styles.metricVal}>{row.question_count} questions</Text>
                    </View>
                  ))
                )}
              </View>

              <Text style={styles.filterLabel}>Filter topics by subject</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => setFilterSubjectId(null)}
                  style={[styles.chip, filterSubjectId === null && styles.chipOn]}
                >
                  <Text style={[styles.chipTxt, filterSubjectId === null && styles.chipTxtOn]}>
                    All
                  </Text>
                </TouchableOpacity>
                {subjects.map((s) => (
                  <TouchableOpacity
                    key={s.subject_id}
                    onPress={() => setFilterSubjectId(s.subject_id)}
                    style={[styles.chip, filterSubjectId === s.subject_id && styles.chipOn]}
                  >
                    <Text
                      style={[
                        styles.chipTxt,
                        filterSubjectId === s.subject_id && styles.chipTxtOn,
                      ]}
                      numberOfLines={1}
                    >
                      {s.subject_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Topic frequency</Text>
                {topicTrends.length === 0 ? (
                  <Text style={styles.muted}>No topics for this filter.</Text>
                ) : (
                  topicTrends.slice(0, 40).map((row, idx) => (
                    <View key={`${row.topic}-${idx}`} style={styles.metricRow}>
                      <Text style={styles.metricName} numberOfLines={2}>
                        {row.topic}
                      </Text>
                      <Text style={styles.metricVal}>{row.question_count}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  scroll: { padding: 20, paddingBottom: 48 },
  lead: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  linkRow: {
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkTxt: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  metricName: { flex: 1, color: colors.text, fontSize: 14 },
  metricVal: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  muted: { color: colors.textMuted, fontSize: 14 },
  filterLabel: {
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  chipTxt: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  chipTxtOn: { color: colors.text },
});
