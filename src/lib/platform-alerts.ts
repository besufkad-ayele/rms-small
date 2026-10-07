import type { PaymentProofRow, PlatformTenantRow } from "@/app/platform/actions";

const PREFS_KEY = "aramis-owner-alerts";

export type AlertPrefs = {
  enabled: boolean;
  sound: boolean;
  seenProofs: string[];
  seenKyc: string[];
  seenFollow: string[];
};

const EMPTY: AlertPrefs = {
  enabled: false,
  sound: true,
  seenProofs: [],
  seenKyc: [],
  seenFollow: [],
};

export function loadAlertPrefs(): AlertPrefs {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<AlertPrefs>) };
  } catch {
    return EMPTY;
  }
}

export function saveAlertPrefs(prefs: AlertPrefs) {
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function pendingKycIds(tenants: PlatformTenantRow[]) {
  return tenants
    .filter((t) => t.organization.verification_status === "pending")
    .map((t) => String(t.organization.id));
}

export function pendingProofIds(proofs: PaymentProofRow[]) {
  return proofs.filter((p) => p.status === "pending").map((p) => p.id);
}

export function dueFollowUpIds(tenants: PlatformTenantRow[], now = Date.now()) {
  return tenants
    .filter((t) => {
      const at = t.subscription?.follow_up_at;
      if (!at) return false;
      const ms = new Date(String(at)).getTime();
      return Number.isFinite(ms) && ms <= now;
    })
    .map((t) => String(t.organization.id));
}

function newIds(next: string[], seen: string[]) {
  const have = new Set(seen);
  return next.filter((id) => !have.has(id));
}

export function playOwnerAlertSound() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.44);
    void ctx.resume();
  } catch {
    /* ignore locked audio contexts */
  }
}

export async function showOwnerNotification(input: {
  title: string;
  body: string;
  tag: string;
  url: string;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const icon = "/icons/android-chrome-192x192.png";
  const payload = {
    body: input.body,
    icon,
    badge: icon,
    tag: input.tag,
    renotify: true,
    data: { url: input.url },
  };

  const reg = await navigator.serviceWorker?.ready.catch(() => null);
  if (reg?.showNotification) {
    await reg.showNotification(input.title, payload);
    return;
  }
  new Notification(input.title, payload);
}

export type OwnerAlert = {
  title: string;
  body: string;
  tag: string;
  section: "onboarding" | "payments" | "subscribers";
};

export function diffOwnerAlerts(input: {
  proofs: PaymentProofRow[];
  tenants: PlatformTenantRow[];
  prefs: AlertPrefs;
}): { prefs: AlertPrefs; alerts: OwnerAlert[] } {
  const kyc = pendingKycIds(input.tenants);
  const proofs = pendingProofIds(input.proofs);
  const follow = dueFollowUpIds(input.tenants);
  const first =
    input.prefs.seenProofs.length === 0 &&
    input.prefs.seenKyc.length === 0 &&
    input.prefs.seenFollow.length === 0;

  const alerts: OwnerAlert[] = [];
  if (!first) {
    const newProofs = newIds(proofs, input.prefs.seenProofs);
    const newKyc = newIds(kyc, input.prefs.seenKyc);
    const newFollow = newIds(follow, input.prefs.seenFollow);
    if (newProofs.length) {
      alerts.push({
        title: "New payment to verify",
        body:
          newProofs.length === 1
            ? "A café sent a payment proof."
            : `${newProofs.length} new payment proofs are waiting.`,
        tag: "owner-payment",
        section: "payments",
      });
    }
    if (newKyc.length) {
      alerts.push({
        title: "New restaurant to review",
        body:
          newKyc.length === 1
            ? "A new KYC application is pending."
            : `${newKyc.length} new KYC applications are pending.`,
        tag: "owner-kyc",
        section: "onboarding",
      });
    }
    if (newFollow.length) {
      alerts.push({
        title: "Follow-up is due",
        body:
          newFollow.length === 1
            ? "A café follow-up time has arrived."
            : `${newFollow.length} follow-ups are due.`,
        tag: "owner-followup",
        section: "subscribers",
      });
    }
  }

  return {
    prefs: {
      ...input.prefs,
      seenProofs: proofs,
      seenKyc: kyc,
      seenFollow: follow,
    },
    alerts,
  };
}
