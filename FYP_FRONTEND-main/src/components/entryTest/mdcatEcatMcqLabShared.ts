import type { GeneratedQuestionItem } from '../../services/questionService';
import { mcqFromGeneratedItem, resolveMcqCorrectLetter } from '../../utils/mcqParse';

export const SUBJECTS = ['Physics', 'Chemistry', 'Biology', 'Mathematics'] as const;

export const TOPIC_SUGGESTIONS: Record<string, string[]> = {
  Physics: ['Mechanics', 'Thermodynamics', 'Waves & optics', 'Electromagnetism', 'Modern physics', 'Rotational motion'],
  Chemistry: ['Atomic structure', 'Chemical bonding', 'Equilibrium', 'Organic chemistry', 'Electrochemistry', 'Thermochemistry'],
  Biology: ['Cell biology', 'Genetics', 'Human physiology', 'Ecology', 'Enzymes', 'Evolution'],
  Mathematics: ['Algebra', 'Trigonometry', 'Limits & continuity', 'Vectors', 'Probability', 'Matrices'],
};

export const COUNT_OPTIONS = [5, 8, 10, 15, 20] as const;
export const TIMER_PRESETS = [10, 15, 20, 30] as const;

export type ExamKey = 'mdcat' | 'ecat';

export function dedupeByStem(list: GeneratedQuestionItem[]): GeneratedQuestionItem[] {
  const seen = new Set<string>();
  const out: GeneratedQuestionItem[] = [];
  for (const q of list) {
    const p = mcqFromGeneratedItem(q);
    const key = (p?.stem ?? q.question ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, 180);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

export function shortExplanation(q: GeneratedQuestionItem, correctLetter: string | null): string {
  const parsed = mcqFromGeneratedItem(q);
  const opt = parsed?.options.find((o) => o.letter === correctLetter);
  if (opt) {
    return `Correct option (${correctLetter}) best matches the syllabus expectation for this stem. Review the underlying principle and common trap distractors in ${opt.text.slice(0, 80)}${opt.text.length > 80 ? '…' : ''}.`;
  }
  return 'Review the chapter notes for this topic and rework similar stems under timed conditions.';
}

export function buildParsedList(questions: GeneratedQuestionItem[]) {
  return questions.map((q) => {
    const parsed = mcqFromGeneratedItem(q);
    const correct = resolveMcqCorrectLetter(q.answer ?? '', parsed);
    return { q, parsed, correct };
  });
}
