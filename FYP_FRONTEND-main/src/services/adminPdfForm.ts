/** Native (uri) or web (File from document picker) — shared by books & past-paper admin uploads. */
export type PickedPdf = { name: string; uri?: string; file?: File };

export function appendPdfToFormData(fd: FormData, field: 'file' | 'files', picked: PickedPdf) {
  const name = picked.name?.toLowerCase().endsWith('.pdf')
    ? picked.name
    : `${picked.name || 'document'}.pdf`;
  if (picked.file) {
    fd.append(field, picked.file, name);
    return;
  }
  if (picked.uri) {
    fd.append(field, {
      uri: picked.uri,
      name,
      type: 'application/pdf',
    } as unknown as Blob);
    return;
  }
  throw new Error('No file or uri in picked PDF');
}
