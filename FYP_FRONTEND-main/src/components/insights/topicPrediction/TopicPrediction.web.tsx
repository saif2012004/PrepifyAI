import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  Cell,
} from 'recharts';
import { colors } from '../../../theme/colors';
import {
  buildTopicPredictionModel,
  classOptions,
  subjectOptions,
  YEAR_MIN,
  YEAR_MAX,
  type ImportanceTier,
  type TopicPredictionFilters,
} from './model';
import { hotTopicMcqPracticeHref } from './practiceNav';
import WebInsightsDashboardLayout, { ResponsiveChartBox } from '../../layout/WebInsightsDashboardLayout';

const insight = {
  page: '#121a30',
  card: '#1a253f',
  elevated: '#232f4d',
  tooltip: '#2a3758',
  border: 'rgba(255,255,255,0.12)',
  grid: 'rgba(255,255,255,0.1)',
} as const;

const TIER_FILL: Record<ImportanceTier, string> = {
  high: colors.danger,
  medium: colors.warning,
  low: colors.success,
};

const CHART_LINE = [colors.primary, colors.accent, colors.gradientEnd, colors.warning, colors.success];

const tooltipProps = {
  contentStyle: {
    backgroundColor: insight.tooltip,
    border: `1px solid ${insight.border}`,
    borderRadius: 12,
  },
  labelStyle: { color: colors.text },
  itemStyle: { color: colors.textMuted },
};
const axisTick = { fill: colors.textSubtle, fontSize: 11 };
const legendStyle = { color: colors.textMuted, fontSize: 12 };

export default function TopicPrediction() {
  const router = useRouter();
  const [classLevel, setClassLevel] = useState<TopicPredictionFilters['classLevel']>('all');
  const [subject, setSubject] = useState<TopicPredictionFilters['subject']>('all');
  const [yearFrom, setYearFrom] = useState(YEAR_MIN);
  const [yearTo, setYearTo] = useState(YEAR_MAX);

  const model = useMemo(
    () => buildTopicPredictionModel({ classLevel, subject, yearFrom, yearTo }),
    [classLevel, subject, yearFrom, yearTo]
  );

  const selectStyle: React.CSSProperties = {
    backgroundColor: insight.elevated,
    borderColor: insight.border,
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 12,
    padding: '10px 12px',
    minHeight: 44,
    width: '100%',
    maxWidth: '100%',
    color: colors.text,
    fontSize: 14,
    fontWeight: 500,
    outline: 'none',
  };

  const barRows = model.barChartData.map((d) => ({
    ...d,
    short: d.label.length > 24 ? `${d.label.slice(0, 22)}…` : d.label,
  }));

  const hotTopicsForPractice = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof model.topics = [];
    const byFreq = [...model.topics].sort(
      (a, b) => b.frequency - a.frequency || b.probabilityPct - a.probabilityPct
    );
    for (const t of byFreq) {
      const k = `${t.subject}::${t.topic}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
      if (out.length >= 8) break;
    }
    return out;
  }, [model.topics]);

  const scrollToMain = () => {
    document.getElementById('topic-prediction-scroll-target')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <WebInsightsDashboardLayout pageBg={insight.page} sidebarBg="#0c1224">
      <div className="w-full max-w-full overflow-x-hidden text-[15px] sm:text-base" style={{ color: colors.text }}>
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-5 inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold sm:mb-6 sm:px-4 sm:text-base"
          style={{
            backgroundColor: insight.card,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: insight.border,
            color: colors.text,
          }}
        >
          ← Back
        </button>

        <header className="mb-6 sm:mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide sm:text-sm" style={{ color: colors.accent }}>
            Forecast
          </p>
          <h1
            className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-[2.25rem] lg:leading-tight"
            style={{ color: colors.text }}
          >
            Topic forecast
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed sm:text-base lg:text-lg" style={{ color: colors.textMuted }}>
            Demo model: filter by class, subject, and years; combines frequency, recency, and momentum into a 0–100
            score, then ranks topics as High / Medium / Low importance.
          </p>
          <button
            type="button"
            onClick={scrollToMain}
            className="mt-4 inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 sm:mt-5 sm:text-base"
            style={{
              backgroundColor: insight.elevated,
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: insight.border,
              color: colors.accent,
            }}
          >
            Scroll down for filters & charts
            <span aria-hidden className="text-base leading-none">
              ↓
            </span>
          </button>
        </header>

        <section
          id="topic-prediction-scroll-target"
          className="mb-6 scroll-mt-6 rounded-2xl p-4 sm:mb-8 sm:p-5 md:p-6"
          style={{
            backgroundColor: insight.card,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: insight.border,
          }}
        >
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide" style={{ color: colors.textSubtle }}>
            Filters
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            <label className="flex min-w-0 flex-col gap-2">
              <span className="text-xs font-semibold" style={{ color: colors.textMuted }}>
                Class
              </span>
              <select
                style={selectStyle}
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value as TopicPredictionFilters['classLevel'])}
              >
                <option value="all">All classes</option>
                {classOptions().map((c) => (
                  <option key={c} value={c}>
                    Class {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className="text-xs font-semibold" style={{ color: colors.textMuted }}>
                Subject
              </span>
              <select
                style={selectStyle}
                value={subject}
                onChange={(e) => setSubject(e.target.value as TopicPredictionFilters['subject'])}
              >
                <option value="all">All subjects</option>
                {subjectOptions().map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className="text-xs font-semibold" style={{ color: colors.textMuted }}>
                From year
              </span>
              <select style={selectStyle} value={yearFrom} onChange={(e) => setYearFrom(Number(e.target.value))}>
                {yearsOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className="text-xs font-semibold" style={{ color: colors.textMuted }}>
                To year
              </span>
              <select style={selectStyle} value={yearTo} onChange={(e) => setYearTo(Number(e.target.value))}>
                {yearsOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section
          className="mb-6 rounded-2xl border p-4 sm:mb-8 sm:p-5 md:p-6"
          style={{
            backgroundColor: 'rgba(99,102,241,0.14)',
            borderColor: 'rgba(99,102,241,0.4)',
            borderWidth: 1,
            borderStyle: 'solid',
          }}
        >
          <h2 className="text-xs font-extrabold uppercase tracking-wide sm:text-sm" style={{ color: colors.accent }}>
            Most likely to appear
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {model.mostLikely.map((t, i) => (
              <div
                key={t.id}
                className="flex h-full min-h-0 flex-col rounded-xl p-4"
                style={{
                  backgroundColor: insight.card,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: insight.border,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold" style={{ color: colors.textSubtle }}>
                    #{i + 1}
                  </span>
                  <TierBadge tier={t.tier} />
                </div>
                <p className="mt-2 text-sm font-semibold leading-snug sm:text-base" style={{ color: colors.text }}>
                  {t.label}
                </p>
                <p className="mt-3 text-xl font-black tabular-nums sm:text-2xl" style={{ color: colors.text }}>
                  {t.probabilityPct}
                  <span className="text-base font-bold" style={{ color: colors.textMuted }}>
                    %
                  </span>
                </p>
                <p className="mt-1 text-xs" style={{ color: colors.textSubtle }}>
                  Freq {t.frequency} · momentum {t.trendDelta >= 0 ? '+' : ''}
                  {t.trendDelta.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="mb-6 rounded-2xl p-4 sm:mb-8 sm:p-5 md:p-6"
          style={{
            backgroundColor: insight.card,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: insight.border,
          }}
        >
          <h2 className="text-base font-bold sm:text-lg lg:text-xl" style={{ color: colors.text }}>
            Practice from high-frequency topics
          </h2>
          <p className="mt-1 text-xs leading-relaxed sm:text-sm md:text-base" style={{ color: colors.textMuted }}>
            Pick a topic below to open <strong style={{ color: colors.text }}>Prepare with AI → MCQs</strong> with this
            topic and class pre-filled.
          </p>
          {hotTopicsForPractice.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: colors.textSubtle }}>
              No topics for this filter — widen the year range or set class/subject to &quot;All&quot;.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {hotTopicsForPractice.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      hotTopicMcqPracticeHref({
                        topic: t.topic,
                        subject: t.subject,
                        classLevel,
                      })
                    )
                  }
                  className="min-h-11 w-full min-w-0 touch-manipulation rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-opacity hover:opacity-90 sm:w-auto sm:max-w-md sm:px-4"
                  style={{
                    backgroundColor: insight.elevated,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: insight.border,
                    color: colors.text,
                    maxWidth: '100%',
                  }}
                >
                  <span className="block truncate" title={t.label}>
                    {t.topic}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium" style={{ color: colors.textSubtle }}>
                    {t.subject} · {t.frequency} hits · Class {classLevel === 'all' ? '10 (default)' : classLevel}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section
          className="mb-8 rounded-2xl p-5 md:p-6"
          style={{
            backgroundColor: insight.card,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: insight.border,
          }}
        >
          <h2 className="text-lg font-bold" style={{ color: colors.text }}>
            Full ranking
          </h2>
          <p className="mt-1 text-xs" style={{ color: colors.textSubtle }}>
            High / Medium / Low from score thresholds (67+ / 34–66 / 0–33).
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {model.topics.slice(0, 24).map((t) => (
              <div
                key={t.id}
                className="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:justify-between"
                style={{ backgroundColor: insight.elevated, border: `1px solid ${insight.border}` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: colors.text }}>
                    {t.label}
                  </p>
                  <p className="text-xs" style={{ color: colors.textMuted }}>
                    Appearances {t.frequency} · trend {t.trendDelta >= 0 ? '+' : ''}
                    {t.trendDelta.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <TierBadge tier={t.tier} />
                  <span className="text-lg font-black tabular-nums" style={{ color: colors.text }}>
                    {t.probabilityPct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 items-stretch gap-4 sm:gap-5 md:grid-cols-2 md:gap-6 xl:gap-8">
          <ChartCard title="Predicted topic weights" subtitle="Score % (min–max within current filter)">
            <ResponsiveChartBox innerClassName="mx-auto h-[240px] w-full min-w-[260px] sm:h-[300px] md:h-[340px] lg:h-[380px] xl:h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barRows} layout="vertical" margin={{ left: 2, right: 10, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={insight.grid} />
                  <XAxis type="number" domain={[0, 100]} tick={axisTick} stroke={insight.grid} />
                  <YAxis
                    type="category"
                    dataKey="short"
                    width={88}
                    tick={{ ...axisTick, fontSize: 10 }}
                    interval={0}
                    stroke={insight.grid}
                  />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey="pct" name="Probability %" radius={[0, 8, 8, 0]}>
                    {barRows.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={TIER_FILL[entry.tier]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ResponsiveChartBox>
          </ChartCard>

          <ChartCard title="Yearly mentions (trend)" subtitle="Raw counts per year for top 5 scored topics">
            <ResponsiveChartBox innerClassName="mx-auto h-[240px] w-full min-w-[260px] sm:h-[300px] md:h-[340px] lg:h-[380px] xl:h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.trendSeries} margin={{ left: 4, right: 10, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={insight.grid} />
                  <XAxis dataKey="year" tick={axisTick} stroke={insight.grid} />
                  <YAxis tick={axisTick} stroke={insight.grid} allowDecimals={false} width={40} />
                  <Tooltip {...tooltipProps} />
                  <Legend wrapperStyle={legendStyle} />
                  {model.trendKeys.map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={model.trendLabels[i] ?? key}
                      stroke={CHART_LINE[i % CHART_LINE.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ResponsiveChartBox>
          </ChartCard>
        </div>

        <div className="mt-4 sm:mt-6">
          <ChartCard
            title="Class mix (filtered corpus)"
            subtitle="Question counts by class for the same filters — used as context for predictions"
          >
            {model.classDistribution.length === 0 ? (
              <p className="py-10 text-center text-sm sm:py-12 sm:text-base" style={{ color: colors.textSubtle }}>
                No rows for this filter.
              </p>
            ) : (
              <ResponsiveChartBox innerClassName="mx-auto h-[220px] w-full min-w-[260px] sm:h-[260px] md:h-[280px] lg:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={model.classDistribution} margin={{ bottom: 8, left: 4, right: 8, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={insight.grid} />
                    <XAxis dataKey="label" tick={axisTick} stroke={insight.grid} />
                    <YAxis tick={axisTick} stroke={insight.grid} allowDecimals={false} width={36} />
                    <Tooltip {...tooltipProps} />
                    <Bar dataKey="count" fill={colors.primary} name="Questions" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ResponsiveChartBox>
            )}
          </ChartCard>
        </div>
      </div>
    </WebInsightsDashboardLayout>
  );
}

function TierBadge({ tier }: { tier: ImportanceTier }) {
  const label = tier === 'high' ? 'High' : tier === 'medium' ? 'Medium' : 'Low';
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide"
      style={{
        backgroundColor: `${TIER_FILL[tier]}22`,
        color: TIER_FILL[tier],
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: `${TIER_FILL[tier]}55`,
      }}
    >
      {label}
    </span>
  );
}

function yearsOptions(): number[] {
  const out: number[] = [];
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) out.push(y);
  return out;
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex h-full min-h-0 flex-col rounded-2xl p-4 sm:p-5 md:p-6"
      style={{
        backgroundColor: insight.card,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: insight.border,
      }}
    >
      <h2 className="text-base font-bold sm:text-lg lg:text-xl" style={{ color: colors.text }}>
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-1 text-xs sm:text-sm" style={{ color: colors.textSubtle }}>
          {subtitle}
        </p>
      ) : null}
      <div className="mt-3 min-h-0 flex-1 sm:mt-4">{children}</div>
    </section>
  );
}
