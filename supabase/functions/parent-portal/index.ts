// Edge Function: parent-portal
//
// Public lookup used by the parent/guardian login page. Given a school
// login_code + parent phone + a child's admission number, it verifies the
// pair and returns, for every child on that phone at that school:
//   - basic profile (name, grade, stream, photo)
//   - exam results (per exam, per subject, with totals)
//   - a fee summary (billed / paid / balance + payment history)
//
// NO Supabase session is created. The (school_code + adm_no + phone) triple is
// the gate. All reads run with the service role, so the underlying tables keep
// their admin-only RLS — anonymous users never get broad table access.
//
// Security notes:
//   - adm_no is unique per school, so it anchors a single-row lookup; the phone
//     is the verifier. A mismatch returns a generic 401 (no field disclosure).
//   - This endpoint is read-only and should be rate-limited at the edge/gateway
//     to blunt enumeration. An SMS-OTP step can be layered on later without
//     changing this contract.
//
// Deploy:
//   supabase functions deploy parent-portal --no-verify-jwt
//
// (--no-verify-jwt is required: parents are anonymous on the login page.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Mirrors public.normalize_phone(): canonical Kenyan form so 0712…, +254712…,
// 254712… and 712… all compare equal.
function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  let digits = p.replace(/[^0-9]/g, "");
  if (digits === "") return null;
  if (digits.length === 12 && digits.startsWith("254")) {
    digits = "0" + digits.slice(3);
  } else if (digits.length === 9) {
    digits = "0" + digits;
  }
  return digits;
}

const GRADE_LABEL: Record<string, string> = {
  pp1: "PP1", pp2: "PP2",
  g1: "Grade 1", g2: "Grade 2", g3: "Grade 3", g4: "Grade 4", g5: "Grade 5", g6: "Grade 6",
  g7: "Grade 7", g8: "Grade 8", g9: "Grade 9",
  g10: "Grade 10", g11: "Grade 11", g12: "Grade 12",
  f3: "Form 3", f4: "Form 4",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: { school_code?: string; phone?: string; adm_no?: string; year?: number };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const code = payload.school_code?.trim();
  const admNo = payload.adm_no?.trim();
  const phoneInput = normalizePhone(payload.phone);
  const year = Number.isInteger(payload.year) ? payload.year! : new Date().getFullYear();

  if (!code) return json({ error: "school_code is required" }, 400);
  if (!admNo) return json({ error: "adm_no is required" }, 400);
  if (!phoneInput) return json({ error: "A valid phone number is required" }, 400);
  if (code.length > 32) return json({ error: "school_code too long" }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Resolve the school from its SCH-### code (or the legacy login_code).
  const { data: schoolId, error: resolveErr } = await admin
    .rpc("resolve_school_by_code", { p: code });
  if (resolveErr) return json({ error: resolveErr.message }, 500);
  if (!schoolId) return json({ error: "School code not recognised" }, 404);

  const { data: school, error: schoolErr } = await admin
    .from("school_registrations")
    .select("id, school_name, school_code, login_code")
    .eq("id", schoolId)
    .single();
  if (schoolErr || !school) return json({ error: "School code not recognised" }, 404);

  // 2. Anchor on (school_id, adm_no) — unique per school — then verify the phone.
  const { data: matched, error: matchErr } = await admin
    .from("students")
    .select("id, parent_phone")
    .eq("school_id", school.id)
    .eq("adm_no", admNo)
    .maybeSingle();

  // Generic failure: never reveal which of the two fields was wrong.
  if (matchErr || !matched || normalizePhone(matched.parent_phone) !== phoneInput) {
    return json({ error: "Those details don't match our records. Check the phone number and admission number." }, 401);
  }

  // 3. All children of this guardian at this school (same stored phone).
  const { data: children, error: childErr } = await admin
    .from("students")
    .select("id, adm_no, first_name, last_name, gender, level_id, stream_id, photo_path")
    .eq("school_id", school.id)
    .eq("parent_phone", matched.parent_phone)
    .order("adm_no");
  if (childErr) return json({ error: childErr.message }, 500);

  const kids = children && children.length ? children : [];

  // 4. School-wide reference maps (one fetch, reused for every child).
  const [examsRes, subjectsRes, streamsRes] = await Promise.all([
    admin.from("exams").select("id, name, term, total_marks, level_id, display_order").eq("school_id", school.id),
    admin.from("subjects").select("id, name").eq("school_id", school.id),
    admin.from("streams").select("id, name").eq("school_id", school.id),
  ]);
  if (examsRes.error) return json({ error: examsRes.error.message }, 500);
  if (subjectsRes.error) return json({ error: subjectsRes.error.message }, 500);

  const examMap = new Map((examsRes.data || []).map((e) => [e.id, e]));
  const subjectMap = new Map((subjectsRes.data || []).map((s) => [s.id, s.name]));
  const streamMap = new Map((streamsRes.data || []).map((s) => [s.id, s.name]));

  // 5. Build each child's results + fee summary.
  const result = [];
  for (const child of kids) {
    const { data: marks } = await admin
      .from("marks")
      .select("exam_id, subject_id, score")
      .eq("student_id", child.id);

    // Group marks by exam.
    const byExam = new Map<string, { score: number; total: number; entries: any[] }>();
    (marks || []).forEach((m) => {
      const exam = examMap.get(m.exam_id);
      if (!exam) return;
      if (!byExam.has(m.exam_id)) byExam.set(m.exam_id, { score: 0, total: 0, entries: [] });
      const bucket = byExam.get(m.exam_id)!;
      const subjName = subjectMap.get(m.subject_id) || "—";
      const max = exam.total_marks || 100;
      bucket.entries.push({ subject: subjName, score: m.score, total_marks: max });
      bucket.score += Number(m.score) || 0;
      bucket.total += max;
    });

    const results = [...byExam.entries()]
      .map(([examId, b]) => {
        const exam = examMap.get(examId)!;
        return {
          exam_id: examId,
          exam_name: exam.name,
          term: exam.term,
          display_order: exam.display_order ?? 0,
          subjects: b.entries.sort((a, z) => a.subject.localeCompare(z.subject)),
          total_score: b.score,
          total_possible: b.total,
        };
      })
      .sort((a, z) => (a.term || "").localeCompare(z.term || "") || a.display_order - z.display_order);

    // Fee summary via the shared SECURITY DEFINER function (service role = authorized).
    const { data: fees } = await admin.rpc("get_student_fee_summary", {
      p_student_id: child.id,
      p_year: year,
    });

    result.push({
      id: child.id,
      adm_no: child.adm_no,
      name: `${child.first_name || ""} ${child.last_name || ""}`.trim(),
      gender: child.gender,
      grade: GRADE_LABEL[child.level_id] || child.level_id,
      stream: child.stream_id ? streamMap.get(child.stream_id) || null : null,
      photo_url: child.photo_path
        ? `${SUPABASE_URL}/storage/v1/object/public/student-photos/${child.photo_path}`
        : null,
      results,
      fees: fees || null,
    });
  }

  return json({
    school: { id: school.id, name: school.school_name, school_code: school.school_code, login_code: school.login_code },
    year,
    children: result,
  });
});
