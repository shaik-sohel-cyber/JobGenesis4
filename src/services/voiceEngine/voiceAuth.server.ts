import { createClient } from "@supabase/supabase-js";

/** Verifies the bearer token and that the caller owns the interview (and its resume). */
export async function verifyVoiceCaller(request: Request, interviewId: string | null) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !interviewId || !/^[0-9a-f-]{36}$/i.test(interviewId)) return null;
  const url = process.env['SUPABASE_URL']!;
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  const sb = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claims } = await sb.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data: iv } = await sb
    .from("interviews")
    .select("id, user_id, resume_id, status, target_role, required_skills")
    .eq("id", interviewId)
    .maybeSingle();
  if (!iv || iv.user_id !== userId) return null;
  const { data: resume } = await sb.from("resumes").select("id, user_id").eq("id", iv.resume_id).maybeSingle();
  if (!resume || resume.user_id !== userId) return null;
  return { userId, interview: iv, client: sb };
}

export const GATEWAY = "https://ai.gateway.lovable.dev";
