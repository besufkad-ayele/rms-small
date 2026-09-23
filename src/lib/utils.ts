import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { BillBreakdown } from "./money";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
}

export function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfYear(date = new Date()): Date {
  return new Date(date.getFullYear(), 0, 1);
}

export function formatMoney(amount: number, currency = "ETB"): string {
  return (
    new Intl.NumberFormat("en-ET", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount) + ` ${currency}`
  );
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-ET", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export type { BillBreakdown };
