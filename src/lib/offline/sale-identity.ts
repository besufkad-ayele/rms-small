import { uid } from "@/lib/utils";

export function ensureClientOrderId(existing?: string | null): string {
  const v = existing?.trim();
  return v ? v : uid("sale");
}
