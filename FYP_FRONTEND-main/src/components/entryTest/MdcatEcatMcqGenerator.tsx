import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Pressable,
  Switch,
  Alert,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { questionService, type GeneratedQuestionItem, type DifficultyUi } from '../../services/questionService';
import { mcqFromGeneratedItem, mcqOrdinalLabel, splitBilingualOptionLines } from '../../utils/mcqParse';
import { syllabusTopicChipsForMcq } from '../../syllabus';
import { colors, radii } from '../../theme/colors';
import {
  COUNT_OPTIONS,
  TIMER_PRESETS,
  TOPIC_SUGGESTIONS,
  SUBJECTS,
  dedupeByStem,
  shortExplanation,
  buildParsedList,
  type ExamKey,
} from './mdcatEcatMcqLabShared';

export default function MdcatEcatMcqGenerator() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const questionsSectionY = useRef(0);

  const [exam, setExam] = useState<ExamKey>('mdcat');
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number]>('Physics');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyUi>('Medium');
  const [count, setCount] = useState<number>(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<GeneratedQuestionItem[]>([]);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [quizMinutes, setQuizMinutes] = useState<(typeof TIMER_PRESETS)[number]>(15);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [quizActive, setQuizActive] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [weakTags, setWeakTags] = useState<string[]>([]);
  const seenAcrossBatches = useRef<Set<string>>(new Set());
  const quizEndGuard = useRef(false);

  const topicHints = useMemo(() => {
    const fromSyllabus = syllabusTopicChipsForMcq({ exam, subjectDisplay: subject });
    if (fromSyllabus.length) return fromSyllabus;
    return TOPIC_SUGGESTIONS[subject] ?? [];
  }, [exam, subject]);

  const board = exam === 'mdcat' ? 'MDCAT' : 'ECAT';

  const parsedList = useMemo(() => buildParsedList(questions), [questions]);

  const score = useMemo(() => {
    let correct = 0;
    let attempted = 0;
    for (const { q, correct: c } of parsedList) {
      const p = picked[q.question_id];
      if (!p || !c) continue;
      attempted += 1;
      if (p === c) correct += 1;
    }
    return { correct, attempted, total: questions.length };
  }, [parsedList, picked, questions.length]);

  const computeWeakTags = useCallback(
    (list: ReturnType<typeof buildParsedList>) => {
      const t = topic.trim() || subject;
      const wrongTopics: string[] = [];
      for (const { q, correct } of list) {
        if (!correct) continue;
        const p = picked[q.question_id];
        if (!p || p !== correct) wrongTopics.push(t);
      }
      const freq = new Map<string, number>();
      for (const w of wrongTopics) freq.set(w, (freq.get(w) ?? 0) + 1);
      return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, n]) => `${name} (${n} miss${n > 1 ? 'es' : ''})`);
    },
    [picked, subject, topic]
  );

  const finishQuiz = useCallback(() => {
    if (quizEndGuard.current) return;
    quizEndGuard.current = true;
    setQuizActive(false);
    setQuizFinished(true);
    setChecked(true);
    setTimeLeft(null);
    setWeakTags(computeWeakTags(parsedList));
  }, [computeWeakTags, parsedList]);

  useEffect(() => {
    if (!quizActive) return;
    quizEndGuard.current = false;
    const id = setInterval(() => {
      setTimeLeft((s) => (s == null ? null : s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [quizActive]);

  useEffect(() => {
    if (quizActive && timeLeft === 0) {
      finishQuiz();
    }
  }, [timeLeft, quizActive, finishQuiz]);

  useEffect(() => {
    if (questions.length === 0 || loading) return;
    const y = questionsSectionY.current;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, 200);
    return () => clearTimeout(t);
  }, [questions.length, loading]);

  const runGenerate = useCallback(async () => {
    const t = topic.trim();
    if (!t) {
      setError('Enter or select a topic.');
      return;
    }
    setLoading(true);
    setError(null);
    quizEndGuard.current = false;
    setChecked(false);
    setShowAnswers(false);
    setQuizFinished(false);
    setQuizActive(false);
    setTimeLeft(null);
    setWeakTags([]);
    try {
      const extra = Math.min(6, Math.ceil(count / 3));
      const { questions: raw } = await questionService.generateQuestions({
        board,
        class_level: '12',
        subject,
        topic: t,
        difficulty,
        qtype: 'MCQ',
        exam_type: exam,
        num_questions: count + extra,
      });
      const deduped = dedupeByStem(raw).filter((q) => {
        const p = mcqFromGeneratedItem(q);
        const key = (p?.stem ?? q.question ?? '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .slice(0, 180);
        if (!key || seenAcrossBatches.current.has(key)) return false;
        return true;
      });
      const slice = deduped.slice(0, count);
      for (const q of slice) {
        const p = mcqFromGeneratedItem(q);
        const key = (p?.stem ?? q.question ?? '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .slice(0, 180);
        if (key) seenAcrossBatches.current.add(key);
      }
      setQuestions(slice);
      setPicked({});
      if (slice.length === 0) {
        setError('No valid MCQs returned — try another topic or fewer questions.');
      } else {
        setError(null);
      }
    } catch (e: unknown) {
      setQuestions([]);
      const msg = e instanceof Error ? e.message : 'Generation failed';
      setError(msg);
      if (/Network|fetch|Failed/i.test(msg)) {
        Alert.alert(
          'Connection',
          'Check that the backend is reachable from this phone (same Wi‑Fi; set your PC address in .env if needed).'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [board, count, difficulty, exam, subject, topic]);

  const startQuiz = () => {
    if (questions.length === 0) return;
    quizEndGuard.current = false;
    setQuizMode(true);
    setQuizFinished(false);
    setChecked(false);
    setShowAnswers(false);
    setPicked({});
    setTimeLeft(quizMinutes * 60);
    setQuizActive(true);
  };

  const resetSession = () => {
    seenAcrossBatches.current.clear();
    setQuestions([]);
    setPicked({});
    setChecked(false);
    setShowAnswers(false);
    setQuizMode(false);
    setQuizActive(false);
    setQuizFinished(false);
    setTimeLeft(null);
    setWeakTags([]);
    setError(null);
  };

  const revealAllowed = !quizMode || quizFinished;

  const chipRow = (children: React.ReactNode) => <View style={styles.chipRow}>{children}</View>;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientStart, colors.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.45 }}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerSub}>MDCAT / ECAT</Text>
            <Text style={styles.headerTitle}>MCQ lab</Text>
          </View>
          {quizMode && quizActive && timeLeft != null ? (
            <View style={styles.timerBox}>
              <Text style={styles.timerLabel}>Time</Text>
              <Text style={styles.timerVal}>
                {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
              </Text>
            </View>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Same engine as web: pick exam, subject, topic, then generate. Open{' '}
            <Text style={styles.link} onPress={() => router.push('/entry-test/syllabus' as never)}>
              syllabus
            </Text>{' '}
            for topic ideas.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Configuration</Text>
            <Text style={styles.label}>Exam</Text>
            {chipRow(
              (['mdcat', 'ecat'] as const).map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.chip, exam === k && styles.chipOn]}
                  onPress={() => setExam(k)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipTxt, exam === k && styles.chipTxtOn]}>{k.toUpperCase()}</Text>
                </TouchableOpacity>
              ))
            )}

            <Text style={[styles.label, styles.labelSp]}>Subject</Text>
            {chipRow(
              SUBJECTS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, subject === s && styles.chipOnIndigo]}
                  onPress={() => {
                    setSubject(s);
                    setTopic('');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipTxt, subject === s && styles.chipTxtOn]}>
                    {s === 'Mathematics' ? 'Math' : s}
                  </Text>
                </TouchableOpacity>
              ))
            )}

            <Text style={[styles.label, styles.labelSp]}>Topic</Text>
            <TextInput
              style={styles.input}
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. Newton's laws, kinetics…"
              placeholderTextColor={colors.textSubtle}
            />
            <Text style={styles.hint}>Tap a chip or type a topic.</Text>
            <ScrollView style={styles.topicScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <View style={styles.topicChipWrap}>
                {topicHints.map((h) => (
                  <TouchableOpacity key={h} style={styles.topicChip} onPress={() => setTopic(h)} activeOpacity={0.85}>
                    <Text style={styles.topicChipTxt} numberOfLines={2}>
                      {h}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.label, styles.labelSp]}>Difficulty</Text>
            {chipRow(
              (['Easy', 'Medium', 'Hard'] as const).map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, difficulty === d && styles.chipOnEmerald]}
                  onPress={() => setDifficulty(d)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipTxt, difficulty === d && styles.chipTxtOnDark]}>{d}</Text>
                </TouchableOpacity>
              ))
            )}

            <Text style={[styles.label, styles.labelSp]}>Count</Text>
            {chipRow(
              COUNT_OPTIONS.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.chipSm, count === n && styles.chipOnViolet]}
                  onPress={() => setCount(n)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipTxt, count === n && styles.chipTxtOn]}>{n}</Text>
                </TouchableOpacity>
              ))
            )}

            <TouchableOpacity
              style={[styles.genBtn, loading && styles.genBtnDisabled]}
              onPress={() => void runGenerate()}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.genBtnTxt}>Generate MCQs</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.clearBtn} onPress={resetSession} activeOpacity={0.85}>
              <Text style={styles.clearBtnTxt}>Clear session</Text>
            </TouchableOpacity>
            {error ? <Text style={styles.err}>{error}</Text> : null}
          </View>

          {questions.length > 0 ? (
            <View
              onLayout={(e) => {
                questionsSectionY.current = e.nativeEvent.layout.y;
              }}
            >
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Mode</Text>
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[styles.modeBtn, !quizMode && styles.modeBtnOn]}
                    onPress={() => {
                      setQuizMode(false);
                      setQuizActive(false);
                      setQuizFinished(false);
                      setTimeLeft(null);
                      setChecked(false);
                    }}
                  >
                    <Text style={[styles.modeBtnTxt, !quizMode && styles.modeBtnTxtOn]}>Study</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeBtn, quizMode && styles.modeBtnOn]}
                    onPress={() => {
                      setQuizMode(true);
                      setQuizActive(false);
                      setQuizFinished(false);
                      setTimeLeft(null);
                      setChecked(false);
                    }}
                  >
                    <Text style={[styles.modeBtnTxt, quizMode && styles.modeBtnTxtOn]}>Quiz</Text>
                  </TouchableOpacity>
                </View>

                {quizMode && !quizActive && !quizFinished ? (
                  <View style={styles.timerRow}>
                    <Text style={styles.smallLabel}>Timer</Text>
                    <View style={styles.chipRow}>
                      {TIMER_PRESETS.map((m) => (
                        <TouchableOpacity
                          key={m}
                          style={[styles.chipSm, quizMinutes === m && styles.chipOnAmber]}
                          onPress={() => setQuizMinutes(m)}
                        >
                          <Text style={[styles.chipTxt, quizMinutes === m && styles.chipTxtOnDark]}>{m}m</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity style={styles.startQuizBtn} onPress={startQuiz}>
                      <Text style={styles.startQuizTxt}>Start timer</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View style={styles.switchRow}>
                  {revealAllowed ? (
                    <>
                      <Text style={styles.switchLabel}>Show answers</Text>
                      <Switch
                        value={showAnswers}
                        onValueChange={setShowAnswers}
                        trackColor={{ false: colors.surface2, true: colors.primary }}
                        thumbColor={colors.text}
                      />
                    </>
                  ) : (
                    <Text style={styles.lockHint}>Answers lock until quiz ends</Text>
                  )}
                  <TouchableOpacity style={styles.regenBtn} onPress={() => void runGenerate()} disabled={loading}>
                    <Text style={styles.regenTxt}>Regenerate</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {quizMode && quizFinished ? (
                <View style={styles.resultBanner}>
                  <Text style={styles.resultTitle}>Quiz results</Text>
                  <Text style={styles.resultBig}>
                    {score.correct} / {score.total}{' '}
                    <Text style={styles.resultPct}>
                      ({score.total ? Math.round((score.correct / score.total) * 100) : 0}%)
                    </Text>
                  </Text>
                  {weakTags.length > 0 ? (
                    <View style={styles.weakWrap}>
                      <Text style={styles.weakTitle}>Review</Text>
                      <View style={styles.chipRow}>
                        {weakTags.map((w) => (
                          <View key={w} style={styles.weakChip}>
                            <Text style={styles.weakChipTxt}>{w}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : score.total > 0 && score.correct === score.total ? (
                    <Text style={styles.allCorrect}>Strong round — try mixed topics next.</Text>
                  ) : null}
                </View>
              ) : null}

              {quizMode && !quizFinished && quizActive ? (
                <TouchableOpacity style={styles.submitEarly} onPress={finishQuiz}>
                  <Text style={styles.submitEarlyTxt}>Submit quiz early</Text>
                </TouchableOpacity>
              ) : null}

              {parsedList.map(({ q, parsed, correct }, idx) => {
                if (!parsed || !correct) {
                  return (
                    <View key={q.question_id} style={styles.parseErr}>
                      <Text style={styles.parseErrTxt}>Q{idx + 1}: Could not parse MCQ. Regenerate.</Text>
                    </View>
                  );
                }
                const choice = picked[q.question_id];
                const show = (showAnswers && revealAllowed) || checked;
                const optionsLocked = (checked && !quizMode) || (quizMode && quizFinished);

                return (
                  <View key={`${q.question_id}-${idx}`} style={styles.qCard}>
                    <View style={styles.qHead}>
                      <Text style={styles.qBadge}>Q{idx + 1}</Text>
                      <Text style={styles.qMeta}>
                        {difficulty} · {subject}
                      </Text>
                    </View>
                    <Text style={styles.qStem}>{parsed.stem}</Text>
                    <View style={styles.optGrid}>
                      {parsed.options.map((opt) => {
                        const selected = choice === opt.letter;
                        const isCorrect = opt.letter === correct;
                        let borderColor = colors.border as string;
                        let bg = colors.bgElevated as string;
                        if (show) {
                          if (isCorrect) {
                            borderColor = colors.success as string;
                            bg = 'rgba(52,211,153,0.12)';
                          } else if (selected && !isCorrect) {
                            borderColor = colors.danger as string;
                            bg = 'rgba(248,113,113,0.1)';
                          }
                        } else if (selected) {
                          borderColor = colors.primary as string;
                          bg = colors.primaryMuted as string;
                        }
                        const optDynamic = {
                          borderColor,
                          backgroundColor: bg,
                          opacity: optionsLocked ? 0.85 : 1,
                        } as ViewStyle;
                        return (
                          <Pressable
                            key={opt.letter}
                            disabled={optionsLocked}
                            onPress={() => {
                              if (optionsLocked) return;
                              setPicked((prev) => ({ ...prev, [q.question_id]: opt.letter }));
                            }}
                            style={({ pressed }) => {
                              const pressedStyle: ViewStyle =
                                pressed && !optionsLocked ? { opacity: 0.92 } : {};
                              return [styles.optBtn, optDynamic, pressedStyle];
                            }}
                          >
                            <View style={styles.optLetterWrap}>
                              <Text style={styles.optLetter}>{mcqOrdinalLabel(opt.letter)}</Text>
                            </View>
                            {(() => {
                              const lines = splitBilingualOptionLines(opt.text);
                              if (lines.length <= 1) {
                                return <Text style={styles.optText}>{opt.text}</Text>;
                              }
                              return (
                                <View style={styles.optTextCol}>
                                  {lines.map((line, li) => (
                                    <Text
                                      key={`${opt.letter}-${li}`}
                                      style={li === 0 ? styles.optText : styles.optTextUrdu}
                                    >
                                      {line}
                                    </Text>
                                  ))}
                                </View>
                              );
                            })()}
                          </Pressable>
                        );
                      })}
                    </View>
                    {show ? (
                      <View style={styles.answerBox}>
                        <Text style={styles.answerLabel}>Answer</Text>
                        <Text style={styles.answerLetter}>Answer: {mcqOrdinalLabel(correct)}</Text>
                        <Text style={styles.answerExpl}>{shortExplanation(q, correct)}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {!quizMode ? (
                <TouchableOpacity
                  style={[styles.checkBtn, questions.length === 0 && styles.genBtnDisabled]}
                  disabled={questions.length === 0 || (quizMode && quizActive)}
                  onPress={() => {
                    setChecked(true);
                    setWeakTags(computeWeakTags(parsedList));
                  }}
                >
                  <Text style={styles.checkBtnTxt}>Check answers (study)</Text>
                </TouchableOpacity>
              ) : quizActive ? (
                <TouchableOpacity style={styles.checkBtn} onPress={finishQuiz}>
                  <Text style={styles.checkBtnTxt}>Finish & score quiz</Text>
                </TouchableOpacity>
              ) : null}

              {!quizMode && checked ? (
                <View style={styles.scoreBox}>
                  <Text style={styles.scoreTxt}>
                    Score:{' '}
                    <Text style={styles.scoreNum}>
                      {score.correct}/{score.total}
                    </Text>{' '}
                    correct
                  </Text>
                  {score.attempted < score.total ? (
                    <Text style={styles.scoreHint}>Select an option for every question to count attempts.</Text>
                  ) : null}
                  {weakTags.length > 0 ? (
                    <View style={styles.weakWrap}>
                      <Text style={styles.weakTitle}>Review focus</Text>
                      <View style={styles.chipRow}>
                        {weakTags.map((w) => (
                          <View key={w} style={styles.weakChip}>
                            <Text style={styles.weakChipTxt}>{w}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : score.total > 0 && score.correct === score.total ? (
                    <Text style={styles.allCorrect}>Clean sheet on this set.</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Ready to practice</Text>
              <Text style={styles.emptyBody}>
                Choose MDCAT or ECAT, subject, topic, then Generate. Ensure the backend is running and the phone can
                reach your server URL.
              </Text>
            </View>
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
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerSub: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  timerBox: {
    minWidth: 72,
    alignItems: 'flex-end',
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    backgroundColor: 'rgba(251,191,36,0.08)',
    paddingHorizontal: 8,
  },
  timerLabel: { fontSize: 9, fontWeight: '800', color: colors.warning, textTransform: 'uppercase' },
  timerVal: { fontSize: 20, fontWeight: '900', color: colors.warning, fontVariant: ['tabular-nums'] },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 48 },
  intro: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  link: { color: colors.accent, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 11, fontWeight: '800', color: colors.textSubtle, textTransform: 'uppercase', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 8 },
  labelSp: { marginTop: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  chipSm: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipOnIndigo: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipOnEmerald: { backgroundColor: colors.success, borderColor: colors.success },
  chipOnViolet: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipOnAmber: { backgroundColor: colors.warning, borderColor: colors.warning },
  chipTxt: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.text },
  chipTxtOnDark: { color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.bgElevated,
  },
  hint: { fontSize: 11, color: colors.textSubtle, marginTop: 6 },
  topicScroll: { marginTop: 10, maxHeight: 160 },
  topicChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  topicChip: {
    maxWidth: 220,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  topicChipTxt: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  genBtn: {
    marginTop: 18,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  genBtnDisabled: { opacity: 0.55 },
  genBtnTxt: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  clearBtn: { marginTop: 10, alignSelf: 'center', paddingVertical: 10 },
  clearBtnTxt: { color: colors.textMuted, fontWeight: '700', fontSize: 14 },
  err: { color: colors.danger, marginTop: 12, fontSize: 13, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.sm, backgroundColor: colors.bgElevated },
  modeBtnOn: { backgroundColor: colors.surface2 },
  modeBtnTxt: { color: colors.textMuted, fontWeight: '700' },
  modeBtnTxtOn: { color: colors.text },
  timerRow: { marginTop: 8, marginBottom: 8 },
  smallLabel: { fontSize: 11, color: colors.textSubtle, marginBottom: 6 },
  startQuizBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: colors.warning,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  startQuizTxt: { color: '#0f172a', fontWeight: '900', fontSize: 13 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  switchLabel: { color: colors.text, fontSize: 14, flex: 1 },
  lockHint: { color: colors.textSubtle, fontSize: 12, flex: 1 },
  regenBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.accent },
  regenTxt: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  resultBanner: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
    backgroundColor: 'rgba(52,211,153,0.08)',
    padding: 16,
    marginBottom: 12,
  },
  resultTitle: { fontSize: 16, fontWeight: '900', color: colors.success },
  resultBig: { fontSize: 22, fontWeight: '900', color: colors.text, marginTop: 6 },
  resultPct: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  weakWrap: { marginTop: 10 },
  weakTitle: { fontSize: 11, fontWeight: '800', color: colors.danger, textTransform: 'uppercase' },
  weakChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  weakChipTxt: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  allCorrect: { marginTop: 8, color: colors.success, fontSize: 13 },
  submitEarly: { alignSelf: 'flex-end', marginBottom: 12, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.md },
  submitEarlyTxt: { color: colors.text, fontWeight: '800', fontSize: 13 },
  qCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  qHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  qBadge: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.accent,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  qMeta: { fontSize: 11, color: colors.textSubtle },
  qStem: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 24, marginBottom: 12 },
  optGrid: { gap: 10 },
  optBtn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 10,
  },
  optLetterWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  optLetter: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.accent,
  },
  optText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  optTextCol: { flex: 1, flexDirection: 'column' },
  optTextUrdu: {
    marginTop: 2,
    color: colors.text,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    opacity: 0.92,
  },
  answerBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  answerLabel: { fontSize: 10, fontWeight: '800', color: colors.success, textTransform: 'uppercase' },
  answerLetter: { marginTop: 4, fontSize: 14, fontWeight: '800', color: colors.text },
  answerExpl: { marginTop: 8, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  parseErr: {
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    marginBottom: 10,
  },
  parseErrTxt: { color: colors.danger, fontSize: 13 },
  checkBtn: {
    marginTop: 8,
    marginBottom: 20,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radii.lg,
  },
  checkBtnTxt: { color: colors.text, fontWeight: '900', fontSize: 14 },
  scoreBox: { alignItems: 'center', marginBottom: 24 },
  scoreTxt: { color: colors.textMuted, fontSize: 14 },
  scoreNum: { color: colors.accent, fontWeight: '900' },
  scoreHint: { color: colors.textSubtle, fontSize: 12, marginTop: 6, textAlign: 'center' },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
  emptyBody: { color: colors.textSubtle, fontSize: 13, textAlign: 'center', marginTop: 10, lineHeight: 20 },
});
