-- Billing rule refinement: an UNSPECIFIED student stays on the plain
-- "All students" sheet for their grade. Category pricing applies only when:
--   1. the student is explicitly assigned a fee category, OR
--   2. the student was explicitly marked a Boarder at admission
--      (the boarder toggle is a specification; 'day' is just the default).
--
-- Previously the resolver mapped default-'day' students onto the system
-- Day Scholar category, which would have silently applied Day Scholar sheet
-- overrides to every untouched student.

CREATE OR REPLACE FUNCTION public.student_fee_category(p_student_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    s.fee_category_id,
    CASE WHEN s.boarding_status = 'boarder' THEN (
      SELECT fc.id FROM fee_categories fc
      WHERE fc.school_id = s.school_id AND fc.kind = 'boarder'
      LIMIT 1
    ) END
  )
  FROM students s WHERE s.id = p_student_id;
$$;

REVOKE ALL ON FUNCTION public.student_fee_category(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_fee_category(UUID) TO authenticated, service_role;
