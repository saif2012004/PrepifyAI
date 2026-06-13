import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileStack, BookOpen } from 'lucide-react-native';
import { colors, radii } from '../../theme/colors';

export default function AdminUploadHubScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Upload</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.sub}>
          Past papers and student library PDFs use different tools and workflows. Choose one.
        </Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/admin/upload-papers')}
          activeOpacity={0.85}
        >
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
            <FileStack size={28} color="#3B82F6" />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Past papers</Text>
            <Text style={styles.cardDesc}>
              PDF upload (like books): questions are extracted on the server. Students see them under Home → Past papers
              for the same subject.
            </Text>
          </View>
          <Text style={styles.chev}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/admin/upload-books')}
          activeOpacity={0.85}
        >
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <BookOpen size={28} color="#10B981" />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Student books (PDF)</Text>
            <Text style={styles.cardDesc}>Full textbook PDF for the library — board is FBISE or Punjab Board only.</Text>
          </View>
          <Text style={styles.chev}>→</Text>
        </TouchableOpacity>
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
  content: { padding: 18, gap: 16, paddingBottom: 40 },
  sub: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginBottom: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  cardDesc: { color: colors.textMuted, fontSize: 12, marginTop: 6, lineHeight: 18 },
  chev: { color: colors.textSubtle, fontSize: 20, fontWeight: '700' },
});
