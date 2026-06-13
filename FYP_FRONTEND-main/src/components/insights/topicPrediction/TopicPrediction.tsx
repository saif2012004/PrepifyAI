import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown } from 'lucide-react-native';
import { colors, radii } from '../../../theme/colors';
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

const TIER: Record<ImportanceTier, { bg: string; border: string; fg: string }> = {
  high: { bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.4)', fg: colors.danger },
  medium: { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.35)', fg: colors.warning },
  low: { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.35)', fg: colors.success },
};

export default function TopicPrediction() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const mainContentY = useRef(0);
  const [classLevel, setClassLevel] = useState<TopicPredictionFilters['classLevel']>('all');
  const [subject, setSubject] = useState<TopicPredictionFilters['subject']>('all');
  const [yearFrom, setYearFrom] = useState(YEAR_MIN);
  const [yearTo, setYearTo] = useState(YEAR_MAX);

  const model = useMemo(
    () => buildTopicPredictionModel({ classLevel, subject, yearFrom, yearTo }),
    [classLevel, subject, yearFrom, yearTo]
  );

  const maxPct = Math.max(1, ...model.topics.map((t) => t.probabilityPct));

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

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Topic forecast</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.banner}>
            Open in browser (Expo web) for charts. Below: ranked topics from the same demo logic.
          </Text>

          <Pressable
            onPress={() =>
              scrollRef.current?.scrollTo({
                y: Math.max(0, mainContentY.current - 8),
                animated: true,
              })
            }
            style={styles.scrollDownBtn}
            accessibilityRole="button"
            accessibilityLabel="Scroll down to filters and rankings"
          >
            <Text style={styles.scrollDownTxt}>Scroll down for filters & rankings</Text>
            <ChevronDown size={20} color={colors.accent} />
          </Pressable>

          <View
            onLayout={(e) => {
              mainContentY.current = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.label}>Class</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <Chip label="All" on={() => setClassLevel('all')} onn={classLevel === 'all'} />
              {classOptions().map((c) => (
                <Chip key={c} label={`Class ${c}`} on={() => setClassLevel(c)} onn={classLevel === c} />
              ))}
            </ScrollView>

            <Text style={[styles.label, { marginTop: 14 }]}>Subject</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <Chip label="All" on={() => setSubject('all')} onn={subject === 'all'} />
              {subjectOptions().map((s) => (
                <Chip key={s} label={s} on={() => setSubject(s)} onn={subject === s} />
              ))}
            </ScrollView>

            <Text style={[styles.label, { marginTop: 14 }]}>Year range</Text>
            <View style={styles.row}>
              <YearChips value={yearFrom} onChange={setYearFrom} />
              <Text style={styles.toTxt}>to</Text>
              <YearChips value={yearTo} onChange={setYearTo} />
            </View>
          </View>

          <Text style={styles.section}>Most likely</Text>
          {model.mostLikely.map((t, i) => (
            <View key={t.id} style={styles.heroCard}>
              <Text style={styles.heroRank}>#{i + 1}</Text>
              <Text style={styles.heroLabel}>{t.label}</Text>
              <View style={styles.heroRow}>
                <TierPill tier={t.tier} />
                <Text style={styles.heroPct}>{t.probabilityPct}%</Text>
              </View>
            </View>
          ))}

          <Text style={[styles.section, { marginTop: 18 }]}>Practice from hot topics</Text>
          <Text style={styles.practiceHint}>Opens MCQs with topic and class pre-filled.</Text>
          {hotTopicsForPractice.length === 0 ? (
            <Text style={styles.practiceEmpty}>No topics for this filter.</Text>
          ) : (
            hotTopicsForPractice.map((t) => (
              <Pressable
                key={t.id}
                style={styles.practiceRow}
                onPress={() =>
                  router.push(
                    hotTopicMcqPracticeHref({
                      topic: t.topic,
                      subject: t.subject,
                      classLevel,
                    }) as never
                  )
                }
              >
                <Text style={styles.practiceTopic} numberOfLines={2}>
                  {t.topic}
                </Text>
                <Text style={styles.practiceMeta}>
                  {t.subject} · {t.frequency} hits → MCQs
                </Text>
              </Pressable>
            ))
          )}

          <Text style={[styles.section, { marginTop: 18 }]}>Weights (bar)</Text>
          {model.topics.slice(0, 10).map((t) => (
            <View key={t.id} style={styles.barRow}>
              <Text style={styles.barLabel} numberOfLines={2}>
                {t.label}
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(t.probabilityPct / maxPct) * 100}%`, backgroundColor: TIER[t.tier].fg }]} />
              </View>
              <Text style={styles.barPct}>{t.probabilityPct}%</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function TierPill({ tier }: { tier: ImportanceTier }) {
  const s = TIER[tier];
  const label = tier === 'high' ? 'High' : tier === 'medium' ? 'Medium' : 'Low';
  return (
    <View style={[styles.tierPill, { backgroundColor: s.bg, borderColor: s.border }]}>
      <Text style={[styles.tierPillTxt, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

function Chip({ label, on, onn }: { label: string; on: () => void; onn: boolean }) {
  return (
    <Pressable onPress={on} style={[styles.chip, onn && styles.chipOn]}>
      <Text style={[styles.chipTxt, onn && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

function YearChips({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  const years: number[] = [];
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) years.push(y);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {years.map((y) => (
        <Pressable
          key={y}
          onPress={() => onChange(y)}
          style={[styles.yearChip, value === y && styles.yearChipOn]}
        >
          <Text style={[styles.yearChipTxt, value === y && styles.yearChipTxtOn]}>{y}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  scrollView: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 48 },
  scrollDownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrollDownTxt: { fontSize: 13, fontWeight: '700', color: colors.accent },
  banner: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 14,
    lineHeight: 18,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 12, fontWeight: '700', color: colors.textSubtle, marginBottom: 8 },
  chipScroll: { marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  chipTxt: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  chipTxtOn: { color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  toTxt: { color: colors.textSubtle, fontSize: 12 },
  yearChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  yearChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  yearChipTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  yearChipTxtOn: { color: colors.text },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 10 },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroRank: { fontSize: 11, fontWeight: '800', color: colors.textSubtle },
  heroLabel: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 4 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  heroPct: { fontSize: 20, fontWeight: '900', color: colors.text },
  tierPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  tierPillTxt: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  barLabel: { width: 100, fontSize: 11, color: colors.textMuted },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  barPct: { width: 36, fontSize: 12, fontWeight: '800', color: colors.text, textAlign: 'right' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  classLine: { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
  practiceHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 10,
  },
  practiceEmpty: { fontSize: 13, color: colors.textSubtle, marginBottom: 8 },
  practiceRow: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  practiceTopic: { fontSize: 14, fontWeight: '700', color: colors.text },
  practiceMeta: { fontSize: 12, color: colors.textSubtle, marginTop: 4 },
});
