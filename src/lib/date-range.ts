import type { ReportPeriod } from "@/lib/types";
import { dayKey, startOfMonth, startOfWeek, startOfYear } from "@/lib/utils";

export type DateRange = {
  from: Date | null;
  to: Date | null;
  label: string;
};

export type DateFilterState = {
  period: ReportPeriod;
  /** Inclusive YYYY-MM-DD custom bounds (override preset when set). */
  fromDate: string | null;
  toDate: string | null;
  /** Weekly: which week-start (YYYY-MM-DD Monday) or null = current */
  weekStart: string | null;
  /** Monthly: week-of-month 1–5, or null */
  monthWeek: number | null;
  /** Yearly: months 1–12 to include; empty = all */
  yearMonths: number[];
};

export function defaultDateFilter(
  period: ReportPeriod = "today",
): DateFilterState {
  return {
    period,
    fromDate: null,
    toDate: null,
    weekStart: null,
    monthWeek: null,
    yearMonths: [],
  };
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Resolve filter → inclusive [from, to] window for queries. */
export function resolveDateRange(filter: DateFilterState): DateRange {
  const now = new Date();

  // Explicit custom from/to always wins when both or either set with period
  if (filter.fromDate || filter.toDate) {
    const from = filter.fromDate ? startOfDay(parseDay(filter.fromDate)) : null;
    const to = filter.toDate
      ? endOfDay(parseDay(filter.toDate))
      : filter.fromDate
        ? endOfDay(parseDay(filter.fromDate))
        : endOfDay(now);
    const label =
      filter.fromDate && filter.toDate
        ? `${filter.fromDate}_to_${filter.toDate}`
        : filter.fromDate
          ? `from_${filter.fromDate}`
          : `to_${filter.toDate}`;
    return { from, to, label };
  }

  switch (filter.period) {
    case "today": {
      const from = startOfDay(now);
      return { from, to: endOfDay(now), label: "daily" };
    }
    case "week": {
      const base = filter.weekStart
        ? parseDay(filter.weekStart)
        : startOfWeek(now);
      const from = startOfDay(base);
      let to = endOfDay(
        new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6),
      );
      if (filter.monthWeek) {
        // unused in week mode
      }
      return { from, to, label: `week_${dayKey(from)}` };
    }
    case "month": {
      const monthStart = startOfMonth(now);
      if (filter.monthWeek && filter.monthWeek >= 1 && filter.monthWeek <= 5) {
        const from = startOfDay(
          new Date(
            monthStart.getFullYear(),
            monthStart.getMonth(),
            1 + (filter.monthWeek - 1) * 7,
          ),
        );
        const toCandidate = endOfDay(
          new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6),
        );
        const monthEnd = endOfDay(
          new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0),
        );
        const to = toCandidate > monthEnd ? monthEnd : toCandidate;
        return {
          from,
          to,
          label: `month_w${filter.monthWeek}`,
        };
      }
      return {
        from: startOfDay(monthStart),
        to: endOfDay(
          new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0),
        ),
        label: "this-month",
      };
    }
    case "year": {
      const yearStart = startOfYear(now);
      if (filter.yearMonths.length > 0) {
        const months = [...filter.yearMonths].sort((a, b) => a - b);
        const first = months[0];
        const last = months[months.length - 1];
        const from = startOfDay(
          new Date(yearStart.getFullYear(), first - 1, 1),
        );
        const to = endOfDay(new Date(yearStart.getFullYear(), last, 0));
        return {
          from,
          to,
          label: `year_m${months.join("-")}`,
        };
      }
      return {
        from: startOfDay(yearStart),
        to: endOfDay(new Date(yearStart.getFullYear(), 11, 31)),
        label: "yearly",
      };
    }
    case "all":
    default:
      return { from: null, to: null, label: "all-time" };
  }
}

/** Prior period of equal length for comparison charts. */
export function priorDateRange(range: DateRange): DateRange {
  if (!range.from || !range.to) {
    return { from: null, to: null, label: "prior" };
  }
  const ms = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - ms);
  return { from, to, label: "prior" };
}

export function filterLabel(filter: DateFilterState): string {
  return resolveDateRange(filter).label;
}
