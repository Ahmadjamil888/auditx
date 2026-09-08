# AuditX AI-first product flow

## Goal
Make AuditX feel like a financial intelligence agent: users land in the AI workspace, import evidence there, and open ledger, issues, tax, and other outputs only when needed.

## Build
1. **Stabilize AI and imports**
   - Keep the configured server-side Lovable AI connection; remove the unsupported hard-coded model path and use the required chat model/API integration.
   - Validate chat errors explicitly and preserve user input when a request fails.
   - Make PDF, image, CSV, Excel, and text attachments visible before sending and ensure supported content reaches the model in a usable form.
   - Add an import progress/result experience: broker detection, extraction, matching, and items requiring review.

2. **Expand the financial agent**
   - Add narrowly scoped tools for document extraction, transaction create/update/delete, portfolio reconciliation, deterministic tax calculation, discrepancy discovery, and report generation.
   - Keep financial calculations deterministic and database-scoped; require approval for every write or deletion.
   - Render tool progress and results in the conversation without exposing hidden reasoning.

3. **Complete the AI-first shell**
   - Keep `/app` and post-auth entry routed to AuditX.
   - Keep the desktop sidebar collapsed to a 64px icon rail by default and expandable on demand.
   - Reorganize navigation around AuditX, Inbox, Portfolio, Ledger, Issues, Connections, and Settings; make manual ledger entry secondary.

4. **Add the product-center views**
   - Add an AuditX Inbox with review, confirmation, and completed states using existing records.
   - Add Connections with upload-based broker imports now and clearly staged email/API connection options.
   - Turn Portfolio into a concise daily briefing derived from current ledger and issue data.

## Technical details
- Use the existing TanStack Start routes, authenticated database client, RLS policies, chat persistence, and design tokens.
- Keep model calls and secrets server-side; do not use browser environment keys.
- Use AI SDK agent/tool patterns with a step limit of at least 50; do not add LangChain because it would duplicate the existing production agent loop and tool runtime.
- Enforce the 20 MB/file and 10 files/message limits. Extract non-PDF office/text formats before model submission; send supported images/PDFs as multimodal input.
- Validate with focused tests, the live chat request, and desktop/mobile browser checks.
