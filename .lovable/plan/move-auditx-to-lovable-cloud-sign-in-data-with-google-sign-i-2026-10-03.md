# Move AuditX to Lovable Cloud (sign-in + data) with Google sign-in

## What you get
- Sign-in, sign-up, password reset and **Continue with Google** all run on Lovable Cloud.
- All AuditX data (organisations, profiles, plans, transactions, ledger, flags, audit trail, chats, brokers, notifications) is stored in Lovable Cloud.
- The AI chat, ledger, tax center, audit trail, imports and every current page keep working the same way.
- Your app works fully once published on Lovable (AI included). The Vercel site would need to be retired or pointed at the Lovable-published app.

## Important note
Accounts and records in your current external database are **not copied over**. Users will sign up again (or sign in with Google) and start fresh. If you need old data moved, tell me and I'll add an import step.

## Steps
1. Turn on Lovable Cloud.
2. Recreate the full AuditX data structure from the existing schema, with access rules so each user only sees their own organisation's data, plus automatic organisation/profile/free-plan creation on first sign-up.
3. Switch the app to the Lovable Cloud connection everywhere (sign-in pages, data hooks, AI chat server, imports, Ask why, insights).
4. Enable email/password and Google sign-in; Google uses Lovable's managed setup (no Google keys needed from you).
5. Add a proper reset-password page and make sure Google sign-in returns to the AuditX chat.
6. Finish open items: ledger add/delete buttons, keep unsent chat text after reload, move Investigations/Agent pages off OpenRouter.
7. Test end to end while signed in: sign up, Google button, chat with AI, ledger add/delete, import, sign out.

## Technical details
- Replace `src/lib/supabase.ts` with the generated `@/integrations/supabase/client`; drop `VITE_SUPABASE_ANON_KEY` usage.
- Migration ports `supabase/schema.sql` with GRANTs before RLS, `has_role`-style roles table if roles needed, and a `handle_new_user` trigger replacing client-side provisioning in `auth-context.tsx`.
- `/api/chat` and other server routes validate the bearer via the Cloud auth middleware; RLS stays on.
- Google via `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })` + `configure_social_auth`; `enable_email_auth` for email.
- Regenerate types; remove `src/lib/database.types.ts` usage.
