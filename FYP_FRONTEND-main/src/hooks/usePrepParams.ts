import { useLocalSearchParams } from 'expo-router';

function one(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * Normalized params for Prepare-with-AI flows (board + class must flow from subject selection).
 */
export function usePrepParams() {
  const p = useLocalSearchParams();

  return {
    subjectId: one(p.subjectId as string | string[] | undefined),
    subjectName: one(p.subjectName as string | string[] | undefined) || 'Subject',
    board: one(p.board as string | string[] | undefined) || 'FBISE',
    classLevel: one(p.classLevel as string | string[] | undefined) || '10',
    /** Optional topic prefill when opening Practice Setup from Performance, etc. */
    practiceTopic: one(p.practiceTopic as string | string[] | undefined) || '',
  };
}
