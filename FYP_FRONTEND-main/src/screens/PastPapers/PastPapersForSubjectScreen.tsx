import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, FileStack } from 'lucide-react-native';
import { listPastPapersForSubject, type PastPaperSummary } from '../../services/pastPaperService';
import { subjectService } from '../../services/subjectService';
import { colors, radii } from '../../theme/colors';
import { FadeIn, PressableScale } from '../../components/animated';

function isPunjabBoard(board: string): boolean {
  return (board || '').toLowerCase().includes('punjab');
}

function sortPapers(a: PastPaperSummary, b: PastPaperSummary): number {
  if (b.year !== a.year) return b.year - a.year;
  return a.board.localeCompare(b.board);
}

export default function PastPapersForSubjectScreen() {
  const router = useRouter();
  const { subjectId, subjectName, classLevel } = useLocalSearchParams<{
    subjectId: string;
    subjectName?: string;
    classLevel?: string;
  }>();
  const sid = Number.parseInt(subjectId ?? '', 10);
  const [papers, setPapers] = useState<PastPaperSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [headerSubjectName, setHeaderSubjectName] = useState<string | null>(null);

  const sorted = useMemo(() => [...papers].sort(sortPapers), [papers]);

  const load = useCallback(async () => {
    if (!Number.isFinite(sid)) {
      setError('Invalid subject');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listPastPapersForSubject(sid);
      setPapers(list.filter((p) => !isPunjabBoard(p.board)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load past papers');
    } finally {
      setLoading(false);
    }
  }, [sid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (subjectName != null && String(subjectName).trim() !== '') {
      setHeaderSubjectName(String(subjectName));
      return;
    }
    if (!Number.isFinite(sid)) {
      setHeaderSubjectName('Past papers');
      return;
    }
    let cancelled = false;
    void subjectService
      .getSubject(sid)
      .then((s) => {
        if (!cancelled) setHeaderSubjectName(s.subject_name);
      })
      .catch(() => {
        if (!cancelled) setHeaderSubjectName('Past papers');
      });
    return () => {
      cancelled = true;
    };
  }, [sid, subjectName]);

  const headerLabel = headerSubjectName ?? '…';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {headerLabel}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {error && !loading && <Text style={styles.err}>{error}</Text>}

        {!loading && !error && sorted.length === 0 && (
          <View style={styles.empty}>
            <FileStack size={40} color={colors.textSubtle} />
            <Text style={styles.emptyTitle}>No papers yet</Text>
            <Text style={styles.emptyBody}>
              When your admin uploads a past paper PDF and publishes it for this subject (Admin → Manage catalog →
              Publish), it will show up here. You open the full paper as a PDF.
            </Text>
          </View>
        )}

        {!loading &&
          sorted.map((p, index) => (
            <FadeIn key={p.paper_id} delay={index * 45} direction="up" distance={16}>
              <PressableScale
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/past-papers/paper/[paperId]',
                    params: {
                      paperId: String(p.paper_id),
                      subjectId: String(sid),
                      subjectName: subjectName ? String(subjectName) : headerLabel,
                      year: String(p.year),
                      board: p.board,
                      classLevel: classLevel ? String(classLevel) : undefined,
                      hasPdf: p.has_pdf ? '1' : '0',
                    },
                  })
                }
              >
                <FileStack size={22} color={colors.accent} />
                <View style={styles.rowText}>
                  <Text style={styles.paperTitle}>
                    {p.year} · {p.board}
                  </Text>
                  <Text style={styles.meta}>{p.has_pdf ? 'Tap to open PDF' : 'Tap to open'}</Text>
                </View>
                <Text style={styles.chev}>→</Text>
              </PressableScale>
            </FadeIn>
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
  centered: { paddingVertical: 32, alignItems: 'center' },
  err: { color: colors.danger, marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptyBody: { color: colors.textSubtle, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: { flex: 1 },
  paperTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textSubtle, fontSize: 13, marginTop: 4 },
  chev: { color: colors.textSubtle, fontSize: 18, fontWeight: '600' },
});
