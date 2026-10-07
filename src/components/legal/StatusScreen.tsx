import Link from "next/link";
import type { ReactNode } from "react";
import { AramisLogo } from "@/components/brand/AramisLogo";
import { LEGAL_LINKS } from "@/components/legal/site";

export function StatusScreen({
  code,
  title,
  children,
  actions,
}: {
  code: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-stone text-ink">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <Link href="/" aria-label="Aramis home" className="mb-8 inline-flex">
          <AramisLogo className="h-9" />
        </Link>
        <p className="font-display text-5xl tracking-tight text-teal">{code}</p>
        <h1 className="mt-3 font-display text-3xl tracking-tight text-ink sm:text-4xl">
          {title}
        </h1>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink/70">
          {children}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">{actions}</div>
        <ul className="mt-8 grid gap-2 sm:grid-cols-2">
          {LEGAL_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block rounded-xl border border-ink/10 bg-paper px-3 py-2.5 text-sm font-medium text-ink"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
