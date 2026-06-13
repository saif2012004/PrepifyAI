/**
 * Dummy past-paper corpus + derived analytics for Past Paper Insights UI.
 * Simulates frequency, trends, difficulty mix, and AI-style bullet points.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export type PaperQuestionRow = {
  year: number;
  /** Class / grade level (e.g. 9–12) */
  classLevel: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
};

export type InsightFilters = {
  classLevel: string | 'all';
  subject: string | 'all';
  yearFrom: number;
  yearTo: number;
};

export const CLASS_LEVELS = ['9', '10', '11', '12'] as const;

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Computer Science'] as const;

const TOPIC_POOL: Record<(typeof SUBJECTS)[number], string[]> = {
  Physics: ['Kinematics', 'Dynamics', 'Work & Energy', 'Waves', 'Electricity', 'Light', 'Thermal', 'Modern Physics'],
  Chemistry: ['Atomic Structure', 'Bonding', 'Acids & Bases', 'Organic', 'Electrochemistry', 'Thermodynamics', 'Equilibrium'],
  Mathematics: ['Algebra', 'Quadratics', 'Trigonometry', 'Calculus', 'Probability', 'Vectors', 'Geometry', 'Series'],
  Biology: ['Cell Biology', 'Genetics', 'Ecology', 'Human Physiology', 'Plant Biology', 'Evolution', 'Biochemistry'],
  'Computer Science': [
    'Programming Fundamentals',
    'Data Structures',
    'Algorithms',
    'OOP',
    'Databases',
    'Networking',
    'Boolean Logic',
    'Web Technologies',
  ],
};

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic “preparation” 0–1 per topic for demo insights. */
function prepScore(subject: string, topic: string): number {
  const rnd = mulberry32(hashCode(subject + '|' + topic));
  return rnd();
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
}

function pickClassLevel(rnd: () => number): string {
  const u = rnd();
  if (u < 0.18) return '9';
  if (u < 0.42) return '10';
  if (u < 0.72) return '11';
  return '12';
}

function buildDummyCorpus(): PaperQuestionRow[] {
  const rows: PaperQuestionRow[] = [];
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const rnd = mulberry32(42);

  for (const year of years) {
    for (const subject of SUBJECTS) {
      const topics = TOPIC_POOL[subject];
      const n = 18 + Math.floor(rnd() * 14);
      for (let i = 0; i < n; i++) {
        const topic = topics[Math.floor(rnd() * topics.length)];
        const bias =
          year >= 2023
            ? (t: string) =>
                ['Organic', 'Calculus', 'Electricity', 'Genetics', 'OOP', 'Data Structures', 'Algorithms'].includes(t)
            : () => false;
        const topic2 = bias(topic) && rnd() > 0.35 ? topic : topics[Math.floor(rnd() * topics.length)];
        const diff =
          rnd() < 0.38 ? 'easy' : rnd() < 0.72 ? 'medium' : ('hard' as Difficulty);
        rows.push({ year, classLevel: pickClassLevel(rnd), subject, topic: topic2, difficulty: diff });
      }
    }
  }
  return rows;
}

export const DUMMY_PAPERS: PaperQuestionRow[] = buildDummyCorpus();

export const YEAR_MIN = 2019;
export const YEAR_MAX = 2025;

export function subjectOptions(): string[] {
  return [...SUBJECTS];
}

export function classOptions(): string[] {
  return [...CLASS_LEVELS];
}

export type TopicFrequency = { topic: string; count: number };
export type ScoredTopic = { topic: string; subject: string; score: number; count: number };
export type TrendPoint = Record<string, string | number>;
export type AiInsight = { title: string; detail: string; tone: 'primary' | 'warning' | 'success' };

export type PastPaperInsightsModel = {
  filters: InsightFilters;
  totalQuestions: number;
  topicFrequency: TopicFrequency[];
  importantTopics: ScoredTopic[];
  subjectWeightage: { subject: string; count: number; pct: number }[];
  classWeightage: { label: string; count: number; pct: number }[];
  topicWeightInSubject: { topic: string; count: number; pct: number }[];
  difficultySplit: { name: string; value: number; fill: string }[];
  yearDistribution: { year: number; count: number }[];
  trendSeries: TrendPoint[];
  trendTopicKeys: string[];
  trendLineLabels: string[];
  aiInsights: AiInsight[];
};

function recencyWeight(year: number, minY: number, maxY: number): number {
  const span = Math.max(1, maxY - minY);
  return 0.65 + ((year - minY) / span) * 0.55;
}

function diffWeight(d: Difficulty): number {
  if (d === 'hard') return 1.45;
  if (d === 'medium') return 1.15;
  return 1;
}

export function buildPastPaperInsightsModel(filters: InsightFilters): PastPaperInsightsModel {
  const { classLevel, subject, yearFrom, yearTo } = filters;
  const lo = Math.min(yearFrom, yearTo);
  const hi = Math.max(yearFrom, yearTo);

  const rows = DUMMY_PAPERS.filter(
    (r) =>
      r.year >= lo &&
      r.year <= hi &&
      (classLevel === 'all' || r.classLevel === classLevel) &&
      (subject === 'all' || r.subject === subject)
  );

  const total = rows.length;
  const minY = rows.length ? Math.min(...rows.map((r) => r.year)) : lo;
  const maxY = rows.length ? Math.max(...rows.map((r) => r.year)) : hi;

  const freqMap = new Map<string, { subject: string; count: number; score: number }>();
  for (const r of rows) {
    const key = `${r.subject} :: ${r.topic}`;
    const cur = freqMap.get(key) ?? { subject: r.subject, count: 0, score: 0 };
    cur.count += 1;
    cur.score += recencyWeight(r.year, minY, maxY) * diffWeight(r.difficulty);
    freqMap.set(key, cur);
  }

  const scored: ScoredTopic[] = [...freqMap.entries()].map(([k, v]) => ({
    topic: k.split(' :: ')[1] ?? k,
    subject: v.subject,
    score: v.score,
    count: v.count,
  }));
  scored.sort((a, b) => b.score - a.score);

  const topicFrequency: TopicFrequency[] = [...freqMap.entries()]
    .map(([k, v]) => ({
      topic: k.includes(' :: ') ? `${k.split(' :: ')[0]} · ${k.split(' :: ')[1]}` : k,
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const importantTopics = scored.slice(0, 8);

  const subCounts = new Map<string, number>();
  for (const r of rows) {
    subCounts.set(r.subject, (subCounts.get(r.subject) ?? 0) + 1);
  }
  const subjectWeightage = [...subCounts.entries()]
    .map(([s, count]) => ({
      subject: s,
      count,
      pct: total ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const classCounts = new Map<string, number>();
  for (const r of rows) {
    classCounts.set(r.classLevel, (classCounts.get(r.classLevel) ?? 0) + 1);
  }
  const classWeightage = [...classCounts.entries()]
    .map(([cl, count]) => ({
      label: `Class ${cl}`,
      count,
      pct: total ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort(
      (a, b) =>
        Number.parseInt(a.label.replace(/\D/g, ''), 10) - Number.parseInt(b.label.replace(/\D/g, ''), 10)
    );

  const topicInSub = new Map<string, number>();
  if (subject !== 'all') {
    for (const r of rows) {
      topicInSub.set(r.topic, (topicInSub.get(r.topic) ?? 0) + 1);
    }
  }
  const subTotal = subject === 'all' ? 0 : [...topicInSub.values()].reduce((a, b) => a + b, 0);
  const topicWeightInSubject = [...topicInSub.entries()]
    .map(([topic, count]) => ({
      topic,
      count,
      pct: subTotal ? Math.round((count / subTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const diffCounts = { easy: 0, medium: 0, hard: 0 };
  for (const r of rows) diffCounts[r.difficulty] += 1;
  const difficultySplit = [
    { name: 'Easy', value: diffCounts.easy, fill: '#22c55e' },
    { name: 'Medium', value: diffCounts.medium, fill: '#eab308' },
    { name: 'Hard', value: diffCounts.hard, fill: '#ef4444' },
  ].filter((d) => d.value > 0);

  const yearMap = new Map<number, number>();
  for (let y = lo; y <= hi; y++) yearMap.set(y, 0);
  for (const r of rows) yearMap.set(r.year, (yearMap.get(r.year) ?? 0) + 1);
  const yearDistribution = [...yearMap.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);

  const topForTrend = scored.slice(0, 5);
  const trendTopicKeys = topForTrend.map((_, i) => `t${i}`);
  const trendLineLabels = topForTrend.map((r) => `${r.topic} (${r.subject})`);
  const trendSeries: TrendPoint[] = [];
  for (let y = lo; y <= hi; y++) {
    const pt: TrendPoint = { year: y };
    topForTrend.forEach((row, i) => {
      const key = trendTopicKeys[i];
      const c = rows.filter((r) => r.year === y && r.subject === row.subject && r.topic === row.topic).length;
      pt[key] = c;
    });
    trendSeries.push(pt);
  }

  const top3 = importantTopics.slice(0, 3).map((t) => t.topic);
  const aiInsights: AiInsight[] = [
    {
      title: 'High-impact topics for upcoming papers',
      detail: `Examiners keep returning to: ${top3.join(', ')}. Prioritise these in timed practice.`,
      tone: 'primary',
    },
  ];

  const underPractised = scored
    .filter((t) => {
      const prep = prepScore(t.subject, t.topic);
      return t.count >= 4 && prep < 0.38;
    })
    .slice(0, 3)
    .map((t) => t.topic);
  if (underPractised.length) {
    aiInsights.push({
      title: 'Frequency vs. preparation gap',
      detail: `${underPractised.join(', ')} show up often in papers but are easy to under-practice — add targeted drills.`,
      tone: 'warning',
    });
  }

  const rising = scored.filter((t) => {
    const early = rows.filter((r) => r.subject === t.subject && r.topic === t.topic && r.year <= lo + 1).length;
    const late = rows.filter((r) => r.subject === t.subject && r.topic === t.topic && r.year >= hi - 1).length;
    return late > early + 1;
  });
  if (rising.length) {
    aiInsights.push({
      title: 'Rising trend in recent years',
      detail: `Weight is shifting toward: ${rising
        .slice(0, 4)
        .map((x) => x.topic)
        .join(', ')}.`,
      tone: 'success',
    });
  }

  return {
    filters,
    totalQuestions: total,
    topicFrequency,
    importantTopics,
    subjectWeightage,
    classWeightage,
    topicWeightInSubject,
    difficultySplit,
    yearDistribution,
    trendSeries,
    trendTopicKeys,
    trendLineLabels,
    aiInsights,
  };
}
