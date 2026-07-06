-- Separate "marks out of" (denominator) from "percentage contribution" (weight)
-- Until now, exams.weight has been doing double duty.
-- After this migration:
--   exams.total_marks = denominator the exam is graded against (e.g. 30, 50, 100)
--   exams.weight      = % contribution to the weighted average (must sum to 100 per scope)

ALTER TABLE exams ADD COLUMN IF NOT EXISTS total_marks INTEGER NOT NULL DEFAULT 100;

-- Existing rows: the app has implicitly assumed marks are out of 100,
-- so backfilling to 100 preserves every historical calculation.
UPDATE exams SET total_marks = 100 WHERE total_marks IS NULL OR total_marks = 0;
