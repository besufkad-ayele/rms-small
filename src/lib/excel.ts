import * as XLSX from "xlsx";
import type { ReportPeriod } from "@/lib/types";

export function downloadWorkbook(
  filename: string,
  sheets: { name: string; rows: Record<string, string | number | null | undefined>[] }[],
) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows.length ? sheet.rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function periodLabel(period: ReportPeriod): string {
  switch (period) {
    case "today":
      return "daily";
    case "week":
      return "weekly";
    case "month":
      return "monthly";
    case "year":
      return "yearly";
    case "all":
      return "all-time";
  }
}
