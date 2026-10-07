import { describe, expect, it } from "vitest";
import {
  optionalWebsite,
  requireEmail,
  requireText,
  sanitizeText,
} from "./form-sanitize";

describe("form sanitize", () => {
  it("collapses whitespace and strips control characters", () => {
    expect(sanitizeText("  Macchiato \n\t special \u0000 ")).toBe(
      "Macchiato special",
    );
  });

  it("rejects an empty required name", () => {
    expect(() => requireText("Name", "   ")).toThrow(/Name is required/);
  });

  it("checks email and optional website", () => {
    expect(requireEmail(" A@Example.COM ")).toBe("a@example.com");
    expect(() => requireEmail("not-an-email")).toThrow(/valid email/);
    expect(optionalWebsite("cafe.example")).toBe("https://cafe.example/");
    expect(optionalWebsite("")).toBe("");
  });
});
