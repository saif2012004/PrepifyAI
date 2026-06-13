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
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { colors } from '../../../theme/colors';
import {
  buildPastPaperInsightsModel,
  classOptions,
  subjectOptions,
  YEAR_MIN,
  YEAR_MAX,
  type InsightFilters,
} from './model';
import WebInsightsDashboardLayout, { ResponsiveChartBox } from '../../layout/WebInsightsDashboardLayout';

/** Slightly lifted slate (vs global `colors.bg` / `surface`) so charts feel less heavy. */
const insight = {
  page: '#121a30',
  card: '#1a253f',
  elevated: '#232f4d',
  tooltip: '#2a3758',
  border: 'rgba(255,255,255,0.12)',
  grid: 'rgba(255,255,255,0.1)',
} as const;

const CHART_LINE = [colors.primary, colors.gradientEnd, colors.accent, colors.warning, colors.success];
const GRID = insight.grid;
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

export default function PastPaperInsights() {
  const router = useRouter();
  const [classLevel, setClassLevel] = useState<InsightFilters['classLevel']>('all');
  const [subject, setSubject] = useState<InsightFilters['subject']>('all');
  const [yearFrom, setYearFrom] = useState(YEAR_MIN);
  const [yearTo, setYearTo] = useState(YEAR_MAX);

  const model = useMemo(
    () => buildPastPaperInsightsModel({ classLevel, subject, yearFrom, yearTo }),
    [classLevel, subject, yearFrom, yearTo]
  );

  const topicBarData = model.topicFrequency.slice(0, 10).map((t) => ({
    topic: t.topic.length > 22 ? `${t.topic.slice(0, 20)}…` : t.topic,
    full: t.topic,
    count: t.count,
  }));

  const importanceData = model.importantTopics.slice(0, 8).map((t) => ({
    label: `${t.topic}`.length > 16 ? `${t.topic.slice(0, 14)}…` : t.topic,
    score: Math.round(t.score * 10) / 10,
  }));

  const selectStyle: React.CSSProperties = {
    backgroundColor: insight.elevated,
    borderColor: insight.border,
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 12,
    padding: '10px 12px',
    minHeight: 44,
    color: colors.text,
    fontSize: 14,
    fontWeight: 500,
    outline: 'none',
    width: '100%',
    maxWidth: '100%',
  };

  const scrollToMain = () => {
    document
      .getElementById('past-paper-insights-scroll-target')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          <p
            className="text-xs font-semibold uppercase tracking-wide sm:text-sm"
            style={{ color: colors.accent }}
          >
            Insights
          </p>
          <h1
            className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl lg:text-[2.25rem] lg:leading-tight"
            style={{ color: colors.text }}
          >
            Past paper analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed sm:text-base lg:text-lg" style={{ color: colors.textMuted }}>
            Explore repeated topics by class and subject, difficulty mix, and year trends — demo data with simulated AI
            highlights.
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
          id="past-paper-insights-scroll-target"
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
                onChange={(e) => setClassLevel(e.target.value as InsightFilters['classLevel'])}
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
                onChange={(e) => setSubject(e.target.value as InsightFilters['subject'])}
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
          <p className="mt-4 text-xs" style={{ color: colors.textSubtle }}>
            Showing <span style={{ color: colors.accent, fontWeight: 700 }}>{model.totalQuestions}</span> question
            occurrences in range.
          </p>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-3 sm:mb-8 sm:gap-4 md:grid-cols-2 md:gap-5">
          {model.aiInsights.map((ins, i) => (
            <div
              key={i}
              className="h-full min-h-0 rounded-2xl border p-4 sm:p-5"
              style={{
                backgroundColor:
                  ins.tone === 'warning'
                    ? 'rgba(251,191,36,0.08)'
                    : ins.tone === 'success'
                      ? 'rgba(52,211,153,0.08)'
                      : 'rgba(99,102,241,0.12)',
                borderColor:
                  ins.tone === 'warning'
                    ? 'rgba(251,191,36,0.35)'
                    : ins.tone === 'success'
                      ? 'rgba(52,211,153,0.35)'
                      : 'rgba(99,102,241,0.35)',
                borderWidth: 1,
                borderStyle: 'solid',
              }}
            >
              <h3 className="text-sm font-bold sm:text-base" style={{ color: colors.text }}>
                {ins.title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed sm:text-sm md:text-base" style={{ color: colors.textMuted }}>
                {ins.detail}
              </p>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 items-stretch gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
          <ChartCard title="Frequently repeated topics" subtitle="Count of appearances in filtered papers">
            <ResponsiveChartBox>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicBarData} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis type="number" tick={axisTick} stroke={GRID} />
                  <YAxis
                    type="category"
                    dataKey="topic"
                    width={72}
                    tick={{ ...axisTick, fontSize: 10 }}
                    interval={0}
                    stroke={GRID}
                  />
                  <Tooltip
                    {...tooltipProps}
                    labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ''}
                  />
                  <Bar dataKey="count" fill={colors.primary} radius={[0, 8, 8, 0]} name="Frequency" />
                </BarChart>
              </ResponsiveContainer>
            </ResponsiveChartBox>
          </ChartCard>

          <ChartCard title="Important topics (weighted)" subtitle="Recency & difficulty-weighted score">
            <ResponsiveChartBox>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={importanceData} margin={{ bottom: 36, left: 4, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="label" tick={axisTick} angle={-18} textAnchor="end" height={72} stroke={GRID} />
                  <YAxis tick={axisTick} stroke={GRID} width={36} />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey="score" fill={colors.gradientEnd} radius={[8, 8, 0, 0]} name="Importance" />
                </BarChart>
              </ResponsiveContainer>
            </ResponsiveChartBox>
          </ChartCard>

          <ChartCard title="Subject weightage" subtitle="Share of questions by subject">
            <ResponsiveChartBox>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={model.subjectWeightage} margin={{ bottom: 8, left: 4, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="subject" tick={axisTick} stroke={GRID} interval={0} angle={0} height={36} />
                  <YAxis tick={axisTick} stroke={GRID} width={36} />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey="count" fill={colors.success} name="Questions" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ResponsiveChartBox>
          </ChartCard>

          <ChartCard title="Class weightage" subtitle="Share of questions by class (9–12)">
            <ResponsiveChartBox>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={model.classWeightage} margin={{ bottom: 8, left: 4, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="label" tick={axisTick} stroke={GRID} />
                  <YAxis tick={axisTick} stroke={GRID} width={36} />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey="count" fill={colors.primary} name="Questions" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ResponsiveChartBox>
          </ChartCard>

          <ChartCard
            title={subject === 'all' ? 'Topic weight (pick a subject)' : 'Topic weight within subject'}
            subtitle={subject === 'all' ? 'Select a subject to see topic mix for that course.' : 'Top topics by count'}
          >
            {subject === 'all' ? (
              <p className="py-12 text-center text-sm sm:py-16 sm:text-base" style={{ color: colors.textSubtle }}>
                Choose a subject above to unlock topic bars.
              </p>
            ) : (
              <ResponsiveChartBox>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={model.topicWeightInSubject} margin={{ bottom: 32, left: 4, right: 8, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis
                      dataKey="topic"
                      tick={{ ...axisTick, fontSize: 9 }}
                      angle={-20}
                      textAnchor="end"
                      height={76}
                      stroke={GRID}
                    />
                    <YAxis tick={axisTick} stroke={GRID} width={36} />
                    <Tooltip {...tooltipProps} />
                    <Bar dataKey="pct" fill={colors.warning} name="%" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ResponsiveChartBox>
            )}
          </ChartCard>

          <ChartCard title="Difficulty distribution" subtitle="Easy / medium / hard mix">
            {model.difficultySplit.length === 0 ? (
              <p className="py-12 text-center text-sm sm:py-16 sm:text-base" style={{ color: colors.textSubtle }}>
                No questions in this filter.
              </p>
            ) : (
              <ResponsiveChartBox>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={model.difficultySplit}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius="72%"
                      label={{ fill: colors.text, fontSize: 10 }}
                    >
                      {model.difficultySplit.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipProps} />
                    <Legend wrapperStyle={legendStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </ResponsiveChartBox>
            )}
          </ChartCard>

          <ChartCard title="Year-wise question volume" subtitle="Total tagged questions per year">
            <ResponsiveChartBox>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={model.yearDistribution} margin={{ left: 4, right: 8, top: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="year" tick={axisTick} stroke={GRID} />
                  <YAxis tick={axisTick} stroke={GRID} width={36} />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey="count" fill={colors.accent} name="Questions" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ResponsiveChartBox>
          </ChartCard>
        </div>

        <ChartCard
          title="Topic trend (top themes)"
          subtitle="Counts per year for highest-scoring topics"
          className="mt-4 sm:mt-6"
        >
          <ResponsiveChartBox innerClassName="mx-auto h-[240px] w-full min-w-[260px] sm:h-[280px] md:h-[300px] lg:h-[340px] xl:h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={model.trendSeries} margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="year" tick={axisTick} stroke={GRID} />
                <YAxis tick={axisTick} stroke={GRID} allowDecimals={false} width={40} />
                <Tooltip {...tooltipProps} />
                <Legend wrapperStyle={legendStyle} />
                {model.trendTopicKeys.map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={model.trendLineLabels[i] ?? key}
                    stroke={CHART_LINE[i % CHART_LINE.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ResponsiveChartBox>
        </ChartCard>
      </div>
    </WebInsightsDashboardLayout>
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
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex h-full min-h-0 flex-col rounded-2xl p-4 sm:p-5 md:p-6 ${className}`}
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
