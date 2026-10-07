import Link from "next/link";
import type { ReactNode } from "react";
import { AramisLogo } from "@/components/brand/AramisLogo";
import { LEGAL_LINKS, SITE } from "@/components/legal/site";

export function InfoPage({
  eyebrow,
  title,
  lede,
  current,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  current: string;
  children: ReactNode;
}) {
  const others = LEGAL_LINKS.filter((link) => link.href !== current);

  return (
    <div className="flex min-h-dvh flex-col bg-stone text-ink">
      <header className="border-b border-ink/10 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Aramis home">
            <AramisLogo className="h-8" />
          </Link>
          <Link
            href="/login"
            className="rounded-xl bg-teal px-3.5 py-2 text-sm font-semibold text-white"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight text-ink sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-ink/55">Updated {SITE.updated}</p>
        <p className="mt-5 text-base leading-relaxed text-ink/75">{lede}</p>
        <div className="mt-8 space-y-4">{children}</div>

        <div className="mt-10">
          <h2 className="font-display text-2xl text-ink">Also on this site</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {others.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm font-semibold text-ink transition hover:border-teal/40"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export function PolicySection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-2xl border border-ink/10 bg-paper p-5 sm:p-6"
    >
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink/75">
        {children}
      </div>
    </section>
  );
}

export function DataItem({
  title,
  what,
  why,
  who,
}: {
  title: string;
  what: string;
  why: string;
  who: string;
}) {
  return (
    <article className="rounded-xl border border-ink/8 bg-stone/70 p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <dl className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink/70">
        <div>
          <dt className="inline font-medium text-ink/90">What we hold. </dt>
          <dd className="inline">{what}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-ink/90">Why. </dt>
          <dd className="inline">{why}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-ink/90">Who can see it. </dt>
          <dd className="inline">{who}</dd>
        </div>
      </dl>
    </article>
  );
}

export function OnThisPage({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  return (
    <nav
      aria-label="On this page"
      className="rounded-2xl border border-ink/10 bg-paper p-4"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
        On this page
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href} className="text-sm font-medium text-teal underline">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
