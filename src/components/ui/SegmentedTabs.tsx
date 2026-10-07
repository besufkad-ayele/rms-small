"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SegmentedTabItem<T extends string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
};

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  size = "md",
}: {
  tabs: SegmentedTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex w-full flex-wrap gap-1 rounded-2xl border border-ink/8 bg-white/90 p-1 sm:w-auto",
        className,
      )}
      role="tablist"
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`seg-tab-${t.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const i = tabs.findIndex((tab) => tab.id === value);
              if (i < 0) return;
              let next: T | null = null;
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                next = tabs[(i + 1) % tabs.length].id;
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                next = tabs[(i - 1 + tabs.length) % tabs.length].id;
              } else if (e.key === "Home") {
                next = tabs[0].id;
              } else if (e.key === "End") {
                next = tabs[tabs.length - 1].id;
              }
              if (!next) return;
              e.preventDefault();
              onChange(next);
              requestAnimationFrame(() => {
                document.getElementById(`seg-tab-${next}`)?.focus();
              });
            }}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-2 rounded-xl font-medium transition sm:flex-none",
              size === "md" && "px-3 py-2.5 text-sm",
              size === "sm" && "px-2.5 py-2 text-xs",
              active
                ? "bg-ink text-stone shadow-sm"
                : "text-ink/65 hover:bg-stone/60 hover:text-ink",
            )}
          >
            {Icon ? <Icon className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} /> : null}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
