"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { updateMyPassword, updateMyProfile } from "@/lib/cloud-auth";
import { useToast } from "./feedback";

export function profileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  return parts
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function PlatformProfile({ onSignOut }: { onSignOut: () => void }) {
  const { profile, user, refresh } = useAuth();
  const toast = useToast();
  const email = profile?.email || user?.email || "";
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"profile" | "password" | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name || "");
    setPhone(profile?.phone || "");
  }, [profile?.full_name, profile?.phone]);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy("profile");
    const res = await updateMyProfile({ fullName, phone });
    setBusy(null);
    if ("error" in res && res.error) {
      toast.error(res.error, "Profile");
      return;
    }
    await refresh();
    toast.success("Profile saved");
  }

  async function onSavePassword(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match.", "Password");
      return;
    }
    setBusy("password");
    const res = await updateMyPassword({ password });
    setBusy(null);
    if ("error" in res && res.error) {
      toast.error(res.error, "Password");
      return;
    }
    setPassword("");
    setConfirm("");
    toast.success("Password updated");
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <h2 className="font-display text-xl">Your profile</h2>
        <p className="mt-1 break-all text-sm text-ink/55">
          Signed in as {email || "platform admin"}
        </p>
        <form className="mt-4 space-y-3" onSubmit={(e) => void onSaveProfile(e)}>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Full name</span>
            <input
              className="field"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Phone</span>
            <input
              className="field"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Email</span>
            <input className="field" value={email} readOnly disabled />
          </label>
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "profile" ? "Saving…" : "Save profile"}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <h2 className="font-display text-xl">Change password</h2>
        <p className="mt-1 text-sm text-ink/55">
          Updates the password for this platform admin login.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => void onSavePassword(e)}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">New password</span>
            <input
              type="password"
              className="field"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Confirm password</span>
            <input
              type="password"
              className="field"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-stone disabled:opacity-50"
          >
            {busy === "password" ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>

      <button
        type="button"
        onClick={onSignOut}
        className="w-full rounded-2xl border border-ink/12 bg-white px-4 py-3 text-sm font-semibold text-ink/80 lg:hidden"
      >
        Sign out
      </button>
    </div>
  );
}
