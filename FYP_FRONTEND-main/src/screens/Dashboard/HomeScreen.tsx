import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import {
  BookOpen,
  BarChart3,
  Sparkles,
  LogOut,
  ChevronRight,
  Brain,
  Target,
  CalendarDays,
  LineChart,
  TrendingUp,
  Library,
  ScrollText,
  MessageCircle,
  GraduationCap,
} from 'lucide-react-native';
import { colors, radii } from '../../theme/colors';
import { performanceService } from '../../services/performanceService';
import { FadeIn, PressableScale, AnimatedCounter } from '../../components/animated';

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [shouldNavigateToLogin, setShouldNavigateToLogin] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const s = await performanceService.getSummary();
      setAccuracy(s.accuracy_percentage);
      setAttempts(s.total_attempts);
    } catch {
      setAccuracy(null);
      setAttempts(null);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (shouldNavigateToLogin && !isAuthenticated) {
      try {
        router.replace('/auth/login' as never);
      } catch {
        router.push('/auth/login' as never);
      }
      setShouldNavigateToLogin(false);
    }
  }, [isAuthenticated, shouldNavigateToLogin, router]);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          logout();
          setShouldNavigateToLogin(true);
        },
      },
    ]);
  };

  const getFirstName = (fullName: string | undefined) => {
    if (!fullName) return 'Student';
    return fullName.split(' ')[0];
  };

  const menuItems = [
    {
      id: '1',
      title: 'Prepare with AI',
      description: 'Board-style MCQs, short & long — powered by your syllabus',
      icon: Brain,
      route: '/prepare-with-ai',
    },
    {
      id: '1e',
      title: 'MDCAT / ECAT MCQ lab',
      description: 'Entry-test MCQs with study & timed quiz modes (richer layout on web)',
      icon: GraduationCap,
      route: '/entry-test/mcq-generator',
    },
    {
      id: '1s',
      title: 'MDCAT / ECAT syllabus',
      description: 'Class 11–12 PTB + FBISE merged topics — filter, search, high-yield tags',
      icon: BookOpen,
      route: '/entry-test/syllabus',
    },
    {
      id: '2',
      title: 'Textbooks (PDF)',
      description: 'Open full books your admin added for each subject',
      icon: Library,
      route: '/books',
    },
    {
      id: '8',
      title: 'Past papers',
      description: 'Past papers your admin has published — open full PDFs by subject',
      icon: ScrollText,
      route: '/past-papers',
    },
    {
      id: '9',
      title: 'Study chatbot',
      description: 'Ask questions and get student-friendly help for your subjects',
      icon: MessageCircle,
      route: '/chatbot',
    },
    {
      id: '7',
      title: 'Performance',
      description: 'Accuracy, topics, and trends from your attempts',
      icon: BarChart3,
      route: '/performance',
    },
    {
      id: '3',
      title: 'Smart practice',
      description: 'Adaptive next question based on how you are doing',
      icon: Target,
      route: '/adaptive/next',
    },
    {
      id: '4',
      title: 'Revision plan',
      description: 'Weak topics and a day-by-day focus outline',
      icon: CalendarDays,
      route: '/adaptive/revision',
    },
    {
      id: '4b',
      title: 'AI revision planner',
      description: 'Exam date, subjects, weak areas, and a full timetable with mocks & spaced review',
      icon: Sparkles,
      route: '/adaptive/revision-planner',
    },
    {
      id: '5',
      title: 'Past paper insights',
      description: 'Topic frequency, trends, difficulty mix, and AI-style highlights from demo papers',
      icon: LineChart,
      route: '/insights/past-paper-insights',
    },
    {
      id: '6',
      title: 'Topic forecast',
      description: 'Past-paper frequency and trends → predicted topic importance with charts (demo data)',
      icon: TrendingUp,
      route: '/insights/topic-prediction',
    },
  ];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, '#0f172a']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.45 }}
      />
      <SafeAreaView style={styles.safe}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.topRow}>
            <View style={styles.userBlock}>
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.avatar} />
              ) : (
                <LinearGradient
                  colors={[colors.primary, colors.gradientEnd]}
                  style={styles.avatarPlaceholder}
                >
                  <Text style={styles.avatarLetter}>
                    {user?.name?.charAt(0).toUpperCase() || 'P'}
                  </Text>
                </LinearGradient>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.greeting}>Welcome back</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {getFirstName(user?.name)}
                </Text>
                {user?.provider === 'google' && (
                  <Text style={styles.badge}>Google</Text>
                )}
              </View>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
              <LogOut size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          <FadeIn delay={80} direction="up">
            <LinearGradient
              colors={['rgba(99,102,241,0.35)', 'rgba(14,165,233,0.2)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroIconWrap}>
                <Sparkles color={colors.accent} size={26} />
              </View>
              <Text style={styles.heroTitle}>PrepifyAI</Text>
              <Text style={styles.heroSubtitle}>
                Exam-ready practice with AI — aligned to your board & class.
              </Text>
              <View style={styles.statRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Accuracy</Text>
                  {accuracy != null ? (
                    <AnimatedCounter value={accuracy} suffix="%" style={styles.statValue} />
                  ) : (
                    <Text style={styles.statValue}>—</Text>
                  )}
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Attempts</Text>
                  {attempts != null ? (
                    <AnimatedCounter value={attempts} style={styles.statValue} />
                  ) : (
                    <Text style={styles.statValue}>—</Text>
                  )}
                </View>
              </View>
            </LinearGradient>
          </FadeIn>

          <FadeIn delay={140}>
            <Text style={styles.sectionLabel}>Start learning</Text>
          </FadeIn>
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <FadeIn key={item.id} delay={180 + index * 60} direction="up" distance={20}>
                <PressableScale
                  onPress={() => router.push(item.route as never)}
                  style={styles.card}
                >
                  <View style={styles.cardIcon}>
                    <Icon size={24} color={colors.accent} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardDesc}>{item.description}</Text>
                  </View>
                  <ChevronRight color={colors.textSubtle} size={22} />
                </PressableScale>
              </FadeIn>
            );
          })}

          <FadeIn delay={240}>
            <View style={styles.tipCard}>
              <BookOpen size={20} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.tipTitle}>Tip</Text>
                <Text style={styles.tipBody}>
                  Pick a subject, choose a topic, and generate questions — your progress syncs when
                  you submit answers on the backend.
                </Text>
              </View>
            </View>
          </FadeIn>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { paddingBottom: 32 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  userBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 14 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 22, fontWeight: '800' },
  greeting: { color: colors.textMuted, fontSize: 14 },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  badge: { color: colors.accent, fontSize: 12, marginTop: 4, fontWeight: '600' },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(248,113,113,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
  },
  hero: {
    marginHorizontal: 20,
    borderRadius: radii.xl,
    padding: 22,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  heroSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: colors.border },
  statLabel: { color: colors.textSubtle, fontSize: 12, marginBottom: 4 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginLeft: 24,
    marginBottom: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 18,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  cardDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  tipCard: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 8,
    padding: 16,
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.2)',
  },
  tipTitle: { color: colors.accent, fontWeight: '700', marginBottom: 4, fontSize: 14 },
  tipBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
