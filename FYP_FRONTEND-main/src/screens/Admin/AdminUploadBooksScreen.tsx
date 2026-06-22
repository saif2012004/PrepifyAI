import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { ArrowLeft, FileUp, Trash2 } from 'lucide-react-native';
import InputField from '../../components/InputField';
import AdminBoardChips from '../../components/AdminBoardChips';
import PrimaryButton from '../../components/PrimaryButton';
import type { CatalogBoardOption } from '../../constants/catalogBoards';
import { uploadStudentBookPdf } from '../../services/adminBookLibraryService';
import type { PickedPdf } from '../../services/adminPdfForm';
import { colors, radii } from '../../theme/colors';
import { FadeIn } from '../../components/animated';

export default function AdminUploadBooksScreen() {
  const router = useRouter();
  const [classLevel, setClassLevel] = useState('10');
  const [board, setBoard] = useState<CatalogBoardOption>('FBISE');
  const [subjectName, setSubjectName] = useState('Biology');
  const [bookTitle, setBookTitle] = useState('');
  const [bookFile, setBookFile] = useState<PickedPdf | null>(null);
  const [busyBook, setBusyBook] = useState(false);

  const pickBookPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a) return;
      if (a.file) {
        setBookFile({ file: a.file, name: a.name || 'textbook.pdf' });
      } else if (a.uri) {
        setBookFile({ uri: a.uri, name: a.name || 'textbook.pdf' });
      }
    } catch (e) {
      Alert.alert('Picker', e instanceof Error ? e.message : 'Could not open file picker');
    }
  };

  const clearBook = () => setBookFile(null);

  const uploadBookLibrary = async () => {
    if (!classLevel.trim() || !board.trim() || !subjectName.trim()) {
      Alert.alert('Fields', 'Class, board, and subject are required.');
      return;
    }
    if (!bookFile) {
      Alert.alert('PDF', 'Pick one textbook PDF.');
      return;
    }
    setBusyBook(true);
    try {
      const r = await uploadStudentBookPdf({
        file: bookFile,
        class_level: classLevel.trim(),
        board: board.trim(),
        subject_name: subjectName.trim(),
        title: bookTitle.trim() || undefined,
      });
      Alert.alert('Saved', `Students open this from Home → Textbooks.\nBook #${r.book_id}\n${r.title}`);
      clearBook();
      setBookTitle('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      if (/401|unauthor|credential|forbidden|403/i.test(msg)) {
        Alert.alert('Admin only', 'Sign in via Admin login with an admin account.');
      } else {
        Alert.alert('Upload failed', msg);
      }
    } finally {
      setBusyBook(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Student books (PDF)</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.hint}>
          Choose board and subject, then pick a PDF. Students open it from Home → Textbooks (reading only, no question
          extraction).
        </Text>

        <FadeIn delay={60} direction="up" distance={16} style={styles.card}>
          <InputField label="Class level" value={classLevel} onChangeText={setClassLevel} placeholder="9–12" appearance="dark" />
          <AdminBoardChips value={board} onChange={setBoard} />
          <InputField
            label="Subject"
            value={subjectName}
            onChangeText={setSubjectName}
            placeholder="Must match catalog subject name"
            appearance="dark"
          />
        </FadeIn>

        <InputField
          label="Display title (optional)"
          value={bookTitle}
          onChangeText={setBookTitle}
          placeholder="e.g. Biology Grade 10"
          appearance="dark"
        />

        <TouchableOpacity style={styles.pickBtn} onPress={pickBookPdf} disabled={busyBook}>
          <FileUp size={20} color={colors.accent} />
          <Text style={styles.pickTxt}>Pick textbook PDF</Text>
        </TouchableOpacity>

        {bookFile && (
          <View style={styles.listCard}>
            <View style={styles.listHead}>
              <Text style={styles.listTitle} numberOfLines={1}>
                {bookFile.name}
              </Text>
              <TouchableOpacity onPress={clearBook} hitSlop={12}>
                <Trash2 size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <PrimaryButton
          title={busyBook ? 'Saving…' : 'Save for students'}
          onPress={uploadBookLibrary}
          disabled={busyBook || !bookFile}
          loading={busyBook}
          color={colors.accent}
        />
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
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '800' },
  scroll: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 40, gap: 14 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bgElevated,
  },
  pickTxt: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  listTitle: { color: colors.text, fontWeight: '800' },
});
