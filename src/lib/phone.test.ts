import { describe, expect, it } from "vitest";
import {
  assessPhone,
  optionalPhoneE164,
  parseStoredPhone,
  requirePhoneE164,
} from "./phone";

describe("phone", () => {
  it("requires 9 Ethiopian digits after +251", () => {
    expect(
      assessPhone({ iso: "ET", national: "911234567", required: true }),
    ).toMatchObject({ e164: "+251911234567", error: null });
    expect(assessPhone({ iso: "ET", national: "91123456", required: true }).error).toBe(
      "Enter 9 digits after +251.",
    );
  });

  it("drops a local leading zero", () => {
    expect(parseStoredPhone("0911234567")).toEqual({
      iso: "ET",
      national: "911234567",
    });
    expect(requirePhoneE164("0911234567")).toBe("+251911234567");
  });

  it("reads an international number back into its country", () => {
    expect(parseStoredPhone("+1 202 555 1234")).toEqual({
      iso: "US",
      national: "2025551234",
    });
    expect(requirePhoneE164("+254712345678")).toBe("+254712345678");
  });

  it("allows a blank optional phone and rejects a partial one", () => {
    expect(optionalPhoneE164("  ")).toBe("");
    expect(() => optionalPhoneE164("91123")).toThrow(/9 digits/);
  });
});
