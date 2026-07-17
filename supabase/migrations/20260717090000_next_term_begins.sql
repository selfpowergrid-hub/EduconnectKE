-- "Next Term Begins" date, printed on report cards (and useful elsewhere).
ALTER TABLE school_information ADD COLUMN IF NOT EXISTS next_term_begins DATE;
