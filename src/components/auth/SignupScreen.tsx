"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AramisLogo } from "@/components/brand/AramisLogo";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { LocaleToggle } from "@/components/i18n/LocaleToggle";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { PhoneField } from "@/components/ui/PhoneField";
import type { PhoneAssessment } from "@/lib/phone";

export function SignupScreen() {
  const { ready, register } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState<PhoneAssessment | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirmPassword") ?? "");
    if (password.length < 8) {
      setBusy(false);
      setError(t("auth.passwordMin"));
      return;
    }
    if (password !== confirm) {
      setBusy(false);
      setError(t("auth.passwordMismatch"));
      return;
    }
    if (phone?.error) {
      setBusy(false);
      setError(phone.error);
      return;
    }
    const err = await register({
      email: String(fd.get("email") ?? ""),
      password,
      fullName: String(fd.get("fullName") ?? ""),
      phone: phone?.e164 || "",
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.replace("/opening");
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink text-stone">
        <p className="text-sm text-stone/70">{t("auth.loading")}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-stone">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#2A9D8F40,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#E9C46A28,_transparent_45%)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 text-center">
          <div className="flex justify-center">
            <AramisLogo priority className="h-12 sm:h-14" />
          </div>
          <h1 className="mt-5 font-display text-4xl tracking-tight text-white sm:text-5xl">
            {t("auth.createAccount")}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-stone/70">
            {t("auth.signupSubtitle")}
          </p>
          <div className="mt-4 flex justify-center">
            <LocaleToggle tone="dark" />
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-md sm:p-8">
          <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
            <label className="block text-sm">
              <FieldLabel required tone="dark" className="mb-1.5">
                {t("auth.fullName")}
              </FieldLabel>
              <input
                name="fullName"
                required
                autoComplete="name"
                className="w-full rounded-xl border border-white/15 bg-ink/40 px-3 py-3 outline-none focus:ring-2 focus:ring-teal/40"
              />
            </label>
            <label className="block text-sm">
              <FieldLabel required tone="dark" className="mb-1.5">
                {t("auth.email")}
              </FieldLabel>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-white/15 bg-ink/40 px-3 py-3 outline-none focus:ring-2 focus:ring-teal/40"
              />
            </label>
            <div className="block text-sm">
              <FieldLabel tone="dark" className="mb-1.5">
                {t("auth.phone")}
              </FieldLabel>
              <PhoneField tone="dark" onChange={setPhone} />
            </div>
            <label className="block text-sm">
              <FieldLabel required tone="dark" className="mb-1.5">
                {t("auth.password")}
              </FieldLabel>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/15 bg-ink/40 px-3 py-3 pr-11 outline-none focus:ring-2 focus:ring-teal/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-stone/55 hover:text-stone"
                  aria-label={
                    showPassword ? t("auth.hidePassword") : t("auth.showPassword")
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>
            <label className="block text-sm">
              <FieldLabel required tone="dark" className="mb-1.5">
                {t("auth.confirmPassword")}
              </FieldLabel>
              <input
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-xl border border-white/15 bg-ink/40 px-3 py-3 outline-none focus:ring-2 focus:ring-teal/40"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-xl bg-teal px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal/25 disabled:opacity-60"
            >
              {busy ? t("auth.creating") : t("auth.continueOnboarding")}
            </button>
          </form>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-coral/20 px-3 py-2 text-sm text-coral"
            >
              {error}
            </p>
          ) : null}

          <p className="mt-6 text-center text-sm text-stone/65">
            {t("auth.haveAccount")}{" "}
            <Link href="/login" className="font-medium text-gold underline">
              {t("auth.signIn")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
