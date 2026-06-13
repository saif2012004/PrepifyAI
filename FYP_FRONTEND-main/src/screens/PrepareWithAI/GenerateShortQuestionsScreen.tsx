import React, { useState } from 'react';
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
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import InputField from '../../components/InputField';
import PrimaryButton from '../../components/PrimaryButton';
import {
  questionService,
  emptyGenerationUserMessage,
  GeneratedQuestionItem,
  DifficultyUi,
  RetrievalSourceItem,
} from '../../services/questionService';
import { usePrepParams } from '../../hooks/usePrepParams';
import { colors, radii } from '../../theme/colors';
import QuestionPracticeCard from '../../components/QuestionPracticeCard';

export default function GenerateShortQuestionsScreen() {
  const router = useRouter();
  const { subjectName, board, classLevel } = usePrepParams();

  const [topic, setTopic] = useState('');
  const [numQuestions, setNumQuestions] = useState('8');
  const [difficulty, setDifficulty] = useState<DifficultyUi>('Medium');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<GeneratedQuestionItem[]>([]);
  const [retrievalSources, setRetrievalSources] = useState<RetrievalSourceItem[]>([]);

  const difficulties: DifficultyUi[] = ['Easy', 'Medium', 'Hard'];

  const generateQuestions = async () => {
    if (!topic.trim()) {
      Alert.alert('Topic', 'Enter a topic first.');
      return;
    }
    const requested = Number.parseInt(numQuestions, 10);
    if (!Number.isFinite(requested) || requested < 1 || requested > 50) {
      Alert.alert('Question count', 'Enter a valid number between 1 and 50.');
      return;
    }
    setLoading(true);
    try {
      const genResult = await questionService.generateQuestions({
        board,
        class_level: classLevel,
        subject: subjectName,
        topic: topic.trim(),
        difficulty,
        qtype: 'Short',
        exam_type: 'board',
        num_questions: requested,
      });
      setQuestions(genResult.questions);
      setRetrievalSources(genResult.retrieval_sources);
      if (genResult.questions.length === 0) {
        Alert.alert('No questions', emptyGenerationUserMessage(genResult));
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setQuestions([]);
    setRetrievalSources([]);
    setTopic('');
    setNumQuestions('8');
    setDifficulty('Medium');
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientMid, colors.bg]}
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
            <Text style={styles.headerTitle}>Short questions</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.panel}>
            <InputField
              label="Topic"
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. Cell structure, Newton's laws..."
              appearance="dark"
            />
            <InputField
              label="How many short questions?"
              value={numQuestions}
              onChangeText={setNumQuestions}
              placeholder="8"
              keyboardType="numeric"
              appearance="dark"
            />
            <Text style={styles.label}>Difficulty</Text>
            <View style={styles.diffRow}>
              {difficulties.map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[styles.diffBtn, difficulty === level && styles.diffBtnOn]}
                  onPress={() => setDifficulty(level)}
                >
                  <Text style={[styles.diffTxt, difficulty === level && styles.diffTxtOn]}>
                    {level}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <PrimaryButton
              title={loading ? 'Generating…' : 'Generate short questions'}
              onPress={generateQuestions}
              disabled={loading || !topic.trim()}
              loading={loading}
              color={colors.success}
            />
          </View>

          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingTxt}>Generating via backend…</Text>
              <Text style={styles.loadingSub}>
                First run may take a few minutes (textbook index + AI). Keep this screen open until questions appear.
              </Text>
            </View>
          )}

          {questions.length > 0 && !loading && (
            <View style={styles.results}>
              <View style={styles.resultsHead}>
                <Text style={styles.resultsTitle}>Questions ({questions.length})</Text>
                <TouchableOpacity onPress={clearResults} style={styles.clearBtn}>
                  <Trash2 size={18} color={colors.danger} />
                  <Text style={styles.clearTxt}>Clear</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.practiceHint}>
                Type your answer, then submit for scoring. Use “Show model answer” only when you want to see it.
                You must be logged in to submit.
              </Text>
              {questions.map((q, i) => (
                <QuestionPracticeCard
                  key={q.question_id}
                  item={q}
                  index={i}
                  accentColor={colors.success}
                  retrievalSources={retrievalSources}
                />
              ))}
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
  diffBtnOn: { borderColor: colors.success, backgroundColor: 'rgba(52,211,153,0.12)' },
  diffTxt: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
  diffTxtOn: { color: colors.text },
  loadingBox: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  loadingTxt: { color: colors.textMuted, fontSize: 14 },
  loadingSub: {
    color: colors.textSubtle,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    lineHeight: 18,
  },
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
  practiceHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
});
