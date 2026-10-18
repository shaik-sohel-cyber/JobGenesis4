import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminUser } from "@/lib/admin-auth.server";

export type AdminUserRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

export type AdminFeedbackRow = {
  id: string;
  rating: number;
  feature: string;
  category: string;
  message: string;
  contactEmail: string | null;
  createdAt: string;
};

export type AdminOverview =
  { authorized: false } | { authorized: true; users: AdminUserRow[]; feedback: AdminFeedbackRow[] };

/** Admin-only list of every account with sign-up and last sign-in times. */
export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    if (!(await isAdminUser(context.supabase, context.userId))) return { authorized: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const all: AdminUserRow[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error("Couldn't load users.");
      for (const u of data.users) {
        const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
        all.push({
          id: u.id,
          email: u.email ?? null,
          fullName: meta.full_name || meta.name || null,
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
        });
      }
      if (data.users.length < 200) break;
    }
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name");
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    for (const u of all) u.fullName = names.get(u.id) || u.fullName;
    all.sort((a, b) => (b.lastSignInAt ?? "").localeCompare(a.lastSignInAt ?? ""));
    const { data: feedback, error: feedbackError } = await supabaseAdmin
      .from("feedback_submissions")
      .select("id, rating, feature, category, message, contact_email, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (feedbackError) {
      console.error("[admin] feedback load failed", feedbackError.message);
      throw new Error("Couldn't load feedback submissions.");
    }
    return {
      authorized: true,
      users: all,
      feedback: feedback.map((item) => ({
        id: item.id,
        rating: item.rating,
        feature: item.feature,
        category: item.category,
        message: item.message,
        contactEmail: item.contact_email,
        createdAt: item.created_at,
      })),
    };
  });
