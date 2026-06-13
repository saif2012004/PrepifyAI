import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { FULL_API_URL } from './api';

function pdfRoot(): string {
  const d = FileSystem.documentDirectory;
  if (!d) {
    throw new Error('This device has no document storage for offline PDFs.');
  }
  return `${d}prepify-pdfs`;
}

function bookPath(bookId: number): string {
  return `${pdfRoot()}/books/book-${bookId}.pdf`;
}

function paperPath(paperId: number): string {
  return `${pdfRoot()}/past-papers/paper-${paperId}.pdf`;
}

async function ensureParentDirs(filePath: string): Promise<void> {
  const root = pdfRoot();
  const infoRoot = await FileSystem.getInfoAsync(root);
  if (!infoRoot.exists) {
    await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  }
  const parent = filePath.slice(0, filePath.lastIndexOf('/'));
  const infoP = await FileSystem.getInfoAsync(parent);
  if (!infoP.exists) {
    await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
  }
}

async function migrateFromLegacyCache(destPath: string, legacyPath: string | null) {
  if (!legacyPath) return;
  const destInfo = await FileSystem.getInfoAsync(destPath);
  if (destInfo.exists) return;
  try {
    const leg = await FileSystem.getInfoAsync(legacyPath);
    if (leg.exists) {
      await FileSystem.copyAsync({ from: legacyPath, to: destPath });
    }
  } catch {
    /* ignore */
  }
}

function legacyBookCache(bookId: number): string | null {
  const c = FileSystem.cacheDirectory;
  return c ? `${c}library-book-${bookId}.pdf` : null;
}

function legacyPaperCache(paperId: number): string | null {
  const c = FileSystem.cacheDirectory;
  return c ? `${c}past-paper-${paperId}.pdf` : null;
}

export type EnsureLocalPdfResult = {
  /** file:// URI under app documents — use for Sharing. */
  localFileUri: string;
  /** True when file was already on disk (no network used). */
  fromOfflineCache: boolean;
};

/**
 * Ensures the textbook PDF exists under a stable app path for offline reopen.
 * If the file is missing and the device is offline / download fails, throws a clear error.
 */
export async function ensureBookPdfLocal(
  bookId: number,
  getToken: () => Promise<string | null>
): Promise<EnsureLocalPdfResult> {
  const dest = bookPath(bookId);
  await ensureParentDirs(dest);
  await migrateFromLegacyCache(dest, legacyBookCache(bookId));

  let info = await FileSystem.getInfoAsync(dest);
  if (info.exists) {
    return { localFileUri: dest, fromOfflineCache: true };
  }

  const token = await getToken();
  if (!token?.trim()) {
    throw new Error('Sign in once while online to download this book for offline reading.');
  }

  const url = `${FULL_API_URL}/books/library/${bookId}/file`;
  try {
    const result = await FileSystem.downloadAsync(url, dest, {
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    if (result.status !== 200) {
      throw new Error(`Download failed (${result.status}).`);
    }
    info = await FileSystem.getInfoAsync(dest);
    if (!info.exists) {
      throw new Error('Download finished but the file is missing.');
    }
    return { localFileUri: result.uri, fromOfflineCache: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const offlineHint =
      /Network|network|Failed to download|Unable to resolve|ECONNREFUSED|timed out|abort/i.test(msg);
    if (offlineHint) {
      throw new Error(
        'No internet connection, or the server could not be reached. Open this book once while online and signed in — it will stay saved for offline reading.'
      );
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}

/**
 * Same as {@link ensureBookPdfLocal} for past-paper PDFs.
 */
export async function ensurePastPaperPdfLocal(
  paperId: number,
  getToken: () => Promise<string | null>
): Promise<EnsureLocalPdfResult> {
  const dest = paperPath(paperId);
  await ensureParentDirs(dest);
  await migrateFromLegacyCache(dest, legacyPaperCache(paperId));

  let info = await FileSystem.getInfoAsync(dest);
  if (info.exists) {
    return { localFileUri: dest, fromOfflineCache: true };
  }

  const token = await getToken();
  if (!token?.trim()) {
    throw new Error('Sign in once while online to download this paper for offline reading.');
  }

  const url = `${FULL_API_URL}/past-papers/manage/${paperId}/pdf`;
  try {
    const result = await FileSystem.downloadAsync(url, dest, {
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    if (result.status !== 200) {
      throw new Error(`Download failed (${result.status}).`);
    }
    info = await FileSystem.getInfoAsync(dest);
    if (!info.exists) {
      throw new Error('Download finished but the file is missing.');
    }
    return { localFileUri: result.uri, fromOfflineCache: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const offlineHint =
      /Network|network|Failed to download|Unable to resolve|ECONNREFUSED|timed out|abort/i.test(msg);
    if (offlineHint) {
      throw new Error(
        'No internet connection, or the server could not be reached. Open this paper once while online and signed in — it will stay saved for offline reading.'
      );
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}

/**
 * URI suitable for WebView: Android uses content:// from FileProvider; iOS uses file://.
 */
export async function webViewUriForLocalPdf(localFileUri: string): Promise<string> {
  if (Platform.OS === 'android') {
    return FileSystem.getContentUriAsync(localFileUri);
  }
  return localFileUri;
}
