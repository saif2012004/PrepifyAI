import React, { useEffect, useMemo, useRef, useState } from 'react';

import {

  View,

  Text,

  TextInput,

  StyleSheet,

  TouchableOpacity,

  ActivityIndicator,

  Alert,

} from 'react-native';

import {

  questionService,

  GeneratedQuestionItem,

  QuestionAnswerResult,

  ExplainAnswerResult,

  RetrievalSourceItem,

} from '../services/questionService';

import { syncService } from '../services/syncService';

import { feedbackService, FeedbackType } from '../services/feedbackService';

import { colors, radii } from '../theme/colors';

import PrimaryButton from './PrimaryButton';

import { mcqFromGeneratedItem, mcqOrdinalLabel, resolveMcqCorrectLetter } from '../utils/mcqParse';
import { McqOptionBody } from './McqOptionBody';



export type QuestionPresentation = 'freeform' | 'mcq';

const FEEDBACK_KINDS: { key: FeedbackType; label: string }[] = [

  { key: 'quality', label: 'Quality' },

  { key: 'difficulty', label: 'Difficulty' },

  { key: 'clarity', label: 'Clarity' },

  { key: 'error', label: 'Error' },

];

type Props = {

  item: GeneratedQuestionItem;

  index: number;

  accentColor: string;

  /** Book-chunk previews from the same generate batch (RAG transparency). */

  retrievalSources?: RetrievalSourceItem[];

  /** MCQ: tap options, instant green/red; hides typed answer & model toggle until after submit. */

  presentation?: QuestionPresentation;

};



export default function QuestionPracticeCard({

  item,

  index,

  accentColor,

  retrievalSources = [],

  presentation = 'freeform',

}: Props) {

  const [draft, setDraft] = useState('');

  const [modelVisible, setModelVisible] = useState(false);

  const [sourcesOpen, setSourcesOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [grading, setGrading] = useState<QuestionAnswerResult | null>(null);

  const [explaining, setExplaining] = useState(false);

  const [tutor, setTutor] = useState<ExplainAnswerResult | null>(null);

  const [mcqPicked, setMcqPicked] = useState<string | null>(null);

  const [feedbackSent, setFeedbackSent] = useState(false);

  const [feedbackBusy, setFeedbackBusy] = useState(false);

  const [feedbackKind, setFeedbackKind] = useState<FeedbackType>('quality');

  const [feedbackStars, setFeedbackStars] = useState<number | null>(null);

  const [feedbackNote, setFeedbackNote] = useState('');

  const explainKeyRef = useRef<string | null>(null);

  /** Wall-clock seconds spent on this question (from open until submit); sent as ``time_taken`` for dashboards. */
  const questionOpenedAtRef = useRef<number>(Date.now());

  useEffect(() => {

    setFeedbackSent(false);

    setFeedbackKind('quality');

    setFeedbackStars(null);

    setFeedbackNote('');

  }, [item.question_id]);



  const parsed = useMemo(() => mcqFromGeneratedItem(item), [item.question, item.stem, item.options]);

  const correctLetter = useMemo(
    () => resolveMcqCorrectLetter(item.answer, parsed),
    [parsed, item.answer]
  );

  const useMcqTap =
    presentation === 'mcq' && parsed !== null && parsed.options.length === 4 && correctLetter !== null;



  useEffect(() => {

    setDraft('');

    setModelVisible(false);

    setGrading(null);

    setTutor(null);

    explainKeyRef.current = null;

    setMcqPicked(null);

    questionOpenedAtRef.current = Date.now();

  }, [item.question_id]);



  useEffect(() => {

    if (!grading) return;

    const key = `${item.question_id}:${Math.round(grading.score_percentage)}`;

    if (explainKeyRef.current === key) return;

    explainKeyRef.current = key;

    let cancelled = false;

    (async () => {

      try {

        const res = await questionService.explainAnswer(item.question_id, draft);

        if (!cancelled) setTutor(res);

      } catch {

        /* LLM may be unset; user can still tap “Get detailed explanation”. */

      }

    })();

    return () => {

      cancelled = true;

    };

  }, [grading, item.question_id, draft]);



  const onSubmit = async () => {

    if (!draft.trim()) {

      Alert.alert('Answer', useMcqTap ? 'Select an option first.' : 'Write your answer in the box first.');

      return;

    }

    setSubmitting(true);

    try {

      const elapsedSec = Math.max(
        1,
        Math.round((Date.now() - questionOpenedAtRef.current) / 1000)
      );

      const res = await questionService.submitAnswer({

        question_id: item.question_id,

        user_answer: draft,

        time_taken: elapsedSec,

      });

      setGrading(res);

      if (!useMcqTap) setModelVisible(true);

    } catch (e: unknown) {

      const msg = e instanceof Error ? e.message : 'Could not submit';

      if (

        /401|credential|login|unauthor|validate credentials|not authenticated/i.test(msg)

      ) {

        Alert.alert('Sign in required', 'Log in to submit answers and track progress.');

      } else {

        const networkLike =

          /network|internet|fetch|timeout|ECONNREFUSED|Failed to connect|not reachable|503|502/i.test(

            msg

          );

        if (networkLike) {

          try {

            await syncService.appendPendingAttempt({

              question_id: item.question_id,

              user_answer: draft.trim(),

            });

          } catch {

            /* ignore storage errors */

          }

          Alert.alert(

            'Submit failed',

            `${msg}\n\nYour answer was saved locally — open Profile and tap Upload offline attempts when you are online.`

          );

        } else {

          Alert.alert('Submit failed', msg);

        }

      }

    } finally {

      setSubmitting(false);

    }

  };



  const onExplain = async () => {

    setExplaining(true);

    try {

      const res = await questionService.explainAnswer(item.question_id, draft);

      setTutor(res);

    } catch (e: unknown) {

      Alert.alert('Explanation', e instanceof Error ? e.message : 'Failed');

    } finally {

      setExplaining(false);

    }

  };



  const onSendQuestionFeedback = async () => {

    setFeedbackBusy(true);

    try {

      await feedbackService.submit({

        question_id: item.question_id,

        feedback_type: feedbackKind,

        feedback_text: feedbackNote.trim() || undefined,

        rating: feedbackStars,

      });

      setFeedbackSent(true);

      Alert.alert('Thanks', 'Your feedback was submitted.');

    } catch (e: unknown) {

      const msg = e instanceof Error ? e.message : 'Could not send';

      if (/401|403|unauthor|login/i.test(msg)) {

        Alert.alert('Sign in', 'Log in to submit feedback.');

      } else {

        Alert.alert('Feedback', msg);

      }

    } finally {

      setFeedbackBusy(false);

    }

  };



  const onMcqOptionPress = (letter: string) => {

    setMcqPicked(letter);

    setDraft(letter);

  };



  const questionDisplay = useMcqTap && parsed ? parsed.stem : item.question;



  return (

    <View style={[styles.card, { borderLeftColor: accentColor }]}>

      <Text style={styles.qNo}>Q{index + 1}</Text>

      <Text style={styles.qText}>{questionDisplay}</Text>

      {item.marks > 0 && <Text style={styles.marks}>{item.marks} marks</Text>}



      {retrievalSources.length > 0 && (

        <View style={styles.sourcesWrap}>

          <TouchableOpacity

            onPress={() => setSourcesOpen((v) => !v)}

            style={styles.sourcesToggle}

            accessibilityRole="button"

            accessibilityLabel={sourcesOpen ? 'Hide RAG sources' : 'Show RAG sources'}

          >

            <Text style={styles.sourcesToggleTxt}>

              {sourcesOpen ? '▼ Hide book sources' : '▶ Sources used (RAG)'}

            </Text>

          </TouchableOpacity>

          {sourcesOpen

            ? retrievalSources.map((s, si) => (

                <View key={`${s.chunk_index}-${si}`} style={styles.sourceItem}>

                  {s.topic || s.source_tag ? (

                    <Text style={styles.sourceMeta}>

                      {[s.topic, s.source_tag].filter(Boolean).join(' · ')}

                    </Text>

                  ) : null}

                  <Text style={styles.sourcePreview}>{s.preview}</Text>

                </View>

              ))

            : null}

        </View>

      )}



      {useMcqTap && parsed ? (

        <>

          <Text style={styles.fieldLabel}>Tap your answer</Text>

          {parsed.options.map((opt) => {

            const selected = mcqPicked === opt.letter;

            const ok = selected && opt.letter === correctLetter;

            const bad = selected && opt.letter !== correctLetter;

            return (

              <TouchableOpacity

                key={opt.letter}

                style={[

                  styles.mcqOption,

                  ok && styles.mcqOptionCorrect,

                  bad && styles.mcqOptionWrong,

                ]}

                onPress={() => onMcqOptionPress(opt.letter)}

                activeOpacity={0.85}

                accessibilityRole="button"

                accessibilityState={{ selected }}

                accessibilityLabel={`Choice ${mcqOrdinalLabel(opt.letter)}: ${opt.text}`}

              >

                <Text style={styles.mcqOptionLetter}>{mcqOrdinalLabel(opt.letter)}.</Text>

                <McqOptionBody
                  text={opt.text}
                  baseStyle={styles.mcqOptionText}
                  primaryStyle={{ fontWeight: '600' }}
                  secondaryStyle={{ fontWeight: '400' }}
                />

              </TouchableOpacity>

            );

          })}

        </>

      ) : (

        <>

          <Text style={styles.fieldLabel}>Your answer</Text>

          <TextInput

            style={styles.input}

            value={draft}

            onChangeText={setDraft}

            placeholder="Type your answer here…"

            placeholderTextColor={colors.textSubtle}

            multiline

            textAlignVertical="top"

            editable={!submitting}

          />

        </>

      )}



      {!useMcqTap && (

        <View style={styles.row}>

          <TouchableOpacity

            style={[styles.secondaryBtn, modelVisible && styles.secondaryBtnOn]}

            onPress={() => setModelVisible((v) => !v)}

            activeOpacity={0.85}

          >

            <Text style={styles.secondaryBtnTxt}>

              {modelVisible ? 'Hide model answer' : 'Show model answer'}

            </Text>

          </TouchableOpacity>

        </View>

      )}



      {!useMcqTap && modelVisible && (

        <View style={styles.modelBox}>

          <Text style={styles.modelLbl}>Model answer</Text>

          <Text style={styles.modelVal}>{item.answer}</Text>

        </View>

      )}



      <View style={styles.submitWrap}>

        <PrimaryButton

          title={submitting ? 'Checking…' : 'Submit answer'}

          onPress={onSubmit}

          disabled={submitting || !draft.trim()}

          loading={submitting}

          color={accentColor}

        />

      </View>



      {grading && (

        <View style={styles.feedback}>

          <Text style={styles.feedTitle}>Result</Text>

          <Text style={[styles.feedLine, grading.is_correct ? styles.ok : styles.bad]}>

            {grading.is_correct ? 'Marked correct (or partial credit applied)' : 'Needs improvement'}

          </Text>

          <Text style={styles.feedLine}>

            Score: {Math.round(grading.score_percentage)}%

            {grading.score_marks != null && grading.max_marks != null

              ? ` (${grading.score_marks} / ${grading.max_marks} marks)`

              : ''}

          </Text>

          {grading.explanation ? (

            <Text style={styles.explain}>{grading.explanation}</Text>

          ) : null}

          <View style={styles.modelBox}>

            <Text style={styles.modelLbl}>Correct / reference answer (from server)</Text>

            <Text style={styles.modelVal}>{grading.correct_answer}</Text>

          </View>

        </View>

      )}



      {grading && !feedbackSent && (

        <View style={styles.qfbWrap}>

          <Text style={styles.qfbTitle}>Rate this question</Text>

          <Text style={styles.qfbHint}>Help improve the question bank (optional 1–5 + note).</Text>

          <View style={styles.qfbKindRow}>

            {FEEDBACK_KINDS.map((k) => (

              <TouchableOpacity

                key={k.key}

                onPress={() => setFeedbackKind(k.key)}

                style={[styles.qfbKind, feedbackKind === k.key && styles.qfbKindOn]}

              >

                <Text style={[styles.qfbKindTxt, feedbackKind === k.key && styles.qfbKindTxtOn]}>

                  {k.label}

                </Text>

              </TouchableOpacity>

            ))}

          </View>

          <View style={styles.qfbStars}>

            {[1, 2, 3, 4, 5].map((n) => (

              <TouchableOpacity key={n} onPress={() => setFeedbackStars(n)} style={styles.qfbStarBtn}>

                <Text style={[styles.qfbStarTxt, feedbackStars === n && styles.qfbStarTxtOn]}>{n}</Text>

              </TouchableOpacity>

            ))}

          </View>

          <TextInput

            style={styles.qfbInput}

            value={feedbackNote}

            onChangeText={setFeedbackNote}

            placeholder="Optional comment…"

            placeholderTextColor={colors.textSubtle}

            multiline

            editable={!feedbackBusy}

          />

          <TouchableOpacity

            style={[styles.qfbSubmit, feedbackBusy && { opacity: 0.7 }]}

            onPress={onSendQuestionFeedback}

            disabled={feedbackBusy}

          >

            {feedbackBusy ? (

              <ActivityIndicator color="#fff" />

            ) : (

              <Text style={styles.qfbSubmitTxt}>Send feedback</Text>

            )}

          </TouchableOpacity>

        </View>

      )}



      {grading && feedbackSent && (

        <Text style={styles.qfbThanks}>Feedback sent — thank you.</Text>

      )}



      <TouchableOpacity

        style={styles.explainBtn}

        onPress={onExplain}

        disabled={explaining}

        activeOpacity={0.85}

        accessibilityRole="button"

        accessibilityLabel="Get detailed explanation"

        accessibilityHint="Loads a tutor explanation from the server. Also loads automatically after submit when online."

      >

        {explaining ? (

          <ActivityIndicator color={colors.accent} />

        ) : (

          <Text style={styles.explainBtnTxt}>Get detailed explanation</Text>

        )}

      </TouchableOpacity>



      {tutor && (

        <View style={styles.tutorBox}>

          <Text style={styles.tutorTitle}>Tutor explanation</Text>

          <Text style={styles.explain}>{tutor.explanation}</Text>

          {tutor.missing_points?.length ? (

            <>

              <Text style={styles.missingTitle}>Points to strengthen</Text>

              {tutor.missing_points.map((p, i) => (

                <Text key={i} style={styles.bullet}>

                  • {p}

                </Text>

              ))}

            </>

          ) : null}

        </View>

      )}

    </View>

  );

}



const styles = StyleSheet.create({

  card: {

    backgroundColor: colors.surface,

    borderRadius: radii.lg,

    padding: 16,

    marginBottom: 12,

    borderWidth: 1,

    borderColor: colors.border,

    borderLeftWidth: 4,

  },

  qNo: { color: colors.accent, fontSize: 12, fontWeight: '800', marginBottom: 8 },

  qText: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600' },

  marks: { color: colors.textSubtle, fontSize: 12, marginTop: 8 },

  fieldLabel: {

    color: colors.textMuted,

    fontSize: 13,

    fontWeight: '600',

    marginTop: 14,

    marginBottom: 8,

  },

  input: {

    minHeight: 96,

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radii.md,

    padding: 12,

    color: colors.text,

    backgroundColor: colors.bgElevated,

    fontSize: 15,

    lineHeight: 22,

  },

  mcqOption: {

    flexDirection: 'row',

    alignItems: 'flex-start',

    gap: 10,

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radii.md,

    padding: 12,

    marginBottom: 8,

    backgroundColor: colors.bgElevated,

  },

  mcqOptionLetter: {

    color: colors.accent,

    fontSize: 15,

    fontWeight: '800',

    minWidth: 22,

  },

  mcqOptionText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 22 },

  mcqOptionCorrect: {

    borderColor: colors.success,

    backgroundColor: 'rgba(52, 211, 153, 0.14)',

  },

  mcqOptionWrong: {

    borderColor: colors.danger,

    backgroundColor: 'rgba(248, 113, 113, 0.12)',

  },

  row: { marginTop: 10 },

  secondaryBtn: {

    alignSelf: 'flex-start',

    paddingVertical: 8,

    paddingHorizontal: 12,

    borderRadius: radii.sm,

    borderWidth: 1,

    borderColor: colors.border,

    backgroundColor: colors.bgElevated,

  },

  secondaryBtnOn: { borderColor: colors.accent },

  secondaryBtnTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  modelBox: {

    marginTop: 12,

    paddingTop: 12,

    borderTopWidth: 1,

    borderTopColor: colors.border,

  },

  modelLbl: { color: colors.textMuted, fontSize: 12, marginBottom: 6, fontWeight: '600' },

  modelVal: { color: colors.success, fontSize: 15, lineHeight: 22 },

  submitWrap: { marginTop: 14 },

  feedback: {

    marginTop: 16,

    padding: 12,

    borderRadius: radii.md,

    backgroundColor: colors.bgElevated,

    borderWidth: 1,

    borderColor: colors.border,

  },

  feedTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },

  feedLine: { color: colors.textMuted, fontSize: 14, marginBottom: 4 },

  ok: { color: colors.success },

  bad: { color: colors.warning },

  explain: { color: colors.text, fontSize: 14, lineHeight: 22, marginTop: 8 },

  qfbWrap: {

    marginTop: 16,

    padding: 12,

    borderRadius: radii.md,

    backgroundColor: colors.bgElevated,

    borderWidth: 1,

    borderColor: colors.border,

  },

  qfbTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },

  qfbHint: { color: colors.textSubtle, fontSize: 12, marginTop: 4, marginBottom: 10 },

  qfbKindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },

  qfbKind: {

    paddingHorizontal: 10,

    paddingVertical: 6,

    borderRadius: radii.sm,

    backgroundColor: colors.surface,

    borderWidth: 1,

    borderColor: colors.border,

  },

  qfbKindOn: { borderColor: colors.accent, backgroundColor: colors.primaryMuted },

  qfbKindTxt: { fontSize: 12, fontWeight: '600', color: colors.textMuted },

  qfbKindTxtOn: { color: colors.text },

  qfbStars: { flexDirection: 'row', gap: 8, marginBottom: 10 },

  qfbStarBtn: {

    width: 36,

    height: 36,

    borderRadius: 8,

    alignItems: 'center',

    justifyContent: 'center',

    backgroundColor: colors.surface,

    borderWidth: 1,

    borderColor: colors.border,

  },

  qfbStarTxt: { fontSize: 14, fontWeight: '700', color: colors.textMuted },

  qfbStarTxtOn: { color: colors.accent },

  qfbInput: {

    minHeight: 64,

    borderRadius: radii.md,

    borderWidth: 1,

    borderColor: colors.border,

    padding: 10,

    color: colors.text,

    fontSize: 14,

    textAlignVertical: 'top',

    marginBottom: 10,

    backgroundColor: colors.surface,

  },

  qfbSubmit: {

    backgroundColor: colors.primary,

    paddingVertical: 12,

    borderRadius: radii.md,

    alignItems: 'center',

  },

  qfbSubmitTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  qfbThanks: { marginTop: 12, color: colors.success, fontSize: 13, fontWeight: '600' },

  explainBtn: {

    marginTop: 12,

    paddingVertical: 12,

    alignItems: 'center',

  },

  explainBtnTxt: { color: colors.accent, fontSize: 14, fontWeight: '700' },

  tutorBox: {

    marginTop: 8,

    padding: 12,

    borderRadius: radii.md,

    backgroundColor: colors.surface2,

    borderWidth: 1,

    borderColor: colors.border,

  },

  tutorTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 6 },

  missingTitle: { color: colors.warning, fontSize: 13, fontWeight: '700', marginTop: 10 },

  bullet: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 4 },

  sourcesWrap: {

    marginTop: 12,

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radii.md,

    overflow: 'hidden',

    backgroundColor: colors.bgElevated,

  },

  sourcesToggle: { paddingVertical: 10, paddingHorizontal: 12 },

  sourcesToggleTxt: { color: colors.accent, fontSize: 13, fontWeight: '700' },

  sourceItem: {

    paddingHorizontal: 12,

    paddingBottom: 10,

    borderTopWidth: 1,

    borderTopColor: colors.border,

  },

  sourceMeta: { color: colors.textSubtle, fontSize: 11, marginTop: 8, marginBottom: 4 },

  sourcePreview: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },

});

