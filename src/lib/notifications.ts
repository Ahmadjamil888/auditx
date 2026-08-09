// ─── Notification System ───────────────────────────────────────────────────────
// Simple in-memory notification system for demo purposes
// In production, this would integrate with a real notification service

import { toast } from "sonner";

export interface NotificationPreferences {
  lowConfidenceAlert: boolean;
  reconciliationFlag: boolean;
  taxComputationUpdate: boolean;
  monthlyDigest: boolean;
}

let preferences: NotificationPreferences = {
  lowConfidenceAlert: true,
  reconciliationFlag: true,
  taxComputationUpdate: false,
  monthlyDigest: true,
};

export function setNotificationPrefs(prefs: NotificationPreferences) {
  preferences = prefs;
}

export function triggerLowConfidenceAlert(fieldName: string, confidence: number) {
  if (preferences.lowConfidenceAlert) {
    toast.warning(`Low confidence extraction: ${fieldName} (${confidence.toFixed(2)})`, {
      description: "Please verify this field before proceeding",
    });
  }
}

export function triggerReconciliationFlag(ticker: string, flagType: string) {
  if (preferences.reconciliationFlag) {
    toast.error(`Reconciliation flag: ${ticker}`, {
      description: `${flagType} detected - review recommended`,
    });
  }
}

export function triggerTaxComputationUpdate() {
  if (preferences.taxComputationUpdate) {
    toast.info("Tax computation updated", {
      description: "Your capital gains tax exposure has been recalculated",
    });
  }
}

export function triggerMonthlyDigest() {
  if (preferences.monthlyDigest) {
    toast.success("Monthly ledger digest ready", {
      description: "Your monthly activity summary is now available",
    });
  }
}