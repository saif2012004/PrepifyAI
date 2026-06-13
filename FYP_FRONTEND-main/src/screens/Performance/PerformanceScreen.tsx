import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  TrendingUp,
  Target,
  Clock,
  BookMarked,
  Sparkles,
  Brain,
  ChevronRight,
} from 'lucide-react-native';
import { colors, radii } from '../../theme/colors';
import {
  performanceService,
  PerformanceSummary,
  TopicPerformanceRow,
  DailyPerformanceRow,
} from '../../services/performanceService';
import { subjectService, Subject } from '../../services/subjectService';

/** Shown when performance is tied to a subject row not in the student catalog — no internal IDs exposed. */
const OTHER_SUBJECT_LABEL = 'Other subject';

export default function PerformanceScreen() {
  const router = useRouter();
  const [data, setData] = useState<PerformanceSummary | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedClassLevel, setSelectedClassLevel] = useState<string | null>(null);
  const [topicSubjectId, setTopicSubjectId] = useState<number | null>(null);
  const [topics, setTopics] = useState<TopicPerformanceRow[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentDays, setRecentDays] = useState<DailyPerformanceRow[]>([]);
  /** Subject IDs from performance that aren’t in the filtered catalog — resolved via GET /subjects/{id} */
  const [resolvedSubjectMeta, setResolvedSubjectMeta] = useState<
    Record<number, { name: string; classLevel: string }>
  >({});

  const loadSummary = useCallback(async () => {
    setError(null);
    try {
      const s = await performanceService.getSummary();
      setData(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load performance');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSubjects = useCallback(async () => {
    try {
      const list = await subjectService.getSubjects();
      setSubjects(list);
      setSelectedClassLevel((prev) => {
        if (prev) return prev;
        return list.length ? String(list[0].class_level) : null;
      });
    } catch {
      setSubjects([]);
      setSelectedClassLevel(null);
    }
  }, []);

  const loadTopics = useCallback(async (subjectId: number) => {
    setTopicsLoading(true);
    try {
      const res = await performanceService.getByTopic(subjectId);
      setTopics(res.topics || []);
    } catch {
      setTopics([]);
    } finally {
      setTopicsLoading(false);
    }
  }, []);

  const loadRecentDays = useCallback(async () => {
    try {
      const r = await performanceService.getRecentDays(7);
      setRecentDays(r.days ?? []);
    } catch {
      setRecentDays([]);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadSummary(), loadSubjects(), loadRecentDays()]);
  }, [loadSummary, loadSubjects, loadRecentDays]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (topicSubjectId != null) {
      loadTopics(topicSubjectId);
    } else {
      setTopics([]);
    }
  }, [topicSubjectId, loadTopics]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    if (topicSubjectId != null) await loadTopics(topicSubjectId);
    setRefreshing(false);
  }, [loadAll, loadTopics, topicSubjectId]);

  const trendColor =
    data?.recent_trend === 'improving'
      ? colors.success
      : data?.recent_trend === 'declining'
        ? colors.danger
        : colors.warning;

  const classLevels = Array.from(new Set(subjects.map((s) => String(s.class_level)))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
  const subjectsForClass = subjects.filter((s) =>
    selectedClassLevel ? String(s.class_level) === selectedClassLevel : true
  );

  useEffect(() => {
    if (!classLevels.length) {
      if (selectedClassLevel !== null) setSelectedClassLevel(null);
      return;
    }
    if (!selectedClassLevel || !classLevels.includes(selectedClassLevel)) {
      setSelectedClassLevel(classLevels[0]);
    }
  }, [classLevels, selectedClassLevel]);

  useEffect(() => {
    if (!subjectsForClass.length) {
      if (topicSubjectId !== null) setTopicSubjectId(null);
      return;
    }
    const exists = topicSubjectId != null && subjectsForClass.some((s) => s.subject_id === topicSubjectId);
    if (!exists) {
      setTopicSubjectId(subjectsForClass[0].subject_id);
    }
  }, [subjectsForClass, topicSubjectId]);

  /** API returns subject_wise_performance keyed by subject_id (e.g. "1", "26"), not by name. */
  const subjectMetaById = useMemo(
    () =>
      subjects.reduce<Record<number, { name: string; classLevel: string }>>((acc, s) => {
        const id = s.subject_id;
        if (id == null || Number.isNaN(Number(id))) return acc;
        acc[Number(id)] = {
          name: (s.subject_name || '').trim() || OTHER_SUBJECT_LABEL,
          classLevel: String(s.class_level || '').trim(),
        };
        return acc;
      }, {}),
    [subjects]
  );

  useEffect(() => {
    if (!data?.subject_wise_performance) return;
    const ids = Object.keys(data.subject_wise_performance)
      .map((k) => Number.parseInt(k, 10))
      .filter((n) => Number.isFinite(n));
    const missing = ids.filter((id) => !subjectMetaById[id] && !resolvedSubjectMeta[id]);
    if (!missing.length) return;

    let cancelled = false;
    void (async () => {
      const next: Record<number, { name: string; classLevel: string }> = {};
      await Promise.all(
        missing.map(async (id) => {
          try {
            const s = await subjectService.getSubject(id);
            if (!cancelled) {
              next[id] = {
                name: (s.subject_name || '').trim() || OTHER_SUBJECT_LABEL,
                classLevel: String(s.class_level || '').trim(),
              };
            }
          } catch {
            /* keep fallback label */
          }
        })
      );
      if (!cancelled && Object.keys(next).length) {
        setResolvedSubjectMeta((prev) => ({ ...prev, ...next }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data?.subject_wise_performance, subjectMetaById, resolvedSubjectMeta]);

  const metaForSubjectId = (id: number): { name: string; classLevel: string } | undefined =>
    subjectMetaById[id] ?? resolvedSubjectMeta[id];

  const hasTopicSignals = data ? data.strong_topics.length > 0 || data.weak_topics.length > 0 : false;
  const strongCount = data?.strong_topics.length ?? 0;
  const weakCount = data?.weak_topics.length ?? 0;
  const fallbackFocusTopics = [...topics]
    .filter((t) => t.attempts > 0 && t.accuracy < 75)
    .sort((a, b) => a.accuracy - b.accuracy || a.attempts - b.attempts)
    .slice(0, 4)
    .map((t) => t.topic_name);
  const effectiveFocusTopics =
    (data?.weak_topics?.length ?? 0) > 0 ? data!.weak_topics : fallbackFocusTopics;

  const sortedTopics = useMemo(() => {
    return [...topics].sort((a, b) => {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return b.attempts - a.attempts;
    });
  }, [topics]);

  const last7DaysSeries = useMemo(() => {
    const keys: string[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const x = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      keys.push(x.toISOString().slice(0, 10));
    }
    const map = new Map(recentDays.map((d) => [d.date.slice(0, 10), d]));
    return keys.map((date) => {
      const hit = map.get(date);
      return (
        hit ?? {
          date,
          attempts: 0,
          correct: 0,
          accuracy_percentage: 0,
        }
      );
    });
  }, [recentDays]);

  const maxDayAttempts = useMemo(() => {
    const m = Math.max(...last7DaysSeries.map((d) => d.attempts), 0);
    return m > 0 ? m : 1;
  }, [last7DaysSeries]);

  const selectedSubjectRow = useMemo(
    () => subjects.find((s) => s.subject_id === topicSubjectId),
    [subjects, topicSubjectId]
  );

  const openPracticeForTopic = (topicName: string) => {
    const sub = selectedSubjectRow;
    if (!sub) {
      Alert.alert('Subject', 'Pick a subject above first.');
      return;
    }
    router.push({
      pathname: '/prepare-with-ai/practice-setup',
      params: {
        subjectId: String(sub.subject_id),
        subjectName: sub.subject_name,
        board: sub.board,
        classLevel: String(sub.class_level),
        practiceTopic: topicName,
      },
    } as never);
  };

  const openAdaptiveForSelection = () => {
    if (topicSubjectId == null) {
      router.push('/adaptive/next' as never);
      return;
    }
    router.push({
      pathname: '/adaptive/next',
      params: { subjectId: String(topicSubjectId) },
    } as never);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Performance</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
          }
        >
          {loading && !data ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.muted}>Loading your stats…</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.card}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={loadAll} style={styles.retry}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {data ? (
            <>
              <View style={styles.heroCard}>
                <Text style={styles.heroLabel}>Accuracy</Text>
                <Text style={styles.heroValue}>
                  {data.accuracy_percentage.toFixed(1)}%
                </Text>
                <View style={styles.heroRow}>
                  <View style={styles.miniStat}>
                    <Target size={18} color={colors.accent} />
                    <Text style={styles.miniVal}>{data.total_attempts}</Text>
                    <Text style={styles.miniLbl}>Attempts</Text>
                  </View>
                  <View style={styles.miniStat}>
                    <TrendingUp size={18} color={colors.success} />
                    <Text style={styles.miniVal}>{data.correct_answers}</Text>
                    <Text style={styles.miniLbl}>Correct</Text>
                  </View>
                  <View style={styles.miniStat}>
                    <Clock size={18} color={colors.warning} />
                    <Text style={styles.miniVal}>
                      {data.average_time != null ? `${data.average_time.toFixed(0)}s` : '—'}
                    </Text>
                    <Text style={styles.miniLbl}>Avg time</Text>
                  </View>
                </View>
                <View style={[styles.trendPill, { borderColor: trendColor + '55' }]}>
                  <Text style={[styles.trendText, { color: trendColor }]}>
                    Trend: {data.recent_trend}
                  </Text>
                </View>
              </View>

              {data.total_attempts === 0 ? (
                <View style={styles.ctaCard}>
                  <Text style={styles.ctaTitle}>No attempts yet</Text>
                  <Text style={styles.ctaBody}>
                    Your accuracy, topics, and trends appear here after you answer questions in Prepare with AI or Smart
                    practice.
                  </Text>
                  <TouchableOpacity
                    style={styles.ctaPrimary}
                    onPress={() => router.push('/prepare-with-ai' as never)}
                    activeOpacity={0.88}
                  >
                    <Brain size={20} color="#fff" />
                    <Text style={styles.ctaPrimaryTxt}>Prepare with AI</Text>
                    <ChevronRight size={18} color="rgba(255,255,255,0.9)" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.ctaSecondary}
                    onPress={() => router.push('/adaptive/next' as never)}
                    activeOpacity={0.88}
                  >
                    <Sparkles size={20} color={colors.accent} />
                    <Text style={styles.ctaSecondaryTxt}>Smart practice</Text>
                    <ChevronRight size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Last 7 days</Text>
                  <Text style={styles.sectionHint}>
                    Bar height is how many questions you attempted each day (UTC). Tap a focus topic below to practice
                    it with AI.
                  </Text>
                  <View style={styles.card}>
                    <View style={styles.dayChartRow}>
                      {last7DaysSeries.map((d) => {
                        const h = Math.round((d.attempts / maxDayAttempts) * 100);
                        const label = d.date.slice(5).replace('-', '/');
                        return (
                          <View key={d.date} style={styles.dayCol}>
                            <View style={styles.dayBarTrack}>
                              <View style={[styles.dayBarFill, { height: `${Math.max(4, h)}%` }]} />
                            </View>
                            <Text style={styles.dayColMeta} numberOfLines={1}>
                              {label}
                            </Text>
                            <Text style={styles.dayColAttempts}>{d.attempts}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </>
              )}

              <Text style={styles.sectionTitle}>By topic</Text>
              <Text style={styles.sectionHint}>
                Pick a subject to see each topic you practiced. Topics are sorted with lower accuracy first so you know
                what to review.
              </Text>

              <Text style={styles.selectorLabel}>Class</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsScroll}
                contentContainerStyle={styles.chipsContent}
              >
                {classLevels.map((cls) => (
                  <TouchableOpacity
                    key={cls}
                    onPress={() => setSelectedClassLevel(cls)}
                    style={[
                      styles.chip,
                      selectedClassLevel === cls && styles.chipOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedClassLevel === cls && styles.chipTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      Class {cls}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.selectorLabel}>Subject</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsScrollTall}
                contentContainerStyle={styles.chipsContent}
              >
                {subjectsForClass.map((s) => (
                  <TouchableOpacity
                    key={s.subject_id}
                    onPress={() => setTopicSubjectId(s.subject_id)}
                    style={[
                      styles.chipTall,
                      topicSubjectId === s.subject_id && styles.chipOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        topicSubjectId === s.subject_id && styles.chipTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      {s.subject_name}
                    </Text>
                    <Text
                      style={[
                        styles.chipSubText,
                        topicSubjectId === s.subject_id && styles.chipSubTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      {s.board} · book {s.book_version}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {topicsLoading ? (
                <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
              ) : (
                <View style={styles.card}>
                  {topics.length === 0 ? (
                    <Text style={styles.muted}>
                      No attempts for this subject yet — practice questions to populate this list.
                    </Text>
                  ) : (
                    sortedTopics.map((t) => (
                      <View key={t.topic_name} style={styles.topicRow}>
                        <BookMarked size={16} color={colors.primary} />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.topicName}>{t.topic_name}</Text>
                          <View style={styles.accuracyBarTrack}>
                            <View
                              style={[
                                styles.accuracyBarFill,
                                {
                                  width: `${Math.min(100, Math.max(0, t.accuracy))}%`,
                                  backgroundColor:
                                    t.accuracy >= 80
                                      ? colors.success
                                      : t.accuracy >= 60
                                        ? colors.warning
                                        : colors.danger,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.topicSub}>
                            {t.correct}/{t.attempts} correct · avg score {t.avg_score}% · ~{t.avg_time}s
                          </Text>
                          <TouchableOpacity
                            style={styles.topicPracticeBtn}
                            onPress={() => openPracticeForTopic(t.topic_name)}
                            activeOpacity={0.85}
                          >
                            <Sparkles size={14} color={colors.accent} />
                            <Text style={styles.topicPracticeTxt}>Practice with AI</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.topicPct}>{t.accuracy.toFixed(0)}%</Text>
                      </View>
                    ))
                  )}
                </View>
              )}

              <Text style={styles.sectionTitle}>Subjects</Text>
              <Text style={styles.sectionHint}>
                Each line is one subject tied to your past answers. The percent is your accuracy (correct ÷
                attempts). “Other subject” means practice was saved under a subject that isn’t in your main
                list; the app tries to load its name in the background.
              </Text>
              <View style={styles.card}>
                {Object.keys(data.subject_wise_performance || {}).length === 0 ? (
                  <Text style={styles.muted}>Answer practice questions to see subject breakdown.</Text>
                ) : (
                  [...Object.entries(data.subject_wise_performance)]
                    .sort(([a], [b]) => {
                      const idA = Number.parseInt(a, 10);
                      const idB = Number.parseInt(b, 10);
                      const metaA = Number.isFinite(idA) ? metaForSubjectId(idA) : undefined;
                      const metaB = Number.isFinite(idB) ? metaForSubjectId(idB) : undefined;
                      const nameA = metaA?.name || OTHER_SUBJECT_LABEL;
                      const nameB = metaB?.name || OTHER_SUBJECT_LABEL;
                      const tie = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
                      if (tie !== 0) return tie;
                      return a.localeCompare(b, undefined, { numeric: true });
                    })
                    .map(([subjectIdKey, pct]) => {
                      const sid = Number.parseInt(subjectIdKey, 10);
                      const meta = Number.isFinite(sid) ? metaForSubjectId(sid) : undefined;
                      const displayName =
                        meta?.name ||
                        (Number.isFinite(sid) ? OTHER_SUBJECT_LABEL : subjectIdKey);
                      const classLabel = meta?.classLevel;
                      const subHint =
                        displayName === OTHER_SUBJECT_LABEL && Number.isFinite(sid)
                          ? 'Practice from another subject listing (name loading or no longer available)'
                          : undefined;
                      return (
                        <View key={subjectIdKey} style={styles.subjectBlock}>
                          <View style={styles.subjectRow}>
                            <BookMarked size={18} color={colors.primary} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.subjectName}>{displayName}</Text>
                              <Text style={styles.subjectClassText}>
                                {classLabel ? `Class ${classLabel}` : subHint ?? 'Class —'}
                              </Text>
                            </View>
                            <Text style={styles.subjectPct}>{pct.toFixed(0)}%</Text>
                          </View>
                          <View style={styles.accuracyBarTrack}>
                            <View
                              style={[
                                styles.accuracyBarFill,
                                {
                                  width: `${Math.min(100, Math.max(0, pct))}%`,
                                  backgroundColor:
                                    pct >= 80
                                      ? colors.success
                                      : pct >= 60
                                        ? colors.warning
                                        : colors.danger,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })
                )}
              </View>

              <Text style={styles.sectionTitle}>Strong topics</Text>
              <Text style={styles.sectionHint}>
                Detected using topic accuracy at least 80%. Current detected: {strongCount}
              </Text>
              <View style={styles.card}>
                {!hasTopicSignals ? (
                  <Text style={styles.muted}>
                    Not enough topic-wise attempts yet to identify strong topics.
                  </Text>
                ) : data.strong_topics.length === 0 ? (
                  <Text style={styles.muted}>No strong topics identified yet.</Text>
                ) : (
                  data.strong_topics.map((t) => (
                    <View key={t} style={styles.topicChip}>
                      <Text style={styles.topicChipText}>{t}</Text>
                    </View>
                  ))
                )}
              </View>

              <Text style={styles.sectionTitle}>Focus areas</Text>
              <Text style={styles.sectionHint}>
                Detected using topic accuracy &lt; 60%. Current detected: {weakCount}. Tap a topic to open Practice
                Setup with that topic filled in, or use Smart practice for the subject you selected above.
              </Text>
              <View style={styles.card}>
                {effectiveFocusTopics.length > 0 ? (
                  <>
                    <Text style={styles.focusLead}>
                      Focus on these areas first to improve your next test score:
                    </Text>
                    {effectiveFocusTopics.map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.focusRow, styles.topicChipWeak]}
                        onPress={() => openPracticeForTopic(t)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.topicChipText}>{t}</Text>
                        <View style={styles.focusRowRight}>
                          <Text style={styles.focusRowAction}>Practice</Text>
                          <ChevronRight size={16} color={colors.textMuted} />
                        </View>
                      </TouchableOpacity>
                    ))}
                    {data.total_attempts > 0 && (
                      <TouchableOpacity
                        style={styles.adaptiveLink}
                        onPress={openAdaptiveForSelection}
                        activeOpacity={0.85}
                      >
                        <Sparkles size={18} color={colors.accent} />
                        <Text style={styles.adaptiveLinkTxt}>Open smart practice for selected subject</Text>
                        <ChevronRight size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </>
                ) : !hasTopicSignals ? (
                  <Text style={styles.muted}>
                    Not enough topic-wise attempts yet to detect focus areas.
                  </Text>
                ) : (
                  <Text style={styles.muted}>No focus areas right now. Keep it up.</Text>
                )}
              </View>
            </>
          ) : null}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  scroll: { padding: 20, paddingBottom: 48 },
  center: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  muted: { color: colors.textMuted, fontSize: 14 },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 22,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 4 },
  heroValue: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
  },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  miniStat: { alignItems: 'center', flex: 1 },
  miniVal: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 6 },
  miniLbl: { color: colors.textSubtle, fontSize: 11, marginTop: 2 },
  trendPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: colors.bgElevated,
  },
  trendText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  selectorLabel: {
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  chipsScroll: { marginBottom: 12, maxHeight: 48 },
  chipsScrollTall: { marginBottom: 12, maxHeight: 58 },
  chipsContent: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 180,
  },
  chipTall: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 200,
  },
  chipOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: colors.text },
  chipSubText: { color: colors.textSubtle, fontSize: 11, fontWeight: '600', marginTop: 2 },
  chipSubTextOn: { color: colors.textMuted },
  accuracyBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 6,
  },
  accuracyBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topicName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  topicSub: { color: colors.textSubtle, fontSize: 12, marginTop: 2 },
  topicPct: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  subjectBlock: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subjectName: { flex: 1, color: colors.text, fontSize: 15 },
  subjectClassText: { color: colors.textSubtle, fontSize: 12, marginTop: 2 },
  subjectPct: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  topicChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  topicChipWeak: { backgroundColor: 'rgba(248,113,113,0.12)' },
  topicChipText: { color: colors.text, fontSize: 13 },
  focusLead: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  errorText: { color: colors.danger, marginBottom: 8 },
  retry: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  retryText: { color: '#fff', fontWeight: '700' },
  ctaCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  ctaTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  ctaBody: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  ctaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  ctaPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ctaSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  ctaSecondaryTxt: { color: colors.text, fontWeight: '700', fontSize: 15 },
  dayChartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 4,
    paddingTop: 8,
    minHeight: 110,
  },
  dayCol: { flex: 1, alignItems: 'center', maxWidth: 48 },
  dayBarTrack: {
    width: '100%',
    height: 72,
    borderRadius: 6,
    backgroundColor: colors.border,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  dayBarFill: {
    width: '100%',
    borderRadius: 6,
    backgroundColor: colors.accent,
    minHeight: 2,
  },
  dayColMeta: { color: colors.textSubtle, fontSize: 10, marginTop: 6, fontWeight: '600' },
  dayColAttempts: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  topicPracticeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  topicPracticeTxt: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    marginBottom: 8,
  },
  focusRowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  focusRowAction: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  adaptiveLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  adaptiveLinkTxt: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
});
