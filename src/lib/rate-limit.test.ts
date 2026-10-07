import { describe, expect, it } from "vitest";
import { allowRequest, publicOrderKey } from "./rate-limit";

describe("allowRequest", () => {
  it("allows up to max hits in the window then blocks", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect(allowRequest(key, 2, 60_000)).toBe(true);
    expect(allowRequest(key, 2, 60_000)).toBe(true);
    expect(allowRequest(key, 2, 60_000)).toBe(false);
  });

  it("keys public orders by slug and digits-only phone", () => {
    expect(publicOrderKey("cafe-one", "+251 91-234-5678")).toBe(
      "cafe-one:251912345678",
    );
  });
});
