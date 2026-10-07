"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { COOKIE_ACK_KEY, LEGAL_LINKS, SITE } from "@/components/legal/site";
import { cn } from "@/lib/utils";

function useInAppShell() {
  const pathname = usePathname() || "/";
  return pathname.startsWith("/app");
}

export function SiteChrome() {
  const pathname = usePathname() || "/";
  const inApp = useInAppShell();
  const year = new Date().getFullYear();

  return (
    <div className="no-print">
      <CookieNotice inset={inApp} />
      <footer className="border-t border-white/10 bg-[#071412] text-[#eef2f0]">
        <div
          className={cn(
            "mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6",
            inApp && "lg:pl-64",
          )}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <Link href="/" className="font-display text-base text-white">
                {SITE.name}
              </Link>
              <p className="mt-0.5 text-xs text-white/55">{SITE.description}</p>
            </div>
            <nav aria-label="Policies and help" className="flex flex-wrap gap-x-4 gap-y-2">
              <FooterLink href="/" current={pathname === "/"}>
                Home
              </FooterLink>
              <FooterLink href="/login" current={pathname === "/login"}>
                Sign in
              </FooterLink>
              {LEGAL_LINKS.map((link) => (
                <FooterLink
                  key={link.href}
                  href={link.href}
                  current={pathname === link.href}
                >
                  {link.label}
                </FooterLink>
              ))}
            </nav>
          </div>
          <p className="text-[11px] text-white/40">
            © {year} {SITE.short}. Policies updated {SITE.updated}.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "text-xs font-medium underline-offset-4 hover:text-white hover:underline",
        current ? "text-gold" : "text-white/70",
      )}
    >
      {children}
    </Link>
  );
}

function CookieNotice({ inset }: { inset: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(COOKIE_ACK_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(COOKIE_ACK_KEY, "1");
    } catch {
      /* private mode */
    }
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="border-t border-ink/10 bg-paper text-ink"
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6",
          inset && "lg:pl-64",
        )}
      >
        <p className="text-sm leading-relaxed text-ink/75">
          Aramis uses essential cookies to keep you signed in, and stores your
          theme and offline counter work on this device. There are no
          advertising cookies.{" "}
          <Link href="/cookies" className="font-medium text-teal underline">
            Cookie policy
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
