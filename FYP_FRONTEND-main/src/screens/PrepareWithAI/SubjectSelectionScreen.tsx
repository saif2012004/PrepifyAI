import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  BookOpen,
  Atom,
  FlaskConical,
  Microscope,
  Monitor,
  AlertCircle,
  Sigma,
} from 'lucide-react-native';
import { subjectService } from '../../services/subjectService';
import { colors, radii } from '../../theme/colors';
import { FadeIn, PressableScale } from '../../components/animated';

// Icon and accent configuration (dark theme: bright icon on translucent fill)
const subjectConfig: {
  [key: string]: {
    icon: any;
    color: string;
    bgColor: string;
  };
} = {
  Computer: {
    icon: Monitor,
    color: colors.accent,
    bgColor: 'rgba(34, 211, 238, 0.18)',
  },
  'Computer Science': {
    icon: Monitor,
    color: colors.accent,
    bgColor: 'rgba(34, 211, 238, 0.18)',
  },
  Biology: {
    icon: Microscope,
    color: colors.success,
    bgColor: 'rgba(52, 211, 153, 0.18)',
  },
  Chemistry: {
    icon: FlaskConical,
    color: '#A78BFA',
    bgColor: 'rgba(167, 139, 250, 0.18)',
  },
  Physics: {
    icon: Atom,
    color: colors.warning,
    bgColor: 'rgba(251, 191, 36, 0.18)',
  },
  Mathematics: {
    icon: Sigma,
    color: '#F472B6',
    bgColor: 'rgba(244, 114, 182, 0.18)',
  },
  Math: {
    icon: Sigma,
    color: '#F472B6',
    bgColor: 'rgba(244, 114, 182, 0.18)',
  },
};

/** When subject_name is not an exact map key (e.g. "MDCAT Biology", "ECAT English"). */
const DEFAULT_SUBJECT_STYLE = {
  icon: BookOpen,
  color: colors.textMuted,
  bgColor: colors.primaryMuted,
};

/** Longer phrases first so "Computer Science" wins over "Computer". */
const SUBJECT_KEYWORD_TO_CONFIG_KEY = [
  'Computer Science',
  'Mathematics',
  'Biology',
  'Chemistry',
  'Physics',
  'Computer',
  'Math',
] as const;

function resolveSubjectStyle(subjectName: string) {
  const trimmed = subjectName.trim();
  if (subjectConfig[trimmed]) {
    return subjectConfig[trimmed];
  }
  const lower = trimmed.toLowerCase();
  for (const key of SUBJECT_KEYWORD_TO_CONFIG_KEY) {
    if (lower.includes(key.toLowerCase())) {
      return subjectConfig[key];
    }
  }
  return DEFAULT_SUBJECT_STYLE;
}

// UI-formatted subject
interface UISubject {
  id: number;
  name: string;
  icon: any;
  color: string;
  bgColor: string;
  board: string;
  classLevel: string;
}

export default function SubjectSelectionScreen() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<UISubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubjects();
  }, []);

  /**
   * Fetch subjects from backend
   */
  const fetchSubjects = async () => {
    try {
      setLoading(true);
      setError(null);

      // No filters: API returns every subject row (all class_level + board values).
      const backendSubjects = await subjectService.getSubjects();

      const uiSubjects: UISubject[] = backendSubjects
        .map((subject) => {
          const config = resolveSubjectStyle(subject.subject_name);
          return {
            id: subject.subject_id,
            name: subject.subject_name,
            icon: config.icon,
            color: config.color,
            bgColor: config.bgColor,
            board: subject.board,
            classLevel: subject.class_level,
          };
        })
        .sort((a, b) => {
          const byBoard = a.board.localeCompare(b.board);
          if (byBoard !== 0) return byBoard;
          const ca = parseInt(String(a.classLevel), 10);
          const cb = parseInt(String(b.classLevel), 10);
          let byClass = 0;
          if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) {
            byClass = ca - cb;
          } else {
            byClass = String(a.classLevel).localeCompare(String(b.classLevel));
          }
          if (byClass !== 0) return byClass;
          return a.name.localeCompare(b.name);
        });

      setSubjects(uiSubjects);
    } catch (error: any) {
      console.error('Error fetching subjects:', error);
      setError(error.message || 'Failed to load subjects');
      
      // Show error alert
      Alert.alert(
        'Error Loading Subjects',
        'Could not load subjects. Please check your connection and try again.',
        [
          {
            text: 'Retry',
            onPress: fetchSubjects,
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubjectSelect = (subject: UISubject) => {
    // Navigate to question type selection with subject info
    router.push({
      pathname: '/prepare-with-ai/question-type',
      params: {
        subjectId: String(subject.id),
        subjectName: subject.name,
        board: subject.board,
        classLevel: subject.classLevel,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <ArrowLeft size={22} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Prepare with AI</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconContainer}>
              <BookOpen size={24} color={colors.accent} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Select Your Subject</Text>
              <Text style={styles.infoText}>
                Board exams (FBISE, etc.), MDCAT, and ECAT subjects from your
                catalog — tap a card to practice with that book’s content.
              </Text>
            </View>
          </View>

          {/* Loading State */}
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.loadingText}>Loading subjects...</Text>
            </View>
          )}

          {/* Error State */}
          {error && !loading && (
            <View style={styles.errorContainer}>
              <AlertCircle size={48} color={colors.danger} />
              <Text style={styles.errorTitle}>Failed to Load Subjects</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                onPress={fetchSubjects}
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Subjects Grid */}
          {!loading && !error && subjects.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>All subjects (every class)</Text>
              <View style={styles.subjectsGrid}>
                {subjects.map((subject, index) => (
                  <FadeIn
                    key={`${subject.id}-${subject.board}-${subject.classLevel}`}
                    delay={index * 55}
                    direction="up"
                    distance={18}
                    style={styles.subjectCardWrap}
                  >
                    <PressableScale
                      onPress={() => handleSubjectSelect(subject)}
                      style={styles.subjectCard}
                    >
                      <View
                        style={[
                          styles.subjectIconContainer,
                          { backgroundColor: subject.bgColor },
                        ]}
                      >
                        <subject.icon size={32} color={subject.color} />
                      </View>
                      <Text style={styles.subjectName}>{subject.name}</Text>
                      <Text style={styles.subjectDescription}>
                        {subject.board} • Class {subject.classLevel}
                      </Text>
                    </PressableScale>
                  </FadeIn>
                ))}
              </View>
            </View>
          )}

          {/* No Subjects State */}
          {!loading && !error && subjects.length === 0 && (
            <View style={styles.emptyContainer}>
              <BookOpen size={64} color={colors.textSubtle} />
              <Text style={styles.emptyTitle}>No Subjects Available</Text>
              <Text style={styles.emptyText}>
                No subjects in the catalog yet. Please contact support.
              </Text>
            </View>
          )}

          {/* Tips Section */}
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>Quick tips</Text>
            <View style={styles.tipsList}>
              <Text style={styles.tipItem}>
                • Choose topics you need to practice
              </Text>
              <Text style={styles.tipItem}>
                • Start with easier difficulty levels
              </Text>
              <Text style={styles.tipItem}>
                • Review explanations for wrong answers
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 18,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoIconContainer: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 14,
  },
  subjectsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  subjectCardWrap: {
    width: '47%',
  },
  subjectCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  subjectCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
    borderColor: colors.primary,
  },
  subjectIconContainer: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  subjectName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  subjectDescription: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  tipsCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
  },
  tipsList: {
    gap: 6,
  },
  tipItem: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: colors.textMuted,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

