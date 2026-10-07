"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type FaqItem = {
  q: string;
  a: string;
  href?: string;
  hrefLabel?: string;
};

export type FaqGroup = {
  title: string;
  items: FaqItem[];
};

export function FaqList({ groups }: { groups: FaqGroup[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${item.q} ${item.a}`.toLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, needle]);

  return (
    <div className="space-y-6">
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
          Search questions
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try offline, trial, cookies…"
          className="field mt-2"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-ink/10 bg-paper px-4 py-6 text-sm text-ink/70">
          No questions match “{query.trim()}”. Try a shorter word, or read the{" "}
          <Link href="/privacy" className="font-medium text-teal underline">
            privacy policy
          </Link>
          .
        </p>
      ) : (
        filtered.map((group) => (
          <section key={group.title}>
            <h2 className="font-display text-2xl text-ink">{group.title}</h2>
            <div className="mt-3 space-y-2">
              {group.items.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-2xl border border-ink/10 bg-paper open:border-teal/30"
                >
                  <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    <span className="flex items-start justify-between gap-3">
                      <span>{item.q}</span>
                      <span
                        aria-hidden
                        className="mt-0.5 text-lg leading-none text-teal transition group-open:rotate-45"
                      >
                        +
                      </span>
                    </span>
                  </summary>
                  <div className="px-4 pb-4 text-sm leading-relaxed text-ink/70">
                    <p>{item.a}</p>
                    {item.href && item.hrefLabel ? (
                      <p className="mt-2">
                        <Link href={item.href} className="font-medium text-teal underline">
                          {item.hrefLabel}
                        </Link>
                      </p>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
