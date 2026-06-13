/**
 * Maps backend /performance + /subjects into the dashboard shape.
 *
 * Covered: summary, recent-days, by-topic (per subject with data).
 * Pie: GET /performance/practice-time-by-subject (sums ``time_taken`` seconds per subject from question attempts).
 */
import {
  performanceService,
  type DailyPerformanceRow,
} from '../../services/performanceService';
import { subjectService, type Subject } from '../../services/subjectService';

export type DashboardData = {
  overall: { average_score: number; accuracy_pct: number; total_tests: number };
  score_progression: readonly { week_label: string; date: string; avg_score: number }[];
  subject_scores: readonly { subject: string; score_pct: number }[];
  topic_performance: readonly { topic: string; subject: string; score_pct: number; attempts: number }[];
  time_per_subject_minutes: readonly { subject: string; minutes: number }[];
  improvement: readonly { subject: string; previous_pct: number; current_pct: number }[];
};

export const EMPTY_DASHBOARD: DashboardData = {
  overall: { average_score: 0, accuracy_pct: 0, total_tests: 0 },
  score_progression: [],
  subject_scores: [],
  topic_performance: [],
  time_per_subject_minutes: [],
  improvement: [],
};

function weightedAccuracy(days: DailyPerformanceRow[]): number {
  if (!days.length) return 0;
  let w = 0;
  let s = 0;
  for (const d of days) {
    if (d.attempts > 0) {
      w += d.attempts;
      s += d.accuracy_percentage * d.attempts;
    }
  }
  if (w > 0) return Math.round((s / w) * 10) / 10;
  return Math.round((days.reduce((a, b) => a + b.accuracy_percentage, 0) / days.length) * 10) / 10;
}

const MAX_TOPIC_FETCH_SUBJECTS = 6;

/** Catalog may omit subjects (e.g. hidden board rows); performance rows still carry ``subject_id``. */
async function subjectNamesById(catalog: Subject[], performanceSubjectIds: number[]): Promise<Map<number, string>> {
  const m = new Map<number, string>(catalog.map((s) => [s.subject_id, s.subject_name]));
  const missing = [...new Set(performanceSubjectIds)].filter((id) => !m.has(id));
  await Promise.all(
    missing.map(async (id) => {
      try {
        const s = await subjectService.getSubject(id);
        m.set(id, s.subject_name);
      } catch {
        m.set(id, `Subject ${id}`);
      }
    })
  );
  return m;
}

export async function loadStudentPerformanceDashboard(): Promise<DashboardData> {
  const [summary, recent, subjects, practiceTime] = await Promise.all([
    performanceService.getSummary(),
    performanceService.getRecentDays(14),
    subjectService.getSubjects().catch(() => []),
    performanceService.getPracticeTimeBySubject().catch(() => ({ subjects: [] })),
  ]);

  const perfSubjectIds = Object.keys(summary.subject_wise_performance)
    .map((k) => Number.parseInt(k, 10))
    .filter((n) => Number.isFinite(n));
  const nameById = await subjectNamesById(subjects, perfSubjectIds);

  const subject_scores = Object.entries(summary.subject_wise_performance)
    .map(([id, pct]) => ({
      subject: nameById.get(Number(id)) ?? `Subject ${id}`,
      score_pct: Math.round(pct * 10) / 10,
    }))
    .sort((a, b) => b.score_pct - a.score_pct);

  const score_progression = recent.days.map((d) => ({
    week_label: d.date.length >= 10 ? d.date.slice(5, 10) : d.date,
    date: d.date,
    avg_score: Math.round(d.accuracy_percentage * 10) / 10,
  }));

  const overall = {
    average_score: Math.round(summary.accuracy_percentage * 10) / 10,
    accuracy_pct: Math.round(summary.accuracy_percentage * 10) / 10,
    total_tests: summary.total_attempts,
  };

  const subjectIds = Object.keys(summary.subject_wise_performance)
    .map((k) => Number.parseInt(k, 10))
    .filter((n) => Number.isFinite(n))
    .slice(0, MAX_TOPIC_FETCH_SUBJECTS);

  const topicChunks = await Promise.all(
    subjectIds.map(async (subjectId) => {
      try {
        const { topics } = await performanceService.getByTopic(subjectId);
        const subj = nameById.get(subjectId) ?? `Subject ${subjectId}`;
        return topics.map((t) => ({
          topic: t.topic_name,
          subject: subj,
          score_pct: Math.round(t.accuracy * 10) / 10,
          attempts: t.attempts,
        }));
      } catch {
        return [];
      }
    })
  );
  const topic_performance = topicChunks.flat();

  /** Earlier vs later half of daily accuracy (no per-subject history in API). */
  let improvement: DashboardData['improvement'] = [];
  const days = recent.days;
  if (days.length >= 4) {
    const mid = Math.floor(days.length / 2);
    const first = days.slice(0, mid);
    const second = days.slice(mid);
    const prev = weightedAccuracy(first);
    const cur = weightedAccuracy(second);
    if (prev > 0 || cur > 0) {
      improvement = [
        {
          subject: 'Daily accuracy (earlier vs later)',
          previous_pct: Math.round(prev),
          current_pct: Math.round(cur),
        },
      ];
    }
  }

  const time_per_subject_minutes: DashboardData['time_per_subject_minutes'] =
    practiceTime.subjects
      .filter((r) => r.minutes > 0)
      .map((r) => ({
        subject: r.subject_name,
        minutes: Math.round(r.minutes * 10) / 10,
      }));

  return {
    overall,
    score_progression,
    subject_scores,
    topic_performance,
    time_per_subject_minutes,
    improvement,
  };
}
