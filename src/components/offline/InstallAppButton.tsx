"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallAppButton({
  className,
  tone = "dark",
  label,
}: {
  className?: string;
  tone?: "dark" | "light";
  label?: string;
}) {
  const { t } = useI18n();
  const buttonLabel = label ?? t("install.app");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setIsStandalone(standalone);
    setIsIOS(
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !(window as Window & { MSStream?: unknown }).MSStream,
    );

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (isStandalone) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return;
    }
    if (isIOS) {
      setShowIosHelp(true);
    }
  }

  if (!deferred && !isIOS) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void install()}
        className={
          tone === "light"
            ? "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-teal/30 bg-teal/10 px-3 py-2 text-xs font-semibold text-teal"
            : "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/15 px-3 py-2 text-xs font-semibold text-gold"
        }
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        {buttonLabel}
      </button>
      {showIosHelp ? (
        <p
          className={
            tone === "light"
              ? "mt-2 text-[11px] leading-snug text-ink/60"
              : "mt-2 text-[11px] leading-snug text-white/70"
          }
        >
          {t("install.ios")}
        </p>
      ) : null}
    </div>
  );
}
