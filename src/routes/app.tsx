import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Only redirect once we know for certain there's no session.
    // While loading is true the session is still being resolved — don't redirect yet.
    if (!loading && !session) {
      navigate({ to: "/signin", replace: true });
    }
  }, [loading, session, navigate]);

  // Render nothing (or a spinner) while auth is resolving
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          className="size-8 animate-spin rounded-full border-2 border-transparent"
          style={{ borderTopColor: "var(--color-accent)" }}
        />
      </div>
    );
  }

  // Session confirmed — render the app
  if (!session) return null;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
