/**
 * Unified entry-test syllabus (MDCAT / ECAT) — Punjab Textbook Board + FBISE aligned buckets.
 * Consumed by syllabus browser, MCQ generator topic pickers, revision planner, insights.
 */

export type EntryExam = 'MDCAT' | 'ECAT';
export type ClassLevel = '11' | '12';
export type BoardSource = 'PTB' | 'FBISE';
export type SyllabusTag = 'important' | 'repeated' | 'conceptual';

export type SyllabusTopic = {
  /** Stable id: subject-chapter-topic slug */
  id: string;
  name: string;
  /** Display chapter title (merged PTB/FBISE naming) */
  chapter: string;
  chapterId: string;
  subjectId: EntrySubjectId;
  classLevel: ClassLevel;
  /** Curricula this topic appears in */
  boards: BoardSource[];
  exams: EntryExam[];
  tags: SyllabusTag[];
};

export type SyllabusChapter = {
  id: string;
  name: string;
  subjectId: EntrySubjectId;
  classLevel: ClassLevel;
  topics: SyllabusTopic[];
};

export type EntrySubjectId = 'physics' | 'chemistry' | 'biology' | 'mathematics';

export type SyllabusSubject = {
  id: EntrySubjectId;
  name: string;
  shortName: string;
  description: string;
  /** Primary exam association; Physics/Chem can appear on both — filter uses overlap */
  exams: EntryExam[];
  chapters: SyllabusChapter[];
};

export type SyllabusCatalog = {
  version: string;
  subjects: SyllabusSubject[];
};

export type SyllabusFilters = {
  exam: EntryExam | 'all';
  classLevel: ClassLevel | 'all';
  subjectId: EntrySubjectId | 'all';
  search: string;
};
