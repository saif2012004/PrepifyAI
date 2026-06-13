import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react-native';
import { apiClient } from '../../services/api';
import { subjectService, Subject } from '../../services/subjectService';

type PendingRow = {
  question_id: number;
  subject_id: number;
  question_type: string;
  difficulty_level: string;
  question_text: string;
  is_approved: string | null;
};

export default function ValidateContentScreen() {
  const router = useRouter();
  const [questions, setQuestions] = useState<PendingRow[]>([]);
  const [subjects, setSubjects] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sessionApproved, setSessionApproved] = useState(0);
  const [sessionRejected, setSessionRejected] = useState(0);

  const loadSubjectsMap = useCallback(async () => {
    try {
      const list: Subject[] = await subjectService.getSubjects(undefined, true);
      const map: Record<number, string> = {};
      list.forEach((s) => {
        map[s.subject_id] = s.subject_name;
      });
      setSubjects(map);
    } catch {
      setSubjects({});
    }
  }, []);

  const loadPending = useCallback(async () => {
    try {
      const rows = (await apiClient.get('/admin/questions/pending', true)) as PendingRow[];
      setQuestions(Array.isArray(rows) ? rows : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load';
      if (/401|403|unauthor|forbidden/i.test(msg)) {
        Alert.alert('Admin only', 'Sign in from the admin login screen.');
      } else {
        Alert.alert('Load failed', msg);
      }
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadSubjectsMap(), loadPending()]);
    setRefreshing(false);
  }, [loadPending, loadSubjectsMap]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void Promise.all([loadSubjectsMap(), loadPending()]);
    }, [loadPending, loadSubjectsMap])
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/admin/dashboard');
    }
  };

  const approve = async (questionId: number) => {
    setActingId(questionId);
    try {
      await apiClient.patch(`/admin/questions/${questionId}/approve`, {}, true);
      setQuestions((prev) => prev.filter((q) => q.question_id !== questionId));
      setSelectedId(null);
      setSessionApproved((n) => n + 1);
      Alert.alert('Approved', 'Question is now visible to students.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setActingId(null);
    }
  };

  const reject = async (questionId: number) => {
    setActingId(questionId);
    try {
      await apiClient.patch(`/admin/questions/${questionId}/reject`, { reason: '' }, true);
      setQuestions((prev) => prev.filter((q) => q.question_id !== questionId));
      setSelectedId(null);
      setSessionRejected((n) => n + 1);
      Alert.alert('Rejected', 'Question marked as rejected.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setActingId(null);
    }
  };

  const diffNorm = (d: string) => {
    const x = (d || 'Medium').toLowerCase();
    if (x === 'easy') return 'Easy';
    if (x === 'hard') return 'Hard';
    return 'Medium';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Validate AI content</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.stats}>
          <View style={styles.statCard}>
            <Clock size={20} color="#F59E0B" />
            <Text style={styles.statValue}>{questions.length}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statCard}>
            <CheckCircle size={20} color="#10B981" />
            <Text style={styles.statValue}>{sessionApproved}</Text>
            <Text style={styles.statLabel}>Approved (session)</Text>
          </View>
          <View style={styles.statCard}>
            <XCircle size={20} color="#EF4444" />
            <Text style={styles.statValue}>{sessionRejected}</Text>
            <Text style={styles.statLabel}>Rejected (session)</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Loading pending questions…</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          >
            {questions.length === 0 ? (
              <View style={styles.emptyState}>
                <CheckCircle size={64} color="#D1D5DB" />
                <Text style={styles.emptyText}>No pending questions to review</Text>
              </View>
            ) : (
              questions.map((q) => {
                const diff = diffNorm(q.difficulty_level);
                const subjectName = subjects[q.subject_id] ?? 'Subject not in catalog';
                const open = selectedId === q.question_id;
                const busy = actingId === q.question_id;
                return (
                  <TouchableOpacity
                    key={q.question_id}
                    style={[styles.questionCard, open && styles.questionCardSelected]}
                    onPress={() => setSelectedId(open ? null : q.question_id)}
                    activeOpacity={0.9}
                  >
                    <View style={styles.questionHeader}>
                      <View style={styles.questionMeta}>
                        <Text style={styles.subject}>{subjectName}</Text>
                        <Text style={styles.topic}> · {q.question_type}</Text>
                      </View>
                      <View
                        style={[
                          styles.difficultyBadge,
                          {
                            backgroundColor:
                              diff === 'Easy'
                                ? '#D1FAE5'
                                : diff === 'Medium'
                                  ? '#FEF3C7'
                                  : '#FEE2E2',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.difficultyText,
                            {
                              color:
                                diff === 'Easy'
                                  ? '#065F46'
                                  : diff === 'Medium'
                                    ? '#92400E'
                                    : '#991B1B',
                            },
                          ]}
                        >
                          {diff}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.questionText}>{q.question_text}</Text>

                    <Text style={styles.hint}>
                      Review the wording and difficulty. Approve to release to students.
                    </Text>

                    {open && (
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.rejectButton]}
                          onPress={() => reject(q.question_id)}
                          disabled={busy}
                        >
                          {busy ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <>
                              <XCircle size={20} color="#FFFFFF" />
                              <Text style={styles.actionButtonText}>Reject</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.approveButton]}
                          onPress={() => approve(q.question_id)}
                          disabled={busy}
                        >
                          {busy ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <>
                              <CheckCircle size={20} color="#FFFFFF" />
                              <Text style={styles.actionButtonText}>Approve</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  placeholder: {
    width: 40,
  },
  stats: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 15,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 16,
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  questionCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  questionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap',
  },
  subject: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  topic: {
    fontSize: 12,
    color: '#6B7280',
  },
  difficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  difficultyText: {
    fontSize: 11,
    fontWeight: '600',
  },
  questionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    lineHeight: 22,
  },
  hint: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 6,
    minHeight: 48,
  },
  approveButton: {
    backgroundColor: '#10B981',
  },
  rejectButton: {
    backgroundColor: '#EF4444',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
