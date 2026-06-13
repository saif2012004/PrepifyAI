import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, FileText, Sparkles } from 'lucide-react-native';
import {
  getPastPaperBrief,
  getPastPaperQuestions,
  type PastPaperQuestionItem,
} from '../../services/pastPaperService';
import { colors, radii } from '../../theme/colors';

function formatQuestionType(t: string): string {
  const s = (t || '').trim().toLowerCase();
  if (!s) return 'Question';
  if (s === 'mcq' || s === 'multiple_choice') return 'MCQ';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PastPaperDetailScreen() {
  const router = useRouter();
  const { paperId, subjectId, subjectName, year, board, classLevel, hasPdf } = useLocalSearchParams<{
    paperId: string;
    subjectId?: string;
    subjectName?: string;
    year?: string;
    board?: string;
    classLevel?: string;
    hasPdf?: string;
  }>();
  const pid = Number.parseInt(paperId ?? '', 10);
  const paramSaysPdf = hasPdf === '1' || hasPdf === 'true';
  const [serverHasPdf, setServerHasPdf] = useState<boolean | null>(null);
  const showOriginalPdf = paramSaysPdf || serverHasPdf === true;
  const [questions, setQuestions] = useState<PastPaperQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(pid)) {
      setError('Invalid paper');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [list, meta] = await Promise.all([
        getPastPaperQuestions(pid),
        getPastPaperBrief(pid).catch(() => null),
      ]);
      setQuestions(list);
      if (meta) {
        setServerHasPdf(!!meta.has_pdf);
      } else {
        setServerHasPdf(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load questions');
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    load();
  }, [load]);

  const subtitle =
    year && board ? `${year} · ${board}` : board ? String(board) : year ? String(year) : `Paper #${pid}`;
  const titleLine = subjectName ? String(subjectName) : 'Past paper';
  const openPrediction = () => {
    if (!subjectId) return;
    router.push({
      pathname: '/insights/exam-topics',
      params: {
        subjectId: String(subjectId),
        classLevel: classLevel ? String(classLevel) : undefined,
      },
    });
  };

  const openOriginalPdf = () => {
    if (!Number.isFinite(pid)) return;
    router.push({
      pathname: '/past-papers/paper/[paperId]/pdf',
      params: {
        paperId: String(pid),
        title: `${titleLine} · ${subtitle}`,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>
            {titleLine}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {showOriginalPdf ? (
          <TouchableOpacity style={styles.pdfBtn} onPress={openOriginalPdf} activeOpacity={0.85}>
            <FileText size={18} color={colors.accent} />
            <Text style={styles.pdfBtnTxt}>Open full past paper (PDF)</Text>
          </TouchableOpacity>
        ) : null}

        {subjectId ? (
          <TouchableOpacity style={styles.predictBtn} onPress={openPrediction} activeOpacity={0.85}>
            <Sparkles size={18} color="#fff" />
            <Text style={styles.predictBtnTxt}>Predict important topics from past papers</Text>
          </TouchableOpacity>
        ) : null}

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {error && !loading && <Text style={styles.err}>{error}</Text>}

        {!loading && !error && questions.length > 0 ? (
          <Text style={styles.sectionTitle}>Questions</Text>
        ) : null}

        {!loading && !error && questions.length === 0 && (
          <Text style={styles.empty}>
            {showOriginalPdf
              ? 'Use “Open full past paper (PDF)” above to read the entire exam paper.'
              : 'No PDF is on file for this paper yet.'}
          </Text>
        )}

        {!loading &&
          questions.map((q, index) => (
            <View key={q.question_id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.qIndex}>Q{index + 1}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{formatQuestionType(q.question_type)}</Text>
                </View>
                {q.marks != null && q.marks > 0 ? (
                  <Text style={styles.marks}>{q.marks} marks</Text>
                ) : null}
              </View>
              {q.topic ? (
                <Text style={styles.topic} numberOfLines={2}>
                  {q.topic}
                </Text>
              ) : null}
              <Text style={styles.qText}>{q.question_text}</Text>
            </View>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  subtitle: { color: colors.textSubtle, fontSize: 12, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  centered: { paddingVertical: 32, alignItems: 'center' },
  predictBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 13,
    marginBottom: 12,
  },
  predictBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  pdfBtnTxt: { color: colors.accent, fontWeight: '800', fontSize: 14, flexShrink: 1 },
  err: { color: colors.danger, marginBottom: 12 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  empty: { color: colors.textSubtle, textAlign: 'center', marginTop: 24, lineHeight: 20 },
  card: {
    marginBottom: 14,
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  qIndex: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  marks: { color: colors.textSubtle, fontSize: 12, marginLeft: 'auto' },
  topic: { color: colors.textMuted, fontSize: 13, marginBottom: 8 },
  qText: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
