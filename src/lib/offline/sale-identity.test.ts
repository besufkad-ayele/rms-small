import { describe, expect, it } from "vitest";
import { ensureClientOrderId } from "./sale-identity";

describe("ensureClientOrderId", () => {
  it("reuses a non-empty id so cloud and offline share one sale", () => {
    expect(ensureClientOrderId("sale_abc123")).toBe("sale_abc123");
    expect(ensureClientOrderId("  sale_abc123  ")).toBe("sale_abc123");
  });

  it("mints a sale_ id when missing", () => {
    const a = ensureClientOrderId();
    const b = ensureClientOrderId("");
    const c = ensureClientOrderId("   ");
    expect(a).toMatch(/^sale_[a-z0-9]+$/);
    expect(b).toMatch(/^sale_[a-z0-9]+$/);
    expect(c).toMatch(/^sale_[a-z0-9]+$/);
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
