import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import InputField from '../../components/InputField';
import PrimaryButton from '../../components/PrimaryButton';
import {
  questionService,
  emptyGenerationUserMessage,
  GeneratedQuestionItem,
  DifficultyUi,
  RetrievalSourceItem,
  mergeRetrievalSources,
  type GenerateQuestionsSafeResult,
} from '../../services/questionService';
import { usePrepParams } from '../../hooks/usePrepParams';
import { colors, radii } from '../../theme/colors';
import QuestionPracticeCard from '../../components/QuestionPracticeCard';

export default function PracticeSetupScreen() {
  const router = useRouter();
  const { subjectName, board, classLevel, practiceTopic } = usePrepParams();

  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyUi>('Medium');
  const [mcqCount, setMcqCount] = useState('8');
  const [shortCount, setShortCount] = useState('8');
  const [longCount, setLongCount] = useState('4');
  const [loading, setLoading] = useState(false);
  const [useStrictTopicSet, setUseStrictTopicSet] = useState(false);

  const [mcqs, setMcqs] = useState<GeneratedQuestionItem[]>([]);
  const [shortQuestions, setShortQuestions] = useState<GeneratedQuestionItem[]>([]);
  const [longQuestions, setLongQuestions] = useState<GeneratedQuestionItem[]>([]);
  const [retrievalSources, setRetrievalSources] = useState<RetrievalSourceItem[]>([]);

  useEffect(() => {
    const t = (practiceTopic || '').trim();
    if (t) setTopic(t);
  }, [practiceTopic]);

  const difficulties: DifficultyUi[] = ['Easy', 'Medium', 'Hard'];

  const parseCount = (label: string, value: string): number | null => {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0 || n > 50) {
      Alert.alert(label, 'Enter a valid number between 0 and 50.');
      return null;
    }
    return n;
  };

  const generateAll = async () => {
    if (!topic.trim()) {
      Alert.alert('Topic', 'Enter a topic first.');
      return;
    }

    let mcq = 0;
    let short = 0;
    let long = 0;
    if (useStrictTopicSet) {
      mcq = 10;
      short = 5;
      long = 3;
    } else {
      const parsedMcq = parseCount('MCQs count', mcqCount);
      if (parsedMcq === null) return;
      const parsedShort = parseCount('Short questions count', shortCount);
      if (parsedShort === null) return;
      const parsedLong = parseCount('Long questions count', longCount);
      if (parsedLong === null) return;
      mcq = parsedMcq;
      short = parsedShort;
      long = parsedLong;
      if (mcq + short + long === 0) {
        Alert.alert('Question counts', 'Set at least one question count greater than 0.');
        return;
      }
    }

    setLoading(true);
    try {
      if (useStrictTopicSet) {
        const result = await questionService.generateTopicSet({
          board,
          class_level: classLevel,
          subject: subjectName,
          topic: topic.trim(),
          difficulty,
          exam_type: 'board',
        });
        setMcqs(result.mcqs);
        setShortQuestions(result.short_questions);
        setLongQuestions(result.long_questions);
        setRetrievalSources(result.retrieval_sources);
        const total = result.mcqs.length + result.short_questions.length + result.long_questions.length;
        if (total === 0) {
          Alert.alert(
            'No questions',
            emptyGenerationUserMessage({
              questions: [],
              feature_disabled_notice: result.feature_disabled_notice,
            })
          );
        }
        return;
      }

      const empty: Promise<GenerateQuestionsSafeResult> = Promise.resolve({
        ok: true,
        questions: [],
        retrieval_sources: [],
      });

      const [mcqRes, shortRes, longRes] = await Promise.all([
        mcq > 0
          ? questionService.generateQuestionsSafe({
              board,
              class_level: classLevel,
              subject: subjectName,
              topic: topic.trim(),
              difficulty,
              qtype: 'MCQ',
              exam_type: 'board',
              num_questions: mcq,
            })
          : empty,
        short > 0
          ? questionService.generateQuestionsSafe({
              board,
              class_level: classLevel,
              subject: subjectName,
              topic: topic.trim(),
              difficulty,
              qtype: 'Short',
              exam_type: 'board',
              num_questions: short,
            })
          : empty,
        long > 0
          ? questionService.generateQuestionsSafe({
              board,
              class_level: classLevel,
              subject: subjectName,
              topic: topic.trim(),
              difficulty,
              qtype: 'Long',
              exam_type: 'board',
              num_questions: long,
            })
          : empty,
      ]);

      const mcqQs = mcqRes.ok ? mcqRes.questions : [];
      const shortQs = shortRes.ok ? shortRes.questions : [];
      const longQs = longRes.ok ? longRes.questions : [];
      setMcqs(mcqQs);
      setShortQuestions(shortQs);
      setLongQuestions(longQs);
      setRetrievalSources(
        mergeRetrievalSources(
          mcqRes.ok ? mcqRes.retrieval_sources : [],
          shortRes.ok ? shortRes.retrieval_sources : [],
          longRes.ok ? longRes.retrieval_sources : []
        )
      );

      const failures: string[] = [];
      if (!mcqRes.ok && mcq > 0) failures.push(`MCQs: ${mcqRes.error}`);
      if (!shortRes.ok && short > 0) failures.push(`Short: ${shortRes.error}`);
      if (!longRes.ok && long > 0) failures.push(`Long: ${longRes.error}`);

      const total = mcqQs.length + shortQs.length + longQs.length;
      if (failures.length > 0) {
        Alert.alert(
          total > 0 ? 'Partial success' : 'Generation failed',
          failures.join('\n\n') +
            (total > 0 ? '\n\nOther question types were loaded below.' : '')
        );
      } else if (total === 0) {
        const buckets: GenerateQuestionsSafeResult[] = [];
        if (mcq > 0) buckets.push(mcqRes);
        if (short > 0) buckets.push(shortRes);
        if (long > 0) buckets.push(longRes);
        const firstOk = buckets.find((r) => r.ok);
        Alert.alert(
          'No questions',
          firstOk && firstOk.ok
            ? emptyGenerationUserMessage(firstOk)
            : emptyGenerationUserMessage({ questions: [] })
        );
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to generate questions.');
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setTopic('');
    setDifficulty('Medium');
    setMcqCount('8');
    setShortCount('8');
    setLongCount('4');
    setMcqs([]);
    setShortQuestions([]);
    setLongQuestions([]);
    setRetrievalSources([]);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientStart, colors.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.4 }}
      />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerSub}>{subjectName}</Text>
            <Text style={styles.headerTitle}>Practice Setup</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.panel}>
            <InputField
              label="Topic"
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. Photosynthesis, chemical bonding..."
              appearance="dark"
            />
            <Pressable
              onPress={() => setUseStrictTopicSet((v) => !v)}
              style={({ pressed }) => [
                styles.modeToggle,
                useStrictTopicSet && styles.modeToggleOn,
                pressed && { opacity: 0.92 },
              ]}
            >
              <Text style={[styles.modeToggleTitle, useStrictTopicSet && styles.modeToggleTitleOn]}>
                Use strict one-click topic set
              </Text>
              <Text style={styles.modeToggleSub}>
                {useStrictTopicSet
                  ? 'Backend endpoint `/generate-topic-set/` (10 MCQs, 5 short, 3 long)'
                  : 'Manual counts mode (custom MCQ/short/long quantities)'}
              </Text>
            </Pressable>
            {!useStrictTopicSet && (
              <>
                <InputField
                  label="MCQs count"
                  value={mcqCount}
                  onChangeText={setMcqCount}
                  placeholder="8"
                  keyboardType="numeric"
                  appearance="dark"
                />
                <InputField
                  label="Short questions count"
                  value={shortCount}
                  onChangeText={setShortCount}
                  placeholder="8"
                  keyboardType="numeric"
                  appearance="dark"
                />
                <InputField
                  label="Long questions count"
                  value={longCount}
                  onChangeText={setLongCount}
                  placeholder="4"
                  keyboardType="numeric"
                  appearance="dark"
                />
              </>
            )}
            <Text style={styles.label}>Difficulty</Text>
            <View style={styles.diffRow}>
              {difficulties.map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[styles.diffBtn, difficulty === level && styles.diffBtnOn]}
                  onPress={() => setDifficulty(level)}
                >
                  <Text style={[styles.diffTxt, difficulty === level && styles.diffTxtOn]}>{level}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <PrimaryButton
              title={loading ? 'Generating…' : useStrictTopicSet ? 'Generate Topic Set (10/5/3)' : 'Generate Practice Set'}
              onPress={generateAll}
              disabled={loading || !topic.trim()}
              loading={loading}
              color={colors.primary}
            />
          </View>

          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingTxt}>Generating your practice set…</Text>
            </View>
          )}

          {(mcqs.length > 0 || shortQuestions.length > 0 || longQuestions.length > 0) && !loading && (
            <View style={styles.results}>
              <View style={styles.resultsHead}>
                <Text style={styles.resultsTitle}>
                  Practice set ({mcqs.length + shortQuestions.length + longQuestions.length})
                </Text>
                <TouchableOpacity onPress={clearAll} style={styles.clearBtn}>
                  <Trash2 size={18} color={colors.danger} />
                  <Text style={styles.clearTxt}>Clear</Text>
                </TouchableOpacity>
              </View>

              {mcqs.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>MCQs ({mcqs.length})</Text>
                  {mcqs.map((q, i) => (
                    <QuestionPracticeCard
                      key={`mcq-${q.question_id}`}
                      item={q}
                      index={i}
                      accentColor={colors.primary}
                      retrievalSources={retrievalSources}
                      presentation="mcq"
                    />
                  ))}
                </>
              )}

              {shortQuestions.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Short Questions ({shortQuestions.length})</Text>
                  {shortQuestions.map((q, i) => (
                    <QuestionPracticeCard
                      key={`short-${q.question_id}`}
                      item={q}
                      index={i}
                      accentColor={colors.success}
                      retrievalSources={retrievalSources}
                    />
                  ))}
                </>
              )}

              {longQuestions.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Long Questions ({longQuestions.length})</Text>
                  {longQuestions.map((q, i) => (
                    <QuestionPracticeCard
                      key={`long-${q.question_id}`}
                      item={q}
                      index={i}
                      accentColor="#A78BFA"
                      retrievalSources={retrievalSources}
                    />
                  ))}
                </>
              )}
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
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerSub: { color: colors.textMuted, fontSize: 12 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  scroll: { flex: 1, paddingHorizontal: 18 },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 10 },
  diffRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  diffBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
  },
  diffBtnOn: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  diffTxt: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
  diffTxtOn: { color: colors.text },
  modeToggle: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  modeToggleOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  modeToggleTitle: { color: colors.text, fontWeight: '800', fontSize: 14, marginBottom: 4 },
  modeToggleTitleOn: { color: colors.text },
  modeToggleSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  loadingBox: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  loadingTxt: { color: colors.textMuted, fontSize: 14 },
  results: { paddingBottom: 40 },
  resultsHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  resultsTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearTxt: { color: colors.danger, fontWeight: '700', fontSize: 14 },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 8,
  },
});

