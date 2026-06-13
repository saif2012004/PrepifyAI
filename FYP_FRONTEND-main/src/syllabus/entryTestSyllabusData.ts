import type {
  BoardSource,
  ClassLevel,
  EntryExam,
  EntrySubjectId,
  SyllabusCatalog,
  SyllabusChapter,
  SyllabusFilters,
  SyllabusSubject,
  SyllabusTag,
  SyllabusTopic,
} from './entryTestSyllabus.types';

function topic(
  id: string,
  name: string,
  chapter: string,
  chapterId: string,
  subjectId: EntrySubjectId,
  classLevel: ClassLevel,
  boards: BoardSource[],
  exams: EntryExam[],
  tags: SyllabusTag[],
): SyllabusTopic {
  return {
    id,
    name,
    chapter,
    chapterId,
    subjectId,
    classLevel,
    boards,
    exams,
    tags,
  };
}

/** Curated merge: PTB + FBISE Class 11/12 — duplicate concepts collapsed, boards unioned. */
export const ENTRY_TEST_SYLLABUS_CATALOG: SyllabusCatalog = {
  version: '2026.1-local',
  subjects: [
    {
      id: 'physics',
      name: 'Physics',
      shortName: 'Phy',
      description: 'Mechanics, waves, electricity, modern physics — PTB + FBISE aligned.',
      exams: ['MDCAT', 'ECAT'],
      chapters: [
        {
          id: 'phy-11-measurement',
          name: 'Measurements & physical quantities',
          subjectId: 'physics',
          classLevel: '11',
          topics: [
            topic(
              'phy-11-measurement-units',
              'SI units, prefixes, significant figures',
              'Measurements & physical quantities',
              'phy-11-measurement',
              'physics',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important', 'conceptual'],
            ),
            topic(
              'phy-11-measurement-errors',
              'Random vs systematic errors, precision & accuracy',
              'Measurements & physical quantities',
              'phy-11-measurement',
              'physics',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['conceptual'],
            ),
          ],
        },
        {
          id: 'phy-11-vectors',
          name: 'Vectors & equilibrium',
          subjectId: 'physics',
          classLevel: '11',
          topics: [
            topic(
              'phy-11-vectors-resolution',
              'Vector resolution, dot & cross product (basics)',
              'Vectors & equilibrium',
              'phy-11-vectors',
              'physics',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important', 'repeated'],
            ),
            topic(
              'phy-11-moments',
              'Torque, equilibrium of rigid bodies',
              'Vectors & equilibrium',
              'phy-11-vectors',
              'physics',
              '11',
              ['PTB', 'FBISE'],
              ['ECAT'],
              ['conceptual'],
            ),
          ],
        },
        {
          id: 'phy-11-motion',
          name: 'Motion in one & two dimensions',
          subjectId: 'physics',
          classLevel: '11',
          topics: [
            topic(
              'phy-11-kinematics-graphs',
              'Displacement, velocity, acceleration; v–t & s–t graphs',
              'Motion in one & two dimensions',
              'phy-11-motion',
              'physics',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important', 'repeated'],
            ),
            topic(
              'phy-11-projectile',
              'Projectile motion — range, time of flight, max height',
              'Motion in one & two dimensions',
              'phy-11-motion',
              'physics',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important'],
            ),
          ],
        },
        {
          id: 'phy-12-electrostatics',
          name: 'Electrostatics',
          subjectId: 'physics',
          classLevel: '12',
          topics: [
            topic(
              'phy-12-coulomb-field',
              'Coulomb’s law, electric field & field lines',
              'Electrostatics',
              'phy-12-electrostatics',
              'physics',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important', 'repeated'],
            ),
            topic(
              'phy-12-potential-capacitors',
              'Electric potential, capacitors & energy storage',
              'Electrostatics',
              'phy-12-electrostatics',
              'physics',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important', 'conceptual'],
            ),
          ],
        },
        {
          id: 'phy-12-current',
          name: 'Current electricity',
          subjectId: 'physics',
          classLevel: '12',
          topics: [
            topic(
              'phy-12-ohms-power',
              'Ohm’s law, resistivity, power in circuits',
              'Current electricity',
              'phy-12-current',
              'physics',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important', 'repeated'],
            ),
            topic(
              'phy-12-kirchhoff',
              'Kirchhoff’s laws, series & parallel combinations',
              'Current electricity',
              'phy-12-current',
              'physics',
              '12',
              ['PTB', 'FBISE'],
              ['ECAT'],
              ['conceptual'],
            ),
          ],
        },
        {
          id: 'phy-12-modern',
          name: 'Atomic spectra & modern physics',
          subjectId: 'physics',
          classLevel: '12',
          topics: [
            topic(
              'phy-12-photoelectric',
              'Photoelectric effect, photon energy',
              'Atomic spectra & modern physics',
              'phy-12-modern',
              'physics',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important'],
            ),
            topic(
              'phy-12-bohr',
              'Bohr model, hydrogen spectrum',
              'Atomic spectra & modern physics',
              'phy-12-modern',
              'physics',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT'],
              ['conceptual'],
            ),
          ],
        },
      ],
    },
    {
      id: 'chemistry',
      name: 'Chemistry',
      shortName: 'Chem',
      description: 'Physical, organic & inorganic — merged PTB/FBISE chapter maps.',
      exams: ['MDCAT', 'ECAT'],
      chapters: [
        {
          id: 'chem-11-stoichiometry',
          name: 'Stoichiometry & atomic structure',
          subjectId: 'chemistry',
          classLevel: '11',
          topics: [
            topic(
              'chem-11-mole-concept',
              'Mole, Avogadro’s number, empirical & molecular formulas',
              'Stoichiometry & atomic structure',
              'chem-11-stoichiometry',
              'chemistry',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important', 'repeated'],
            ),
            topic(
              'chem-11-electron-config',
              'Electronic configuration, periodic trends',
              'Stoichiometry & atomic structure',
              'chem-11-stoichiometry',
              'chemistry',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important', 'conceptual'],
            ),
          ],
        },
        {
          id: 'chem-11-bonding',
          name: 'Chemical bonding',
          subjectId: 'chemistry',
          classLevel: '11',
          topics: [
            topic(
              'chem-11-ionic-covalent',
              'Ionic vs covalent bonding, Lewis structures',
              'Chemical bonding',
              'chem-11-bonding',
              'chemistry',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important'],
            ),
            topic(
              'chem-11-vsepr',
              'VSEPR shapes, hybridization (sp, sp², sp³)',
              'Chemical bonding',
              'chem-11-bonding',
              'chemistry',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['conceptual', 'repeated'],
            ),
          ],
        },
        {
          id: 'chem-12-equilibrium',
          name: 'Chemical equilibrium',
          subjectId: 'chemistry',
          classLevel: '12',
          topics: [
            topic(
              'chem-12-kc-kp',
              'Kc, Kp, Le Chatelier’s principle',
              'Chemical equilibrium',
              'chem-12-equilibrium',
              'chemistry',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important', 'repeated'],
            ),
            topic(
              'chem-12-acid-base',
              'Acids & bases, pH, buffers (intro)',
              'Chemical equilibrium',
              'chem-12-equilibrium',
              'chemistry',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT'],
              ['conceptual'],
            ),
          ],
        },
        {
          id: 'chem-12-organic',
          name: 'Organic chemistry fundamentals',
          subjectId: 'chemistry',
          classLevel: '12',
          topics: [
            topic(
              'chem-12-nomenclature',
              'IUPAC nomenclature of hydrocarbons',
              'Organic chemistry fundamentals',
              'chem-12-organic',
              'chemistry',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['important'],
            ),
            topic(
              'chem-12-isomerism',
              'Structural & stereoisomerism (basics)',
              'Organic chemistry fundamentals',
              'chem-12-organic',
              'chemistry',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT', 'ECAT'],
              ['repeated', 'conceptual'],
            ),
          ],
        },
      ],
    },
    {
      id: 'biology',
      name: 'Biology',
      shortName: 'Bio',
      description: 'Cell biology, genetics, human physiology — MDCAT focus.',
      exams: ['MDCAT'],
      chapters: [
        {
          id: 'bio-11-cell',
          name: 'Cell biology',
          subjectId: 'biology',
          classLevel: '11',
          topics: [
            topic(
              'bio-11-cell-structure',
              'Prokaryotic vs eukaryotic cell, organelles & functions',
              'Cell biology',
              'bio-11-cell',
              'biology',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT'],
              ['important', 'repeated'],
            ),
            topic(
              'bio-11-membrane-transport',
              'Plasma membrane, passive & active transport',
              'Cell biology',
              'bio-11-cell',
              'biology',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT'],
              ['important', 'conceptual'],
            ),
          ],
        },
        {
          id: 'bio-11-bioenergetics',
          name: 'Bioenergetics',
          subjectId: 'biology',
          classLevel: '11',
          topics: [
            topic(
              'bio-11-photosynthesis',
              'Photosynthesis — light & dark reactions',
              'Bioenergetics',
              'bio-11-bioenergetics',
              'biology',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT'],
              ['important'],
            ),
            topic(
              'bio-11-respiration',
              'Cellular respiration, glycolysis, Krebs, ETC (overview)',
              'Bioenergetics',
              'bio-11-bioenergetics',
              'biology',
              '11',
              ['PTB', 'FBISE'],
              ['MDCAT'],
              ['repeated', 'conceptual'],
            ),
          ],
        },
        {
          id: 'bio-12-genetics',
          name: 'Genetics & evolution',
          subjectId: 'biology',
          classLevel: '12',
          topics: [
            topic(
              'bio-12-mendel',
              'Mendelian inheritance, monohybrid & dihybrid crosses',
              'Genetics & evolution',
              'bio-12-genetics',
              'biology',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT'],
              ['important', 'repeated'],
            ),
            topic(
              'bio-12-dna-replication',
              'DNA structure, replication & transcription (basics)',
              'Genetics & evolution',
              'bio-12-genetics',
              'biology',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT'],
              ['important', 'conceptual'],
            ),
          ],
        },
        {
          id: 'bio-12-human-systems',
          name: 'Human physiology (systems overview)',
          subjectId: 'biology',
          classLevel: '12',
          topics: [
            topic(
              'bio-12-heart-blood',
              'Cardiovascular system — heart, blood vessels, blood groups',
              'Human physiology (systems overview)',
              'bio-12-human-systems',
              'biology',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT'],
              ['important', 'repeated'],
            ),
            topic(
              'bio-12-nervous',
              'Neuron, synapse, CNS vs PNS',
              'Human physiology (systems overview)',
              'bio-12-human-systems',
              'biology',
              '12',
              ['PTB', 'FBISE'],
              ['MDCAT'],
              ['conceptual'],
            ),
          ],
        },
      ],
    },
    {
      id: 'mathematics',
      name: 'Mathematics',
      shortName: 'Math',
      description: 'Algebra, trigonometry, calculus — ECAT engineering stream.',
      exams: ['ECAT'],
      chapters: [
        {
          id: 'math-11-trig',
          name: 'Trigonometry',
          subjectId: 'mathematics',
          classLevel: '11',
          topics: [
            topic(
              'math-11-trig-identities',
              'Fundamental identities, sum & difference formulas',
              'Trigonometry',
              'math-11-trig',
              'mathematics',
              '11',
              ['PTB', 'FBISE'],
              ['ECAT'],
              ['important', 'repeated'],
            ),
            topic(
              'math-11-trig-equations',
              'Trigonometric equations & inverse functions',
              'Trigonometry',
              'math-11-trig',
              'mathematics',
              '11',
              ['PTB', 'FBISE'],
              ['ECAT'],
              ['conceptual'],
            ),
          ],
        },
        {
          id: 'math-11-functions',
          name: 'Functions & limits',
          subjectId: 'mathematics',
          classLevel: '11',
          topics: [
            topic(
              'math-11-domain-range',
              'Domain, range, composition of functions',
              'Functions & limits',
              'math-11-functions',
              'mathematics',
              '11',
              ['PTB', 'FBISE'],
              ['ECAT'],
              ['important'],
            ),
            topic(
              'math-11-limits',
              'Limits of algebraic functions, continuity',
              'Functions & limits',
              'math-11-functions',
              'mathematics',
              '11',
              ['PTB', 'FBISE'],
              ['ECAT'],
              ['important', 'repeated'],
            ),
          ],
        },
        {
          id: 'math-12-differentiation',
          name: 'Differentiation',
          subjectId: 'mathematics',
          classLevel: '12',
          topics: [
            topic(
              'math-12-derivatives-rules',
              'Product, quotient, chain rule; derivatives of standard functions',
              'Differentiation',
              'math-12-differentiation',
              'mathematics',
              '12',
              ['PTB', 'FBISE'],
              ['ECAT'],
              ['important', 'repeated'],
            ),
            topic(
              'math-12-applications',
              'Maxima/minima, rates of change',
              'Differentiation',
              'math-12-differentiation',
              'mathematics',
              '12',
              ['PTB', 'FBISE'],
              ['ECAT'],
              ['conceptual'],
            ),
          ],
        },
        {
          id: 'math-12-integration',
          name: 'Integration',
          subjectId: 'mathematics',
          classLevel: '12',
          topics: [
            topic(
              'math-12-antiderivatives',
              'Indefinite integrals, standard forms',
              'Integration',
              'math-12-integration',
              'mathematics',
              '12',
              ['PTB', 'FBISE'],
              ['ECAT'],
              ['important'],
            ),
            topic(
              'math-12-definite-area',
              'Definite integrals, area under curves',
              'Integration',
              'math-12-integration',
              'mathematics',
              '12',
              ['PTB', 'FBISE'],
              ['ECAT'],
              ['important', 'repeated'],
            ),
          ],
        },
      ],
    },
  ],
};

function examMatchesTopic(exam: EntryExam | 'all', topic: SyllabusTopic): boolean {
  if (exam === 'all') return true;
  return topic.exams.includes(exam);
}

function examMatchesSubject(exam: EntryExam | 'all', subject: SyllabusSubject): boolean {
  if (exam === 'all') return true;
  return subject.exams.includes(exam);
}

function filterChapter(
  ch: SyllabusChapter,
  filters: SyllabusFilters,
): SyllabusChapter | null {
  if (filters.classLevel !== 'all' && ch.classLevel !== filters.classLevel) return null;
  const q = filters.search.trim().toLowerCase();
  const topics = ch.topics.filter((t) => {
    if (filters.classLevel !== 'all' && t.classLevel !== filters.classLevel) return false;
    if (!examMatchesTopic(filters.exam, t)) return false;
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.chapter.toLowerCase().includes(q) ||
      ch.name.toLowerCase().includes(q)
    );
  });
  if (!topics.length) return null;
  return { ...ch, topics };
}

/** Filter catalog by exam, class, subject, and free-text search (topic/chapter). */
export function filterSyllabusCatalog(
  catalog: SyllabusCatalog,
  filters: SyllabusFilters,
): SyllabusSubject[] {
  return catalog.subjects
    .filter((s) => {
      if (filters.subjectId !== 'all' && s.id !== filters.subjectId) return false;
      if (!examMatchesSubject(filters.exam, s)) return false;
      return true;
    })
    .map((s) => {
      const chapters = s.chapters
        .map((ch) => filterChapter(ch, filters))
        .filter((c): c is SyllabusChapter => c !== null);
      return { ...s, chapters };
    })
    .filter((s) => s.chapters.length > 0);
}

export function flattenTopics(subjects: SyllabusSubject[]): SyllabusTopic[] {
  const out: SyllabusTopic[] = [];
  for (const s of subjects) {
    for (const ch of s.chapters) {
      out.push(...ch.topics);
    }
  }
  return out;
}

/** Topic ids for weak-topic / revision weighting. */
export function getImportantTopicIds(subjects: SyllabusSubject[]): string[] {
  return flattenTopics(subjects)
    .filter((t) => t.tags.includes('important'))
    .map((t) => t.id);
}

export function getSubjectById(
  catalog: SyllabusCatalog,
  id: EntrySubjectId,
): SyllabusSubject | undefined {
  return catalog.subjects.find((s) => s.id === id);
}

const DISPLAY_TO_SUBJECT: Record<string, EntrySubjectId> = {
  Physics: 'physics',
  Chemistry: 'chemistry',
  Biology: 'biology',
  Mathematics: 'mathematics',
};

/**
 * Topic names from the unified syllabus for MCQ lab chips (exam + subject aware).
 * Important-tagged topics first; empty if the subject is not on that exam (e.g. Biology + ECAT).
 */
export function syllabusTopicChipsForMcq(params: {
  exam: 'mdcat' | 'ecat';
  subjectDisplay: string;
}): string[] {
  const subjectId = DISPLAY_TO_SUBJECT[params.subjectDisplay];
  if (!subjectId) return [];
  const exam: EntryExam = params.exam === 'mdcat' ? 'MDCAT' : 'ECAT';
  const topics = flattenTopics(
    filterSyllabusCatalog(ENTRY_TEST_SYLLABUS_CATALOG, {
      exam,
      classLevel: 'all',
      subjectId,
      search: '',
    }),
  );
  return [...topics]
    .sort((a, b) => {
      const ai = a.tags.includes('important') ? 0 : 1;
      const bi = b.tags.includes('important') ? 0 : 1;
      return ai - bi || a.name.localeCompare(b.name);
    })
    .map((t) => t.name);
}
