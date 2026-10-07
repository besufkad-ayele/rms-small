import { describe, expect, it } from "vitest";
import { interpolate, isLocale } from "./i18n";
import { messages, translate } from "./i18n-messages";

describe("i18n", () => {
  it("accepts only en and am", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("am")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("interpolates placeholders", () => {
    expect(interpolate("ends in {n} day(s)", { n: 3 })).toBe(
      "ends in 3 day(s)",
    );
  });

  it("returns Amharic chrome strings and falls back to English", () => {
    expect(translate("am", "nav.home")).toBe("መነሻ");
    expect(translate("en", "nav.home")).toBe("Home");
    expect(translate("am", "sync.pending", { n: 4 })).toBe("4 በመጠባበቅ");
    expect(translate("en", "does.not.exist")).toBe("does.not.exist");
  });

  it("keeps English and Amharic keys in sync", () => {
    expect(Object.keys(messages.am).sort()).toEqual(
      Object.keys(messages.en).sort(),
    );
  });
});
