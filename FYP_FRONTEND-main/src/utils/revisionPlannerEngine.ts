/**
 * Simulated "AI" revision planner: weighted scheduling, spaced repetition hints,
 * mock-test cadence, and exam buffer days. Pure functions — no network.
 */

export type SlotType = 'revision' | 'practice' | 'mock_test' | 'buffer' | 'spaced_review';

export interface PlannerSlot {
  id: string;
  type: SlotType;
  subject: string;
  /** Human-readable line */
  title: string;
  /** Topics or instructions */
  detail: string;
  minutes: number;
}

export interface PlannerDay {
  id: string;
  /** 0 = first plan day */
  dayOffset: number;
  /** ISO date yyyy-mm-dd */
  dateISO: string;
  weekday: string;
  focusHeadline: string;
  slots: PlannerSlot[];
  isBufferPhase: boolean;
  isMockDay: boolean;
}

export interface SubjectPlannerInput {
  id: string;
  name: string;
  /** Full syllabus — comma or newline separated in UI, normalized to array */
  topics: string[];
  weakTopics: string[];
  strongTopics: string[];
}

export interface PlannerEngineInput {
  examDateISO: string;
  subjects: SubjectPlannerInput[];
  dailyStudyHours: number;
  /** Optional anchor; default today */
  planStartISO?: string;
}

export interface PlannerEngineResult {
  days: PlannerDay[];
  summary: {
    totalDays: number;
    studyDaysBeforeBuffer: number;
    bufferDays: number;
    totalSlots: number;
    totalMinutesPlanned: number;
    subjectsIncluded: string[];
    /** Unique syllabus topics in the plan */
    topicsTotal: number;
    /** Topics that received at least one scheduled revision slot */
    topicsPlannedAtLeastOnce: number;
    /** Rough % of syllabus topics touched by the generated schedule */
    syllabusCoveragePct: number;
  };
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Local calendar YYYY-MM-DD (avoids UTC shift from toISOString and invalid-date throws). */
function formatISODateLocal(d: Date): string {
  if (Number.isNaN(d.getTime())) {
    const f = startOfDay(new Date());
    const y = f.getFullYear();
    const m = String(f.getMonth() + 1).padStart(2, '0');
    const day = String(f.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

function topicWeight(topic: string, weak: string[], strong: string[]): number {
  const t = norm(topic);
  if (weak.some((w) => norm(w) === t)) return 3;
  if (strong.some((s) => norm(s) === t)) return 1;
  return 2;
}

/** Spread topic across first pass; later days reference spaced_review */
function buildRevisionPlanner(input: PlannerEngineInput): PlannerEngineResult {
  const start = input.planStartISO
    ? startOfDay(new Date(input.planStartISO + 'T12:00:00'))
    : startOfDay(new Date());
  if (Number.isNaN(start.getTime())) {
    return {
      days: [],
      summary: {
        totalDays: 0,
        studyDaysBeforeBuffer: 0,
        bufferDays: 0,
        totalSlots: 0,
        totalMinutesPlanned: 0,
        subjectsIncluded: [],
        topicsTotal: 0,
        topicsPlannedAtLeastOnce: 0,
        syllabusCoveragePct: 0,
      },
    };
  }
  const examRaw = startOfDay(new Date((input.examDateISO || '').trim() + 'T12:00:00'));
  const exam = Number.isNaN(examRaw.getTime())
    ? (() => {
        const x = startOfDay(new Date(start));
        x.setDate(x.getDate() + 28);
        return x;
      })()
    : examRaw;
  let totalDays = Math.ceil((exam.getTime() - start.getTime()) / 86400000) + 1;
  if (!Number.isFinite(totalDays) || totalDays < 7) totalDays = 21;
  if (totalDays > 90) totalDays = 90;

  const bufferDays = Math.min(3, Math.max(2, Math.floor(totalDays * 0.12)));
  const heavyDays = Math.max(totalDays - bufferDays, 1);
  const dailyMinutes = Math.max(60, Math.min(12 * 60, Math.round(input.dailyStudyHours * 60)));

  const subjects = input.subjects.filter((s) => s.name.trim() && s.topics.length > 0);
  if (subjects.length === 0) {
    return {
      days: [],
      summary: {
        totalDays: 0,
        studyDaysBeforeBuffer: 0,
        bufferDays: 0,
        totalSlots: 0,
        totalMinutesPlanned: 0,
        subjectsIncluded: [],
        topicsTotal: 0,
        topicsPlannedAtLeastOnce: 0,
        syllabusCoveragePct: 0,
      },
    };
  }

  type TopicUnit = {
    subject: string;
    topic: string;
    weight: number;
    firstDayIndex: number;
  };

  const units: TopicUnit[] = [];
  subjects.forEach((s) => {
    s.topics.forEach((topic) => {
      units.push({
        subject: s.name.trim(),
        topic: topic.trim(),
        weight: topicWeight(topic, s.weakTopics, s.strongTopics),
        firstDayIndex: -1,
      });
    });
  });
  units.sort((a, b) => b.weight - a.weight);

  const subjectNames = subjects.map((s) => s.name.trim());
  const days: PlannerDay[] = [];
  let unitCursor = 0;
  let totalSlots = 0;
  let totalMinutes = 0;

  const revisionShare = 0.46;
  const practiceShare = 0.32;
  const spacedShare = 0.14;
  const flexShare = 0.08;

  const startISO = formatISODateLocal(start);

  for (let d = 0; d < totalDays; d++) {
    const dateISO = addDays(startISO, d);
    const isBuffer = d >= heavyDays;
    const isMockDay = !isBuffer && (d + 1) % 5 === 0 && d > 0;

    const slots: PlannerSlot[] = [];
    let mRev = Math.round(dailyMinutes * revisionShare);
    let mPrac = Math.round(dailyMinutes * practiceShare);
    let mSpaced = Math.round(dailyMinutes * spacedShare);
    let mFlex = Math.max(0, dailyMinutes - mRev - mPrac - mSpaced);

    if (isBuffer) {
      const b1 = Math.round(dailyMinutes * 0.38);
      slots.push({
        id: `${d}-b1`,
        type: 'buffer',
        subject: 'Mixed',
        title: 'Light review & rest',
        detail:
          'Skim notes, flashcards only, and sleep well. No heavy new topics — consolidate what you already covered.',
        minutes: b1,
      });
      slots.push({
        id: `${d}-b2`,
        type: 'revision',
        subject: subjectNames[d % subjectNames.length],
        title: 'Quick weak-area sweep',
        detail: 'Short passes per subject: formulas, diagrams, and mistakes notebook only.',
        minutes: Math.max(0, dailyMinutes - b1),
      });
      totalSlots += slots.length;
      totalMinutes += slots.reduce((s, x) => s + x.minutes, 0);
      days.push({
        id: `day-${d}`,
        dayOffset: d,
        dateISO,
        weekday: weekdayLabel(dateISO),
        focusHeadline: isBuffer && d === heavyDays ? 'Exam week: ease into recall mode' : 'Pre-exam buffer',
        slots,
        isBufferPhase: true,
        isMockDay: false,
      });
      continue;
    }

    if (isMockDay) {
      const mix = subjectNames.slice(0, Math.min(3, subjectNames.length)).join(' + ');
      const mockM = Math.min(58, Math.round(dailyMinutes * 0.38));
      slots.push({
        id: `${d}-mock`,
        type: 'mock_test',
        subject: mix,
        title: 'Timed mixed mock',
        detail:
          'Under exam conditions: mixed MCQ + short from recent topics. Mark unknowns for tomorrow’s revision.',
        minutes: mockM,
      });
      const rem = dailyMinutes - mockM;
      mRev = Math.round(rem * 0.52);
      mPrac = Math.round(rem * 0.3);
      mSpaced = Math.max(0, rem - mRev - mPrac);
      mFlex = 0;
    }

    // Primary revision: pick weighted topics
    const revTopics: string[] = [];
    const revSubjects = new Set<string>();
    let budget = mRev;
    while (budget >= 18 && unitCursor < units.length) {
      const u = units[unitCursor];
      if (u.firstDayIndex < 0) u.firstDayIndex = d;
      revTopics.push(`${u.subject}: ${u.topic}`);
      revSubjects.add(u.subject);
      unitCursor += 1;
      budget -= 18 + u.weight * 4;
    }
    if (revTopics.length === 0 && unitCursor < units.length) {
      const u = units[unitCursor];
      if (u.firstDayIndex < 0) u.firstDayIndex = d;
      revTopics.push(`${u.subject}: ${u.topic}`);
      revSubjects.add(u.subject);
      unitCursor += 1;
    }

    slots.push({
      id: `${d}-r1`,
      type: 'revision',
      subject: Array.from(revSubjects).join(', ') || subjectNames[0],
      title: 'Deep revision block',
      detail:
        revTopics.length > 0
          ? revTopics.join(' · ')
          : 'Catch up on the next syllabus chunk from your list — prioritise weak areas.',
      minutes: mRev,
    });

    // Practice
    const prSubject = subjectNames[d % subjectNames.length];
    const sub = subjects.find((s) => s.name.trim() === prSubject);
    const weakPick = sub?.weakTopics[0] || sub?.topics[0] || 'core concepts';
    slots.push({
      id: `${d}-p1`,
      type: 'practice',
      subject: prSubject,
      title: 'Active practice',
      detail: `Past-paper style questions on: ${weakPick}. Check answers and log mistakes.`,
      minutes: mPrac,
    });

    // Spaced: topics first seen ~4 days ago
    const spacedLines: string[] = [];
    units.forEach((u) => {
      if (u.firstDayIndex >= 0 && d - u.firstDayIndex === 4) {
        spacedLines.push(`${u.subject}: ${u.topic}`);
      }
    });
    slots.push({
      id: `${d}-s1`,
      type: 'spaced_review',
      subject: spacedLines[0]?.split(':')[0]?.trim() || subjectNames[(d + 1) % subjectNames.length],
      title: 'Spaced repetition',
      detail:
        spacedLines.length > 0
          ? `Revisit (active recall): ${spacedLines.slice(0, 4).join(' · ')}`
          : 'Rotate one topic from each subject using blurting or blank-page recall.',
      minutes: mSpaced,
    });

    if (mFlex > 10) {
      slots.push({
        id: `${d}-f1`,
        type: 'revision',
        subject: subjectNames[(d + 2) % subjectNames.length],
        title: 'Flex / catch-up',
        detail: 'Finish loose ends, mark scheme review, or extend weak topic from morning block.',
        minutes: mFlex,
      });
    }

    const weakHint = units.filter((u) => u.weight >= 3).slice(0, 2);
    const focusHeadline =
      isMockDay && slots.some((s) => s.type === 'mock_test')
        ? `Mock test + consolidation · ${weekdayLabel(dateISO)}`
        : weakHint.length
          ? `Focus: ${weakHint.map((u) => u.topic).join(', ')}`
          : `Steady syllabus push · ${subjectNames[d % subjectNames.length]}`;

    totalSlots += slots.length;
    totalMinutes += slots.reduce((s, x) => s + x.minutes, 0);

    days.push({
      id: `day-${d}`,
      dayOffset: d,
      dateISO,
      weekday: weekdayLabel(dateISO),
      focusHeadline,
      slots,
      isBufferPhase: false,
      isMockDay,
    });
  }

  const topicsTotal = units.length;
  const topicsPlannedAtLeastOnce = units.filter((u) => u.firstDayIndex >= 0).length;
  const syllabusCoveragePct =
    topicsTotal > 0 ? Math.min(100, Math.round((topicsPlannedAtLeastOnce / topicsTotal) * 100)) : 0;

  return {
    days,
    summary: {
      totalDays,
      studyDaysBeforeBuffer: heavyDays,
      bufferDays,
      totalSlots,
      totalMinutesPlanned: totalMinutes,
      subjectsIncluded: subjectNames,
      topicsTotal,
      topicsPlannedAtLeastOnce,
      syllabusCoveragePct,
    },
  };
}

export const revisionPlannerEngine = {
  build: buildRevisionPlanner,
  parseList: (raw: string) => parseList(raw),
};

export const DUMMY_PLANNER_INPUT: PlannerEngineInput = {
  examDateISO: addDays(new Date().toISOString().slice(0, 10), 28),
  dailyStudyHours: 3.5,
  subjects: [
    {
      id: '1',
      name: 'Physics',
      topics: parseList(
        'Measurements, Kinematics, Dynamics, Work & Energy, Thermal properties, Waves, Light, Electricity'
      ),
      weakTopics: parseList('Dynamics, Electricity'),
      strongTopics: parseList('Measurements'),
    },
    {
      id: '2',
      name: 'Chemistry',
      topics: parseList('Fundamentals, Atomic structure, Chemical bonding, Acids bases, Organic basics, Mole concept'),
      weakTopics: parseList('Organic basics, Mole concept'),
      strongTopics: parseList('Atomic structure'),
    },
    {
      id: '3',
      name: 'Mathematics',
      topics: parseList('Algebra, Quadratic equations, Geometry, Trigonometry, Sets, Statistics'),
      weakTopics: parseList('Trigonometry'),
      strongTopics: parseList('Sets'),
    },
    {
      id: '4',
      name: 'Biology',
      topics: parseList('Cell biology, Enzymes, Nutrition, Transport, Respiration, Coordination, Reproduction'),
      weakTopics: parseList('Respiration, Coordination'),
      strongTopics: parseList('Cell biology'),
    },
  ],
};
