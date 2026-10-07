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
        "inline-flex rounded-full border p-0.5",
        dark ? "border-white/20" : "border-ink/15",
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
              "rounded-full px-3 py-1 text-xs font-medium transition",
              active
                ? dark
                  ? "bg-white/15 text-white"
                  : "bg-ink text-stone"
                : dark
                  ? "text-white/60 hover:text-white"
                  : "text-ink/55 hover:text-ink",
            )}
          >
            {opt.native}
          </button>
        );
      })}
    </div>
  );
}
