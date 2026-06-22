import React, { useCallback, useEffect, useState } from 'react';
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
import { ArrowLeft, FileText } from 'lucide-react-native';
import { listLibraryPdfs, LibraryPdfItem } from '../../services/bookLibraryService';
import { subjectService } from '../../services/subjectService';
import { colors, radii } from '../../theme/colors';
import { FadeIn, PressableScale } from '../../components/animated';

function formatSize(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BooksForSubjectScreen() {
  const router = useRouter();
  const { subjectId, subjectName } = useLocalSearchParams<{
    subjectId: string;
    subjectName?: string;
  }>();
  const sid = Number.parseInt(subjectId ?? '', 10);
  const [items, setItems] = useState<LibraryPdfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [headerSubjectName, setHeaderSubjectName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(sid)) {
      setError('Invalid subject');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listLibraryPdfs(sid);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load books');
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
      setHeaderSubjectName('Books');
      return;
    }
    let cancelled = false;
    void subjectService
      .getSubject(sid)
      .then((s) => {
        if (!cancelled) setHeaderSubjectName(s.subject_name);
      })
      .catch(() => {
        if (!cancelled) setHeaderSubjectName('Books');
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

        {!loading && !error && items.length === 0 && (
          <View style={styles.empty}>
            <FileText size={40} color={colors.textSubtle} />
            <Text style={styles.emptyTitle}>No PDFs yet</Text>
            <Text style={styles.emptyBody}>Ask your admin to upload a textbook for this subject.</Text>
          </View>
        )}

        {!loading &&
          items.map((b, index) => (
            <FadeIn key={b.book_id} delay={index * 45} direction="up" distance={16}>
              <PressableScale
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/books/view/[bookId]',
                    params: { bookId: String(b.book_id), title: b.title },
                  })
                }
              >
                <FileText size={22} color={colors.accent} />
                <View style={styles.rowText}>
                  <Text style={styles.bookTitle} numberOfLines={2}>
                    {b.title}
                  </Text>
                  {b.file_size_bytes ? (
                    <Text style={styles.meta}>{formatSize(b.file_size_bytes)}</Text>
                  ) : null}
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
  bookTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textSubtle, fontSize: 13, marginTop: 4 },
  chev: { color: colors.textSubtle, fontSize: 18, fontWeight: '600' },
});
