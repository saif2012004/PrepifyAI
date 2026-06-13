import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  Sparkles,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  BookOpen,
  Dumbbell,
  ClipboardList,
  Leaf,
  RefreshCw,
  CalendarDays,
  GraduationCap,
} from 'lucide-react-native';
import { colors, radii } from '../../theme/colors';
import {
  DUMMY_PLANNER_INPUT,
  revisionPlannerEngine,
  type PlannerDay,
  type PlannerEngineInput,
  type PlannerSlot,
  type SubjectPlannerInput,
} from '../../utils/revisionPlannerEngine';

const SLOT_TINT = {
  revisionBg: 'rgba(99,102,241,0.18)',
  practiceBg: 'rgba(34,211,238,0.12)',
  mockBg: 'rgba(251,191,36,0.14)',
  bufferBg: 'rgba(52,211,153,0.12)',
  spacedBg: 'rgba(167,139,250,0.16)',
} as const;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SLOT_META: Record<
  PlannerSlot['type'],
  { label: string; Icon: typeof BookOpen; fg: string; bg: string }
> = {
  revision: { label: 'Revision', Icon: BookOpen, fg: colors.primary, bg: SLOT_TINT.revisionBg },
  practice: { label: 'Practice', Icon: Dumbbell, fg: colors.accent, bg: SLOT_TINT.practiceBg },
  mock_test: { label: 'Mock test', Icon: ClipboardList, fg: colors.warning, bg: SLOT_TINT.mockBg },
  buffer: { label: 'Buffer', Icon: Leaf, fg: colors.success, bg: SLOT_TINT.bufferBg },
  spaced_review: { label: 'Spaced review', Icon: RefreshCw, fg: '#A78BFA', bg: SLOT_TINT.spacedBg },
};

type SubjectRow = SubjectPlannerInput & {
  topicsRaw: string;
  weakRaw: string;
  strongRaw: string;
};

function withRaw(s: SubjectPlannerInput): SubjectRow {
  return {
    ...s,
    topics: [...s.topics],
    weakTopics: [...s.weakTopics],
    strongTopics: [...s.strongTopics],
    topicsRaw: s.topics.join(', '),
    weakRaw: s.weakTopics.join(', '),
    strongRaw: s.strongTopics.join(', '),
  };
}

function emptySubjectRow(id: string): SubjectRow {
  return {
    id,
    name: '',
    topics: [],
    weakTopics: [],
    strongTopics: [],
    topicsRaw: '',
    weakRaw: '',
    strongRaw: '',
  };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Local calendar YYYY-MM-DD for default plan start. */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODateOnly(iso: string): Date | null {
  const t = iso.trim();
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntilExam(examISO: string): number | null {
  const t = examISO.trim();
  if (!t) return null;
  const exam = new Date(`${t}T12:00:00`);
  if (Number.isNaN(exam.getTime())) return null;
  const diff = Math.ceil((exam.getTime() - startOfToday().getTime()) / 86400000);
  return Math.max(0, diff);
}

export default function AiRevisionPlannerScreen() {
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const [examDate, setExamDate] = useState(DUMMY_PLANNER_INPUT.examDateISO);
  const [planStartDate, setPlanStartDate] = useState(() => todayISO());
  const [dailyHours, setDailyHours] = useState(String(DUMMY_PLANNER_INPUT.dailyStudyHours));
  const [subjects, setSubjects] = useState<SubjectRow[]>(() => DUMMY_PLANNER_INPUT.subjects.map(withRaw));
  const [planDays, setPlanDays] = useState<PlannerDay[]>([]);
  const [summary, setSummary] = useState<ReturnType<typeof revisionPlannerEngine.build>['summary'] | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [completedSlotIds, setCompletedSlotIds] = useState<Record<string, boolean>>({});

  const padX = 16;
  const gap = 12;
  const cols = winW >= 720 ? 2 : 1;
  const cardW = (winW - padX * 2 - gap * (cols - 1)) / cols;

  const loadDummy = () => {
    setExamDate(DUMMY_PLANNER_INPUT.examDateISO);
    setPlanStartDate(todayISO());
    setDailyHours(String(DUMMY_PLANNER_INPUT.dailyStudyHours));
    setSubjects(DUMMY_PLANNER_INPUT.subjects.map(withRaw));
    setCompletedSlotIds({});
    setPlanDays([]);
    setSummary(null);
  };

  const generate = useCallback(() => {
    Keyboard.dismiss();
    const hoursNorm = dailyHours.trim().replace(/\s/g, '').replace(',', '.');
    const h = Number.parseFloat(hoursNorm);
    if (!Number.isFinite(h) || h < 0.5 || h > 14) {
      Alert.alert('Daily hours', 'Enter a number between 0.5 and 14 hours per day.');
      return;
    }
    const subs: SubjectPlannerInput[] = subjects
      .map((s) => ({
        id: s.id,
        name: s.name.trim(),
        topics: revisionPlannerEngine.parseList(s.topicsRaw ?? ''),
        weakTopics: revisionPlannerEngine.parseList(s.weakRaw ?? ''),
        strongTopics: revisionPlannerEngine.parseList(s.strongRaw ?? ''),
      }))
      .filter((s) => s.name && s.topics.length > 0);

    if (!subs.length) {
      Alert.alert('Subjects', 'Add at least one subject name and a comma-separated topic list.');
      return;
    }

    const startTrim = planStartDate.trim();
    if (startTrim) {
      const ps = parseISODateOnly(startTrim);
      if (!ps) {
        Alert.alert('Plan start date', 'Use YYYY-MM-DD (example: 2026-04-11).');
        return;
      }
      const ex = parseISODateOnly(examDate.trim());
      if (ex && ps.getTime() > ex.getTime()) {
        Alert.alert('Dates', 'Plan start must be on or before your exam date.');
        return;
      }
    }

    const input: PlannerEngineInput = {
      examDateISO: examDate.trim(),
      dailyStudyHours: h,
      subjects: subs,
      ...(startTrim ? { planStartISO: startTrim } : {}),
    };

    let out: ReturnType<typeof revisionPlannerEngine.build>;
    try {
      out = revisionPlannerEngine.build(input);
    } catch (e) {
      Alert.alert('Plan error', e instanceof Error ? e.message : 'Could not build plan.');
      return;
    }
    if (!out.days.length) {
      Alert.alert('Plan', 'Could not build a plan. Check your exam date (use YYYY-MM-DD).');
      return;
    }
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch {
      /* Web / environments where LayoutAnimation is unsupported */
    }
    setPlanDays(out.days);
    setSummary(out.summary);
    setCompletedSlotIds({});
    setExpandedDay(out.days[0]?.id ?? null);
  }, [dailyHours, examDate, planStartDate, subjects]);

  const progress = useMemo(() => {
    const ids = planDays.flatMap((d) => d.slots.map((s) => s.id));
    const done = ids.filter((id) => completedSlotIds[id]).length;
    const pct = ids.length ? Math.round((done / ids.length) * 100) : 0;
    return { done, total: ids.length, pct };
  }, [planDays, completedSlotIds]);

  const daysLeft = useMemo(() => daysUntilExam(examDate), [examDate]);

  const weakChips = useMemo(() => {
    const out: { topic: string; subject: string }[] = [];
    subjects.forEach((s) => {
      revisionPlannerEngine.parseList(s.weakRaw ?? '').forEach((t) => {
        if (t) out.push({ topic: t, subject: s.name.trim() || 'Subject' });
      });
    });
    return out;
  }, [subjects]);

  const strongChips = useMemo(() => {
    const out: { topic: string; subject: string }[] = [];
    subjects.forEach((s) => {
      revisionPlannerEngine.parseList(s.strongRaw ?? '').forEach((t) => {
        if (t) out.push({ topic: t, subject: s.name.trim() || 'Subject' });
      });
    });
    return out;
  }, [subjects]);

  const toggleSlot = (id: string) => {
    setCompletedSlotIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updateSubject = (id: string, patch: Partial<SubjectRow>) => {
    setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addSubject = () => {
    setSubjects((prev) => [...prev, emptySubjectRow(`s-${Date.now()}`)]);
  };

  const removeSubject = (id: string) => {
    setSubjects((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  };

  const coveragePct = summary?.syllabusCoveragePct ?? 0;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.55 }}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          stickyHeaderIndices={[0]}
          contentContainerStyle={[styles.scroll, { paddingHorizontal: padX }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.stickyHeader}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <ArrowLeft size={22} color={colors.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.stickyTitle}>Revision Planner</Text>
              <Text style={styles.stickySub}>Exam-ready schedule · smart spacing</Text>
            </View>
          </View>

          {summary && planDays.length > 0 ? (
            <LinearGradient
              colors={['rgba(99,102,241,0.22)', 'rgba(49,46,129,0.45)', colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.summaryHero}
            >
              <View style={styles.summaryRow}>
                <View style={styles.summaryTile}>
                  <CalendarDays size={20} color={colors.primary} />
                  <Text style={styles.summaryValue}>{daysLeft == null ? '—' : daysLeft}</Text>
                  <Text style={styles.summaryLabel}>Days to exam</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryTile}>
                  <GraduationCap size={20} color={colors.gradientEnd} />
                  <Text style={styles.summaryValue}>{coveragePct}%</Text>
                  <Text style={styles.summaryLabel}>Syllabus in plan</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryTile}>
                  <BookOpen size={20} color={colors.accent} />
                  <Text style={styles.summaryValue}>{progress.pct}%</Text>
                  <Text style={styles.summaryLabel}>Slots done</Text>
                </View>
              </View>
              <View style={styles.summaryProgressTrack}>
                <LinearGradient
                  colors={[colors.primary, colors.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.summaryProgressFill, { width: `${progress.pct}%` }]}
                />
              </View>
              <Text style={styles.summaryHint}>
                {progress.done} of {progress.total} tasks checked · {summary.totalDays} days ·{' '}
                {Math.round(summary.totalMinutesPlanned / 60)}h planned
              </Text>
            </LinearGradient>
          ) : (
            <View style={styles.heroPlaceholder}>
              <Text style={styles.heroTitle}>Plan your revision</Text>
              <Text style={styles.heroBody}>
                Set your exam date and subjects below, then generate a balanced timetable with buffer days and mock
                blocks.
              </Text>
            </View>
          )}

          {(weakChips.length > 0 || strongChips.length > 0) && (
            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>Topic signals</Text>
              {weakChips.length > 0 ? (
                <View style={styles.chipBlock}>
                  <Text style={styles.chipBlockLabel}>Weak — prioritize</Text>
                  <View style={styles.chipRow}>
                    {weakChips.slice(0, 12).map((c, i) => (
                      <View key={`w-${i}`} style={[styles.badge, styles.badgeWeak]}>
                        <Text style={[styles.badgeTxt, { color: colors.danger }]} numberOfLines={1}>
                          {c.topic}
                        </Text>
                      </View>
                    ))}
                    {weakChips.length > 12 ? (
                      <Text style={styles.moreChip}>+{weakChips.length - 12}</Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
              {strongChips.length > 0 ? (
                <View style={[styles.chipBlock, weakChips.length > 0 && { marginTop: 14 }]}>
                  <Text style={styles.chipBlockLabel}>Strong — maintain</Text>
                  <View style={styles.chipRow}>
                    {strongChips.slice(0, 12).map((c, i) => (
                      <View key={`s-${i}`} style={[styles.badge, styles.badgeStrong]}>
                        <Text style={[styles.badgeTxt, { color: colors.success }]} numberOfLines={1}>
                          {c.topic}
                        </Text>
                      </View>
                    ))}
                    {strongChips.length > 12 ? (
                      <Text style={styles.moreChip}>+{strongChips.length - 12}</Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionEyebrow}>Exam & availability</Text>
            <Text style={styles.fieldLbl}>Plan start date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={planStartDate}
              onChangeText={setPlanStartDate}
              placeholder={todayISO()}
              placeholderTextColor={colors.textSubtle}
            />
            <Text style={styles.fieldHint}>First day of your timetable. Clear the field to use today.</Text>
            <Text style={styles.fieldLbl}>Exam date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={examDate}
              onChangeText={setExamDate}
              placeholder="2026-05-15"
              placeholderTextColor={colors.textSubtle}
            />
            <Text style={styles.fieldLbl}>Daily study hours</Text>
            <TextInput
              style={styles.input}
              value={dailyHours}
              onChangeText={setDailyHours}
              keyboardType="decimal-pad"
              placeholder="3.5"
              placeholderTextColor={colors.textSubtle}
            />
            <Pressable onPress={loadDummy} style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.85 }]}>
              <Sparkles size={16} color={colors.accent} />
              <Text style={styles.ghostBtnTxt}>Load sample data (FBISE-style)</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionHeading}>Subjects & syllabus</Text>
          {subjects.map((s) => (
            <View key={s.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionEyebrow}>Subject</Text>
                {subjects.length > 1 ? (
                  <Pressable onPress={() => removeSubject(s.id)} hitSlop={8}>
                    <Text style={styles.removeTxt}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
              <TextInput
                style={styles.input}
                value={s.name}
                onChangeText={(t) => updateSubject(s.id, { name: t })}
                placeholder="e.g. Physics"
                placeholderTextColor={colors.textSubtle}
              />
              <Text style={styles.fieldLbl}>Topics (comma-separated)</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={s.topicsRaw}
                onChangeText={(t) => updateSubject(s.id, { topicsRaw: t })}
                placeholder="Kinematics, Dynamics, …"
                placeholderTextColor={colors.textSubtle}
                multiline
              />
              <Text style={styles.fieldLbl}>Weak topics</Text>
              <TextInput
                style={styles.input}
                value={s.weakRaw}
                onChangeText={(t) => updateSubject(s.id, { weakRaw: t })}
                placeholder="Dynamics, …"
                placeholderTextColor={colors.textSubtle}
              />
              <Text style={styles.fieldLbl}>Strong topics</Text>
              <TextInput
                style={styles.input}
                value={s.strongRaw}
                onChangeText={(t) => updateSubject(s.id, { strongRaw: t })}
                placeholder="Measurements, …"
                placeholderTextColor={colors.textSubtle}
              />
            </View>
          ))}

          <Pressable onPress={addSubject} style={({ pressed }) => [styles.addSub, pressed && { opacity: 0.85 }]}>
            <Text style={styles.addSubTxt}>+ Add subject</Text>
          </Pressable>

          <Pressable
            onPress={generate}
            style={({ pressed }) => [styles.primaryWrap, pressed && { opacity: 0.94, transform: [{ scale: 0.99 }] }]}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <LinearGradient
              colors={[colors.primary, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryBtn}
            >
              <Calendar size={20} color="#fff" />
              <Text style={styles.primaryTxt}>Generate plan</Text>
            </LinearGradient>
          </Pressable>

          {summary && planDays.length > 0 ? (
            <>
              <Text style={[styles.sectionHeading, { marginTop: 8 }]}>Daily plan</Text>
              <Text style={styles.gridHint}>Tap a day to expand tasks. Mark items done as you go.</Text>
              <View style={[styles.dayGrid, { gap }]}>
                {planDays.map((day, index) => (
                  <Animated.View
                    key={day.id}
                    entering={FadeInDown.delay(Math.min(index * 40, 400)).duration(380)}
                    style={{ width: cardW }}
                  >
                    <DayCard
                      day={day}
                      expanded={expandedDay === day.id}
                      onToggle={() => {
                        try {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        } catch {
                          /* noop */
                        }
                        setExpandedDay((v) => (v === day.id ? null : day.id));
                      }}
                      completedSlotIds={completedSlotIds}
                      onToggleSlot={toggleSlot}
                    />
                  </Animated.View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <Text style={styles.emptyTxt}>
                Fill exam date, hours, and at least one subject with topics, then tap Generate plan. Or load sample
                data.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DayCard({
  day,
  expanded,
  onToggle,
  completedSlotIds,
  onToggleSlot,
}: {
  day: PlannerDay;
  expanded: boolean;
  onToggle: () => void;
  completedSlotIds: Record<string, boolean>;
  onToggleSlot: (id: string) => void;
}) {
  const dayMinutes = day.slots.reduce((a, s) => a + s.minutes, 0);
  const doneCount = day.slots.filter((s) => completedSlotIds[s.id]).length;
  const dayPct = day.slots.length ? Math.round((doneCount / day.slots.length) * 100) : 0;

  return (
    <View style={[styles.dayCard, day.isBufferPhase && styles.dayCardBuffer]}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.dayHeader, pressed && { opacity: 0.92 }]}
      >
        <View style={styles.dayDateCol}>
          <Text style={styles.dayWeek}>{day.weekday}</Text>
          <Text style={styles.dayISO}>{day.dateISO}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayFocus} numberOfLines={expanded ? 4 : 2}>
            {day.focusHeadline}
          </Text>
          <View style={styles.dayMetaRow}>
            <Clock size={13} color={colors.textSubtle} />
            <Text style={styles.dayMeta}>
              {dayMinutes} min · Day {day.dayOffset + 1}
            </Text>
            {day.isMockDay ? (
              <View style={[styles.pill, styles.pillMock]}>
                <Text style={[styles.pillTxt, { color: colors.warning }]}>Mock</Text>
              </View>
            ) : null}
            {day.isBufferPhase ? (
              <View style={[styles.pill, styles.pillBuffer]}>
                <Text style={[styles.pillTxt, { color: colors.success }]}>Buffer</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.dayProgressTrack}>
            <LinearGradient
              colors={[colors.primary, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.dayProgressFill, { width: `${dayPct}%` }]}
            />
          </View>
          <Text style={styles.dayProgressMeta}>
            {doneCount}/{day.slots.length} tasks · {dayPct}%
          </Text>
        </View>
        {expanded ? <ChevronUp size={20} color={colors.textMuted} /> : <ChevronDown size={20} color={colors.textMuted} />}
      </Pressable>
      {expanded ? (
        <View style={styles.slotsWrap}>
          {day.slots.map((slot) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              done={!!completedSlotIds[slot.id]}
              onToggle={() => onToggleSlot(slot.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SlotRow({ slot, done, onToggle }: { slot: PlannerSlot; done: boolean; onToggle: () => void }) {
  const meta = SLOT_META[slot.type];
  const Icon = meta.Icon;
  return (
    <Pressable
      style={({ pressed }) => [styles.slotRow, done && styles.slotRowDone, pressed && { backgroundColor: colors.surface2 }]}
      onPress={onToggle}
    >
      <View style={[styles.slotIconWrap, { backgroundColor: meta.bg }]}>
        <Icon size={18} color={meta.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.slotTop}>
          <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.typeBadgeTxt, { color: meta.fg }]}>{meta.label}</Text>
          </View>
          <View style={styles.slotMinRow}>
            <Clock size={12} color={colors.textSubtle} />
            <Text style={styles.slotMin}>{slot.minutes} min</Text>
          </View>
        </View>
        <Text style={styles.slotTitle}>{slot.title}</Text>
        <Text style={styles.slotDetail}>{slot.detail}</Text>
        <View style={styles.slotSubjectRow}>
          <BookOpen size={12} color={colors.textSubtle} />
          <Text style={styles.slotSubject}>{slot.subject}</Text>
        </View>
      </View>
      <View style={styles.checkWrap}>
        {done ? <CheckCircle2 size={22} color={colors.success} /> : <Circle size={22} color={colors.border} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  stickyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  stickyTitle: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  stickySub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  scroll: { paddingBottom: 48, paddingTop: 4 },
  summaryHero: {
    borderRadius: radii.lg,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.28)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  summaryRow: { flexDirection: 'row', alignItems: 'stretch' },
  summaryTile: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 4 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },
  summaryProgressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryProgressFill: { height: '100%', borderRadius: 999 },
  summaryHint: { fontSize: 11, color: colors.textSubtle, marginTop: 10, textAlign: 'center' },
  heroPlaceholder: {
    borderRadius: radii.lg,
    padding: 18,
    marginBottom: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 6 },
  heroBody: { fontSize: 14, color: colors.textMuted, lineHeight: 21 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
    marginTop: 4,
    letterSpacing: -0.2,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSubtle,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  gridHint: { fontSize: 13, color: colors.textMuted, marginBottom: 12, lineHeight: 19 },
  fieldLbl: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
  fieldHint: { fontSize: 11, color: colors.textSubtle, marginTop: -6, marginBottom: 12, lineHeight: 16 },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    marginBottom: 12,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  ghostBtnTxt: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  removeTxt: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  addSub: { alignSelf: 'center', marginBottom: 16 },
  addSubTxt: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  primaryWrap: { borderRadius: radii.lg, overflow: 'hidden', marginBottom: 22 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  primaryTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  emptyTxt: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  chipBlock: {},
  chipBlockLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    maxWidth: '100%',
  },
  badgeWeak: { backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.35)' },
  badgeStrong: { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.35)' },
  badgeTxt: { fontSize: 12, fontWeight: '700' },
  moreChip: { alignSelf: 'center', fontSize: 12, fontWeight: '700', color: colors.textSubtle },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  dayCardBuffer: {
    borderColor: 'rgba(52,211,153,0.35)',
    backgroundColor: 'rgba(52,211,153,0.06)',
  },
  dayHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  dayDateCol: { width: 88 },
  dayWeek: { fontSize: 11, fontWeight: '800', color: colors.textSubtle, textTransform: 'uppercase' },
  dayISO: { fontSize: 14, fontWeight: '800', color: colors.text },
  dayFocus: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20 },
  dayMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  dayMeta: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  dayProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayProgressFill: { height: '100%', borderRadius: 999 },
  dayProgressMeta: { fontSize: 11, color: colors.textSubtle, marginTop: 6, fontWeight: '600' },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  pillMock: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderColor: 'rgba(251,191,36,0.35)',
  },
  pillBuffer: {
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderColor: 'rgba(52,211,153,0.35)',
  },
  pillTxt: { fontSize: 10, fontWeight: '800' },
  slotsWrap: { borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: 4 },
  slotRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  slotRowDone: { opacity: 0.62 },
  slotIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  typeBadgeTxt: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  slotMinRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slotMin: { fontSize: 12, color: colors.accent, fontWeight: '800' },
  slotTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  slotDetail: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  slotSubjectRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  slotSubject: { fontSize: 12, color: colors.textSubtle, fontWeight: '600' },
  checkWrap: { justifyContent: 'center', paddingLeft: 4 },
});
