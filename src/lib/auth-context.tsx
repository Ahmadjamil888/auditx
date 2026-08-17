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
      console.log("[AuditX] Auth session loaded, loading profile for user:", u.id);
      
      // 1. Profile row (no cross-table embeds — profiles has no FK to subscriptions)
      console.log("[AuditX] Loading profile...");
      let { data: row, error } = await supabase
        .from("profiles")
        .select("id, org_id, full_name, role")
        .eq("user_id", u.id)
        .maybeSingle();

      if (error) {
        console.error("[AuditX] Profile lookup failed:", error.message, error);
        return;
      }

      console.log("[AuditX] Profile lookup result:", row ? "found" : "not found");

      // 2. Self-provision organisation + profile + free subscription on first login
      if (!row && !provisioning.current) {
        console.log("[AuditX] No profile found, starting provisioning...");
        provisioning.current = true;
        row = await provision(u);
        provisioning.current = false;
        console.log("[AuditX] Provisioning completed, result:", row ? "success" : "failed");
      }
      if (!row) {
        console.warn("[AuditX] No profile available after provisioning attempt");
        return;
      }

      console.log("[AuditX] Profile loaded, org_id:", row.org_id);

      // 3. Organisation + subscription, fetched independently
      console.log("[AuditX] Loading organization and subscription...");
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

      if (orgRes.error) {
        console.error("[AuditX] Organization lookup failed:", orgRes.error.message, orgRes.error);
      } else {
        console.log("[AuditX] Organization loaded:", orgRes.data ? "found" : "not found");
      }

      if (subRes.error) {
        console.error("[AuditX] Subscription lookup failed:", subRes.error.message, subRes.error);
      } else {
        console.log("[AuditX] Subscription loaded:", subRes.data ? "found" : "not found");
      }

      // Default plan is always free when no subscription row exists yet.
      if (!subRes.data) {
        console.log("[AuditX] No subscription found, creating free subscription...");
        await supabase
          .from("subscriptions")
          .insert({ org_id: row.org_id, plan: "free", status: "active" })
          .then(() => {
            console.log("[AuditX] Free subscription created successfully");
          }, (err) => {
            console.error("[AuditX] Failed to create free subscription:", err.message, err);
          });
      }

      console.log("[AuditX] Setting profile state...");
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
      console.log("[AuditX] Profile state set successfully");
    } catch (cause) {
      console.error("[AuditX] Could not load profile:", cause);
    }
  }, []);

  async function provision(u: User) {
    console.log("[AuditX] Starting provisioning for user:", u.id);
    const meta = u.user_metadata ?? {};
    const orgName = (meta["org_name"] as string | undefined) || `${u.email?.split("@")[0] ?? "My"} Organisation`;

    console.log("[AuditX] Creating organization:", orgName);
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: orgName,
        jurisdiction_default: (meta["jurisdiction"] as string | undefined) ?? "PSX",
      })
      .select("id")
      .single();

    if (orgError || !org) {
      console.error("[AuditX] Could not create organisation:", orgError?.message, orgError);
      return null;
    }

    console.log("[AuditX] Organization created successfully, id:", org.id);

    console.log("[AuditX] Creating profile for user:", u.id);
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
      console.error("[AuditX] Could not create profile:", profileError?.message, profileError);
      return null;
    }

    console.log("[AuditX] Profile created successfully, id:", created.id);

    console.log("[AuditX] Creating subscription for org:", org.id);
    await supabase
      .from("subscriptions")
      .insert({ org_id: org.id, plan: "free", status: "active" })
      .then(() => {
        console.log("[AuditX] Subscription created successfully");
      }, (err) => {
        console.error("[AuditX] Failed to create subscription:", err.message, err);
      });

    console.log("[AuditX] Provisioning completed successfully");
    return created;
  }

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadProfile(data.user);
  }, [loadProfile]);

  useEffect(() => {
    console.log("[AuditX] AuthContext useEffect - getting initial session");
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      console.log("[AuditX] Initial session result:", s ? "found" : "not found");
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        console.log("[AuditX] User found in session, loading profile...");
        loadProfile(s.user).finally(() => {
          console.log("[AuditX] Profile loading completed, setting loading=false");
          setLoading(false);
        });
      } else {
        console.log("[AuditX] No user in session, setting loading=false");
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("[AuditX] Auth state change:", event, "session:", !!s);
      setSession(s);
      setUser(s?.user ?? null);
      if (event === "SIGNED_OUT") {
        console.log("[AuditX] User signed out, clearing profile");
        setProfile(null);
        return;
      }
      if (s?.user) {
        console.log("[AuditX] Auth state change with user, loading profile...");
        void loadProfile(s.user);
      }
    });

    return () => {
      console.log("[AuditX] AuthContext cleanup");
      listener.subscription.unsubscribe();
    };
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
