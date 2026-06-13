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
  GeneratedQuestionItem,
  DifficultyUi,
  RetrievalSourceItem,
  mergeRetrievalSources,
} from '../../services/questionService';
import { usePrepParams } from '../../hooks/usePrepParams';
import { colors, radii } from '../../theme/colors';
import QuestionPracticeCard from '../../components/QuestionPracticeCard';

type Section = {
  type: 'mcq' | 'short' | 'long';
  questions: GeneratedQuestionItem[];
};

export default function GenerateFullPaperScreen() {
  const router = useRouter();
  const { subjectName, board, classLevel } = usePrepParams();

  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyUi>('Medium');
  const [loading, setLoading] = useState(false);
  const [paper, setPaper] = useState<Section[]>([]);
  const [retrievalSources, setRetrievalSources] = useState<RetrievalSourceItem[]>([]);
  const [loadStep, setLoadStep] = useState('');

  const difficulties: DifficultyUi[] = ['Easy', 'Medium', 'Hard'];

  const generatePaper = async () => {
    if (!topic.trim()) {
      Alert.alert('Topic', 'Enter a topic or chapter focus.');
      return;
    }
    setLoading(true);
    setPaper([]);
    setRetrievalSources([]);
    try {
      setLoadStep('MCQ, short & long (parallel)…');
      const base = {
        board,
        class_level: classLevel,
        subject: subjectName,
        topic: topic.trim(),
        difficulty,
        exam_type: 'board' as const,
      };
      const [mcqRes, shortRes, longRes] = await Promise.all([
        questionService.generateQuestionsSafe({ ...base, qtype: 'MCQ', num_questions: 8 }),
        questionService.generateQuestionsSafe({ ...base, qtype: 'Short', num_questions: 5 }),
        questionService.generateQuestionsSafe({ ...base, qtype: 'Long', num_questions: 3 }),
      ]);
      const mcqQs = mcqRes.ok ? mcqRes.questions : [];
      const shortQs = shortRes.ok ? shortRes.questions : [];
      const longQs = longRes.ok ? longRes.questions : [];
      const merged = mergeRetrievalSources(
        mcqRes.ok ? mcqRes.retrieval_sources : [],
        shortRes.ok ? shortRes.retrieval_sources : [],
        longRes.ok ? longRes.retrieval_sources : []
      );
      setRetrievalSources(merged);
      setPaper([
        { type: 'mcq', questions: mcqQs },
        { type: 'short', questions: shortQs },
        { type: 'long', questions: longQs },
      ]);

      const failures: string[] = [];
      if (!mcqRes.ok) failures.push(`MCQs: ${mcqRes.error}`);
      if (!shortRes.ok) failures.push(`Short: ${shortRes.error}`);
      if (!longRes.ok) failures.push(`Long: ${longRes.error}`);
      const anyOk = mcqQs.length + shortQs.length + longQs.length > 0;
      if (failures.length > 0) {
        Alert.alert(
          anyOk ? 'Paper partly built' : 'Paper generation failed',
          failures.join('\n\n') + (anyOk ? '\n\nSections that succeeded are shown below.' : '')
        );
      }
    } catch (e: unknown) {
      Alert.alert('Paper generation failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
      setLoadStep('');
    }
  };

  const clearResults = () => {
    setPaper([]);
    setRetrievalSources([]);
    setTopic('');
    setDifficulty('Medium');
  };

  const totalMarks = paper.reduce(
    (sum, section) =>
      sum + section.questions.reduce((s, q) => s + (q.marks > 0 ? q.marks : 0), 0),
    0
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#B45309', colors.bg]}
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
            <Text style={styles.headerTitle}>Full paper</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.panel}>
            <InputField
              label="Topic / chapter"
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. Mechanics, Organic chemistry unit…"
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
              title={loading ? 'Building paper…' : 'Generate full paper'}
              onPress={generatePaper}
              disabled={loading || !topic.trim()}
              loading={loading}
              color="#F59E0B"
            />
            <Text style={styles.note}>
              Runs three question generations in parallel (MCQ, short, long). Ensure generation is enabled on the
              server.
            </Text>
          </View>

          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#FBBF24" />
              <Text style={styles.loadingTxt}>{loadStep || 'Working…'}</Text>
            </View>
          )}

          {paper.some((s) => s.questions.length > 0) && !loading && (
            <View style={styles.paper}>
              <View style={styles.paperHead}>
                <View>
                  <Text style={styles.paperTitle}>Practice paper</Text>
                  <Text style={styles.paperSub}>
                    {subjectName} · {topic} · {board} class {classLevel}
                  </Text>
                </View>
                <View style={styles.marksBox}>
                  <Text style={styles.marksNum}>{totalMarks || '—'}</Text>
                  <Text style={styles.marksLbl}>marks</Text>
                </View>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity onPress={clearResults} style={styles.clearBtn}>
                  <Trash2 size={18} color={colors.danger} />
                  <Text style={styles.clearTxt}>Clear</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.practiceHint}>
                Each item has an answer box, optional model answer, submit for scoring, and “Get detailed explanation”.
                Sign in to submit. Questions are numbered 1–N across the whole paper.
              </Text>

              {(() => {
                let n = 0;
                return paper.map((section) => (
                  <View key={section.type} style={styles.section}>
                    <View style={styles.sectionHead}>
                      <Text style={styles.sectionTitle}>
                        {section.type === 'mcq'
                          ? 'Section A — MCQs'
                          : section.type === 'short'
                            ? 'Section B — Short'
                            : 'Section C — Long'}
                      </Text>
                    </View>
                    {section.questions.map((q) => {
                      const idx = n;
                      n += 1;
                      return (
                        <QuestionPracticeCard
                          key={q.question_id}
                          item={q}
                          index={idx}
                          accentColor="#F59E0B"
                          retrievalSources={retrievalSources}
                          presentation={section.type === 'mcq' ? 'mcq' : 'freeform'}
                        />
                      );
                    })}
                  </View>
                ));
              })()}
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
  diffBtnOn: { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.12)' },
  diffTxt: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
  diffTxtOn: { color: colors.text },
  note: { marginTop: 14, color: colors.textSubtle, fontSize: 12, lineHeight: 18 },
  loadingBox: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  loadingTxt: { color: colors.textMuted, fontSize: 14 },
  paper: { paddingBottom: 40 },
  paperHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  paperTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  paperSub: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  marksBox: { alignItems: 'center' },
  marksNum: { color: '#FBBF24', fontSize: 28, fontWeight: '800' },
  marksLbl: { color: colors.textSubtle, fontSize: 11 },
  actions: { marginBottom: 16 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  clearTxt: { color: colors.danger, fontWeight: '700' },
  practiceHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  section: { marginBottom: 20 },
  sectionHead: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    padding: 12,
    borderRadius: radii.md,
    marginBottom: 10,
  },
  sectionTitle: { color: '#FBBF24', fontWeight: '800', fontSize: 15 },
});
