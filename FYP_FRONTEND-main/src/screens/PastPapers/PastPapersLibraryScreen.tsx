import React, { useCallback, useEffect, useState } from 'react';
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
import { ArrowLeft, ScrollText } from 'lucide-react-native';
import { subjectService, Subject } from '../../services/subjectService';
import { colors, radii } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';

function isPunjabBoard(board: string): boolean {
  return (board || '').toLowerCase().includes('punjab');
}

export default function PastPapersLibraryScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await subjectService.getSubjects();
      setSubjects(list.filter((s) => !isPunjabBoard(s.board)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load subjects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openSubject = (s: Subject) => {
    if (!isAuthenticated) {
      Alert.alert('Sign in', 'Log in to view past papers for each subject.');
      return;
    }
    router.push({
      pathname: '/past-papers/subject/[subjectId]',
      params: {
        subjectId: String(s.subject_id),
        subjectName: s.subject_name,
        classLevel: s.class_level,
        board: s.board,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Past papers</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.info}>
          <ScrollText size={22} color={colors.accent} />
          <Text style={styles.infoText}>
            Pick a subject to see papers your admin has published. Each entry opens the full past paper as a PDF; an
            extra practice list appears only when questions could be extracted from the scan.
          </Text>
        </View>

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {error && !loading && <Text style={styles.err}>{error}</Text>}

        {!loading &&
          subjects.map((s) => (
            <TouchableOpacity key={s.subject_id} style={styles.row} onPress={() => openSubject(s)} activeOpacity={0.85}>
              <View style={styles.rowText}>
                <Text style={styles.subjName}>{s.subject_name}</Text>
                <Text style={styles.meta}>
                  Class {s.class_level} · {s.board}
                </Text>
              </View>
              <Text style={styles.chev}>→</Text>
            </TouchableOpacity>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '800' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  info: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    marginBottom: 16,
  },
  infoText: { flex: 1, color: colors.textSubtle, fontSize: 14, lineHeight: 20 },
  centered: { paddingVertical: 32, alignItems: 'center' },
  err: { color: colors.danger, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: { flex: 1 },
  subjName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textSubtle, fontSize: 13, marginTop: 4 },
  chev: { color: colors.textSubtle, fontSize: 18, fontWeight: '600' },
});
