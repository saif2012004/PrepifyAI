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
import { useRouter } from 'expo-router';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import InputField from '../../components/InputField';
import PrimaryButton from '../../components/PrimaryButton';
import QuestionPracticeCard from '../../components/QuestionPracticeCard';
import {
  questionService,
  emptyGenerationUserMessage,
  GeneratedQuestionItem,
  DifficultyUi,
  RetrievalSourceItem,
} from '../../services/questionService';
import { colors, radii } from '../../theme/colors';

type QType = 'MCQ' | 'Short' | 'Long';

export default function QuestionGeneratorScreen() {
  const router = useRouter();
  const [board, setBoard] = useState('FBISE');
  const [classLevel, setClassLevel] = useState('10');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyUi>('Medium');
  const [qtype, setQtype] = useState<QType>('MCQ');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<GeneratedQuestionItem[]>([]);
  const [retrievalSources, setRetrievalSources] = useState<RetrievalSourceItem[]>([]);

  const difficulties: DifficultyUi[] = ['Easy', 'Medium', 'Hard'];
  const qtypes: { id: QType; label: string }[] = [
    { id: 'MCQ', label: 'MCQ' },
    { id: 'Short', label: 'Short' },
    { id: 'Long', label: 'Long' },
  ];

  const defaultCount = (t: QType) => (t === 'Long' ? 4 : t === 'MCQ' ? 8 : 6);

  const generateQuestions = async () => {
    if (!subject.trim() || !topic.trim()) {
      Alert.alert('Missing fields', 'Enter subject and topic.');
      return;
    }
    setLoading(true);
    try {
      const genResult = await questionService.generateQuestions({
        board: board.trim() || 'FBISE',
        class_level: classLevel.trim() || '10',
        subject: subject.trim(),
        topic: topic.trim(),
        difficulty,
        qtype,
        exam_type: 'board',
        num_questions: defaultCount(qtype),
      });
      setQuestions(genResult.questions);
      setRetrievalSources(genResult.retrieval_sources);
      if (genResult.questions.length === 0) {
        Alert.alert('No questions', emptyGenerationUserMessage(genResult));
      }
    } catch (e: unknown) {
      Alert.alert('Generation failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setQuestions([]);
    setRetrievalSources([]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI Question Generator</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            <InputField
              label="Board"
              value={board}
              onChangeText={setBoard}
              placeholder="FBISE, Punjab, …"
              appearance="dark"
            />
            <InputField
              label="Class level"
              value={classLevel}
              onChangeText={setClassLevel}
              placeholder="9, 10, 11, 12"
              appearance="dark"
            />
            <InputField
              label="Subject"
              value={subject}
              onChangeText={setSubject}
              placeholder="Biology, Chemistry, Physics…"
              appearance="dark"
            />
            <InputField
              label="Topic"
              value={topic}
              onChangeText={setTopic}
              placeholder="Cell structure, Organic chemistry…"
              appearance="dark"
            />

            <Text style={styles.label}>Difficulty</Text>
            <View style={styles.difficultyContainer}>
              {difficulties.map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.difficultyButton,
                    difficulty === level && styles.difficultyButtonActive,
                  ]}
                  onPress={() => setDifficulty(level)}
                >
                  <Text
                    style={[
                      styles.difficultyText,
                      difficulty === level && styles.difficultyTextActive,
                    ]}
                  >
                    {level}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Question type</Text>
            <View style={styles.difficultyContainer}>
              {qtypes.map(({ id, label }) => (
                <TouchableOpacity
                  key={id}
                  style={[styles.difficultyButton, qtype === id && styles.difficultyButtonActive]}
                  onPress={() => setQtype(id)}
                >
                  <Text
                    style={[styles.difficultyText, qtype === id && styles.difficultyTextActive]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.countHint}>
              Generates {defaultCount(qtype)} questions (same as Prepare with AI defaults).
            </Text>

            <View style={styles.buttonSpacing}>
              <PrimaryButton
                title={loading ? 'Generating…' : 'Generate questions'}
                onPress={generateQuestions}
                loading={loading}
                disabled={loading || !subject.trim() || !topic.trim()}
                color={colors.primary}
              />
            </View>

            {questions.length > 0 && (
              <TouchableOpacity style={styles.clearButton} onPress={clearResults} activeOpacity={0.7}>
                <Trash2 size={18} color={colors.danger} strokeWidth={2} />
                <Text style={styles.clearButtonText}>Clear results</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading && (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loaderText}>Calling PrepifyAI backend…</Text>
            </View>
          )}

          {questions.length > 0 && !loading && (
            <View style={styles.questionsContainer}>
              <Text style={styles.questionsTitle}>Generated ({questions.length})</Text>
              <Text style={styles.practiceHint}>
                Submit answers while logged in. Use “Show model answer” when you want to reveal it.
              </Text>
              {questions.map((q, i) => (
                <QuestionPracticeCard
                  key={q.question_id}
                  item={q}
                  index={i}
                  accentColor={colors.primary}
                  retrievalSources={retrievalSources}
                  presentation={qtype === 'MCQ' ? 'mcq' : 'freeform'}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  form: {
    padding: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
    marginTop: 4,
  },
  difficultyContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  difficultyButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  difficultyButtonActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  difficultyText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  difficultyTextActive: {
    color: colors.text,
  },
  countHint: {
    fontSize: 12,
    color: colors.textSubtle,
    marginBottom: 12,
  },
  buttonSpacing: {
    marginTop: 8,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    gap: 8,
  },
  clearButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  loaderContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loaderText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.textMuted,
  },
  questionsContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  questionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  practiceHint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: 14,
  },
});
