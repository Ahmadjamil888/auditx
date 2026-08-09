// ─── Simple client-side auth store (prototype — no real Supabase) ─────────────
// In production this would be replaced with Supabase Auth hooks.

import { useState, useEffect, useCallback } from "react";

export interface User {
  id: string;
  email: string;
  name: string;
  org: string;
  plan: "free" | "pro" | "enterprise";
  jurisdiction: "PSX" | "NSE";
}

const STORAGE_KEY = "auditx_demo_user";

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function storeUser(user: User) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(STORAGE_KEY);
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(getStoredUser);

  const signIn = useCallback((email: string, _password: string): Promise<User> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Demo: accept any @... email
        if (!email.includes("@")) {
          reject(new Error("Invalid email address"));
          return;
        }
        const u: User = {
          id: "demo-user-001",
          email,
          name: email.split("@")[0]!.replace(/[._]/g, " "),
          org: "Demo Organisation",
          plan: "pro",
          jurisdiction: "PSX",
        };
        storeUser(u);
        setUser(u);
        resolve(u);
      }, 900);
    });
  }, []);

  const signUp = useCallback(
    (email: string, _password: string, org: string, jurisdiction: "PSX" | "NSE"): Promise<User> => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (!email.includes("@")) {
            reject(new Error("Invalid email address"));
            return;
          }
          const u: User = {
            id: `user-${Date.now()}`,
            email,
            name: email.split("@")[0]!.replace(/[._]/g, " "),
            org,
            plan: "free",
            jurisdiction,
          };
          storeUser(u);
          setUser(u);
          resolve(u);
        }, 1100);
      });
    },
    [],
  );

  const signOut = useCallback(() => {
    clearUser();
    setUser(null);
  }, []);

  // Sync across tabs
  useEffect(() => {
    const handler = () => setUser(getStoredUser());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return { user, signIn, signUp, signOut };
}
