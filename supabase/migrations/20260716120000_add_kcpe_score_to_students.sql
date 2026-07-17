-- Add baseline (KCPE / KSSEA) score to students for VAP tracking
ALTER TABLE students ADD COLUMN IF NOT EXISTS kcpe_score INTEGER;

-- Comment for clarity
COMMENT ON COLUMN students.kcpe_score IS 'Entry baseline score (e.g. KCPE out of 500) used for Value Added Progress (VAP) calculation on the broadsheet';
