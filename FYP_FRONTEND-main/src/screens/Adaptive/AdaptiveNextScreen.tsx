import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Sparkles } from 'lucide-react-native';
import { colors, radii } from '../../theme/colors';
import { subjectService, Subject } from '../../services/subjectService';
import {
  adaptiveService,
  mapAdaptiveToGeneratedItem,
  AdaptiveNextQuestionResponse,
  SmartPracticeSessionResponse,
} from '../../services/adaptiveService';
import QuestionPracticeCard from '../../components/QuestionPracticeCard';

export default function AdaptiveNextScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const paramSubjectId = useMemo(() => {
    const raw = Array.isArray(params.subjectId) ? params.subjectId[0] : params.subjectId;
    const n = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(n) ? n : null;
  }, [params.subjectId]);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedClassLevel, setSelectedClassLevel] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [next, setNext] = useState<AdaptiveNextQuestionResponse | null>(null);
  const [session, setSession] = useState<SmartPracticeSessionResponse | null>(null);
  const [planStatus, setPlanStatus] = useState<'idle' | 'loaded' | 'unavailable'>('idle');
  const [loadingNext, setLoadingNext] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadSubjects = useCallback(async () => {
    setLoadingSubjects(true);
    try {
      const list = await subjectService.getSubjects();
      const fbiseOnly = list.filter((s) => /fbise/i.test((s.board || '').trim()));
      setSubjects(fbiseOnly);
      setSelectedClassLevel((prev) =>
        prev === null && fbiseOnly.length ? String(fbiseOnly[0].class_level) : prev
      );
    } catch (e: unknown) {
      Alert.alert('Subjects', e instanceof Error ? e.message : 'Could not load subjects');
    } finally {
      setLoadingSubjects(false);
    }
  }, []);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  useEffect(() => {
    if (paramSubjectId == null || subjects.length === 0) return;
    const hit = subjects.find((s) => s.subject_id === paramSubjectId);
    if (hit) {
      setSubjectId(hit.subject_id);
      setSelectedClassLevel(String(hit.class_level));
    }
  }, [paramSubjectId, subjects]);

  const fetchNext = async () => {
    if (subjectId == null) {
      Alert.alert('Subject', 'Select a subject first.');
      return;
    }
    setLoadingNext(true);
    setNext(null);
    setSession(null);
    setPlanStatus('idle');
    try {
      // Load next question first (core action). Session-plan is secondary and should not block practice.
      const row = await adaptiveService.getNextQuestion(subjectId);
      setNext(row);

      try {
        const smartSession = await adaptiveService.getSmartPracticeSession({
          subjectId,
          totalQuestions: 12,
        });
        setSession(smartSession);
        setPlanStatus('loaded');
      } catch (sessionErr: unknown) {
        setPlanStatus('unavailable');
        const smsg = sessionErr instanceof Error ? sessionErr.message : 'Could not load smart plan';
        if (/401|403|login|unauthor|forbidden|credential/i.test(smsg)) {
          Alert.alert('Sign in required', 'Log in to load full smart-practice recommendations.');
        } else if (/404|not found/i.test(smsg)) {
          Alert.alert(
            'Smart plan unavailable',
            'Next question loaded. Restart backend so the smart-practice session endpoint is available.'
          );
        } else {
          Alert.alert('Smart plan', `Next question loaded, but plan failed: ${smsg}`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load question';
      setFetchError(msg);
      if (/401|403|login|unauthor|forbidden|credential/i.test(msg)) {
        Alert.alert('Sign in required', 'Log in to use adaptive practice.');
      } else {
        Alert.alert('Adaptive', msg);
      }
    } finally {
      setLoadingNext(false);
    }
  };

  const classLevels = Array.from(new Set(subjects.map((s) => String(s.class_level))));
  const subjectsForClassRaw = subjects.filter((s) =>
    selectedClassLevel ? String(s.class_level) === selectedClassLevel : true
  );
  const subjectsForClass = subjectsForClassRaw.filter((s, idx, arr) => {
    const key = (s.subject_name || '').trim().toLowerCase();
    if (!key) return false;
    return arr.findIndex((x) => (x.subject_name || '').trim().toLowerCase() === key) === idx;
  });

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
      if (subjectId !== null) setSubjectId(null);
      return;
    }
    const exists = subjectId != null && subjectsForClass.some((s) => s.subject_id === subjectId);
    if (!exists) setSubjectId(subjectsForClass[0].subject_id);
  }, [subjectsForClass, subjectId]);

  const selected = subjects.find((s) => s.subject_id === subjectId);
  const progressPercent = session
    ? Math.max(
        0,
        Math.min(100, Math.round((session.weak_topic_reinforcement.improved_topics_count / 5) * 100))
      )
    : 0;

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
          <Text style={styles.headerTitle}>Smart practice</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.lead}>
            Each tap loads one new question (random mix of MCQ, short, or long), grounded in your book when
            indexed. You can submit without signing in (approximate grading); sign in to save progress on your
            dashboard.
          </Text>

          {loadingSubjects ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
          ) : subjects.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.meta}>No FBISE subjects available for Smart Practice.</Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.label}>Class</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
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

              <Text style={styles.label}>Subject</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                {subjectsForClass.map((s) => (
                  <TouchableOpacity
                    key={s.subject_id}
                    onPress={() => setSubjectId(s.subject_id)}
                    style={[
                      styles.chip,
                      subjectId === s.subject_id && styles.chipOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        subjectId === s.subject_id && styles.chipTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      {s.subject_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {selected && (
                <Text style={styles.meta}>
                  {selected.board} · Class {selected.class_level}
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.primaryWrap}
            onPress={fetchNext}
            disabled={loadingNext || subjectId == null}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[colors.primary, colors.gradientEnd]}
              style={styles.primaryBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {loadingNext ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Sparkles size={20} color="#fff" />
                  <Text style={styles.primaryTxt}>Get next question</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {planStatus !== 'idle' && (
            <View
              style={[
                styles.planStatusPill,
                planStatus === 'loaded' ? styles.planStatusLoaded : styles.planStatusUnavailable,
              ]}
            >
              <Text style={styles.planStatusText}>
                Plan status: {planStatus === 'loaded' ? 'loaded' : 'unavailable'}
              </Text>
            </View>
          )}

          {next && (
            <>
              <QuestionPracticeCard
                item={mapAdaptiveToGeneratedItem(next)}
                index={0}
                accentColor={colors.accent}
                presentation={next.question_type === 'MCQ' ? 'mcq' : 'freeform'}
              />
              {next.explanation ? (
                <View style={styles.card}>
                  <Text style={styles.sectionMini}>Explanation</Text>
                  <Text style={styles.meta}>{next.explanation}</Text>
                </View>
              ) : null}
            </>
          )}

          {session && (
            <View style={styles.card}>
              <Text style={styles.sessionTitle}>Smart Practice Plan</Text>
              <Text style={styles.sessionGoal}>{session.practice_goal}</Text>

              <Text style={styles.sectionMini}>Topic prioritization</Text>
              <Text style={styles.meta}>
                Weak {session.topic_prioritization.distribution.weak} · Moderate{' '}
                {session.topic_prioritization.distribution.moderate} · Strong{' '}
                {session.topic_prioritization.distribution.strong}
              </Text>
              <Text style={styles.meta}>
                Question mix: MCQ {session.question_generation.mix.mcq} · Short{' '}
                {session.question_generation.mix.short} · Concept {session.question_generation.mix.concept_based}
              </Text>

              <Text style={styles.sectionMini}>Progress indicator</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
              </View>
              <Text style={styles.metaStrong}>{session.engagement.progress_indicator}</Text>

              <Text style={styles.sectionMini}>Adaptive flow</Text>
              {session.adaptive_practice_flow.slice(0, 4).map((step, i) => (
                <Text key={`flow-${i}`} style={styles.bulletText}>
                  • {step}
                </Text>
              ))}

              <Text style={styles.sectionMini}>Focus topics</Text>
              {(session.weak_topic_reinforcement.still_need_attention || []).length === 0 ? (
                <Text style={styles.meta}>No urgent weak topic right now.</Text>
              ) : (
                <View style={styles.topicWrap}>
                  {session.weak_topic_reinforcement.still_need_attention.map((t) => (
                    <View key={t} style={styles.topicChip}>
                      <Text style={styles.topicChipText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.sectionMini}>Next best actions</Text>
              {(session.next_best_actions || []).slice(0, 4).map((a, i) => (
                <Text key={`act-${i}`} style={styles.bulletText}>
                  • {a}
                </Text>
              ))}

              <Text style={styles.meta}>{session.engagement.encouragement}</Text>
              <Text style={styles.nextStep}>Next step: {session.next_step_recommendation}</Text>
            </View>
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
  lead: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.textSubtle, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  chipsRow: { flexGrow: 0, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 200,
  },
  chipOn: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  chipText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: colors.text },
  meta: { color: colors.textSubtle, fontSize: 12 },
  primaryWrap: { marginBottom: 20, borderRadius: radii.lg, overflow: 'hidden' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  primaryTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sessionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  sessionGoal: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 10 },
  sectionMini: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  bulletText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 2 },
  topicWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  topicChipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  metaStrong: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: 8 },
  nextStep: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 8 },
  planStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
    borderWidth: 1,
  },
  planStatusLoaded: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: 'rgba(16,185,129,0.45)',
  },
  planStatusUnavailable: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.35)',
  },
  planStatusText: { color: colors.textSubtle, fontSize: 12, fontWeight: '700' },
  errorCard: {
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  errorTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  errorBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  errorHint: { color: colors.textSubtle, fontSize: 12, lineHeight: 17 },
});
