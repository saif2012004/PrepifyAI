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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Flame, BookOpen, ChevronDown, ChevronUp } from 'lucide-react-native';
import { colors, radii } from '../../theme/colors';
import { FadeIn } from '../../components/animated';
import { subjectService, Subject } from '../../services/subjectService';
import {
  predictionService,
  ExamRecommendationsResponse,
  PredictionStatus,
} from '../../services/predictionService';

const CLASS_OPTIONS = ['9', '10', '11', '12'] as const;

export default function ExamTopicsScreen() {
  const router = useRouter();
  const { subjectId: subjectIdParam, classLevel: classLevelParam } = useLocalSearchParams<{
    subjectId?: string;
    classLevel?: string;
  }>();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [classLevel, setClassLevel] = useState('10');
  const [status, setStatus] = useState<PredictionStatus | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExamRecommendationsResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [st, subs] = await Promise.all([
        predictionService.getStatus(),
        subjectService.getSubjects(),
      ]);
      setStatus(st);
      setSubjects(subs);
      setSubjectId((prev) => {
        if (prev != null) return prev;
        const sid = Number.parseInt(subjectIdParam ?? '', 10);
        if (Number.isFinite(sid) && subs.some((s) => s.subject_id === sid)) return sid;
        return subs.length ? subs[0].subject_id : null;
      });
      const cl = String(classLevelParam ?? '').trim();
      if (CLASS_OPTIONS.includes(cl as (typeof CLASS_OPTIONS)[number])) {
        setClassLevel(cl);
      }
    } catch (e: unknown) {
      Alert.alert('Load failed', e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingMeta(false);
    }
  }, [classLevelParam, subjectIdParam]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const selected = subjects.find((s) => s.subject_id === subjectId);

  useEffect(() => {
    if (!selected?.class_level) return;
    const cl = String(selected.class_level).trim();
    if (CLASS_OPTIONS.includes(cl as (typeof CLASS_OPTIONS)[number])) {
      setClassLevel(cl);
    }
  }, [selected?.subject_id, selected?.class_level]);

  const run = async () => {
    if (subjectId == null) {
      Alert.alert('Subject', 'Select a subject.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await predictionService.getExamTopicRecommendations({
        class_level: classLevel.trim(),
        subject_id: subjectId,
      });
      setResult(res);
      setExpanded({});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      if (/401|403|login|unauthor/i.test(msg)) {
        Alert.alert('Sign in required', 'Log in to analyze past papers.');
      } else {
        Alert.alert('Recommendations', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const mode = status?.prediction_mode?.includes('fallback') ? 'fallback' : 'model';

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
          <Text style={styles.headerTitle}>Important exam topics</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.lead}>
            Uses every past-paper question stored for your subject, predicts a topic for each one, then
            ranks topics that show up most. Tie-in with book chunks when available. First run can take a minute.
          </Text>

          <View style={styles.note}>
            <Flame size={18} color={colors.accent} />
            <Text style={styles.noteTxt}>
              Engine: {mode === 'model' ? 'DistilBERT (if loaded for this class)' : 'Fallback embeddings'}{' '}
              · {status?.models_loaded ?? 0} checkpoint(s)
            </Text>
          </View>

          {loadingMeta ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
          ) : (
            <>
              <Text style={styles.label}>Class</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {CLASS_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setClassLevel(c)}
                    style={[styles.chip, classLevel === c && styles.chipOn]}
                  >
                    <Text style={[styles.chipTxt, classLevel === c && styles.chipTxtOn]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Subject</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {subjects.map((s) => (
                  <TouchableOpacity
                    key={s.subject_id}
                    onPress={() => setSubjectId(s.subject_id)}
                    style={[styles.chip, subjectId === s.subject_id && styles.chipOn]}
                  >
                    <Text
                      style={[styles.chipTxt, subjectId === s.subject_id && styles.chipTxtOn]}
                      numberOfLines={1}
                    >
                      {s.subject_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={[styles.runBtn, loading && styles.runBtnDisabled]}
                onPress={run}
                disabled={loading || subjectId == null}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.runBtnTxt}>Analyze past papers</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {result && (
            <FadeIn style={styles.summary} direction="up" distance={16}>
              <Text style={styles.summaryTitle}>Summary</Text>
              <Text style={styles.summaryLine}>
                Papers: {result.past_papers_analyzed} · Questions scored: {result.total_questions_analyzed} ·
                Topics: {result.unique_topics_found}
              </Text>
              {result.message ? <Text style={styles.summaryMsg}>{result.message}</Text> : null}
            </FadeIn>
          )}

          {result?.recommendations?.length === 0 && !result.message ? (
            <Text style={styles.muted}>No recommendations — add past papers for this subject or check topic models.</Text>
          ) : null}

          {result?.recommendations?.map((rec, idx) => {
            const key = `${rec.topic_name}-${idx}`;
            const open = !!expanded[key];
            return (
              <FadeIn key={key} delay={Math.min(idx, 10) * 55} direction="up" distance={16} style={styles.card}>
                <TouchableOpacity
                  style={styles.cardHead}
                  onPress={() => toggle(key)}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rank}>
                      #{idx + 1} · {rec.topic_name}
                    </Text>
                    <Text style={styles.meta}>
                      score {rec.prediction_score.toFixed(2)}
                      {rec.frequency != null ? ` · ${rec.frequency} hits` : ''}
                      {rec.avg_confidence != null
                        ? ` · avg conf ${(rec.avg_confidence * 100).toFixed(0)}%`
                        : ''}
                    </Text>
                  </View>
                  {open ? (
                    <ChevronUp size={20} color={colors.textSubtle} />
                  ) : (
                    <ChevronDown size={20} color={colors.textSubtle} />
                  )}
                </TouchableOpacity>
                {open &&
                  (rec.chapters?.length ? (
                    rec.chapters.map((ch) => (
                      <View key={ch.chunk_id} style={styles.chunk}>
                        <View style={styles.chunkHead}>
                          <BookOpen size={14} color={colors.accent} />
                          <Text style={styles.chunkTitle}>{ch.chapter_name}</Text>
                        </View>
                        <Text style={styles.chunkPreview} numberOfLines={6}>
                          {ch.content_preview}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.muted}>No textbook chunk match for this topic yet.</Text>
                  ))}
              </FadeIn>
            );
          })}
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
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text, flex: 1, textAlign: 'center' },
  scroll: { padding: 20, paddingBottom: 48 },
  lead: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  noteTxt: { flex: 1, color: colors.textSubtle, fontSize: 13 },
  label: {
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
  runBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.lg,
    alignItems: 'center',
    marginBottom: 20,
  },
  runBtnDisabled: { opacity: 0.7 },
  runBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  summary: {
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  summaryTitle: { fontWeight: '800', color: colors.text, marginBottom: 6 },
  summaryLine: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  summaryMsg: { color: colors.accent, marginTop: 8, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { fontSize: 16, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.textSubtle, marginTop: 4 },
  chunk: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chunkHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  chunkTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  chunkPreview: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  muted: { color: colors.textMuted, fontSize: 14, marginTop: 8 },
});
