import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  CheckSquare,
  FileText,
  ScrollText,
  FileStack,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react-native';
import { colors, radii } from '../../theme/colors';
import { FadeIn, PressableScale } from '../../components/animated';

const questionTypes = [
  {
    id: 'setup',
    name: 'Practice Setup',
    shortName: 'Setup',
    icon: SlidersHorizontal,
    color: colors.accent,
    bgColor: 'rgba(34, 211, 238, 0.18)',
    description: 'Choose MCQ, short, and long counts in one screen',
    route: '/prepare-with-ai/practice-setup',
  },
  {
    id: 'mcqs',
    name: 'Multiple Choice Questions',
    shortName: 'MCQs',
    icon: CheckSquare,
    color: '#818CF8',
    bgColor: 'rgba(129, 140, 248, 0.2)',
    description: 'Practice with multiple choice questions',
    route: '/prepare-with-ai/generate-mcqs',
  },
  {
    id: 'short',
    name: 'Short Questions',
    shortName: 'Short Q',
    icon: FileText,
    color: colors.success,
    bgColor: 'rgba(52, 211, 153, 0.18)',
    description: 'Brief answer questions for quick practice',
    route: '/prepare-with-ai/generate-short',
  },
  {
    id: 'long',
    name: 'Long Questions',
    shortName: 'Long Q',
    icon: ScrollText,
    color: '#A78BFA',
    bgColor: 'rgba(167, 139, 250, 0.18)',
    description: 'Detailed questions for in-depth understanding',
    route: '/prepare-with-ai/generate-long',
  },
  {
    id: 'paper',
    name: 'Complete Paper',
    shortName: 'Full Paper',
    icon: FileStack,
    color: colors.warning,
    bgColor: 'rgba(251, 191, 36, 0.18)',
    description: 'Generate a full practice exam paper',
    route: '/prepare-with-ai/generate-paper',
  },
];

export default function QuestionTypeSelectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { subjectName, subjectId, board, classLevel } = params;

  const handleTypeSelect = (route: string) => {
    router.push({
      pathname: route as never,
      params: {
        subjectName,
        subjectId,
        board: board ?? 'FBISE',
        classLevel: classLevel ?? '10',
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
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerSubtitle}>Prepare with AI</Text>
            <Text style={styles.headerTitle}>{subjectName}</Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Info Banner */}
          <View style={styles.infoBanner}>
            <Text style={styles.bannerText}>
              Choose the type of questions you want to practice
            </Text>
          </View>

          {/* Question Types Grid */}
          <View style={styles.typesContainer}>
            {questionTypes.map((type, index) => (
              <FadeIn key={type.id} delay={index * 70} direction="up" distance={18}>
                <PressableScale
                  onPress={() => handleTypeSelect(type.route)}
                  style={[
                    styles.typeCard,
                    { borderLeftColor: type.color, borderLeftWidth: 4 },
                  ]}
                >
                  <View
                    style={[
                      styles.typeIconContainer,
                      { backgroundColor: type.bgColor },
                    ]}
                  >
                    <type.icon size={28} color={type.color} />
                  </View>
                  <View style={styles.typeContent}>
                    <Text style={styles.typeName}>{type.name}</Text>
                    <Text style={styles.typeDescription}>{type.description}</Text>
                  </View>
                  <ChevronRight size={22} color={colors.textSubtle} />
                </PressableScale>
              </FadeIn>
            ))}
          </View>

          {/* Features Section */}
          <View style={styles.featuresCard}>
            <Text style={styles.featuresTitle}>What you can do</Text>
            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>
                  Select specific topics to focus on
                </Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>
                  Choose difficulty level (Easy, Medium, Hard)
                </Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>
                  Get instant AI-generated questions
                </Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>
                  View detailed explanations for answers
                </Text>
              </View>
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
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 2,
    fontWeight: '600',
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
  infoBanner: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 20,
  },
  typesContainer: {
    gap: 12,
    marginBottom: 20,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeIconContainer: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  typeContent: {
    flex: 1,
  },
  typeName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  typeDescription: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  featuresCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  featuresTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 12,
  },
  featuresList: {
    gap: 10,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginRight: 10,
  },
  featureText: {
    fontSize: 13,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 19,
  },
});

