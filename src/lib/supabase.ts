// ─── Supabase client (browser) ────────────────────────────────────────────────
// Keys come from .env — VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
// The anon key is safe to expose; row-level security handles authorisation.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || supabaseUrl === "https://your-project.supabase.co") {
  console.warn(
    "[AuditX] VITE_SUPABASE_URL is not configured. " +
      "Fill in your Supabase project URL in .env to enable real auth and data.",
  );
}

export const supabase = createClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
);

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  meta: { full_name: string; org_name: string; jurisdiction: string },
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: meta },
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signInWithGoogle() {
  // Guard: warn early if Supabase URL looks like a placeholder
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url || url.includes("your-project") || url.includes("placeholder")) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.",
    );
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/app/overview`,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error) throw new Error(error.message);

  // Supabase returns a URL to redirect to — follow it explicitly
  if (data?.url) {
    window.location.href = data.url;
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(error.message);
}

export function onAuthStateChange(callback: (session: import("@supabase/supabase-js").Session | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
