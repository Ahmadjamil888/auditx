// ─── Real Supabase auth context ───────────────────────────────────────────────
// Replaces the localStorage demo store. Works with real Supabase sessions.
// Falls back gracefully when Supabase is not yet configured.

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

interface OrgProfile {
  org_id: string;
  org_name: string;
  full_name: string;
  role: string;
  jurisdiction: string;
  plan: "free" | "pro" | "enterprise";
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: OrgProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid: string) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("org_id, full_name, role, organizations(name, jurisdiction_default), subscriptions(plan)")
        .eq("user_id", uid)
        .single();

      if (error || !data) return;

      const org = Array.isArray(data.organizations)
        ? data.organizations[0]
        : (data.organizations as { name: string; jurisdiction_default: string } | null);

      const sub = Array.isArray(data.subscriptions)
        ? data.subscriptions[0]
        : (data.subscriptions as { plan: string } | null);

      setProfile({
        org_id: data.org_id,
        org_name: org?.name ?? "My Organisation",
        full_name: data.full_name,
        role: data.role,
        jurisdiction: org?.jurisdiction_default ?? "PSX",
        plan: (sub?.plan ?? "free") as "free" | "pro" | "enterprise",
      });
    } catch {
      // Profile table not yet set up — leave profile as null
      console.warn("[AuditX] Could not load profile — check your Supabase schema.");
    }
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signOut: handleSignOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
