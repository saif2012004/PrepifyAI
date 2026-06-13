import type { Href } from 'expo-router';

/** Open Prepare-with-AI MCQs with topic + class/subject for RAG generation; answers submit via existing API when signed in. */
export function hotTopicMcqPracticeHref(input: {
  topic: string;
  subject: string;
  classLevel: string | 'all';
}): Href {
  const cl = input.classLevel === 'all' ? '10' : input.classLevel;
  return {
    pathname: '/prepare-with-ai/generate-mcqs',
    params: {
      subjectName: input.subject,
      board: 'FBISE',
      classLevel: cl,
      practiceTopic: input.topic,
    },
  } as Href;
}
