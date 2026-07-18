// Edge Function: send-report-card
//
// Emails a student's report card PDF to their parent/guardian via Resend.
// The caller must be an authenticated school user; RLS proves membership —
// we look the student up with the CALLER's token, so a student outside the
// caller's school simply isn't visible and the send is refused.
//
// Deploy:
//   supabase functions deploy send-report-card
//
// Required function secrets:
//   SUPABASE_URL, SUPABASE_ANON_KEY            (present by default)
//   RESEND_API_KEY                              (from resend.com → API Keys)
// Optional:
//   REPORT_FROM_EMAIL   e.g. "St. Pius Reports <reports@logiq.co.ke>"
//                       (domain must be verified in Resend; defaults to
//                        Resend's onboarding address for testing)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("REPORT_FROM_EMAIL") || "LogiQ-Taaluma <onboarding@resend.dev>";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY is not configured on the server" }, 500);

  let payload: {
    student_id?: string;
    to?: string;
    subject?: string;
    body_text?: string;
    pdf_base64?: string;
    filename?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { student_id, to, subject, body_text, pdf_base64, filename } = payload;
  if (!student_id || !to || !pdf_base64) {
    return json({ error: "student_id, to and pdf_base64 are required" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json({ error: "Recipient email address looks invalid" }, 400);
  }
  // ~7MB base64 ≈ 5MB PDF — Resend's attachment ceiling is well above this.
  if (pdf_base64.length > 7_000_000) {
    return json({ error: "PDF is too large to email (over ~5MB)" }, 413);
  }

  // Caller must be signed in; the student must be visible to THEM under RLS.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !caller) return json({ error: "Not authenticated" }, 401);

  const { data: student, error: stuErr } = await callerClient
    .from("students")
    .select("id, school_id, first_name, last_name, adm_no")
    .eq("id", student_id)
    .single();
  if (stuErr || !student) return json({ error: "Student not found (or not in your school)" }, 404);

  // School display name for the email body/from-name.
  const { data: info } = await callerClient
    .from("school_information")
    .select("school_name")
    .eq("school_id", student.school_id)
    .maybeSingle();
  const schoolName = info?.school_name || "Your school";

  const studentName = `${student.first_name || ""} ${student.last_name || ""}`.trim();
  const safeSubject = subject || `${studentName} — Report Card`;
  const text = body_text ||
    `Dear Parent/Guardian,\n\nPlease find attached the report card for ${studentName} (Adm No: ${student.adm_no}).\n\nRegards,\n${schoolName}\n\n— Sent via LogiQ-Taaluma. Please do not reply to this email.`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: safeSubject,
      text,
      attachments: [
        {
          filename: filename || `${student.adm_no}_report_card.pdf`,
          content: pdf_base64,
        },
      ],
    }),
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ error: result?.message || `Email provider error (${res.status})` }, 502);
  }
  return json({ ok: true, id: result?.id || null, to });
});
