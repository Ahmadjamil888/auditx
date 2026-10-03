// ─── Lovable Cloud client (browser) ──────────────────────────────────────────
// Re-exports the generated Lovable Cloud client so all existing imports keep
// working. Row-level security handles authorisation.

import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export { supabase };

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
    options: { data: meta, emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signInWithGoogle() {
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
  });
  if (result.error) {
    throw new Error(result.error instanceof Error ? result.error.message : String(result.error));
  }
  return result;
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

export function onAuthStateChange(callback: (session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
