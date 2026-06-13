import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Sparkles,
  CalendarDays,
  BookOpen,
  Target,
  RefreshCw,
  Lightbulb,
  CheckCircle2,
} from 'lucide-react-native';
import { colors, radii } from '../../theme/colors';

const FEATURES: {
  title: string;
  body: string;
  Icon: typeof CalendarDays;
  color: string;
  iconBg: string;
}[] = [
  {
    title: 'Exam-aware schedule',
    body: 'Set plan start, exam date, and daily hours — the timetable anchors from day one through the exam.',
    Icon: CalendarDays,
    color: colors.accent,
    iconBg: 'rgba(34,211,238,0.14)',
  },
  {
    title: 'Weak vs strong topics',
    body: 'Tag weaker chapters so they get more airtime; strong topics stay in the mix without hogging the plan.',
    Icon: Target,
    color: colors.danger,
    iconBg: 'rgba(248,113,113,0.14)',
  },
  {
    title: 'Mocks & buffer days',
    body: 'Mock-style blocks and lighter pre-exam days so you revise hard without burning out.',
    Icon: RefreshCw,
    color: colors.success,
    iconBg: 'rgba(52,211,153,0.14)',
  },
  {
    title: 'Multi-subject balance',
    body: 'Add every subject in one place and get a single timetable instead of juggling separate lists.',
    Icon: BookOpen,
    color: colors.primary,
    iconBg: colors.primaryMuted,
  },
];

const STEPS = [
  'Add subjects, topics, and optional weak/strong tags.',
  'Set plan start, exam date, and how many hours you can study per day.',
  'Generate, then tick off slots as you complete them.',
];

export default function RevisionPlanScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.5 }}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Revision plan</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient
            colors={['rgba(99,102,241,0.35)', 'rgba(49,46,129,0.5)', colors.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroBadge}>
              <Sparkles size={22} color={colors.accent} />
            </View>
            <Text style={styles.heroKicker}>Smart scheduling</Text>
            <Text style={styles.heroTitle}>Plan your revision like a pro</Text>
            <Text style={styles.heroSub}>
              One guided flow for a full timetable — revision blocks, practice, spaced review, and rest days.
            </Text>
          </LinearGradient>

          <Text style={styles.sectionLabel}>What you get</Text>
          <View style={styles.card}>
            {FEATURES.map((f, i) => {
              const Icon = f.Icon;
              return (
                <View
                  key={f.title}
                  style={[styles.featureRow, i < FEATURES.length - 1 && styles.featureRowBorder]}
                >
                  <View style={[styles.featureIcon, { backgroundColor: f.iconBg }]}>
                    <Icon size={20} color={f.color} />
                  </View>
                  <View style={styles.featureText}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureBody}>{f.body}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>How it works</Text>
          <View style={styles.card}>
            {STEPS.map((step, index) => (
              <View key={step} style={[styles.stepRow, index < STEPS.length - 1 && styles.stepRowBorder]}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumTxt}>{index + 1}</Text>
                </View>
                <Text style={styles.stepTxt}>{step}</Text>
              </View>
            ))}
          </View>

          <View style={styles.tipCard}>
            <View style={styles.tipIconWrap}>
              <Lightbulb size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tipTitle}>Quick tip</Text>
              <Text style={styles.tipBody}>
                Start with realistic daily hours — you can always regenerate the plan after your first week feels too
                light or too heavy.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.btn}
            onPress={() => router.push('/adaptive/revision-planner' as never)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[colors.primary, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btnGradient}
            >
              <Sparkles size={20} color="#fff" />
              <Text style={styles.btnTxt}>Open AI revision planner</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.trustRow}>
            <CheckCircle2 size={16} color={colors.textSubtle} />
            <Text style={styles.trustTxt}>Sample data available · Works offline once loaded</Text>
          </View>
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
  scroll: { padding: 20, paddingBottom: 48 },
  hero: {
    borderRadius: radii.lg,
    padding: 20,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.45)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    lineHeight: 30,
    marginBottom: 10,
  },
  heroSub: { fontSize: 14, color: colors.textMuted, lineHeight: 21 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  featureRow: { flexDirection: 'row', padding: 14, gap: 14, alignItems: 'flex-start' },
  featureRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  featureBody: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  stepRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumTxt: { fontSize: 13, fontWeight: '800', color: colors.text },
  stepTxt: { flex: 1, fontSize: 14, color: colors.textMuted, lineHeight: 20, paddingTop: 2 },
  tipCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: radii.lg,
    marginBottom: 22,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
  },
  tipIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(251,191,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: { fontSize: 13, fontWeight: '800', color: colors.warning, marginBottom: 6 },
  tipBody: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  btn: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  btnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  trustTxt: { fontSize: 12, color: colors.textSubtle, flex: 1, textAlign: 'center', lineHeight: 17 },
});
