-- Add a display_order column so exams render in a stable, user-controlled order
-- everywhere in the app (Exam Listings, Weighting, Entries, Marksheets, Reports).

ALTER TABLE exams ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- Backfill: assign 1..N per (school_id, level_id, term) using created_at ASC,
-- so the current chronological order becomes the initial display order.
UPDATE exams AS e
SET display_order = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY school_id, level_id, term
           ORDER BY created_at ASC
         ) AS rn
  FROM exams
) AS sub
WHERE e.id = sub.id
  AND e.display_order IS NULL;

CREATE INDEX IF NOT EXISTS exams_order_idx
  ON exams (school_id, level_id, term, display_order);
