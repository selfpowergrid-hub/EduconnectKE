-- Per-mark sit-status for the Comparative Exam Analysis:
--   NULL      = normal (a score was entered)
--   'missed'  = X — student was registered but missed the exam
--   'cheating'= Y — cheating / disqualified
-- A status row carries no gradeable score; means exclude it, but it still
-- counts under Entry and in the X / Y tallies.
ALTER TABLE marks ADD COLUMN IF NOT EXISTS status TEXT
  CHECK (status IN ('missed', 'cheating'));
