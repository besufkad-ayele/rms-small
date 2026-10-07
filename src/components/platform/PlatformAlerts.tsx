"use client";

import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApplicationRow,
  PaymentProofRow,
  PlatformTenantRow,
} from "@/app/platform/actions";
import type { PlatformSection } from "./platform-ui";
import {
  diffOwnerAlerts,
  loadAlertPrefs,
  playOwnerAlertSound,
  saveAlertPrefs,
  showOwnerNotification,
  type AlertPrefs,
} from "@/lib/platform-alerts";

export function usePlatformAlerts({
  proofs,
  tenants,
  applications = [],
  ready,
  onOpen,
}: {
  proofs: PaymentProofRow[];
  tenants: PlatformTenantRow[];
  applications?: ApplicationRow[];
  ready: boolean;
  onOpen: (section: PlatformSection) => void;
}) {
  const [prefs, setPrefs] = useState<AlertPrefs>(() => loadAlertPrefs());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [permission, setPermission] = useState<NotificationPermission>(
    () =>
      typeof Notification === "undefined" ? "denied" : Notification.permission,
  );
  const primed = useRef(false);

  useEffect(() => {
    if (!ready) return;
    const current = prefsRef.current;
    const next = diffOwnerAlerts({
      proofs,
      tenants,
      applications,
      prefs: current,
    });
    if (!primed.current) {
      primed.current = true;
      setPrefs(next.prefs);
      saveAlertPrefs(next.prefs);
      return;
    }
    if (next.alerts.length === 0) {
      const same =
        next.prefs.seenProofs.join() === current.seenProofs.join() &&
        next.prefs.seenKyc.join() === current.seenKyc.join() &&
        next.prefs.seenFollow.join() === current.seenFollow.join();
      if (same) return;
      setPrefs(next.prefs);
      saveAlertPrefs(next.prefs);
      return;
    }
    setPrefs(next.prefs);
    saveAlertPrefs(next.prefs);
    if (!current.enabled) return;
    if (current.sound) playOwnerAlertSound();
    try {
      navigator.vibrate?.([70, 40, 90]);
    } catch {
      /* ignore */
    }
    for (const alert of next.alerts) {
      void showOwnerNotification({
        title: alert.title,
        body: alert.body,
        tag: alert.tag,
        url: `/platform?tab=${alert.section}`,
      });
    }
  }, [proofs, tenants, applications, ready]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const tab = event.data?.tab as PlatformSection | undefined;
      if (event.data?.type === "PLATFORM_NAV" && tab) onOpen(tab);
    }
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [onOpen]);

  const enable = useCallback(async () => {
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return false;
    }
    const next = { ...prefs, enabled: true };
    setPrefs(next);
    saveAlertPrefs(next);
    playOwnerAlertSound();
    return true;
  }, [prefs]);

  const setEnabled = useCallback(
    (enabled: boolean) => {
      const next = { ...prefs, enabled };
      setPrefs(next);
      saveAlertPrefs(next);
    },
    [prefs],
  );

  const setSound = useCallback(
    (sound: boolean) => {
      const next = { ...prefs, sound };
      setPrefs(next);
      saveAlertPrefs(next);
      if (sound) playOwnerAlertSound();
    },
    [prefs],
  );

  return { prefs, permission, enable, setEnabled, setSound };
}

export function OwnerAlertsCard({
  prefs,
  permission,
  onEnable,
  onToggle,
  onSound,
}: {
  prefs: AlertPrefs;
  permission: NotificationPermission;
  onEnable: () => Promise<boolean>;
  onToggle: (enabled: boolean) => void;
  onSound: (sound: boolean) => void;
}) {
  const blocked = permission === "denied";
  return (
    <section className="rounded-2xl border border-ink/8 bg-white px-3 py-3 sm:px-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal">
          {prefs.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Phone alerts</p>
          <p className="mt-0.5 text-xs leading-snug text-ink/55">
            Sound and a banner when a new KYC or payment arrives — works best
            with the Owner app on your home screen.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {blocked ? (
              <p className="text-xs text-coral">
                Notifications are blocked in the browser settings.
              </p>
            ) : !prefs.enabled ? (
              <button
                type="button"
                onClick={() => void onEnable()}
                className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
              >
                Turn on alerts
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onToggle(false)}
                className="rounded-xl border border-ink/12 px-3 py-2 text-xs font-semibold"
              >
                Alerts on
              </button>
            )}
            <button
              type="button"
              onClick={() => onSound(!prefs.sound)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink/12 px-3 py-2 text-xs font-semibold"
            >
              {prefs.sound ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" />
              )}
              Sound {prefs.sound ? "on" : "off"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
