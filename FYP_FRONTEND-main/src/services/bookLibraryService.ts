import * as FileSystem from 'expo-file-system/legacy';
import { apiClient, FULL_API_URL } from './api';

export type LibraryPdfItem = {
  book_id: number;
  subject_id: number;
  title: string;
  original_filename: string;
  file_size_bytes: number | null;
  added_on: string | null;
};

export async function listLibraryPdfs(subjectId: number): Promise<LibraryPdfItem[]> {
  return apiClient.get(`/books/library?subject_id=${subjectId}`, true);
}

/**
 * Downloads the PDF with the user token and returns a local file URI suitable for WebView or Sharing.
 */
export async function downloadLibraryPdfToCache(bookId: number): Promise<string> {
  const token = await apiClient.getToken();
  if (!token) {
    throw new Error('Sign in to open books.');
  }
  const url = `${FULL_API_URL}/books/library/${bookId}/file`;
  const base = FileSystem.cacheDirectory;
  if (!base) {
    throw new Error('Cache directory is not available on this device.');
  }
  const dest = `${base}library-book-${bookId}.pdf`;
  const result = await FileSystem.downloadAsync(url, dest, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.status !== 200) {
    throw new Error(`Download failed (${result.status})`);
  }
  return result.uri;
}
