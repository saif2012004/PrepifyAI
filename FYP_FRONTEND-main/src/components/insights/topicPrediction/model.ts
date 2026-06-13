/**
 * Topic “prediction” from dummy past-paper rows: frequency + recency + simple trend → scores & tiers.
 * Reuses the same synthetic corpus as Past Paper Insights.
 */

import { DUMMY_PAPERS } from '../pastPaperInsights/model';

export { subjectOptions, classOptions, YEAR_MIN, YEAR_MAX } from '../pastPaperInsights/model';

export type TopicPredictionFilters = {
  classLevel: string | 'all';
  subject: string | 'all';
  yearFrom: number;
  yearTo: number;
};

export type ImportanceTier = 'high' | 'medium' | 'low';

export type PredictedTopic = {
  id: string;
  label: string;
  subject: string;
  topic: string;
  /** 0–100, min–max scaled within this filter */
  probabilityPct: number;
  tier: ImportanceTier;
  frequency: number;
  /** Rough momentum: positive = more mentions in later years of range */
  trendDelta: number;
};

export type TopicPredictionModel = {
  filters: TopicPredictionFilters;
  topics: PredictedTopic[];
  mostLikely: PredictedTopic[];
  barChartData: { label: string; pct: number; tier: ImportanceTier }[];
  classDistribution: { label: string; count: number }[];
  trendSeries: Record<string, string | number>[];
  trendKeys: string[];
  trendLabels: string[];
};

function tierFromPct(p: number): ImportanceTier {
  if (p >= 67) return 'high';
  if (p >= 34) return 'medium';
  return 'low';
}

function recencyWeight(year: number, lo: number, hi: number): number {
  const span = Math.max(1, hi - lo);
  return 0.55 + ((year - lo) / span) * 0.45;
}

export function buildTopicPredictionModel(filters: TopicPredictionFilters): TopicPredictionModel {
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

  const classCounts = new Map<string, number>();
  for (const r of rows) {
    classCounts.set(r.classLevel, (classCounts.get(r.classLevel) ?? 0) + 1);
  }
  const classDistribution = [...classCounts.entries()]
    .map(([cl, count]) => ({ label: `Class ${cl}`, count }))
    .sort(
      (a, b) =>
        Number.parseInt(a.label.replace(/\D/g, ''), 10) - Number.parseInt(b.label.replace(/\D/g, ''), 10)
    );

  const yearsInRange: number[] = [];
  for (let y = lo; y <= hi; y++) yearsInRange.push(y);
  const splitIdx = Math.max(0, Math.floor((yearsInRange.length - 1) / 2));
  const earlyYearSet = new Set(yearsInRange.slice(0, splitIdx + 1));
  const lateYearSet = new Set(yearsInRange.slice(splitIdx + 1));
  if (lateYearSet.size === 0 && yearsInRange.length) {
    yearsInRange.forEach((y) => lateYearSet.add(y));
  }

  type Agg = {
    subject: string;
    topic: string;
    freq: number;
    early: number;
    late: number;
    recencySum: number;
  };

  const map = new Map<string, Agg>();
  for (const r of rows) {
    const key = `${r.subject}::${r.topic}`;
    const a = map.get(key) ?? { subject: r.subject, topic: r.topic, freq: 0, early: 0, late: 0, recencySum: 0 };
    a.freq += 1;
    a.recencySum += recencyWeight(r.year, lo, hi);
    if (earlyYearSet.has(r.year)) a.early += 1;
    if (lateYearSet.has(r.year)) a.late += 1;
    map.set(key, a);
  }

  const rawList: { key: string; a: Agg; raw: number; trendDelta: number }[] = [];
  for (const [key, a] of map.entries()) {
    const trendDelta = (a.late - a.early) / Math.max(1, a.early);
    const trendBoost = Math.max(-6, Math.min(18, trendDelta * 7));
    const raw = a.freq * 6.5 + a.recencySum * 4.2 + trendBoost;
    rawList.push({ key, a, raw, trendDelta });
  }

  const rawVals = rawList.map((x) => x.raw);
  const rMin = rawVals.length ? Math.min(...rawVals) : 0;
  const rMax = rawVals.length ? Math.max(...rawVals) : 1;
  const span = Math.max(1e-6, rMax - rMin);

  const topics: PredictedTopic[] = rawList
    .map(({ key, a, raw, trendDelta }) => {
      const probabilityPct = Math.round(((raw - rMin) / span) * 100);
      const p = Math.min(100, Math.max(0, probabilityPct));
      return {
        id: key,
        label: `${a.subject} · ${a.topic}`,
        subject: a.subject,
        topic: a.topic,
        probabilityPct: p,
        tier: tierFromPct(p),
        frequency: a.freq,
        trendDelta,
      };
    })
    .sort((x, y) => y.probabilityPct - x.probabilityPct);

  const mostLikely = topics.slice(0, 3);

  const barChartData = topics.slice(0, 14).map((t) => ({
    label: t.label.length > 28 ? `${t.label.slice(0, 26)}…` : t.label,
    pct: t.probabilityPct,
    tier: t.tier,
  }));

  const topTrend = topics.slice(0, 5);
  const trendKeys = topTrend.map((_, i) => `s${i}`);
  const trendLabels = topTrend.map((t) => t.label);
  const trendSeries: Record<string, string | number>[] = [];
  for (let y = lo; y <= hi; y++) {
    const pt: Record<string, string | number> = { year: y };
    topTrend.forEach((t, i) => {
      const c = rows.filter((r) => r.year === y && r.subject === t.subject && r.topic === t.topic).length;
      pt[trendKeys[i]] = c;
    });
    trendSeries.push(pt);
  }

  return {
    filters,
    topics,
    mostLikely,
    barChartData,
    classDistribution,
    trendSeries,
    trendKeys,
    trendLabels,
  };
}
