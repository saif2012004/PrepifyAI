-- Fix DatatypeMismatch: column "embedding" is json but inserts use vector(384)
-- Prereq: Postgres with pgvector (image pgvector/pgvector:pg16 — already in docker-compose).
--
-- Run from host (example):
--   docker exec -i prepifyai_postgres psql -U postgres -d PrepifyAI_Main < scripts/migrate_past_papers_embedding_to_pgvector.sql
--
-- If ALTER fails (bad dimensions / corrupt rows), truncate questions then retry:
--   TRUNCATE TABLE past_papers_questions RESTART IDENTITY CASCADE;

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT c.data_type INTO col_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'past_papers_questions'
    AND c.column_name = 'embedding';

  IF col_type IS NULL THEN
    RAISE NOTICE 'Table past_papers_questions or column embedding not found; nothing to do.';
    RETURN;
  END IF;

  IF col_type NOT IN ('json', 'jsonb') THEN
    RAISE NOTICE 'past_papers_questions.embedding is already %; skipping.', col_type;
    RETURN;
  END IF;

  EXECUTE $sql$
    ALTER TABLE past_papers_questions
      ALTER COLUMN embedding TYPE vector(384)
      USING (
        CASE
          WHEN embedding IS NULL THEN NULL
          WHEN jsonb_typeof(embedding::jsonb) = 'array' THEN embedding::text::vector
          WHEN (embedding::jsonb) ? 'values' THEN (embedding::jsonb -> 'values')::text::vector
          ELSE NULL
        END
      )
  $sql$;

  RAISE NOTICE 'past_papers_questions.embedding migrated to vector(384).';
END $$;
