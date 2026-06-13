import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Path,
  Polyline,
  Circle,
  Line,
  Rect,
  G,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Target,
  ClipboardList,
  PieChart as PieChartIcon,
  BarChart3,
} from 'lucide-react-native';
import { colors, radii } from '../../theme/colors';
import {
  type DashboardData,
  EMPTY_DASHBOARD,
  loadStudentPerformanceDashboard,
} from './studentPerformanceDashboardApi';

export type { DashboardData } from './studentPerformanceDashboardApi';

/*
 * ─── Legacy dummy JSON (commented out for production; restore to test UI) ───
 *
 * const STUDENT_PERFORMANCE_DUMMY_LEGACY = {
 *   overall: { average_score: 67.3, accuracy_pct: 72.1, total_tests: 24 },
 *   score_progression: [
 *     { week_label: 'W1', date: '2026-01-05', avg_score: 52 },
 *     { week_label: 'W2', date: '2026-01-12', avg_score: 55 },
 *     { week_label: 'W3', date: '2026-01-19', avg_score: 61 },
 *     { week_label: 'W4', date: '2026-01-26', avg_score: 58 },
 *     { week_label: 'W5', date: '2026-02-02', avg_score: 64 },
 *     { week_label: 'W6', date: '2026-02-09', avg_score: 68 },
 *     { week_label: 'W7', date: '2026-02-16', avg_score: 71 },
 *     { week_label: 'W8', date: '2026-02-23', avg_score: 74 },
 *   ],
 *   subject_scores: [
 *     { subject: 'Physics', score_pct: 76 },
 *     { subject: 'Chemistry', score_pct: 48 },
 *     { subject: 'Math', score_pct: 58 },
 *     { subject: 'Biology', score_pct: 81 },
 *   ],
 *   topic_performance: [
 *     { topic: 'Algebra', subject: 'Math', score_pct: 44, attempts: 32 },
 *     { topic: 'Mechanics', subject: 'Physics', score_pct: 72, attempts: 18 },
 *     { topic: 'Organic Chemistry', subject: 'Chemistry', score_pct: 48, attempts: 22 },
 *     { topic: 'Cell Biology', subject: 'Biology', score_pct: 85, attempts: 14 },
 *     { topic: 'Calculus', subject: 'Math', score_pct: 52, attempts: 20 },
 *     { topic: 'Thermodynamics', subject: 'Physics', score_pct: 41, attempts: 12 },
 *     { topic: 'Acids & Bases', subject: 'Chemistry', score_pct: 68, attempts: 16 },
 *   ],
 *   time_per_subject_minutes: [
 *     { subject: 'Physics', minutes: 185 },
 *     { subject: 'Chemistry', minutes: 142 },
 *     { subject: 'Math', minutes: 220 },
 *     { subject: 'Biology', minutes: 95 },
 *   ],
 *   improvement: [
 *     { subject: 'Physics', previous_pct: 62, current_pct: 76 },
 *     { subject: 'Chemistry', previous_pct: 42, current_pct: 48 },
 *     { subject: 'Math', previous_pct: 61, current_pct: 58 },
 *     { subject: 'Biology', previous_pct: 74, current_pct: 81 },
 *   ],
 * } as const satisfies DashboardData;
 */

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_PAD = 20;
const LINE_CHART_W = SCREEN_W - 32 - CHART_PAD * 2;
const LINE_CHART_H = 160;
const BAR_CHART_H = 200;
const PIE_SIZE = Math.min(200, SCREEN_W - 80);
const WEAK_THRESHOLD = 55;

function buildAiInsights(data: DashboardData): string[] {
  const lines: string[] = [];
  const weakTopics = data.topic_performance.filter((t) => t.score_pct < WEAK_THRESHOLD);
  const lowSubjects = data.subject_scores.filter((s) => s.score_pct < 60);

  if (weakTopics.some((t) => t.topic === 'Algebra' || t.subject === 'Math')) {
    lines.push('Algebra and equation-solving show the largest gap — short daily drills on linear systems will lift your Math average fastest.');
  }
  if (weakTopics.some((t) => t.topic.includes('Thermodynamics') || t.topic.includes('Mechanics'))) {
    lines.push('Physics conceptual items (energy, forces) are inconsistent — try 10-minute recap + one applied problem per session.');
  }
  if (lowSubjects.some((s) => s.subject === 'Chemistry')) {
    lines.push('Chemistry sits below your other subjects; balancing reaction-type MCQs with mechanism sketches usually improves retention.');
  }
  const mathTime = data.time_per_subject_minutes.find((t) => t.subject === 'Math')?.minutes ?? 0;
  const bioTime = data.time_per_subject_minutes.find((t) => t.subject === 'Biology')?.minutes ?? 0;
  if (mathTime > bioTime * 1.5) {
    lines.push('You allocate more time to Math than Biology — if Biology is a board priority, shift one session per week to balance load.');
  }
  const prog = data.score_progression;
  if (prog.length >= 2) {
    const last = prog[prog.length - 1].avg_score;
    const first = prog[0].avg_score;
    if (last > first + 10) {
      lines.push('Your weekly averages are trending up — keep the same study rhythm; spacing repeats beats cramming.');
    } else if (last < first) {
      lines.push('Recent weeks dipped slightly — shorter, more frequent tests beat long rare sessions for steady gains.');
    }
  }
  if (!lines.length) {
    lines.push('Performance is balanced across topics. Maintain mixed practice (recall + application) to lock in gains before exams.');
  }
  return lines.slice(0, 4);
}

function polar(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

/** One segment of the time donut; ``path`` fill. ``ring`` is used when a single 100% slice would degenerate (full 2π arc). */
type TimePieSlice =
  | { kind: 'path'; path: string; color: string; label: string; pct: number }
  | {
      kind: 'ring';
      cx: number;
      cy: number;
      rMid: number;
      strokeW: number;
      color: string;
      label: string;
      pct: number;
    };

function donutSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  sweepAngle: number
): string {
  const endAngle = startAngle + sweepAngle;
  const large = sweepAngle > Math.PI ? 1 : 0;
  const p1 = polar(cx, cy, rOuter, startAngle);
  const p2 = polar(cx, cy, rOuter, endAngle);
  const p3 = polar(cx, cy, rInner, endAngle);
  const p4 = polar(cx, cy, rInner, startAngle);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

const SUBJECT_COLORS: Record<string, string> = {
  Physics: '#22D3EE',
  Chemistry: '#A78BFA',
  Math: '#F472B6',
  Biology: '#34D399',
};

export default function StudentPerformanceDashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    console.log('[PerformanceDashboard] load:start');
    setError(null);
    try {
      const next = await loadStudentPerformanceDashboard();
      console.log('[PerformanceDashboard] load:success', {
        subjects: next.subject_scores.length,
        topics: next.topic_performance.length,
      });
      setData(next);
    } catch (e) {
      console.log('[PerformanceDashboard] load:error', e);
      setError(e instanceof Error ? e.message : 'Could not load performance');
      setData(EMPTY_DASHBOARD);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    console.log('[PerformanceDashboard] mount');
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const aiLines = useMemo(() => buildAiInsights(data), [data]);

  const alerts = useMemo(() => {
    const out: { title: string; detail: string; score: number }[] = [];
    for (const t of data.topic_performance) {
      if (t.score_pct < 50) {
        out.push({
          title: `Low score: ${t.topic}`,
          detail: `Your average on this topic is ${t.score_pct}%. Re-practice with shorter sessions and check worked examples before the next test.`,
          score: t.score_pct,
        });
      }
    }
    for (const s of data.subject_scores) {
      if (s.score_pct < 50) {
        out.push({
          title: `${s.subject} below 50%`,
          detail: 'Schedule a focused review week: one topic per day with timed quizzes.',
          score: s.score_pct,
        });
      }
    }
    return out.slice(0, 4);
  }, [data]);

  const linePoints = useMemo(() => {
    const pts = data.score_progression;
    if (!pts.length) return { d: '', labels: [] as string[], circles: [] as { cx: number; cy: number }[] };
    const scores = pts.map((p) => p.avg_score);
    const minS = Math.min(...scores) - 5;
    const maxS = Math.max(...scores) + 5;
    const range = maxS - minS || 1;
    const n = pts.length;
    const stepX = LINE_CHART_W / Math.max(1, n - 1);
    const coords: string[] = [];
    const circles: { cx: number; cy: number }[] = [];
    for (let i = 0; i < n; i++) {
      const x = CHART_PAD + i * stepX;
      const y = CHART_PAD + LINE_CHART_H - ((pts[i].avg_score - minS) / range) * (LINE_CHART_H - CHART_PAD * 2);
      coords.push(`${x},${y}`);
      circles.push({ cx: x, cy: y });
    }
    return { d: coords.join(' '), labels: pts.map((p) => p.week_label), circles };
  }, [data.score_progression]);

  const maxSubject = useMemo(() => {
    const vals = data.subject_scores.map((s) => s.score_pct);
    return vals.length ? Math.max(...vals, 1) : 1;
  }, [data.subject_scores]);

  const pieSlices = useMemo(() => {
    const items = [...data.time_per_subject_minutes];
    const totalMins = items.reduce((a, b) => a + b.minutes, 0);
    if (!items.length) {
      return { slices: [] as TimePieSlice[], total: 0 };
    }
    const total = totalMins || 1;
    const cx = PIE_SIZE / 2;
    const cy = PIE_SIZE / 2;
    const ro = PIE_SIZE * 0.38;
    const ri = PIE_SIZE * 0.22;
    const slices: TimePieSlice[] = [];

    // One subject = 100% → arc sweep is 2π and SVG degenerates (start = end). Draw a stroke ring instead.
    if (items.length === 1 && items[0].minutes > 0) {
      const it = items[0];
      slices.push({
        kind: 'ring',
        cx,
        cy,
        rMid: (ro + ri) / 2,
        strokeW: Math.max(4, ro - ri),
        color: SUBJECT_COLORS[it.subject] ?? colors.accent,
        label: it.subject,
        pct: 100,
      });
    } else {
      let angle = -Math.PI / 2;
      for (const it of items) {
        const sweep = (it.minutes / total) * Math.PI * 2;
        const path = donutSlice(cx, cy, ro, ri, angle, sweep);
        slices.push({
          kind: 'path',
          path,
          color: SUBJECT_COLORS[it.subject] ?? colors.accent,
          label: it.subject,
          pct: Math.round((it.minutes / total) * 100),
        });
        angle += sweep;
      }
    }
    return { slices, total: totalMins };
  }, [data.time_per_subject_minutes]);

  const maxImprove = useMemo(() => {
    const vals = data.improvement.flatMap((r) => [r.previous_pct, r.current_pct]);
    return vals.length ? Math.max(...vals, 1) : 1;
  }, [data.improvement]);

  const hasProgression = data.score_progression.length > 0;
  const hasSubjects = data.subject_scores.length > 0;
  const hasTimePie = pieSlices.slices.length > 0;
  const hasTopics = data.topic_performance.length > 0;
  const hasImprovement = data.improvement.length > 0;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerKicker}>Performance</Text>
            <Text style={styles.headerTitle}>Learning dashboard</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
          }
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.loadingTxt}>Loading your dashboard…</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.card}>
              <Text style={styles.errorTxt}>{error}</Text>
              <TouchableOpacity onPress={() => void load()} style={styles.retryBtn}>
                <Text style={styles.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Overall */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Overall performance</Text>
            <Text style={styles.cardSub}>
              From your account: overall accuracy, attempts, and charts below (summary, recent days, by topic).
            </Text>
            <View style={styles.overallRow}>
              <View style={styles.overallTile}>
                <Text style={styles.overallVal}>{data.overall.average_score.toFixed(1)}%</Text>
                <Text style={styles.overallLbl}>Avg score</Text>
              </View>
              <View style={styles.overallTile}>
                <Text style={styles.overallVal}>{data.overall.accuracy_pct.toFixed(1)}%</Text>
                <Text style={styles.overallLbl}>Accuracy</Text>
              </View>
              <View style={styles.overallTile}>
                <Text style={styles.overallVal}>{data.overall.total_tests}</Text>
                <Text style={styles.overallLbl}>Total tests</Text>
              </View>
            </View>
          </View>

          {/* Alerts */}
          {alerts.length > 0 && (
            <View style={styles.cardAlert}>
              <View style={styles.alertHeader}>
                <AlertTriangle size={20} color={colors.danger} />
                <Text style={styles.alertTitle}>Needs attention (under 50%)</Text>
              </View>
              {alerts.map((a, i) => (
                <View key={i} style={styles.alertRow}>
                  <Text style={styles.alertItemTitle}>{a.title}</Text>
                  <Text style={styles.alertItemMeta}>Score: {a.score}%</Text>
                  <Text style={styles.alertItemDetail}>{a.detail}</Text>
                  <TouchableOpacity
                    style={styles.repracticeBtn}
                    activeOpacity={0.88}
                    onPress={() => router.push('/prepare-with-ai' as never)}
                  >
                    <Target size={16} color={colors.primary} />
                    <Text style={styles.repracticeTxt}>Open Prepare with AI to re-practice</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Line chart */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <TrendingUp size={20} color={colors.accent} />
              <Text style={styles.cardTitleInline}>Score progression</Text>
            </View>
            <Text style={styles.cardSub}>Daily accuracy over recent days (UTC)</Text>
            {hasProgression ? (
              <>
                <Svg width={LINE_CHART_W + CHART_PAD * 2} height={LINE_CHART_H + 36}>
                  <Defs>
                    <SvgLinearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={colors.accent} stopOpacity="0.9" />
                      <Stop offset="1" stopColor={colors.primary} stopOpacity="0.9" />
                    </SvgLinearGradient>
                  </Defs>
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                    const y = CHART_PAD + t * (LINE_CHART_H - CHART_PAD * 2);
                    return (
                      <Line
                        key={t}
                        x1={CHART_PAD}
                        y1={y}
                        x2={CHART_PAD + LINE_CHART_W}
                        y2={y}
                        stroke={colors.border}
                        strokeWidth={1}
                      />
                    );
                  })}
                  <Polyline
                    points={linePoints.d}
                    fill="none"
                    stroke="url(#lineGrad)"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {linePoints.circles.map((c, i) => (
                    <Circle key={i} cx={c.cx} cy={c.cy} r={5} fill={colors.surface} stroke={colors.accent} strokeWidth={2} />
                  ))}
                </Svg>
                <View style={styles.xLabels}>
                  {linePoints.labels.map((lb, i) => (
                    <Text key={i} style={styles.xLabel}>
                      {lb}
                    </Text>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.chartEmpty}>No weekly scores yet — chart appears when progression data exists.</Text>
            )}
          </View>

          {/* Subject bar chart */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <BarChart3 size={20} color={colors.accent} />
              <Text style={styles.cardTitleInline}>Subject-wise performance</Text>
            </View>
            <Text style={styles.cardSub}>Subject averages (%)</Text>
            {hasSubjects ? (
              <>
                <Svg width={SCREEN_W - 32} height={BAR_CHART_H}>
                  {data.subject_scores.map((s, i) => {
                    const n = data.subject_scores.length;
                    const gap = 8;
                    const barW = (SCREEN_W - 32 - 48 - gap * (n - 1)) / Math.max(n, 1);
                    const x = 24 + i * (barW + gap);
                    const h = ((BAR_CHART_H - 50) * s.score_pct) / maxSubject;
                    const y = BAR_CHART_H - 28 - h;
                    const col = SUBJECT_COLORS[s.subject] ?? colors.primary;
                    return (
                      <G key={`${s.subject}-${i}`}>
                        <Rect x={x} y={y} width={barW} height={h} rx={8} fill={col} opacity={0.9} />
                        <SvgText
                          x={x + barW / 2}
                          y={BAR_CHART_H - 8}
                          fill={colors.textMuted}
                          fontSize={11}
                          fontWeight="600"
                          textAnchor="middle"
                        >
                          {s.subject.length > 6 ? `${s.subject.slice(0, 5)}…` : s.subject}
                        </SvgText>
                      </G>
                    );
                  })}
                </Svg>
                <View style={styles.legendRow}>
                  {data.subject_scores.map((s, i) => (
                    <View key={`${s.subject}-${i}`} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: SUBJECT_COLORS[s.subject] }]} />
                      <Text style={styles.legendTxt}>
                        {s.subject} {s.score_pct}%
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.chartEmpty}>No subject scores yet — bar chart fills when you have practice data.</Text>
            )}
          </View>

          {/* Pie time */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <PieChartIcon size={20} color={colors.accent} />
              <Text style={styles.cardTitleInline}>Time spent per subject</Text>
            </View>
            <Text style={styles.cardSub}>
              Question practice only: total seconds you spent on submitted answers (per subject), not general study
              sessions.
            </Text>
            {hasTimePie ? (
              <View style={styles.pieRow}>
                <Svg width={PIE_SIZE} height={PIE_SIZE}>
                  {pieSlices.slices.map((sl, i) =>
                    sl.kind === 'ring' ? (
                      <Circle
                        key={i}
                        cx={sl.cx}
                        cy={sl.cy}
                        r={sl.rMid}
                        fill="none"
                        stroke={sl.color}
                        strokeWidth={sl.strokeW}
                        opacity={0.92}
                      />
                    ) : (
                      <Path key={i} d={sl.path} fill={sl.color} opacity={0.92} />
                    )
                  )}
                  <Circle cx={PIE_SIZE / 2} cy={PIE_SIZE / 2} r={PIE_SIZE * 0.18} fill={colors.surface} />
                </Svg>
                <View style={styles.pieLegend}>
                  {pieSlices.slices.map((sl, i) => (
                    <View key={i} style={styles.pieLegRow}>
                      <View style={[styles.legendDot, { backgroundColor: sl.color }]} />
                      <Text style={styles.pieLegTxt}>
                        {sl.label} · {sl.pct}%
                      </Text>
                    </View>
                  ))}
                  <Text style={styles.pieTotal}>{pieSlices.total} min total</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.chartEmpty}>
                No timed practice yet — you must be signed in, then submit answers (short/long practice cards, or tap an
                MCQ option on the MCQs screen so the server can record time). Guest mode does not save attempts. Pull to
                refresh after practicing.
              </Text>
            )}
          </View>

          {/* Topics */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <ClipboardList size={20} color={colors.accent} />
              <Text style={styles.cardTitleInline}>Topic-wise performance</Text>
            </View>
            <Text style={styles.cardSub}>Weak topics highlighted — focus here first</Text>
            {hasTopics ? (
              [...data.topic_performance]
                .sort((a, b) => a.score_pct - b.score_pct)
                .map((t, i) => {
                  const weak = t.score_pct < WEAK_THRESHOLD;
                  return (
                    <View key={`${t.subject}-${t.topic}-${t.score_pct}-${i}`} style={[styles.topicRow, weak && styles.topicRowWeak]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.topicName}>{t.topic}</Text>
                        <Text style={styles.topicMeta}>
                          {t.subject} · {t.attempts} attempts
                        </Text>
                      </View>
                      {weak && (
                        <View style={styles.weakPill}>
                          <Text style={styles.weakPillTxt}>Weak</Text>
                        </View>
                      )}
                      <Text style={[styles.topicScore, weak && styles.topicScoreWeak]}>{t.score_pct}%</Text>
                    </View>
                  );
                })
            ) : (
              <Text style={styles.chartEmpty}>No topic breakdown yet.</Text>
            )}
          </View>

          {/* Improvement */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Target size={20} color={colors.accent} />
              <Text style={styles.cardTitleInline}>Improvement vs last period</Text>
            </View>
            <Text style={styles.cardSub}>Previous (muted) vs current (bright)</Text>
            {hasImprovement ? (
              data.improvement.map((row, i) => {
                const wPrev = (row.previous_pct / maxImprove) * 100;
                const wCur = (row.current_pct / maxImprove) * 100;
                return (
                  <View key={`${row.subject}-${i}`} style={styles.impBlock}>
                    <Text style={styles.impSubject}>{row.subject}</Text>
                    <View style={styles.impBarTrack}>
                      <View style={[styles.impBarPrev, { width: `${wPrev}%` }]} />
                    </View>
                    <View style={[styles.impBarTrack, { marginTop: 6 }]}>
                      <View style={[styles.impBarCur, { width: `${wCur}%` }]} />
                    </View>
                    <View style={styles.impLabels}>
                      <Text style={styles.impLblMuted}>Previous {row.previous_pct}%</Text>
                      <Text style={styles.impLbl}>Current {row.current_pct}%</Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={styles.chartEmpty}>No prior vs current comparison yet.</Text>
            )}
          </View>

          {/* AI */}
          <LinearGradient
            colors={['rgba(99,102,241,0.25)', 'rgba(14,165,233,0.12)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.aiCard}
          >
            <View style={styles.cardHead}>
              <Sparkles size={22} color={colors.accent} />
              <Text style={styles.aiTitle}>AI insights</Text>
            </View>
            <Text style={styles.aiSub}>Rule-based summary from your scores (replace with LLM later)</Text>
            {aiLines.map((line, i) => (
              <View key={i} style={styles.aiBullet}>
                <Text style={styles.aiBulletDot}>●</Text>
                <Text style={styles.aiBulletTxt}>{line}</Text>
              </View>
            ))}
          </LinearGradient>

          <Text style={styles.footerNote}>
            Live data loads from the backend when signed in. Legacy dummy JSON remains commented in this file for UI
            testing without a server.
          </Text>
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerKicker: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardAlert: {
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderRadius: radii.xl,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  cardSub: { color: colors.textMuted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  cardTitleInline: { color: colors.text, fontSize: 17, fontWeight: '800' },
  overallRow: { flexDirection: 'row', marginTop: 16, gap: 10 },
  overallTile: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  overallVal: { color: colors.text, fontSize: 22, fontWeight: '800' },
  overallLbl: { color: colors.textSubtle, fontSize: 11, marginTop: 4, fontWeight: '600' },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  alertTitle: { color: colors.danger, fontSize: 15, fontWeight: '800' },
  alertRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(248,113,113,0.2)',
  },
  alertItemTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  alertItemMeta: { color: colors.danger, fontSize: 13, fontWeight: '700', marginTop: 4 },
  alertItemDetail: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  repracticeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  repracticeTxt: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  xLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 4,
    width: LINE_CHART_W + CHART_PAD * 2,
  },
  xLabel: { color: colors.textSubtle, fontSize: 10, fontWeight: '600', width: 36, textAlign: 'center' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  pieRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 16, flexWrap: 'wrap' },
  pieLegend: { flex: 1, minWidth: 140, gap: 8 },
  pieLegRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pieLegTxt: { color: colors.text, fontSize: 13, fontWeight: '600' },
  pieTotal: { color: colors.textSubtle, fontSize: 12, marginTop: 8 },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  topicRowWeak: {
    backgroundColor: 'rgba(248,113,113,0.06)',
    marginHorizontal: -12,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderBottomWidth: 0,
    marginBottom: 6,
  },
  topicName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  topicMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  topicScore: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  topicScoreWeak: { color: colors.danger },
  weakPill: {
    backgroundColor: 'rgba(248,113,113,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  weakPillTxt: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  chartEmpty: { color: colors.textMuted, fontSize: 14, lineHeight: 20, paddingVertical: 16, textAlign: 'center' },
  impBlock: { marginTop: 14 },
  impSubject: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  impBarTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  impBarPrev: { height: '100%', backgroundColor: colors.textSubtle, borderRadius: 5 },
  impBarCur: { height: '100%', backgroundColor: colors.success, borderRadius: 5 },
  impLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  impLblMuted: { color: colors.textSubtle, fontSize: 11 },
  impLbl: { color: colors.success, fontSize: 11, fontWeight: '700' },
  aiCard: {
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
  },
  aiTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  aiSub: { color: colors.textMuted, fontSize: 13, marginTop: 6, marginBottom: 12, lineHeight: 18 },
  aiBullet: { flexDirection: 'row', gap: 10, marginTop: 10, paddingRight: 8 },
  aiBulletDot: { color: colors.accent, fontSize: 12, marginTop: 3 },
  aiBulletTxt: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 21 },
  footerNote: { color: colors.textSubtle, fontSize: 11, textAlign: 'center', marginTop: 8, lineHeight: 16 },
  loadingRow: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  loadingTxt: { color: colors.textMuted, fontSize: 14 },
  errorTxt: { color: colors.danger, fontSize: 14, marginBottom: 10 },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radii.md,
  },
  retryTxt: { color: '#fff', fontWeight: '700' },
});
