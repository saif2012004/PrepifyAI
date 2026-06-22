import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { motion } from 'framer-motion';
import { questionService, type GeneratedQuestionItem, type DifficultyUi } from '../../services/questionService';
import { mcqFromGeneratedItem, mcqOrdinalLabel, splitBilingualOptionLines } from '../../utils/mcqParse';
import { syllabusTopicChipsForMcq } from '../../syllabus';
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
    for (const { q, correct: correctLetter } of parsedList) {
      const p = picked[q.question_id];
      if (!p || !correctLetter) continue;
      attempted += 1;
      if (p === correctLetter) correct += 1;
    }
    return { correct, attempted, total: questions.length };
  }, [parsedList, picked, questions.length]);

  const computeWeakTags = useCallback(
    (list: typeof parsedList) => {
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

  const quizEndGuard = useRef(false);

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
    const id = window.setInterval(() => {
      setTimeLeft((s) => (s == null ? null : s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [quizActive]);

  useEffect(() => {
    if (quizActive && timeLeft === 0) {
      finishQuiz();
    }
  }, [timeLeft, quizActive, finishQuiz]);

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
        queueMicrotask(() => {
          document.getElementById('entry-test-mcq-questions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } catch (e: unknown) {
      setQuestions([]);
      setError(e instanceof Error ? e.message : 'Generation failed');
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

  const scrollToMain = () => {
    document.getElementById('entry-test-mcq-lab-scroll-target')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full overflow-x-hidden overflow-y-visible bg-slate-950 text-slate-100 selection:bg-cyan-500/25 [&_a]:cursor-pointer [&_button:not(:disabled)]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
      <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-5 sm:py-8 lg:px-8">
        <motion.header
          className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="min-w-0 flex-1 lg:max-w-3xl">
            <button
              type="button"
              onClick={() => router.back()}
              className="mb-3 inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800 active:bg-slate-800/90"
            >
              ← Back
            </button>
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">Entry test prep</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl md:text-4xl">
              MDCAT / ECAT MCQ lab
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
              Generate exam-style MCQs with conceptual, numeric, and theory mixes. Use study mode to learn, or quiz
              mode with a timer and scored review. Topic chips follow the{' '}
              <Link
                href="/entry-test/syllabus"
                className="font-semibold text-cyan-400 underline decoration-cyan-500/50 transition-colors hover:text-cyan-200"
              >
                unified syllabus
              </Link>
              .
            </p>
            <button
              type="button"
              onClick={scrollToMain}
              className="mt-4 inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-cyan-300 transition-colors hover:border-slate-500 hover:bg-slate-700 active:scale-[0.99] sm:mt-5"
            >
              Scroll down for configuration & MCQs
              <span aria-hidden className="text-base leading-none">
                ↓
              </span>
            </button>
          </div>
          {quizMode && quizActive && timeLeft != null ? (
            <div className="shrink-0 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 text-center sm:text-right lg:min-w-[11rem]">
              <p className="text-xs font-bold uppercase text-amber-200">Time left</p>
              <p className="font-mono text-3xl font-black text-amber-300">
                {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
              </p>
            </div>
          ) : null}
        </motion.header>

        <motion.section
          id="entry-test-mcq-lab-scroll-target"
          className="mb-8 scroll-mt-6 rounded-2xl border border-slate-700/80 bg-slate-900/80 p-4 shadow-xl shadow-black/40 sm:p-5 md:p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Configuration</h2>
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-400">Exam</label>
              <div className="flex flex-wrap gap-2">
                {(['mdcat', 'ecat'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setExam(k)}
                    className={`min-h-11 min-w-[4.5rem] touch-manipulation rounded-xl px-4 py-2 text-sm font-bold uppercase transition-colors active:scale-[0.98] ${
                      exam === k
                        ? 'bg-cyan-500 text-slate-950 ring-2 ring-cyan-300'
                        : 'border border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500 hover:bg-slate-700'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-400">Subject</label>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSubject(s);
                      setTopic('');
                    }}
                    className={`min-h-11 touch-manipulation rounded-xl px-3 py-2 text-sm font-semibold transition-colors active:scale-[0.98] ${
                      subject === s
                        ? 'bg-indigo-500 text-white ring-2 ring-indigo-300'
                        : 'border border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500 hover:bg-slate-700'
                    }`}
                  >
                    {s === 'Mathematics' ? 'Math' : s}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <label className="mb-2 block text-xs font-semibold text-slate-400">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Newton's laws, chemical kinetics, genetics…"
                className="min-h-11 w-full min-w-0 cursor-text rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500 transition-shadow focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:text-base"
                style={{ wordBreak: 'break-word' }}
              />
              <p className="mt-1.5 text-[11px] text-slate-500 sm:text-xs">
                Click or tap a chip, or type a topic, then Generate MCQs.
              </p>
              <div
                className="mt-2 max-h-44 overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-xl border border-slate-700/60 bg-slate-950/50 p-2 [-webkit-overflow-scrolling:touch] hover:border-slate-600 sm:max-h-52 md:max-h-60"
                style={{ touchAction: 'pan-y' }}
              >
                <div className="flex flex-wrap gap-2">
                  {topicHints.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setTopic(h)}
                      className="max-w-full min-h-9 touch-manipulation rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-2 text-left text-xs font-medium leading-snug text-cyan-200 transition-colors hover:border-cyan-500/40 hover:bg-slate-700 active:scale-[0.99] sm:py-1.5"
                      style={{ wordBreak: 'break-word' }}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-400">Difficulty</label>
              <div className="flex flex-wrap gap-2">
                {(['Easy', 'Medium', 'Hard'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`min-h-11 touch-manipulation rounded-xl px-3 py-2 text-sm font-semibold transition-colors active:scale-[0.98] ${
                      difficulty === d
                        ? 'bg-emerald-500 text-slate-950'
                        : 'border border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500 hover:bg-slate-700'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-400">Number of MCQs</label>
              <div className="flex flex-wrap gap-2">
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className={`min-h-11 min-w-11 touch-manipulation rounded-xl px-3 py-2 text-sm font-bold transition-colors active:scale-[0.98] ${
                      count === n
                        ? 'bg-violet-500 text-white'
                        : 'border border-slate-600 bg-slate-800 text-slate-300 hover:border-violet-500/50 hover:bg-slate-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              disabled={loading}
              onClick={() => void runGenerate()}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-6 py-3.5 text-base font-black text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-105 active:brightness-95 active:scale-[0.99] disabled:opacity-50 sm:flex-none sm:min-w-[200px]"
            >
              {loading ? 'Generating…' : 'Generate MCQs'}
            </button>
            <button
              type="button"
              onClick={resetSession}
              className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800 active:scale-[0.99]"
            >
              Clear session
            </button>
          </div>
          {error ? <p className="mt-4 text-sm font-medium text-rose-400">{error}</p> : null}
        </motion.section>

        {questions.length > 0 ? (
          <div id="entry-test-mcq-questions" className="scroll-mt-6">
            <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-700/80 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold uppercase text-slate-500">Mode</span>
                <button
                  type="button"
                  onClick={() => {
                    setQuizMode(false);
                    setQuizActive(false);
                    setQuizFinished(false);
                    setTimeLeft(null);
                    setChecked(false);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors active:scale-[0.98] ${!quizMode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  Study
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuizMode(true);
                    setQuizActive(false);
                    setQuizFinished(false);
                    setTimeLeft(null);
                    setChecked(false);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors active:scale-[0.98] ${quizMode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  Quiz
                </button>
                {quizMode && !quizActive && !quizFinished ? (
                  <div className="flex flex-wrap items-center gap-2 border-l border-slate-600 pl-3">
                    <span className="text-xs text-slate-500">Timer</span>
                    {TIMER_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setQuizMinutes(m)}
                        className={`rounded-md px-2 py-1 text-xs font-bold transition-colors active:scale-[0.98] ${
                          quizMinutes === m
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={startQuiz}
                      className="ml-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-slate-950 transition-colors hover:bg-amber-400 active:scale-[0.98]"
                    >
                      Start timer
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {revealAllowed ? (
                  <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={showAnswers}
                      onChange={(e) => setShowAnswers(e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-slate-500 accent-cyan-500"
                    />
                    Show answers & explanations
                  </label>
                ) : (
                  <span className="text-xs text-slate-500">Answers lock until quiz ends</span>
                )}
                <button
                  type="button"
                  onClick={() => void runGenerate()}
                  disabled={loading}
                  className="rounded-lg border border-cyan-600/50 px-3 py-1.5 text-xs font-bold text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-950/50 active:scale-[0.98] disabled:opacity-50"
                >
                  Regenerate
                </button>
              </div>
            </section>

            {quizMode && quizFinished ? (
              <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                <h3 className="text-lg font-black text-emerald-200">Quiz results</h3>
                <p className="mt-1 text-2xl font-black text-white">
                  {score.correct} / {score.total}{' '}
                  <span className="text-base font-semibold text-slate-400">
                    ({score.total ? Math.round((score.correct / score.total) * 100) : 0}%)
                  </span>
                </p>
                {weakTags.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-bold uppercase text-rose-300">Weak areas to review</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {weakTags.map((w) => (
                        <li
                          key={w}
                          className="rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-100"
                        >
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : score.total > 0 && score.correct === score.total ? (
                  <p className="mt-2 text-sm text-emerald-200/90">Strong round — keep this pace on mixed topics.</p>
                ) : null}
              </div>
            ) : null}

            {quizMode && !quizFinished && quizActive ? (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={finishQuiz}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-500 active:scale-[0.99]"
                >
                  Submit quiz early
                </button>
              </div>
            ) : null}

            <div className="space-y-5">
              {parsedList.map(({ q, parsed, correct }, idx) => {
                if (!parsed || !correct) {
                  return (
                    <div
                      key={q.question_id}
                      className="rounded-2xl border border-rose-500/30 bg-slate-900/80 p-5 text-sm text-rose-200"
                    >
                      Q{idx + 1}: Could not parse MCQ layout. Regenerate or pick another topic.
                    </div>
                  );
                }
                const choice = picked[q.question_id];
                const show = (showAnswers && revealAllowed) || checked;
                const optionsLocked = (checked && !quizMode) || (quizMode && quizFinished);

                return (
                  <motion.article
                    key={`${q.question_id}-${idx}`}
                    className="rounded-2xl border border-slate-700/90 bg-gradient-to-br from-slate-900 to-slate-900/40 p-4 shadow-lg sm:p-5"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: Math.min(idx, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs font-black text-cyan-300">
                        Q{idx + 1}
                      </span>
                      <span className="text-xs font-medium text-slate-500">{difficulty} · {subject}</span>
                    </div>
                    <p className="text-base font-semibold leading-relaxed text-slate-100 [overflow-wrap:anywhere] sm:text-lg">
                      {parsed.stem}
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {parsed.options.map((opt) => {
                        const selected = choice === opt.letter;
                        const isCorrect = opt.letter === correct;
                        let ring =
                          'border-slate-600 bg-slate-800/80 hover:border-cyan-500/40 hover:bg-slate-800 enabled:hover:shadow-md enabled:hover:shadow-cyan-900/20';
                        if (show) {
                          if (isCorrect) ring = 'border-emerald-500 bg-emerald-500/15 ring-1 ring-emerald-400';
                          else if (selected && !isCorrect)
                            ring = 'border-rose-500 bg-rose-500/10 ring-1 ring-rose-400';
                        } else if (selected) ring = 'border-indigo-400 bg-indigo-500/20';

                        return (
                          <button
                            key={opt.letter}
                            type="button"
                            disabled={optionsLocked}
                            onClick={() => {
                              if (optionsLocked) return;
                              setPicked((prev) => ({ ...prev, [q.question_id]: opt.letter }));
                            }}
                            className={`flex w-full min-w-0 items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-all sm:min-h-[3.25rem] ${ring} ${
                              optionsLocked ? 'cursor-not-allowed' : 'cursor-pointer active:scale-[0.995]'
                            }`}
                          >
                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-cyan-300">
                              {mcqOrdinalLabel(opt.letter)}
                            </span>
                            <span className="min-w-0 flex-1 text-slate-200 [overflow-wrap:anywhere]">
                              {splitBilingualOptionLines(opt.text).map((line, li) => (
                                <span
                                  key={`${opt.letter}-${li}`}
                                  className={
                                    li === 0
                                      ? 'block font-semibold'
                                      : 'mt-0.5 block text-sm font-normal text-slate-300'
                                  }
                                >
                                  {line}
                                </span>
                              ))}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {show ? (
                      <div className="mt-4 rounded-xl border border-slate-600 bg-slate-950/60 p-4">
                        <p className="text-xs font-bold uppercase text-emerald-400">Answer</p>
                        <p className="mt-1 text-sm font-bold text-white">Answer: {mcqOrdinalLabel(correct)}</p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-400">{shortExplanation(q, correct)}</p>
                      </div>
                    ) : null}
                  </motion.article>
                );
              })}
            </div>

            {!quizMode ? (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  disabled={questions.length === 0 || (quizMode && quizActive)}
                  onClick={() => {
                    setChecked(true);
                    setWeakTags(computeWeakTags(parsedList));
                  }}
                  className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-8 py-3 text-sm font-black text-white shadow-lg transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
                >
                  Check answers (study)
                </button>
              </div>
            ) : quizActive ? (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={finishQuiz}
                  className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-8 py-3 text-sm font-black text-white shadow-lg transition hover:brightness-110 active:scale-[0.99]"
                >
                  Finish & score quiz
                </button>
              </div>
            ) : null}

            {!quizMode && checked ? (
              <div className="mt-6 space-y-3 text-center">
                <p className="text-sm text-slate-400">
                  Score:{' '}
                  <span className="font-bold text-cyan-300">
                    {score.correct}/{score.total}
                  </span>{' '}
                  correct
                  {score.attempted < score.total ? (
                    <span className="text-slate-500"> — select an option for every question to count attempts.</span>
                  ) : null}
                </p>
                {weakTags.length > 0 ? (
                  <div>
                    <p className="text-xs font-bold uppercase text-rose-300">Review focus</p>
                    <ul className="mt-2 flex flex-wrap justify-center gap-2">
                      {weakTags.map((w) => (
                        <li
                          key={w}
                          className="rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-100"
                        >
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : score.total > 0 && score.correct === score.total ? (
                  <p className="text-sm text-emerald-300/90">Clean sheet on this set — try a harder topic next.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-10 text-center sm:px-8 sm:py-12">
            <p className="text-sm font-semibold text-slate-400 sm:text-base">Ready to practice</p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500 sm:text-sm">
              Choose MDCAT or ECAT, pick a subject, set a topic (click a syllabus chip or type), then click{' '}
              <span className="font-bold text-slate-400">Generate MCQs</span>. Ensure the backend is running on the same
              host/port as this page (see console &quot;Backend URL&quot; in dev).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
