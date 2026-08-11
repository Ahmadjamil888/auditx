// ─── Plan definitions and entitlement checks ──────────────────────────────────

export type PlanId = "free" | "pro" | "enterprise";

export interface PlanLimits {
  id: PlanId;
  name: string;
  price: string;
  note: string;
  /** null = unlimited */
  transactionsPerMonth: number | null;
  taxProfiles: number | null;
  brokerAccounts: number | null;
  features: {
    csvExport: boolean;
    pdfExport: boolean;
    anomalyDetection: boolean;
    taxLossHarvesting: boolean;
    multiAccount: boolean;
    teamRoles: boolean;
    apiAccess: boolean;
  };
  highlights: string[];
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: "free",
    name: "Free",
    price: "$0",
    note: "For getting your first book clean",
    transactionsPerMonth: 50,
    taxProfiles: 1,
    brokerAccounts: 1,
    features: {
      csvExport: true,
      pdfExport: false,
      anomalyDetection: false,
      taxLossHarvesting: false,
      multiAccount: false,
      teamRoles: false,
      apiAccess: false,
    },
    highlights: ["50 parsed transactions / month", "1 tax profile", "1 broker account", "CSV export"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "$9.99",
    note: "For active retail traders",
    transactionsPerMonth: null,
    taxProfiles: 3,
    brokerAccounts: 10,
    features: {
      csvExport: true,
      pdfExport: true,
      anomalyDetection: true,
      taxLossHarvesting: true,
      multiAccount: false,
      teamRoles: false,
      apiAccess: false,
    },
    highlights: [
      "Unlimited parsed transactions",
      "3 tax profiles",
      "PDF tax summary",
      "Anomaly detection",
      "Tax-loss harvesting",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: "$49",
    note: "For brokerages & portfolio managers",
    transactionsPerMonth: null,
    taxProfiles: null,
    brokerAccounts: null,
    features: {
      csvExport: true,
      pdfExport: true,
      anomalyDetection: true,
      taxLossHarvesting: true,
      multiAccount: true,
      teamRoles: true,
      apiAccess: true,
    },
    highlights: [
      "Everything in Pro",
      "Multi-client accounts",
      "Team roles & permissions",
      "API access",
      "Priority reconciliation",
    ],
  },
};

export type FeatureKey = keyof PlanLimits["features"];

export function planOf(plan: string | null | undefined): PlanLimits {
  const id = (plan ?? "free") as PlanId;
  return PLANS[id] ?? PLANS.free;
}

export function hasFeature(plan: string | null | undefined, feature: FeatureKey): boolean {
  return planOf(plan).features[feature];
}

export function withinLimit(
  plan: string | null | undefined,
  limit: "transactionsPerMonth" | "taxProfiles" | "brokerAccounts",
  current: number,
): boolean {
  const max = planOf(plan)[limit];
  return max === null || current < max;
}

export function limitLabel(
  plan: string | null | undefined,
  limit: "transactionsPerMonth" | "taxProfiles" | "brokerAccounts",
): string {
  const max = planOf(plan)[limit];
  return max === null ? "Unlimited" : String(max);
}
