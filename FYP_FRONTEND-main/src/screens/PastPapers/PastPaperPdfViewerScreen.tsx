import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { ArrowLeft, Share2, ExternalLink } from 'lucide-react-native';
import { ensurePastPaperPdfLocal, webViewUriForLocalPdf } from '../../services/localPdfCache';
import { apiClient, FULL_API_URL } from '../../services/api';
import { colors, radii } from '../../theme/colors';

async function openPdfInSystemViewer(localFileUri: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  const contentUri = await FileSystem.getContentUriAsync(localFileUri);
  const IntentLauncher = await import('expo-intent-launcher');
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/pdf',
    flags: 1,
  });
}

export default function PastPaperPdfViewerScreen() {
  const router = useRouter();
  const { paperId, title } = useLocalSearchParams<{ paperId: string; title?: string }>();
  const pid = Number.parseInt(paperId ?? '', 10);
  const [viewUri, setViewUri] = useState<string | null>(null);
  const [localFileUri, setLocalFileUri] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [webOpened, setWebOpened] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webViewErr, setWebViewErr] = useState<string | null>(null);
  const blobRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(pid)) {
      setError('Invalid paper');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setWebOpened(false);
    setViewUri(null);
    setLocalFileUri(null);
    setFromCache(false);
    setWebViewErr(null);
    if (blobRef.current) {
      try {
        URL.revokeObjectURL(blobRef.current);
      } catch {
        /* ignore */
      }
      blobRef.current = null;
    }
    try {
      if (Platform.OS === 'web') {
        const token = await apiClient.getToken();
        if (!token) {
          throw new Error('Sign in to view this past paper.');
        }
        const url = `${FULL_API_URL}/past-papers/manage/${pid}/pdf`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          throw new Error(`Could not load PDF (${res.status})`);
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        blobRef.current = objectUrl;
        if (typeof window !== 'undefined') {
          window.open(objectUrl, '_blank', 'noopener,noreferrer');
        }
        setWebOpened(true);
      } else {
        const { localFileUri: local, fromOfflineCache } = await ensurePastPaperPdfLocal(pid, () =>
          apiClient.getToken()
        );
        setLocalFileUri(local);
        setFromCache(fromOfflineCache);
        const wv = await webViewUriForLocalPdf(local);
        setViewUri(wv);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load PDF');
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    load();
    return () => {
      if (blobRef.current) {
        try {
          URL.revokeObjectURL(blobRef.current);
        } catch {
          /* ignore */
        }
        blobRef.current = null;
      }
    };
  }, [load]);

  const onShare = async () => {
    if (!localFileUri) return;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(localFileUri, { mimeType: 'application/pdf', dialogTitle: title || 'Past paper' });
    } catch (e) {
      Alert.alert('Share', e instanceof Error ? e.message : 'Could not share');
    }
  };

  const onOpenExternal = async () => {
    if (!localFileUri) return;
    try {
      if (Platform.OS === 'android') {
        await openPdfInSystemViewer(localFileUri);
      } else {
        await Sharing.shareAsync(localFileUri, { mimeType: 'application/pdf', dialogTitle: title || 'Past paper' });
      }
    } catch (e) {
      Alert.alert('Open PDF', e instanceof Error ? e.message : 'Could not open');
    }
  };

  const headerTitle = title ? String(title) : `Past paper #${pid}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text numberOfLines={1} style={styles.toolbarTitle}>
          {headerTitle}
        </Text>
        <TouchableOpacity onPress={onShare} style={styles.iconBtn} disabled={!localFileUri}>
          <Share2 size={20} color={localFileUri ? colors.accent : colors.textSubtle} />
        </TouchableOpacity>
      </View>

      {fromCache && !loading && !error ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineTxt}>Saved copy — opens without internet.</Text>
        </View>
      ) : null}

      {Platform.OS === 'android' && localFileUri && !loading && !error ? (
        <TouchableOpacity style={styles.externalRow} onPress={onOpenExternal} activeOpacity={0.85}>
          <ExternalLink size={18} color={colors.accent} />
          <Text style={styles.externalTxt}>Open in PDF app (recommended on Android)</Text>
        </TouchableOpacity>
      ) : null}

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingTxt}>Loading PDF…</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.centered}>
          <Text style={styles.err}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={load}>
            <Text style={styles.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && webOpened && Platform.OS === 'web' && (
        <View style={styles.centered}>
          <Text style={styles.webHint}>The PDF should open in a new browser tab.</Text>
          <Text style={styles.webHintSub}>If it did not, check your popup blocker.</Text>
          <TouchableOpacity style={styles.retry} onPress={load}>
            <Text style={styles.retryTxt}>Open again</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && viewUri && Platform.OS !== 'web' && (
        <View style={styles.webWrap}>
          {webViewErr ? (
            <View style={styles.centered}>
              <Text style={styles.err}>{webViewErr}</Text>
              {localFileUri && Platform.OS === 'android' ? (
                <TouchableOpacity style={styles.retry} onPress={onOpenExternal}>
                  <Text style={styles.retryTxt}>Open in PDF app</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[styles.retry, { marginTop: 10 }]} onPress={load}>
                <Text style={styles.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <WebView
              key={viewUri}
              source={{ uri: viewUri }}
              style={styles.web}
              allowsInlineMediaPlayback
              originWhitelist={['http://*', 'https://*', 'file://*', 'content://*', 'data:*', '*']}
              allowFileAccess
              allowUniversalAccessFromFileURLs
              mixedContentMode="always"
              onError={(e) => {
                const ne = e.nativeEvent;
                const desc = (ne.description && String(ne.description).trim()) || '';
                setWebViewErr(desc || 'Could not show PDF inside the app.');
              }}
              onHttpError={(e) => {
                setWebViewErr(`Could not load document (HTTP ${e.nativeEvent.statusCode}).`);
              }}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  offlineBanner: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(52,211,153,0.25)',
  },
  offlineTxt: { color: colors.success, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  externalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  externalTxt: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  webWrap: { flex: 1 },
  web: { flex: 1, backgroundColor: '#1e1e1e' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingTxt: { marginTop: 12, color: colors.textSubtle, fontSize: 14 },
  webHint: { color: colors.text, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  webHintSub: { color: colors.textSubtle, textAlign: 'center', marginTop: 8, fontSize: 14 },
  err: { color: colors.danger, textAlign: 'center', marginBottom: 16 },
  retry: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: colors.primary, borderRadius: radii.md },
  retryTxt: { color: '#fff', fontWeight: '700' },
});
