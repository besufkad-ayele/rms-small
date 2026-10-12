"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  AlertCircle,
  ChefHat,
  ShieldCheck,
  WifiOff,
  UtensilsCrossed,
  Receipt,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AramisLogo } from "@/components/brand/AramisLogo";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { LocaleToggle } from "@/components/i18n/LocaleToggle";
import { cn } from "@/lib/utils";

export function LoginScreen({
  variant = "default",
}: {
  /** Staff-focused copy; same auth underneath */
  variant?: "default" | "staff";
}) {
  const { ready, login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const search = useSearchParams();
  const justApproved = search.get("approved") === "1";

  const [activeRole, setActiveRole] = useState<"default" | "staff">(variant);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);

  const isStaff = activeRole === "staff";

  const subtitle = useMemo(() => {
    if (isStaff) return t("auth.staffSubtitle");
    if (justApproved) return t("auth.approvedSubtitle");
    return t("auth.defaultSubtitle");
  }, [justApproved, isStaff, t]);

  const handleRoleChange = (role: "default" | "staff") => {
    setActiveRole(role);
    setError(null);
    router.replace(role === "staff" ? "/staff-login" : "/login");
  };

  const handleKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockActive(e.getModifierState("CapsLock"));
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const err = await login(
      String(fd.get("email") ?? ""),
      String(fd.get("password") ?? ""),
    );
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.replace("/opening");
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#071412] text-white">
        <div className="flex flex-col items-center gap-4 text-center">
          <AramisLogo priority tone="onDark" className="h-10" />
          <div className="flex items-center gap-2 text-sm text-white/80">
            <Loader2 className="h-4 w-4 animate-spin text-teal" />
            <span>{t("auth.loading")}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#071412] text-white antialiased selection:bg-teal selection:text-white">
      {/* Dynamic Ambient Background Elements */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        {/* Glow beam top-left (Teal) */}
        <div className="animate-pulse-glow absolute -top-40 -left-40 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,_#2A9D8F35_0%,_transparent_70%)] blur-3xl" />
        {/* Glow halo bottom-right (Gold) */}
        <div className="animate-pulse-glow absolute -bottom-40 -right-40 h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,_#E9C46A25_0%,_transparent_70%)] blur-3xl" />
        {/* Subtle center ambient tone */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[800px] rounded-full bg-[radial-gradient(circle,_#0f352e30_0%,_transparent_65%)] blur-2xl" />
        {/* Fine grid texture */}
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:28px_28px] opacity-40" />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-7xl flex-col justify-between px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/60"
          >
            <AramisLogo
              priority
              tone="onDark"
              className="h-9 sm:h-11 transition-transform group-hover:scale-[1.02]"
            />
          </Link>
          <div className="flex items-center gap-3">
            <LocaleToggle tone="dark" />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="my-auto py-8 sm:py-12">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8 xl:gap-14">
            {/* Left Column: Brand Showcase (Visible on lg+) */}
            <div className="hidden flex-col justify-center lg:col-span-6 lg:flex xl:col-span-7">
              {/* Status Pill */}
              <div className="mb-6 inline-flex w-fit items-center gap-2.5 rounded-full border border-teal/40 bg-teal/15 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300 shadow-inner backdrop-blur-md">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
                </span>
                <span>Hospitality Operating System</span>
              </div>

              {/* Editorial Title */}
              <h1 className="font-display text-4xl leading-[1.12] tracking-tight text-white sm:text-5xl xl:text-6xl">
                Run your restaurant counter in{" "}
                <span className="bg-gradient-to-r from-teal via-gold to-white bg-clip-text text-transparent">
                  perfect rhythm.
                </span>
              </h1>

              {/* Subheading - High contrast text-white/80 */}
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 xl:text-lg">
                High-speed cashier POS, offline-first sync engine, live kitchen dispatching, and automated day-close financial reports.
              </p>

              {/* Feature Highlights Grid */}
              <div className="mt-10 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Feature 1 */}
                <div className="group rounded-2xl border border-white/12 bg-[#0e2420]/75 p-5 backdrop-blur-md transition-all duration-300 hover:border-teal/50 hover:bg-[#122e29] hover:shadow-lg hover:shadow-teal/15">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/20 text-emerald-300 transition-transform group-hover:scale-110">
                    <WifiOff className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3.5 text-sm font-semibold text-white">
                    Offline First
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                    Ring tickets and print bills with zero interruption when connectivity drops.
                  </p>
                </div>

                {/* Feature 2 */}
                <div className="group rounded-2xl border border-white/12 bg-[#0e2420]/75 p-5 backdrop-blur-md transition-all duration-300 hover:border-gold/50 hover:bg-[#122e29] hover:shadow-lg hover:shadow-gold/15">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold transition-transform group-hover:scale-110">
                    <UtensilsCrossed className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3.5 text-sm font-semibold text-white">
                    Live Kitchen KDS
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                    Instant round dispatches and station prep tracking across multiple counters.
                  </p>
                </div>

                {/* Feature 3 */}
                <div className="group rounded-2xl border border-white/12 bg-[#0e2420]/75 p-5 backdrop-blur-md transition-all duration-300 hover:border-teal/50 hover:bg-[#122e29] hover:shadow-lg hover:shadow-teal/15">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/20 text-emerald-300 transition-transform group-hover:scale-110">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3.5 text-sm font-semibold text-white">
                    Daily Audits
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                    Cash, CBE, Telebirr & split tender reconciliations ready at every shift close.
                  </p>
                </div>
              </div>

              {/* Trust Badge */}
              <div className="mt-10 flex items-center gap-3 text-xs text-white/65">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                <span>Encrypted multi-tenant isolation & offline local SQLite / IndexedDB sync</span>
              </div>
            </div>

            {/* Right Column: Authentication Form Card */}
            <div className="mx-auto w-full max-w-md lg:col-span-6 lg:max-w-none xl:col-span-5">
              <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-[#0b211d]/90 p-6.5 shadow-2xl backdrop-blur-2xl sm:p-9">
                {/* Top Glowing Edge Accent */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal to-transparent"
                />

                {/* Role Switcher Tabs */}
                <div className="mb-6">
                  <div
                    role="tablist"
                    aria-label="Account Type"
                    className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/12 bg-black/40 p-1.5"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!isStaff}
                      onClick={() => handleRoleChange("default")}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-medium transition-all duration-200",
                        !isStaff
                          ? "bg-teal text-white shadow-md shadow-teal/30 font-semibold"
                          : "text-white/70 hover:text-white hover:bg-white/10",
                      )}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>{t("auth.ownerSignIn")}</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isStaff}
                      onClick={() => handleRoleChange("staff")}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-medium transition-all duration-200",
                        isStaff
                          ? "bg-gold text-ink shadow-md shadow-gold/25 font-semibold"
                          : "text-white/70 hover:text-white hover:bg-white/10",
                      )}
                    >
                      <ChefHat className="h-4 w-4" />
                      <span>{t("auth.staffSignIn")}</span>
                    </button>
                  </div>
                </div>

                {/* Form Header */}
                <div className="mb-6">
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    {isStaff ? t("auth.staffSignIn") : t("auth.signIn")}
                  </h2>
                  <p className="mt-2 text-xs sm:text-sm leading-relaxed text-white/75">
                    {subtitle}
                  </p>
                </div>

                {/* Notification Banners */}
                {justApproved && !isStaff ? (
                  <div className="mb-5 flex items-start gap-3 rounded-2xl border border-teal/40 bg-teal/20 p-3.5 text-xs sm:text-sm text-emerald-200 shadow-inner">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t("auth.approvedBanner")}</span>
                  </div>
                ) : null}

                {isStaff ? (
                  <div className="mb-5 flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/15 p-3.5 text-xs sm:text-sm text-gold shadow-inner">
                    <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t("auth.staffBanner")}</span>
                  </div>
                ) : null}

                {/* Login Form */}
                <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
                  {/* Email Field */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-email"
                      className="block text-xs sm:text-sm font-medium text-white/90"
                    >
                      {t("auth.email")}
                    </label>
                    <div className="relative flex items-center">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-white/50">
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        id="login-email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        autoCapitalize="none"
                        placeholder="you@restaurant.com"
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "login-error" : undefined}
                        className="w-full rounded-xl border border-white/20 bg-black/40 py-3 pl-10 pr-4 text-sm text-white placeholder-white/40 transition-all outline-none focus:border-teal/80 focus:bg-black/60 focus:ring-2 focus:ring-teal/30"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="login-password"
                        className="block text-xs sm:text-sm font-medium text-white/90"
                      >
                        {t("auth.password")}
                      </label>
                    </div>
                    <div className="relative flex items-center">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-white/50">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        id="login-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="current-password"
                        placeholder="••••••••"
                        onKeyDown={handleKeyEvent}
                        onKeyUp={handleKeyEvent}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "login-error" : undefined}
                        className="w-full rounded-xl border border-white/20 bg-black/40 py-3 pl-10 pr-11 text-sm text-white placeholder-white/40 transition-all outline-none focus:border-teal/80 focus:bg-black/60 focus:ring-2 focus:ring-teal/30"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center px-3.5 text-white/55 transition hover:text-white focus:outline-none"
                        aria-label={
                          showPassword
                            ? t("auth.hidePassword")
                            : t("auth.showPassword")
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Caps Lock Detector Warning */}
                    {capsLockActive && (
                      <div
                        role="status"
                        className="flex items-center gap-1.5 pt-1 text-xs text-gold"
                      >
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Caps Lock is ON</span>
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      id="login-submit-btn"
                      type="submit"
                      disabled={busy}
                      className={cn(
                        "group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg transition-all duration-200 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60",
                        isStaff
                          ? "bg-gradient-to-r from-gold via-[#e4ba5b] to-[#d4aa4b] text-ink shadow-gold/20 hover:brightness-105"
                          : "bg-gradient-to-r from-teal via-[#2aa395] to-[#208477] shadow-teal/25 hover:brightness-110",
                      )}
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{t("auth.wait")}</span>
                        </>
                      ) : (
                        <>
                          <span>{t("auth.submit")}</span>
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* Error Banner */}
                {error ? (
                  <div
                    id="login-error"
                    role="alert"
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-coral/30 bg-coral/20 p-3 text-xs sm:text-sm text-coral"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                ) : null}

                {/* Card Footer: Role Switch / Signup Links */}
                <div className="mt-8 border-t border-white/12 pt-5 text-center text-xs sm:text-sm text-white/70">
                  {isStaff ? (
                    <p>
                      {t("auth.ownerPrompt")}{" "}
                      <button
                        type="button"
                        onClick={() => handleRoleChange("default")}
                        className="font-medium text-gold hover:underline focus:outline-none"
                      >
                        {t("auth.ownerSignIn")}
                      </button>
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      <p>
                        {t("auth.staffPrompt")}{" "}
                        <button
                          type="button"
                          onClick={() => handleRoleChange("staff")}
                          className="font-medium text-gold hover:underline focus:outline-none"
                        >
                          {t("auth.staffSignIn")}
                        </button>
                      </p>
                      <p>
                        {t("auth.newHere")}{" "}
                        <Link
                          href="/signup"
                          className="font-medium text-emerald-300 hover:underline"
                        >
                          {t("auth.createAccount")}
                        </Link>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Sub-card reassurance */}
              <div className="mt-4 flex justify-center text-center text-xs text-white/50">
                <span>Aramis RMS · Fast, Offline-Ready Counter System</span>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-white/60">
          <p>© {new Date().getFullYear()} Aramis RMS. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-white transition">
              Home
            </Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-white transition">
              Terms & Privacy
            </Link>
            <span>·</span>
            <Link href="/faq" className="hover:text-white transition">
              FAQ
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
