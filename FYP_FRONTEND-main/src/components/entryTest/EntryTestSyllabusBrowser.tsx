import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import {
  ENTRY_TEST_SYLLABUS_CATALOG,
  filterSyllabusCatalog,
  flattenTopics,
} from '../../syllabus';
import type { ClassLevel, EntryExam, EntrySubjectId, SyllabusFilters, SyllabusTag } from '../../syllabus';
import { colors, radii } from '../../theme/colors';

const EXAMS: Array<{ value: EntryExam | 'all'; label: string }> = [
  { value: 'all', label: 'All exams' },
  { value: 'MDCAT', label: 'MDCAT' },
  { value: 'ECAT', label: 'ECAT' },
];

const CLASSES: Array<{ value: ClassLevel | 'all'; label: string }> = [
  { value: 'all', label: '11 + 12' },
  { value: '11', label: 'Class 11' },
  { value: '12', label: 'Class 12' },
];

const SUBJECTS: Array<{ value: EntrySubjectId | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'physics', label: 'Physics' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'biology', label: 'Biology' },
  { value: 'mathematics', label: 'Math' },
];

function tagStyle(tag: SyllabusTag): { bg: string; border: string; text: string } {
  if (tag === 'important') return { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.45)', text: '#fde68a' };
  if (tag === 'repeated') return { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.4)', text: '#ddd6fe' };
  return { bg: 'rgba(56,189,248,0.1)', border: 'rgba(56,189,248,0.4)', text: '#bae6fd' };
}

function FilterChips<T extends string>(props: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const { label, options, value, onChange } = props;
  return (
    <View style={styles.filterBlock}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <TouchableOpacity
              key={String(o.value)}
              style={[styles.filterChip, on && styles.filterChipOn]}
              onPress={() => onChange(o.value)}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipTxt, on && styles.filterChipTxtOn]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function EntryTestSyllabusBrowser() {
  const router = useRouter();
  const [exam, setExam] = useState<EntryExam | 'all'>('all');
  const [classLevel, setClassLevel] = useState<ClassLevel | 'all'>('all');
  const [subjectId, setSubjectId] = useState<EntrySubjectId | 'all'>('all');
  const [search, setSearch] = useState('');
  const [openSubjects, setOpenSubjects] = useState<Record<string, boolean>>({});
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});

  const filters: SyllabusFilters = useMemo(
    () => ({ exam, classLevel, subjectId, search }),
    [exam, classLevel, subjectId, search]
  );

  const filteredSubjects = useMemo(
    () => filterSyllabusCatalog(ENTRY_TEST_SYLLABUS_CATALOG, filters),
    [filters]
  );

  const stats = useMemo(() => {
    const topics = flattenTopics(filteredSubjects);
    const important = topics.filter((t) => t.tags.includes('important')).length;
    return { topics: topics.length, chapters: filteredSubjects.reduce((n, s) => n + s.chapters.length, 0), important };
  }, [filteredSubjects]);

  const toggleSubject = (id: string) => {
    setOpenSubjects((s) => ({ ...s, [id]: !s[id] }));
  };

  const toggleChapter = (id: string) => {
    setOpenChapters((s) => ({ ...s, [id]: !s[id] }));
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            MDCAT & ECAT syllabus
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>
            Class 11–12 topics (PTB + FBISE). Filter and search; expand a subject to see chapters and topics.
          </Text>
          <View style={styles.statRow}>
            <Text style={styles.statPill}>{stats.topics} topics</Text>
            <Text style={styles.statPill}>{stats.chapters} chapters</Text>
            <Text style={[styles.statPill, styles.statPillHi]}>{stats.important} important</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Filters</Text>
            <FilterChips label="Exam" options={EXAMS} value={exam} onChange={setExam} />
            <FilterChips label="Class" options={CLASSES} value={classLevel} onChange={setClassLevel} />
            <FilterChips label="Subject" options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
            <Text style={[styles.filterLabel, { marginTop: 12 }]}>Search</Text>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="Topic or chapter…"
              placeholderTextColor={colors.textSubtle}
            />
          </View>

          {filteredSubjects.length === 0 ? (
            <Text style={styles.empty}>No topics match. Try &quot;All exams&quot; or clear search.</Text>
          ) : (
            filteredSubjects.map((sub) => {
              const open = !!openSubjects[sub.id];
              const topicCount = sub.chapters.reduce((n, ch) => n + ch.topics.length, 0);
              return (
                <View key={sub.id} style={styles.subjectCard}>
                  <TouchableOpacity style={styles.subjectHead} onPress={() => toggleSubject(sub.id)} activeOpacity={0.88}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.subjectName}>{sub.name}</Text>
                      <Text style={styles.subjectDesc} numberOfLines={3}>
                        {sub.description}
                      </Text>
                      <View style={styles.examRow}>
                        {sub.exams.map((e) => (
                          <Text key={e} style={styles.examTag}>
                            {e}
                          </Text>
                        ))}
                        <Text style={styles.mergeTag}>PTB + FBISE</Text>
                      </View>
                    </View>
                    <View style={styles.subjectMeta}>
                      <Text style={styles.topicCount}>{topicCount}</Text>
                      <Text style={styles.topicLbl}>topics</Text>
                      <Text style={styles.chev}>{open ? '▲' : '▼'}</Text>
                    </View>
                  </TouchableOpacity>

                  {open ? (
                    <View style={styles.chapterWrap}>
                      {sub.chapters.map((ch) => {
                        const chOpen = !!openChapters[ch.id];
                        return (
                          <View key={ch.id} style={styles.chapterCard}>
                            <TouchableOpacity style={styles.chapterHead} onPress={() => toggleChapter(ch.id)}>
                              <Text style={styles.chapterTitle} numberOfLines={2}>
                                <Text style={styles.classBadge}>{ch.classLevel}</Text> {ch.name}
                              </Text>
                              <Text style={styles.chapterChev}>{chOpen ? '−' : '+'}</Text>
                            </TouchableOpacity>
                            {chOpen ? (
                              <View style={styles.topicList}>
                                {ch.topics.map((t) => {
                                  const isImportant = t.tags.includes('important');
                                  return (
                                    <View
                                      key={t.id}
                                      style={[styles.topicItem, isImportant && styles.topicItemImportant]}
                                    >
                                      <Text style={[styles.topicName, isImportant && styles.topicNameImportant]}>
                                        {t.name}
                                        {isImportant ? (
                                          <Text style={styles.highYield}> · High yield</Text>
                                        ) : null}
                                      </Text>
                                      <View style={styles.tagRow}>
                                        {t.boards.map((b) => (
                                          <Text key={b} style={styles.boardTag}>
                                            {b}
                                          </Text>
                                        ))}
                                        {t.tags.map((tag) => {
                                          const ts = tagStyle(tag);
                                          return (
                                            <View
                                              key={tag}
                                              style={[styles.sylTag, { backgroundColor: ts.bg, borderColor: ts.border }]}
                                            >
                                              <Text style={[styles.sylTagTxt, { color: ts.text }]}>{tag}</Text>
                                            </View>
                                          );
                                        })}
                                      </View>
                                    </View>
                                  );
                                })}
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}

          <Text style={styles.footer}>
            Catalog v{ENTRY_TEST_SYLLABUS_CATALOG.version} — same data as the web syllabus screen.
          </Text>
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 16, fontWeight: '800' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  lead: { color: colors.textMuted, fontSize: 14, lineHeight: 22, marginBottom: 12 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  statPillHi: { borderColor: 'rgba(251,191,36,0.35)', backgroundColor: 'rgba(251,191,36,0.1)', color: colors.warning },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 11, fontWeight: '800', color: colors.textSubtle, textTransform: 'uppercase', marginBottom: 12 },
  filterBlock: { marginBottom: 12 },
  filterLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  filterChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  filterChipTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  filterChipTxtOn: { color: colors.text },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.bgElevated,
  },
  empty: { textAlign: 'center', color: colors.textMuted, padding: 24, fontSize: 14 },
  subjectCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 12,
    overflow: 'hidden',
  },
  subjectHead: { flexDirection: 'row', padding: 16, alignItems: 'flex-start' },
  subjectName: { fontSize: 17, fontWeight: '800', color: colors.text },
  subjectDesc: { marginTop: 6, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  examRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  examTag: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success,
    backgroundColor: 'rgba(52,211,153,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  mergeTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  subjectMeta: { alignItems: 'flex-end', marginLeft: 8 },
  topicCount: { fontSize: 22, fontWeight: '900', color: colors.accent },
  topicLbl: { fontSize: 10, fontWeight: '700', color: colors.textSubtle, textTransform: 'uppercase' },
  chev: { marginTop: 8, fontSize: 12, color: colors.textMuted, fontWeight: '800' },
  chapterWrap: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 10, paddingBottom: 12 },
  chapterCard: {
    marginTop: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
  chapterHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  chapterTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text, paddingRight: 8 },
  classBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    backgroundColor: colors.surface2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  chapterChev: { fontSize: 16, color: colors.textSubtle, fontWeight: '700' },
  topicList: { borderTopWidth: 1, borderTopColor: colors.border, padding: 10, gap: 10 },
  topicItem: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
  },
  topicItemImportant: {
    borderColor: 'rgba(251,191,36,0.4)',
    backgroundColor: 'rgba(251,191,36,0.06)',
  },
  topicName: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20 },
  topicNameImportant: { color: '#fef3c7' },
  highYield: { fontSize: 10, fontWeight: '800', color: colors.warning, textTransform: 'uppercase' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  boardTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  sylTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  sylTagTxt: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  footer: { marginTop: 20, textAlign: 'center', fontSize: 11, color: colors.textSubtle },
});
