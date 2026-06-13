import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown } from 'lucide-react-native';
import { colors, radii } from '../../../theme/colors';
import {
  buildPastPaperInsightsModel,
  classOptions,
  subjectOptions,
  YEAR_MIN,
  YEAR_MAX,
  type InsightFilters,
} from './model';

/** Native: same analytics as web; use Expo web build for interactive Recharts. */
export default function PastPaperInsights() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const mainContentY = useRef(0);
  const [classLevel, setClassLevel] = useState<InsightFilters['classLevel']>('all');
  const [subject, setSubject] = useState<InsightFilters['subject']>('all');
  const [yearFrom, setYearFrom] = useState(YEAR_MIN);
  const [yearTo, setYearTo] = useState(YEAR_MAX);

  const model = useMemo(
    () => buildPastPaperInsightsModel({ classLevel, subject, yearFrom, yearTo }),
    [classLevel, subject, yearFrom, yearTo]
  );

  const maxFreq = Math.max(1, ...model.topicFrequency.map((t) => t.count));

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Past paper insights</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.banner}>
            For charts and full layout, open this app in the browser (Expo web). Below is a compact summary from the
            same demo data.
          </Text>

          <Text style={styles.label}>Subject</Text>
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

          <Text style={styles.meta}>Questions in view: {model.totalQuestions}</Text>

          {model.aiInsights.map((ins, i) => (
            <View key={i} style={styles.insightCard}>
              <Text style={styles.insightTitle}>{ins.title}</Text>
              <Text style={styles.insightBody}>{ins.detail}</Text>
            </View>
          ))}

          <Text style={styles.section}>Top topics (frequency)</Text>
          {model.topicFrequency.slice(0, 8).map((t) => (
            <View key={t.topic} style={styles.barRow}>
              <Text style={styles.barLabel} numberOfLines={1}>
                {t.topic}
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(t.count / maxFreq) * 100}%` }]} />
              </View>
              <Text style={styles.barCount}>{t.count}</Text>
            </View>
          ))}

          <Text style={[styles.section, { marginTop: 18 }]}>By class (count)</Text>
          <View style={styles.card}>
            {model.classWeightage.map((row) => (
              <Text key={row.label} style={styles.diffLine}>
                {row.label}: {row.count} ({row.pct}%)
              </Text>
            ))}
          </View>

          <Text style={[styles.section, { marginTop: 18 }]}>Difficulty mix</Text>
          <View style={styles.card}>
            {model.difficultySplit.map((d) => (
              <Text key={d.name} style={styles.diffLine}>
                {d.name}: {d.value}
              </Text>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
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
          onPress={() => onChange(y === value ? value : y)}
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
    marginBottom: 16,
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
  meta: { fontSize: 13, color: colors.accent, fontWeight: '700', marginTop: 12, marginBottom: 12 },
  insightCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insightTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  insightBody: { fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  barLabel: { width: 100, fontSize: 12, color: colors.textMuted },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  barCount: { width: 28, fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'right' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  diffLine: { fontSize: 14, color: colors.textMuted, marginBottom: 6 },
});
