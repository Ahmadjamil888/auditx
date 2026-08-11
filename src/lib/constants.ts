// ─── Shared contact / project constants ───────────────────────────────────────

export const SUPPORT_EMAIL = "ahmadjamildhami@gmail.com";
export const WHATSAPP_NUMBER = "03338188722";
export const WHATSAPP_LINK = "https://wa.me/923338188722";
export const GITHUB_URL = "https://github.com/Ahmadjamil888/auditx";

export function mailto(subject: string, body: string) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function upgradeMailto(plan: string, context: { email?: string | undefined; org?: string | undefined }) {
  return mailto(
    `I want to upgrade my plan — ${plan}`,
    [
      "Hi AuditX team,",
      "",
      `I want to upgrade my plan to ${plan}.`,
      "",
      `Account email: ${context.email ?? "(please fill in)"}`,
      `Organisation: ${context.org ?? "(please fill in)"}`,
      "",
      "My payment account details:",
      "Account holder name: ",
      "Bank / wallet: ",
      "Account number / IBAN: ",
      "",
      "Please verify the payment and confirm by email so I can sign in again with the upgraded plan.",
      "",
      "Thanks,",
    ].join("\n"),
  );
}
