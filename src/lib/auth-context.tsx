// ─── Real Supabase auth context ───────────────────────────────────────────────
// Loads (and self-provisions) the signed-in user's organisation, profile and
// subscription. Never uses PostgREST embeds across unrelated tables.

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PlanId } from "./plans";
import { supabase } from "./supabase";

interface OrgProfile {
  profile_id: string;
  org_id: string;
  org_name: string;
  full_name: string;
  role: string;
  jurisdiction: string;
  plan: PlanId;
  plan_status: string;
  avatar_url?: string | undefined;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: OrgProfile | null;
  loading: boolean;
  planChosen: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  planChosen: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const provisioning = useRef(false);

  const loadProfile = useCallback(async (u: User) => {
    try {
      // 1. Profile row (no cross-table embeds — profiles has no FK to subscriptions)
      let { data: row, error } = await supabase
        .from("profiles")
        .select("id, org_id, full_name, role")
        .eq("user_id", u.id)
        .maybeSingle();

      if (error) {
        console.warn("[AuditX] profile lookup failed:", error.message);
        return;
      }

      // 2. Self-provision organisation + profile + free subscription on first login
      if (!row && !provisioning.current) {
        provisioning.current = true;
        row = await provision(u);
        provisioning.current = false;
      }
      if (!row) return;

      // 3. Organisation + subscription, fetched independently
      const [orgRes, subRes] = await Promise.all([
        supabase
          .from("organizations")
          .select("name, jurisdiction_default")
          .eq("id", row.org_id)
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("plan, status")
          .eq("org_id", row.org_id)
          .maybeSingle(),
      ]);

      // Default plan is always free when no subscription row exists yet.
      if (!subRes.data) {
        await supabase
          .from("subscriptions")
          .insert({ org_id: row.org_id, plan: "free", status: "active" })
          .then(() => undefined, () => undefined);
      }

      setProfile({
        profile_id: row.id,
        org_id: row.org_id,
        org_name: orgRes.data?.name ?? "My Organisation",
        full_name: row.full_name || ((u.user_metadata?.["full_name"] as string | undefined) ?? ""),
        role: row.role,
        jurisdiction: orgRes.data?.jurisdiction_default ?? "PSX",
        plan: ((subRes.data?.plan as PlanId | undefined) ?? "free"),
        plan_status: subRes.data?.status ?? "active",
        avatar_url: u.user_metadata?.["avatar_url"] as string | undefined,
      });
    } catch (cause) {
      console.warn("[AuditX] Could not load profile", cause);
    }
  }, []);

  async function provision(u: User) {
    const meta = u.user_metadata ?? {};
    const orgName = (meta["org_name"] as string | undefined) || `${u.email?.split("@")[0] ?? "My"} Organisation`;

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: orgName,
        jurisdiction_default: (meta["jurisdiction"] as string | undefined) ?? "PSX",
      })
      .select("id")
      .single();

    if (orgError || !org) {
      console.warn("[AuditX] Could not create organisation:", orgError?.message);
      return null;
    }

    const { data: created, error: profileError } = await supabase
      .from("profiles")
      .insert({
        org_id: org.id,
        user_id: u.id,
        full_name: (meta["full_name"] as string | undefined) ?? u.email?.split("@")[0] ?? "",
        role: "owner",
      })
      .select("id, org_id, full_name, role")
      .single();

    if (profileError || !created) {
      console.warn("[AuditX] Could not create profile:", profileError?.message);
      return null;
    }

    await supabase
      .from("subscriptions")
      .insert({ org_id: org.id, plan: "free", status: "active" })
      .then(() => undefined, () => undefined);

    return created;
  }

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadProfile(data.user);
  }, [loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadProfile(s.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        return;
      }
      if (s?.user) void loadProfile(s.user);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }

  const planChosen = Boolean(user?.user_metadata?.["plan_chosen"]);

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, planChosen, signOut: handleSignOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
