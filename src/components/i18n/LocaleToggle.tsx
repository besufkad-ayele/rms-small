"use client";

import { useI18n } from "@/components/i18n/LocaleProvider";
import { LOCALES } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LocaleToggle({
  tone = "light",
}: {
  tone?: "light" | "dark";
}) {
  const { locale, setLocale, t } = useI18n();
  const dark = tone === "dark";

  return (
    <div
      role="radiogroup"
      aria-label={t("settings.language")}
      className={cn(
        "inline-flex max-w-full flex-wrap justify-center gap-1 rounded-2xl border p-1",
        dark ? "border-white/20 bg-white/[0.04] backdrop-blur-md" : "border-ink/15",
      )}
    >
      {LOCALES.map((opt) => {
        const active = locale === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLocale(opt.id)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition",
              active
                ? dark
                  ? "bg-white/20 text-white font-semibold shadow-sm"
                  : "bg-ink text-stone"
                : dark
                  ? "text-white/75 hover:text-white hover:bg-white/10"
                  : "text-ink/65 hover:text-ink hover:bg-ink/5",
            )}
          >
            {opt.native}
          </button>
        );
      })}
    </div>
  );
}
