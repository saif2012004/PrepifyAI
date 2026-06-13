import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { ArrowLeft, FileUp, Trash2 } from 'lucide-react-native';
import InputField from '../../components/InputField';
import AdminBoardChips from '../../components/AdminBoardChips';
import PrimaryButton from '../../components/PrimaryButton';
import type { CatalogBoardOption } from '../../constants/catalogBoards';
import type { PickedPdf } from '../../services/adminPdfForm';
import { uploadPastPaperPdfLibraryOnly } from '../../services/adminPastPaperService';
import { colors, radii } from '../../theme/colors';

const PAST_PAPER_BOARD_OPTIONS: readonly CatalogBoardOption[] = ['FBISE'];

function assetToPicked(a: DocumentPicker.DocumentPickerAsset): PickedPdf | null {
  if (a.file) return { file: a.file, name: a.name || 'past-paper.pdf' };
  if (a.uri) return { uri: a.uri, name: a.name || 'past-paper.pdf' };
  return null;
}

export default function AdminUploadPastPapersScreen() {
  const router = useRouter();
  const [classLevel, setClassLevel] = useState('10');
  const [board, setBoard] = useState<CatalogBoardOption>('FBISE');
  const [subjectName, setSubjectName] = useState('Biology');
  const [yearStr, setYearStr] = useState('2024');
  const [publishForStudents, setPublishForStudents] = useState(true);
  const [paperFile, setPaperFile] = useState<PickedPdf | null>(null);
  const [busy, setBusy] = useState(false);

  const pickPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a) return;
      const p = assetToPicked(a);
      if (p) setPaperFile(p);
    } catch (e) {
      Alert.alert('Picker', e instanceof Error ? e.message : 'Could not open file picker');
    }
  };

  const clearPaperFile = () => setPaperFile(null);

  const upload = async () => {
    const y = Number.parseInt(yearStr, 10);
    if (!Number.isFinite(y) || y < 1990 || y > 2100) {
      Alert.alert('Year', 'Enter a valid year.');
      return;
    }
    if (!classLevel.trim() || !board.trim() || !subjectName.trim()) {
      Alert.alert('Fields', 'Class, board, and subject are required.');
      return;
    }
    if (!paperFile) {
      Alert.alert('PDF', 'Pick one past paper PDF.');
      return;
    }

    setBusy(true);
    try {
      const r = await uploadPastPaperPdfLibraryOnly({
        file: paperFile,
        class_level: classLevel.trim(),
        board: board.trim(),
        subject_name: subjectName.trim(),
        year: y,
        publishForStudents,
      });
      const live = r.is_published === true;
      Alert.alert(
        live ? 'Saved (live for students)' : 'Saved (draft)',
        `Paper #${r.paper_id}\nSame flow as Student books: the PDF is stored for Past papers (read-only viewer).\n\n` +
          (live
            ? 'Students open it under Home → Past papers.'
            : 'Turn on “Save for students”, or Publish in Admin → Manage catalog.'),
      );
      clearPaperFile();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      if (/401|unauthor|credential|forbidden|403/i.test(msg)) {
        Alert.alert('Admin only', 'Sign in via Admin login with an admin account.');
      } else {
        Alert.alert('Upload failed', msg);
      }
    } finally {
      setBusy(false);
    }
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
        <Text style={styles.hint}>
          Upload works like <Text style={styles.bold}>Student books (PDF)</Text>: one PDF per save, validated and stored
          on the server. Students read the full paper under <Text style={styles.bold}>Home → Past papers</Text>.
        </Text>

        <View style={styles.card}>
          <InputField label="Class level" value={classLevel} onChangeText={setClassLevel} placeholder="9–12" appearance="dark" />
          <AdminBoardChips value={board} onChange={setBoard} options={PAST_PAPER_BOARD_OPTIONS} />
          <InputField
            label="Subject"
            value={subjectName}
            onChangeText={setSubjectName}
            placeholder="Must match catalog subject name"
            appearance="dark"
          />
          <InputField
            label="Year"
            value={yearStr}
            onChangeText={setYearStr}
            placeholder="2024"
            keyboardType="numeric"
            appearance="dark"
          />
        </View>

        <View style={styles.publishRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.publishLabel}>Save for students</Text>
            <Text style={styles.publishHint}>
              Off = draft only (students will not see it until you Publish in Manage catalog). On = live for students.
            </Text>
          </View>
          <Switch
            value={publishForStudents}
            onValueChange={setPublishForStudents}
            disabled={busy}
            trackColor={{ false: colors.border, true: colors.success }}
            thumbColor={colors.surface}
          />
        </View>

        <TouchableOpacity style={styles.pickBtn} onPress={pickPdf} disabled={busy}>
          <FileUp size={20} color={colors.accent} />
          <Text style={styles.pickTxt}>Pick past paper PDF</Text>
        </TouchableOpacity>

        {paperFile && (
          <View style={styles.listCard}>
            <View style={styles.listHead}>
              <Text style={styles.listTitle} numberOfLines={1}>
                {paperFile.name}
              </Text>
              <TouchableOpacity onPress={clearPaperFile} hitSlop={12}>
                <Trash2 size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <PrimaryButton
          title={busy ? 'Saving…' : 'Save for students'}
          onPress={upload}
          disabled={busy || !paperFile}
          loading={busy}
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
  bold: { fontWeight: '800', color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  publishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  publishLabel: { color: colors.text, fontWeight: '800', fontSize: 15 },
  publishHint: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
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
