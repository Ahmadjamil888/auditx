// ─── AuditX Notification Service ─────────────────────────────────────────────
// Abstracted notification service with Browser implementation.
// Architecture is ready for a future Tauri implementation.
//
// Usage:
//   const svc = BrowserNotificationService.getInstance();
//   await svc.requestPermission();
//   svc.send({ title: "AuditX completed your report", body: "...", link: "/app/reports" });

export type NotificationPermission = "granted" | "denied" | "unsupported" | "default";

export interface NotificationPayload {
  title: string;
  body: string;
  link?: string;
  icon?: string;
}

// ── Abstract interface (ready for Tauri implementation) ───────────────────────

export interface INotificationService {
  getPermission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  send(payload: NotificationPayload): void;
}

// ── Browser implementation ────────────────────────────────────────────────────

export class BrowserNotificationService implements INotificationService {
  private static instance: BrowserNotificationService;

  static getInstance(): BrowserNotificationService {
    if (!BrowserNotificationService.instance) {
      BrowserNotificationService.instance = new BrowserNotificationService();
    }
    return BrowserNotificationService.instance;
  }

  getPermission(): NotificationPermission {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return window.Notification.permission as NotificationPermission;
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    if (window.Notification.permission === "granted") return "granted";
    if (window.Notification.permission === "denied") return "denied";

    const result = await window.Notification.requestPermission();
    return result as NotificationPermission;
  }

  send(payload: NotificationPayload): void {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (window.Notification.permission !== "granted") return;

    const n = new window.Notification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? "/favicon.svg",
      tag: "auditx",
    });

    if (payload.link) {
      n.onclick = () => {
        window.focus();
        window.location.href = payload.link!;
        n.close();
      };
    }
  }
}

// ── Convenience singleton ─────────────────────────────────────────────────────

export const notificationService = BrowserNotificationService.getInstance();

// ── React hook ────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    notificationService.getPermission(),
  );

  useEffect(() => {
    setPermission(notificationService.getPermission());
  }, []);

  const request = useCallback(async () => {
    const result = await notificationService.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const send = useCallback(
    (payload: NotificationPayload) => notificationService.send(payload),
    [],
  );

  return { permission, request, send };
}
