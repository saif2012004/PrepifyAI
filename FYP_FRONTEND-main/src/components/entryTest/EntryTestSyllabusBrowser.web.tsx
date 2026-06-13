import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ENTRY_TEST_SYLLABUS_CATALOG,
  filterSyllabusCatalog,
  flattenTopics,
} from '../../syllabus';
import type { ClassLevel, EntryExam, EntrySubjectId, SyllabusFilters, SyllabusTag } from '../../syllabus';

const EXAMS: Array<{ value: EntryExam | 'all'; label: string }> = [
  { value: 'all', label: 'All exams' },
  { value: 'MDCAT', label: 'MDCAT' },
  { value: 'ECAT', label: 'ECAT' },
];

const CLASSES: Array<{ value: ClassLevel | 'all'; label: string }> = [
  { value: 'all', label: 'Class 11 + 12' },
  { value: '11', label: 'Class 11' },
  { value: '12', label: 'Class 12' },
];

const SUBJECTS: Array<{ value: EntrySubjectId | 'all'; label: string }> = [
  { value: 'all', label: 'All subjects' },
  { value: 'physics', label: 'Physics' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'biology', label: 'Biology' },
  { value: 'mathematics', label: 'Mathematics' },
];

function tagClasses(tag: SyllabusTag): string {
  if (tag === 'important') return 'border-amber-500/60 bg-amber-500/15 text-amber-200';
  if (tag === 'repeated') return 'border-violet-500/50 bg-violet-500/10 text-violet-200';
  return 'border-sky-500/50 bg-sky-500/10 text-sky-200';
}

export default function EntryTestSyllabusBrowser() {
  const router = useRouter();
  const [exam, setExam] = useState<EntryExam | 'all'>('all');
  const [classLevel, setClassLevel] = useState<ClassLevel | 'all'>('all');
  const [subjectId, setSubjectId] = useState<EntrySubjectId | 'all'>('all');
  const [search, setSearch] = useState('');
  const [openSubjects, setOpenSubjects] = useState<Record<string, boolean>>({});
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});

  const filters: SyllabusFilters = useMemo(
    () => ({ exam, classLevel, subjectId, search }),
    [exam, classLevel, subjectId, search]
  );

  const filteredSubjects = useMemo(
    () => filterSyllabusCatalog(ENTRY_TEST_SYLLABUS_CATALOG, filters),
    [filters]
  );

  const stats = useMemo(() => {
    const topics = flattenTopics(filteredSubjects);
    const important = topics.filter((t) => t.tags.includes('important')).length;
    return { topics: topics.length, chapters: filteredSubjects.reduce((n, s) => n + s.chapters.length, 0), important };
  }, [filteredSubjects]);

  const toggleSubject = (id: string) => {
    setOpenSubjects((s) => ({ ...s, [id]: !s[id] }));
  };

  const toggleChapter = (id: string) => {
    setOpenChapters((s) => ({ ...s, [id]: !s[id] }));
  };

  const scrollToMain = () => {
    document.getElementById('entry-test-syllabus-scroll-target')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full overflow-x-hidden overflow-y-visible bg-slate-950 text-slate-100 selection:bg-emerald-500/25 [&_button:not(:disabled)]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-4 inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 active:scale-[0.99]"
          >
            ← Back
          </button>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Unified syllabus</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">MDCAT &amp; ECAT (PTB + FBISE)</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            Class 11–12 topics merged from Punjab Board and FBISE tracks. Filter by exam, class, and subject; search
            across chapters and topic names. Highlights show high-yield topics for planners and generators.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-300">
              {stats.topics} topics
            </span>
            <span className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-300">
              {stats.chapters} chapters
            </span>
            <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-medium text-amber-200">
              {stats.important} important
            </span>
          </div>
          <button
            type="button"
            onClick={scrollToMain}
            className="mt-5 inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:border-slate-500 hover:bg-slate-700 active:scale-[0.99]"
          >
            Scroll down for filters & syllabus
            <span aria-hidden className="text-base leading-none">
              ↓
            </span>
          </button>
        </header>

        <section
          id="entry-test-syllabus-scroll-target"
          className="mb-8 scroll-mt-6 rounded-2xl border border-slate-700/80 bg-slate-900/80 p-5 shadow-xl shadow-black/40 sm:p-6"
        >
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Filters</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-400">Exam</label>
              <select
                value={exam}
                onChange={(e) => setExam(e.target.value as EntryExam | 'all')}
                className="w-full cursor-pointer rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white transition-colors hover:border-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {EXAMS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-400">Class</label>
              <select
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value as ClassLevel | 'all')}
                className="w-full cursor-pointer rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white transition-colors hover:border-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {CLASSES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-400">Subject</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value as EntrySubjectId | 'all')}
                className="w-full cursor-pointer rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white transition-colors hover:border-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {SUBJECTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-1">
              <label className="mb-2 block text-xs font-semibold text-slate-400">Search</label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Topic or chapter…"
                className="w-full cursor-text rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 transition-shadow focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>
        </section>

        {filteredSubjects.length === 0 ? (
          <p className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-8 text-center text-sm text-slate-400">
            No topics match these filters. Try &quot;All exams&quot; or clear search.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredSubjects.map((sub) => {
              const open = !!openSubjects[sub.id];
              const topicCount = sub.chapters.reduce((n, ch) => n + ch.topics.length, 0);
              return (
                <div
                  key={sub.id}
                  className="flex flex-col overflow-x-hidden overflow-y-visible rounded-2xl border border-slate-700/90 bg-gradient-to-b from-slate-900 to-slate-950 shadow-lg shadow-black/30"
                >
                  <button
                    type="button"
                    onClick={() => toggleSubject(sub.id)}
                    className="flex w-full items-start justify-between gap-3 p-5 text-left transition-colors hover:bg-slate-800/50 active:bg-slate-800/70"
                  >
                    <div>
                      <h3 className="text-lg font-bold text-white">{sub.name}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">{sub.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {sub.exams.map((e) => (
                          <span
                            key={e}
                            className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300"
                          >
                            {e}
                          </span>
                        ))}
                        <span className="rounded-md border border-slate-600 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                          PTB + FBISE
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-2xl font-black text-cyan-400">{topicCount}</p>
                      <p className="text-[10px] font-semibold uppercase text-slate-500">topics</p>
                      <p className="mt-2 text-xs font-bold text-slate-400">{open ? '▲' : '▼'}</p>
                    </div>
                  </button>

                  {open ? (
                    <div className="border-t border-slate-700/80 px-3 pb-4 pt-1">
                      {sub.chapters.map((ch) => {
                        const chOpen = !!openChapters[ch.id];
                        return (
                          <div key={ch.id} className="mb-2 mt-2 rounded-xl border border-slate-700/60 bg-slate-950/80">
                            <button
                              type="button"
                              onClick={() => toggleChapter(ch.id)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800/40 active:bg-slate-800/60"
                            >
                              <span>
                                <span className="mr-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                                  {ch.classLevel}
                                </span>
                                {ch.name}
                              </span>
                              <span className="text-slate-500">{chOpen ? '−' : '+'}</span>
                            </button>
                            {chOpen ? (
                              <ul className="space-y-2 border-t border-slate-800 px-3 py-3">
                                {ch.topics.map((t) => {
                                  const isImportant = t.tags.includes('important');
                                  return (
                                    <li
                                      key={t.id}
                                      className={`rounded-lg border px-3 py-2.5 text-sm ${
                                        isImportant
                                          ? 'border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/20'
                                          : 'border-slate-700/80 bg-slate-900/50'
                                      }`}
                                    >
                                      <p className={`font-medium leading-snug ${isImportant ? 'text-amber-100' : 'text-slate-200'}`}>
                                        {t.name}
                                        {isImportant ? (
                                          <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                                            High yield
                                          </span>
                                        ) : null}
                                      </p>
                                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        {t.boards.map((b) => (
                                          <span
                                            key={b}
                                            className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400"
                                          >
                                            {b}
                                          </span>
                                        ))}
                                        {t.tags.map((tag) => (
                                          <span
                                            key={tag}
                                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${tagClasses(tag)}`}
                                          >
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-slate-600">
          Catalog v{ENTRY_TEST_SYLLABUS_CATALOG.version} — same structure is importable for MCQ generator, revision
          planner, and past-paper insights.
        </p>
      </div>
    </div>
  );
}
