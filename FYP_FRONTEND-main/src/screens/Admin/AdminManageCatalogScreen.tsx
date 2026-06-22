import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  BookOpen,
  FileStack,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  EyeOff,
} from 'lucide-react-native';
import { subjectService, Subject } from '../../services/subjectService';
import { adminSubjectService } from '../../services/adminSubjectService';
import {
  deleteLibraryBook,
  updateLibraryBookMeta,
  listAdminLibraryPdfs,
  AdminLibraryPdfItem,
} from '../../services/adminBookLibraryService';
import {
  listManagedPastPapers,
  updateManagedPastPaper,
  deleteManagedPastPaper,
  listPastPaperQuestionsForPaper,
  updatePastPaperQuestion,
  deletePastPaperQuestion,
  ManagedPastPaper,
  PastPaperQuestionAdminItem,
  PastPaperQuestionUpdateBody,
} from '../../services/adminPastPaperService';
import { colors, radii } from '../../theme/colors';
import { FadeIn } from '../../components/animated';

export default function AdminManageCatalogScreen() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  /** Class level for the library / past-paper picker (e.g. "10"). */
  const [catalogClassLevel, setCatalogClassLevel] = useState<string | null>(null);
  const [booksSubjectId, setBooksSubjectId] = useState<number | null>(null);
  const [showAllLibraryPdfs, setShowAllLibraryPdfs] = useState(false);
  const [books, setBooks] = useState<AdminLibraryPdfItem[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);

  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newClass, setNewClass] = useState('10');
  const [newBoard, setNewBoard] = useState('FBISE');
  const [newName, setNewName] = useState('');
  const [newVersion, setNewVersion] = useState('2024');
  const [savingSubject, setSavingSubject] = useState(false);

  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const [editClass, setEditClass] = useState('');
  const [editBoard, setEditBoard] = useState('');
  const [editName, setEditName] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [editBook, setEditBook] = useState<AdminLibraryPdfItem | null>(null);
  const [editBookTitle, setEditBookTitle] = useState('');
  const [editBookSubjectId, setEditBookSubjectId] = useState<number | null>(null);
  const [bookPendingDelete, setBookPendingDelete] = useState<AdminLibraryPdfItem | null>(null);
  const [deletingBook, setDeletingBook] = useState(false);
  const [paperPendingDelete, setPaperPendingDelete] = useState<ManagedPastPaper | null>(null);
  const [deletingPastPaper, setDeletingPastPaper] = useState(false);

  const [papers, setPapers] = useState<ManagedPastPaper[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [expandedPaperId, setExpandedPaperId] = useState<number | null>(null);
  const [paperQuestions, setPaperQuestions] = useState<Record<number, PastPaperQuestionAdminItem[]>>({});
  const [loadingQsPaperId, setLoadingQsPaperId] = useState<number | null>(null);
  const [editPastPaper, setEditPastPaper] = useState<ManagedPastPaper | null>(null);
  const [editPastPaperYear, setEditPastPaperYear] = useState('');
  const [editPastPaperBoard, setEditPastPaperBoard] = useState('');
  const [editPastPaperPublished, setEditPastPaperPublished] = useState(false);
  const [editPQ, setEditPQ] = useState<PastPaperQuestionAdminItem | null>(null);
  const [eqText, setEqText] = useState('');
  const [eqType, setEqType] = useState('');
  const [eqTopic, setEqTopic] = useState('');
  const [eqMarks, setEqMarks] = useState('');

  const loadSubjects = useCallback(async () => {
    setLoadingSubjects(true);
    try {
      const list = await subjectService.getSubjects(undefined, true);
      setSubjects(list);
    } catch (e) {
      Alert.alert('Could not load subjects', e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingSubjects(false);
    }
  }, []);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  const sortedClassLevels = useMemo(() => sortedUniqueClassLevels(subjects), [subjects]);

  const subjectsInSelectedClass = useMemo(() => {
    if (catalogClassLevel == null) return [];
    return subjects.filter((s) => s.class_level === catalogClassLevel);
  }, [subjects, catalogClassLevel]);

  const subjectNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of subjects) {
      m.set(s.subject_id, s.subject_name);
    }
    return m;
  }, [subjects]);

  useEffect(() => {
    if (!subjects.length) {
      setCatalogClassLevel(null);
      setBooksSubjectId(null);
      return;
    }
    const levels = sortedUniqueClassLevels(subjects);
    setCatalogClassLevel((prev) => {
      if (prev && levels.includes(prev)) return prev;
      return levels[0] ?? null;
    });
  }, [subjects]);

  useEffect(() => {
    if (catalogClassLevel == null) return;
    const inClass = subjects.filter((s) => s.class_level === catalogClassLevel);
    if (!inClass.length) return;
    setBooksSubjectId((prev) => {
      if (prev != null && inClass.some((s) => s.subject_id === prev)) return prev;
      return inClass[0].subject_id;
    });
  }, [catalogClassLevel, subjects]);

  const loadBooks = useCallback(async () => {
    setLoadingBooks(true);
    try {
      if (showAllLibraryPdfs) {
        const list = await listAdminLibraryPdfs();
        setBooks(list);
        return;
      }
      if (booksSubjectId != null) {
        const list = await listAdminLibraryPdfs(booksSubjectId);
        setBooks(list);
        return;
      }
      setBooks([]);
    } catch (e) {
      Alert.alert('Could not load books', e instanceof Error ? e.message : 'Error');
      setBooks([]);
    } finally {
      setLoadingBooks(false);
    }
  }, [showAllLibraryPdfs, booksSubjectId]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  const loadPapers = useCallback(async (sid: number) => {
    setLoadingPapers(true);
    try {
      const list = await listManagedPastPapers({ subject_id: sid });
      setPapers(list);
    } catch (e) {
      Alert.alert('Could not load past papers', e instanceof Error ? e.message : 'Error');
      setPapers([]);
    } finally {
      setLoadingPapers(false);
    }
  }, []);

  useEffect(() => {
    if (booksSubjectId != null) {
      void loadPapers(booksSubjectId);
      setExpandedPaperId(null);
    } else {
      setPapers([]);
    }
  }, [booksSubjectId, loadPapers]);

  const togglePaperExpanded = async (paperId: number) => {
    if (expandedPaperId === paperId) {
      setExpandedPaperId(null);
      return;
    }
    setExpandedPaperId(paperId);
    if (paperQuestions[paperId]) return;
    setLoadingQsPaperId(paperId);
    try {
      const qs = await listPastPaperQuestionsForPaper(paperId);
      setPaperQuestions((p) => ({ ...p, [paperId]: qs }));
    } catch (e) {
      Alert.alert('Could not load questions', e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingQsPaperId(null);
    }
  };

  const openEditPastPaper = (p: ManagedPastPaper) => {
    setEditPastPaper(p);
    setEditPastPaperYear(String(p.year));
    setEditPastPaperBoard(p.board);
    setEditPastPaperPublished(!!p.is_published);
  };

  const savePastPaperMeta = async () => {
    if (!editPastPaper) return;
    const y = parseInt(editPastPaperYear.trim(), 10);
    if (!Number.isFinite(y) || y < 1990 || y > 2100) {
      Alert.alert('Year', 'Enter a valid year.');
      return;
    }
    const b = editPastPaperBoard.trim();
    if (!b) {
      Alert.alert('Board', 'Board is required.');
      return;
    }
    const pid = editPastPaper.paper_id;
    try {
      await updateManagedPastPaper(pid, {
        year: y,
        board: b,
        is_published: editPastPaperPublished,
      });
      setEditPastPaper(null);
      setPapers((prev) =>
        prev.map((x) =>
          x.paper_id === pid
            ? { ...x, year: y, board: b, is_published: editPastPaperPublished }
            : x
        )
      );
      if (booksSubjectId != null) {
        try {
          await loadPapers(booksSubjectId);
        } catch {
          /* local row already refreshed */
        }
      }
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Error');
    }
  };

  const publishPastPaperForStudents = async (p: ManagedPastPaper) => {
    try {
      await updateManagedPastPaper(p.paper_id, { is_published: true });
      setPapers((prev) =>
        prev.map((x) => (x.paper_id === p.paper_id ? { ...x, is_published: true } : x))
      );
      if (booksSubjectId != null) {
        try {
          await loadPapers(booksSubjectId);
        } catch {
          /* list already patched */
        }
      }
    } catch (e) {
      Alert.alert('Publish failed', e instanceof Error ? e.message : 'Error');
    }
  };

  const unpublishPastPaperForStudents = async (p: ManagedPastPaper) => {
    try {
      await updateManagedPastPaper(p.paper_id, { is_published: false });
      setPapers((prev) =>
        prev.map((x) => (x.paper_id === p.paper_id ? { ...x, is_published: false } : x))
      );
      if (booksSubjectId != null) {
        try {
          await loadPapers(booksSubjectId);
        } catch {
          /* list already patched */
        }
      }
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Error');
    }
  };

  const openDeletePastPaperModal = (p: ManagedPastPaper) => {
    setPaperPendingDelete(p);
  };

  const runDeletePastPaper = async () => {
    const p = paperPendingDelete;
    if (!p) return;
    const prevPapers = papers;
    const prevQs = paperQuestions;
    const prevExpanded = expandedPaperId;
    setPaperPendingDelete(null);
    setPapers((prev) => prev.filter((x) => x.paper_id !== p.paper_id));
    setPaperQuestions((prev) => {
      const next = { ...prev };
      delete next[p.paper_id];
      return next;
    });
    if (expandedPaperId === p.paper_id) setExpandedPaperId(null);
    setDeletingPastPaper(true);
    try {
      await deleteManagedPastPaper(p.paper_id);
      if (booksSubjectId != null) {
        try {
          await loadPapers(booksSubjectId);
        } catch {
          /* optimistic list is already correct */
        }
      }
    } catch (e) {
      setPapers(prevPapers);
      setPaperQuestions(prevQs);
      setExpandedPaperId(prevExpanded);
      Alert.alert('Delete failed', e instanceof Error ? e.message : 'Error');
    } finally {
      setDeletingPastPaper(false);
    }
  };

  const openEditQuestion = (q: PastPaperQuestionAdminItem) => {
    setEditPQ(q);
    setEqText(q.question_text);
    setEqType(q.question_type);
    setEqTopic(q.topic ?? '');
    setEqMarks(q.marks != null && !Number.isNaN(Number(q.marks)) ? String(q.marks) : '');
  };

  const savePastPaperQuestion = async () => {
    if (!editPQ) return;
    if (!eqText.trim()) {
      Alert.alert('Text', 'Question text cannot be empty.');
      return;
    }
    if (!eqType.trim()) {
      Alert.alert('Type', 'Question type is required (e.g. MCQ, SHORT).');
      return;
    }
    const body: PastPaperQuestionUpdateBody = {
      question_text: eqText.trim(),
      question_type: eqType.trim(),
      topic: eqTopic.trim() ? eqTopic.trim() : null,
    };
    const m = parseFloat(eqMarks);
    if (eqMarks.trim() !== '' && !Number.isNaN(m)) {
      body.marks = m;
    }
    try {
      await updatePastPaperQuestion(editPQ.question_id, body);
      setEditPQ(null);
      const pid = editPQ.paper_id;
      const qs = await listPastPaperQuestionsForPaper(pid);
      setPaperQuestions((prev) => ({ ...prev, [pid]: qs }));
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Error');
    }
  };

  const confirmDeleteQuestion = (q: PastPaperQuestionAdminItem) => {
    Alert.alert('Delete question', `Remove question #${q.question_id}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const pid = q.paper_id;
          const prevList = paperQuestions[pid] ?? [];
          setPaperQuestions((prev) => ({
            ...prev,
            [pid]: prevList.filter((x) => x.question_id !== q.question_id),
          }));
          try {
            await deletePastPaperQuestion(q.question_id);
            const qs = await listPastPaperQuestionsForPaper(pid);
            setPaperQuestions((prev) => ({ ...prev, [pid]: qs }));
          } catch (e) {
            setPaperQuestions((prev) => ({ ...prev, [pid]: prevList }));
            Alert.alert('Delete failed', e instanceof Error ? e.message : 'Error');
          }
        },
      },
    ]);
  };

  const openEditSubject = (s: Subject) => {
    setEditSubject(s);
    setEditClass(s.class_level);
    setEditBoard(s.board);
    setEditName(s.subject_name);
    setEditVersion(s.book_version);
  };

  const saveEditSubject = async () => {
    if (!editSubject) return;
    if (!editClass.trim() || !editBoard.trim() || !editName.trim() || !editVersion.trim()) {
      Alert.alert('Fields', 'All fields are required.');
      return;
    }
    setSavingSubject(true);
    try {
      await adminSubjectService.update(editSubject.subject_id, {
        class_level: editClass.trim(),
        board: editBoard.trim(),
        subject_name: editName.trim(),
        book_version: editVersion.trim(),
      });
      setEditSubject(null);
      await loadSubjects();
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Error');
    } finally {
      setSavingSubject(false);
    }
  };

  const createSubject = async () => {
    if (!newClass.trim() || !newBoard.trim() || !newName.trim() || !newVersion.trim()) {
      Alert.alert('Fields', 'Fill class, board, subject name, and book version.');
      return;
    }
    setSavingSubject(true);
    try {
      await adminSubjectService.create({
        class_level: newClass.trim(),
        board: newBoard.trim(),
        subject_name: newName.trim(),
        book_version: newVersion.trim(),
      });
      setShowAddSubject(false);
      setNewName('');
      await loadSubjects();
    } catch (e) {
      Alert.alert('Create failed', e instanceof Error ? e.message : 'Error');
    } finally {
      setSavingSubject(false);
    }
  };

  const confirmDeleteSubject = (s: Subject) => {
    Alert.alert(
      'Delete subject',
      `Remove "${s.subject_name}" (${s.board} · class ${s.class_level})? This can fail if past papers or questions still reference it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminSubjectService.remove(s.subject_id);
              if (booksSubjectId === s.subject_id) {
                setBooksSubjectId(null);
              }
              await loadSubjects();
            } catch (e) {
              Alert.alert('Delete failed', e instanceof Error ? e.message : 'Error');
            }
          },
        },
      ]
    );
  };

  const openEditBook = (b: AdminLibraryPdfItem) => {
    setEditBook(b);
    setEditBookTitle(b.title);
    setEditBookSubjectId(b.subject_id);
  };

  const saveLibraryBookMeta = async () => {
    if (!editBook || editBookSubjectId == null) return;
    const t = editBookTitle.trim();
    if (!t) {
      Alert.alert('Title', 'Enter a non-empty title.');
      return;
    }
    try {
      await updateLibraryBookMeta(editBook.book_id, { title: t, subject_id: editBookSubjectId });
      setEditBook(null);
      await loadBooks();
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Error');
    }
  };

  const openDeleteBookModal = (b: AdminLibraryPdfItem) => {
    setBookPendingDelete(b);
  };

  const runDeleteBook = async () => {
    const b = bookPendingDelete;
    if (!b) return;
    setDeletingBook(true);
    try {
      await deleteLibraryBook(b.book_id);
      setBookPendingDelete(null);
      setBooks((prev) => prev.filter((x) => x.book_id !== b.book_id));
      try {
        await loadBooks();
      } catch {
        /* Optimistic list already updated */
      }
      Alert.alert('Removed', 'Book PDF was removed from the catalog.');
    } catch (e) {
      Alert.alert('Delete failed', e instanceof Error ? e.message : 'Error');
    } finally {
      setDeletingBook(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Manage catalog</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Subjects</Text>
        <Text style={styles.hint}>
          Add, edit, or remove subjects (admin only). Student apps load a filtered catalog (lowercase fbise / punjab boards
          are hidden there but still listed here for you to fix or migrate).
        </Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowAddSubject(true)}>
          <Plus size={20} color="#fff" />
          <Text style={styles.primaryBtnTxt}>Add subject</Text>
        </TouchableOpacity>

        {loadingSubjects ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
        ) : (
          subjects.map((s, index) => (
            <FadeIn key={s.subject_id} delay={Math.min(index, 10) * 45} direction="up" distance={14} style={styles.card}>
              <Text style={styles.cardTitle}>{s.subject_name}</Text>
              <Text style={styles.cardMeta}>
                Class {s.class_level} · {s.board} · book {s.book_version}
              </Text>
              <View style={styles.rowBtns}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => openEditSubject(s)}>
                  <Pencil size={18} color={colors.primary} />
                  <Text style={styles.iconBtnTxt}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => confirmDeleteSubject(s)}>
                  <Trash2 size={18} color={colors.danger} />
                  <Text style={[styles.iconBtnTxt, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </FadeIn>
          ))
        )}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Class & subject for library & past papers</Text>
        <Text style={styles.hint}>
          Pick a class, then a subject (board and book version are shown so rows stay distinct). Past papers always follow
          the subject you select. For library PDFs you can also choose All PDFs to audit every upload at once.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          <TouchableOpacity
            style={[styles.chip, showAllLibraryPdfs && styles.chipOn]}
            onPress={() => setShowAllLibraryPdfs(true)}
          >
            <Text style={[styles.chipTxt, showAllLibraryPdfs && styles.chipTxtOn]}>All PDFs</Text>
          </TouchableOpacity>
        </ScrollView>

        <Text style={styles.chipSectionLabel}>Class</Text>
        {loadingSubjects ? (
          <Text style={styles.muted}>Loading classes…</Text>
        ) : sortedClassLevels.length === 0 ? (
          <Text style={styles.muted}>No classes in catalog yet. Add a subject above.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
            {sortedClassLevels.map((cl) => (
              <TouchableOpacity
                key={cl}
                style={[styles.chip, catalogClassLevel === cl && styles.chipOn]}
                onPress={() => {
                  setShowAllLibraryPdfs(false);
                  setCatalogClassLevel(cl);
                }}
              >
                <Text style={[styles.chipTxt, catalogClassLevel === cl && styles.chipTxtOn]}>Class {cl}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <Text style={styles.chipSectionLabel}>Subject</Text>
        {loadingSubjects ? (
          <Text style={styles.muted}>Loading subjects…</Text>
        ) : subjectsInSelectedClass.length === 0 ? (
          <Text style={styles.muted}>No subjects for this class.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRowTall}>
            {subjectsInSelectedClass.map((s) => (
              <TouchableOpacity
                key={s.subject_id}
                style={[styles.chipTall, booksSubjectId === s.subject_id && styles.chipOn]}
                onPress={() => {
                  setShowAllLibraryPdfs(false);
                  setCatalogClassLevel(s.class_level);
                  setBooksSubjectId(s.subject_id);
                }}
              >
                <Text
                  style={[styles.chipTxt, booksSubjectId === s.subject_id && styles.chipTxtOn]}
                  numberOfLines={1}
                >
                  {s.subject_name}
                </Text>
                <Text
                  style={[styles.chipSubTxt, booksSubjectId === s.subject_id && styles.chipSubTxtOn]}
                  numberOfLines={1}
                >
                  {s.board} · book {s.book_version}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Past papers (ingested)</Text>
        <Text style={styles.hint}>
          New uploads are drafts until you tap Publish. Only published papers appear to students under Past papers.
          Use Edit to change year, board, or visibility (tap Update paper in the form to save). Unpublish hides a live
          paper from students without deleting it. Delete removes the paper from the catalog right away. Expand a row
          to edit or delete individual questions. Upload PDFs from Admin → Upload past papers.
        </Text>

        {booksSubjectId == null ? (
          <Text style={styles.muted}>Pick a subject above.</Text>
        ) : loadingPapers ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
        ) : papers.length === 0 ? (
          <View style={styles.emptyBooks}>
            <FileStack size={32} color={colors.textSubtle} />
            <Text style={styles.muted}>No past papers for this subject yet.</Text>
          </View>
        ) : (
          papers.map((p, index) => (
            <FadeIn key={p.paper_id} delay={Math.min(index, 10) * 45} direction="up" distance={14} style={styles.card}>
              <TouchableOpacity
                style={styles.paperHeaderRow}
                onPress={() => void togglePaperExpanded(p.paper_id)}
                activeOpacity={0.7}
              >
                {expandedPaperId === p.paper_id ? (
                  <ChevronDown size={20} color={colors.textMuted} />
                ) : (
                  <ChevronRight size={20} color={colors.textMuted} />
                )}
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.cardTitle}>
                    Paper #{p.paper_id} — {p.board} · {p.year}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {subjectNameById.get(p.subject_id) ?? 'Subject not in catalog'}
                    {p.is_published ? (
                      <Text style={styles.liveTag}> · Live for students</Text>
                    ) : (
                      <Text style={styles.draftTag}> · Draft (not visible to students)</Text>
                    )}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.rowBtnsWrap}>
                {!p.is_published ? (
                  <TouchableOpacity style={[styles.iconBtn, styles.iconBtnStack]} onPress={() => void publishPastPaperForStudents(p)}>
                    <CheckCircle2 size={18} color={colors.success} style={{ marginTop: 2 }} />
                    <View>
                      <Text style={[styles.iconBtnTxt, { color: colors.success }]}>Publish</Text>
                      <Text style={styles.iconBtnSub}>Update: go live</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.iconBtn, styles.iconBtnStack]} onPress={() => void unpublishPastPaperForStudents(p)}>
                    <EyeOff size={18} color={colors.warning} style={{ marginTop: 2 }} />
                    <View>
                      <Text style={[styles.iconBtnTxt, { color: colors.warning }]}>Unpublish</Text>
                      <Text style={styles.iconBtnSub}>Update: hide</Text>
                    </View>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.iconBtn, styles.iconBtnStack]} onPress={() => openEditPastPaper(p)}>
                  <Pencil size={18} color={colors.primary} style={{ marginTop: 2 }} />
                  <View>
                    <Text style={styles.iconBtnTxt}>Edit</Text>
                    <Text style={styles.iconBtnSub}>Update details</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => openDeletePastPaperModal(p)}>
                  <Trash2 size={18} color={colors.danger} />
                  <Text style={[styles.iconBtnTxt, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>

              {expandedPaperId === p.paper_id && (
                <View style={styles.questionsBlock}>
                  {loadingQsPaperId === p.paper_id ? (
                    <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
                  ) : (paperQuestions[p.paper_id] ?? []).length === 0 ? (
                    <Text style={styles.muted}>No questions stored for this paper.</Text>
                  ) : (
                    (paperQuestions[p.paper_id] ?? []).map((q) => (
                      <View key={q.question_id} style={styles.questionCard}>
                        <Text style={styles.questionPreview} numberOfLines={3}>
                          {q.question_text}
                        </Text>
                        <Text style={styles.cardMeta}>
                          #{q.question_id} · {q.question_type}
                          {q.topic ? ` · ${q.topic}` : ''}
                          {q.marks != null ? ` · ${q.marks} marks` : ''}
                        </Text>
                        <View style={styles.rowBtnsWrap}>
                          <TouchableOpacity style={[styles.iconBtn, styles.iconBtnStack]} onPress={() => openEditQuestion(q)}>
                            <Pencil size={16} color={colors.primary} style={{ marginTop: 1 }} />
                            <View>
                              <Text style={styles.iconBtnTxt}>Edit</Text>
                              <Text style={styles.iconBtnSub}>Update text</Text>
                            </View>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.iconBtn} onPress={() => confirmDeleteQuestion(q)}>
                            <Trash2 size={16} color={colors.danger} />
                            <Text style={[styles.iconBtnTxt, { color: colors.danger }]}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </FadeIn>
          ))
        )}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Student textbook PDFs</Text>
        <Text style={styles.hint}>
          Delete uploads that do not belong, or open Edit to move a PDF to the correct subject (same files as Home →
          Textbooks).
        </Text>

        {!showAllLibraryPdfs && booksSubjectId == null ? (
          <Text style={styles.muted}>Pick a subject above, or tap All PDFs.</Text>
        ) : loadingBooks ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
        ) : books.length === 0 ? (
          <View style={styles.emptyBooks}>
            <BookOpen size={32} color={colors.textSubtle} />
            <Text style={styles.muted}>No PDFs for this subject. Use Admin → Upload student books.</Text>
          </View>
        ) : (
          books.map((b, index) => (
            <FadeIn key={b.book_id} delay={Math.min(index, 10) * 45} direction="up" distance={14} style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {b.title}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={2}>
                {b.subject_name} · {b.board} · class {b.class_level}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                #{b.book_id} · {b.original_filename}
              </Text>
              <View style={styles.rowBtns}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => openEditBook(b)}>
                  <Pencil size={18} color={colors.accent} />
                  <Text style={styles.iconBtnTxt}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => openDeleteBookModal(b)}>
                  <Trash2 size={18} color={colors.danger} />
                  <Text style={[styles.iconBtnTxt, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </FadeIn>
          ))
        )}
      </ScrollView>

      {/* Delete past paper — same Modal pattern as books (instant list removal after confirm) */}
      <Modal
        visible={!!paperPendingDelete}
        transparent
        animationType="fade"
        onRequestClose={() => !deletingPastPaper && setPaperPendingDelete(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete past paper?</Text>
            <Text style={styles.deleteConfirmBody}>
              Remove paper #{paperPendingDelete?.paper_id} ({paperPendingDelete?.board} · {paperPendingDelete?.year})
              and its stored questions? This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                disabled={deletingPastPaper}
                onPress={() => setPaperPendingDelete(null)}
              >
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, { backgroundColor: colors.danger }]}
                disabled={deletingPastPaper}
                onPress={() => void runDeletePastPaper()}
              >
                <Text style={styles.modalSaveTxt}>{deletingPastPaper ? '…' : 'Delete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete library PDF — Modal works on web; Alert.alert multi-button often does not */}
      <Modal
        visible={!!bookPendingDelete}
        transparent
        animationType="fade"
        onRequestClose={() => !deletingBook && setBookPendingDelete(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete book?</Text>
            <Text style={styles.deleteConfirmBody}>
              Remove &quot;{bookPendingDelete?.title}&quot; ({bookPendingDelete?.subject_name}, #
              {bookPendingDelete?.book_id})? The PDF file will be removed from the server.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                disabled={deletingBook}
                onPress={() => setBookPendingDelete(null)}
              >
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, { backgroundColor: colors.danger }]}
                disabled={deletingBook}
                onPress={() => void runDeleteBook()}
              >
                <Text style={styles.modalSaveTxt}>{deletingBook ? '…' : 'Delete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add subject */}
      <Modal visible={showAddSubject} transparent animationType="fade" onRequestClose={() => setShowAddSubject(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New subject</Text>
            <Field label="Class" value={newClass} onChange={setNewClass} />
            <Field label="Board" value={newBoard} onChange={setNewBoard} />
            <Field label="Subject name" value={newName} onChange={setNewName} />
            <Field label="Book version" value={newVersion} onChange={setNewVersion} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAddSubject(false)}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={createSubject} disabled={savingSubject}>
                <Text style={styles.modalSaveTxt}>{savingSubject ? '…' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit subject */}
      <Modal visible={!!editSubject} transparent animationType="fade" onRequestClose={() => setEditSubject(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit subject</Text>
            <Field label="Class" value={editClass} onChange={setEditClass} />
            <Field label="Board" value={editBoard} onChange={setEditBoard} />
            <Field label="Subject name" value={editName} onChange={setEditName} />
            <Field label="Book version" value={editVersion} onChange={setEditVersion} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditSubject(null)}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveEditSubject} disabled={savingSubject}>
                <Text style={styles.modalSaveTxt}>{savingSubject ? '…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit past paper year/board */}
      <Modal visible={!!editPastPaper} transparent animationType="fade" onRequestClose={() => setEditPastPaper(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit past paper</Text>
            <Field label="Year" value={editPastPaperYear} onChange={setEditPastPaperYear} />
            <Field label="Board" value={editPastPaperBoard} onChange={setEditPastPaperBoard} />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Visible to students (Past papers)</Text>
              <Switch value={editPastPaperPublished} onValueChange={setEditPastPaperPublished} />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditPastPaper(null)}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={savePastPaperMeta}>
                <Text style={styles.modalSaveTxt}>Update paper</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit past paper question */}
      <Modal visible={!!editPQ} transparent animationType="fade" onRequestClose={() => setEditPQ(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit question #{editPQ?.question_id}</Text>
              <Text style={styles.fieldLbl}>Question text</Text>
              <TextInput
                value={eqText}
                onChangeText={setEqText}
                placeholderTextColor={colors.textSubtle}
                style={[styles.input, styles.inputMultiline]}
                multiline
                textAlignVertical="top"
              />
              <Field label="Type (e.g. MCQ, SHORT)" value={eqType} onChange={setEqType} />
              <Field label="Topic (optional)" value={eqTopic} onChange={setEqTopic} />
              <Field label="Marks (optional)" value={eqMarks} onChange={setEqMarks} />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setEditPQ(null)}>
                  <Text style={styles.modalCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={savePastPaperQuestion}>
                  <Text style={styles.modalSaveTxt}>Update question</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit library PDF: title + subject */}
      <Modal visible={!!editBook} transparent animationType="fade" onRequestClose={() => setEditBook(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={{ paddingVertical: 16 }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit library PDF</Text>
              <Field label="Display title" value={editBookTitle} onChange={setEditBookTitle} />
              <Text style={styles.fieldLbl}>Catalog subject</Text>
              <Text style={styles.subjPickHint}>Pick the subject this file should appear under for students.</Text>
              <ScrollView style={styles.subjPickList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {subjects.map((s) => (
                  <TouchableOpacity
                    key={s.subject_id}
                    style={[
                      styles.subjPickRow,
                      editBookSubjectId === s.subject_id && styles.subjPickRowOn,
                    ]}
                    onPress={() => setEditBookSubjectId(s.subject_id)}
                  >
                    <Text style={styles.subjPickTxt}>
                      {s.subject_name} · {s.board} · class {s.class_level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setEditBook(null)}>
                  <Text style={styles.modalCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={saveLibraryBookMeta}>
                  <Text style={styles.modalSaveTxt}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function sortedUniqueClassLevels(list: Subject[]): string[] {
  const seen = new Set<string>();
  for (const s of list) seen.add(s.class_level);
  return Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.textSubtle}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
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
  content: { padding: 16, paddingBottom: 48 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    marginBottom: 16,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  rowBtns: { flexDirection: 'row', gap: 20, marginTop: 12 },
  rowBtnsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    rowGap: 12,
    marginTop: 12,
    alignItems: 'flex-start',
  },
  iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtnStack: { alignItems: 'flex-start' },
  iconBtnTxt: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  iconBtnSub: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  liveTag: { color: colors.success, fontWeight: '700' },
  draftTag: { color: colors.warning, fontWeight: '700' },
  paperHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  questionsBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  questionCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  questionPreview: { color: colors.text, fontSize: 14, lineHeight: 20 },
  inputMultiline: { minHeight: 120, marginBottom: 12 },
  chips: { marginBottom: 8, maxHeight: 44 },
  chipsRow: { marginBottom: 6, maxHeight: 44 },
  chipsRowTall: { marginBottom: 12, maxHeight: 58 },
  chipSectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  chipTall: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    maxWidth: 200,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.primaryMuted },
  chipTxt: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  chipTxtOn: { color: colors.text },
  chipSubTxt: { color: colors.textSubtle, fontSize: 11, fontWeight: '600', marginTop: 2 },
  chipSubTxtOn: { color: colors.textMuted },
  muted: { color: colors.textSubtle, fontSize: 14, marginVertical: 12 },
  emptyBooks: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 14 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 4,
    gap: 12,
  },
  switchLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  fieldLbl: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    color: colors.text,
    backgroundColor: colors.bgElevated,
    fontSize: 15,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  modalCancel: { paddingVertical: 12, paddingHorizontal: 16 },
  modalCancelTxt: { color: colors.textMuted, fontWeight: '700' },
  modalSave: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radii.md,
  },
  modalSaveTxt: { color: '#fff', fontWeight: '800' },
  subjPickHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  subjPickList: { maxHeight: 200, marginBottom: 8 },
  subjPickRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.bgElevated,
  },
  subjPickRowOn: { borderColor: colors.accent, backgroundColor: colors.primaryMuted },
  subjPickTxt: { color: colors.text, fontSize: 14, fontWeight: '600' },
  deleteConfirmBody: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 8 },
});
