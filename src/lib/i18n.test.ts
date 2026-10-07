import { describe, expect, it } from "vitest";
import { interpolate, isLocale, localeIntlTag, LOCALES } from "./i18n";
import { messages, translate } from "./i18n-messages";

describe("i18n", () => {
  it("accepts English and Ethiopian locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("am")).toBe(true);
    expect(isLocale("om")).toBe(true);
    expect(isLocale("so")).toBe(true);
    expect(isLocale("ti")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("maps locales to Ethiopia BCP 47 tags", () => {
    expect(localeIntlTag("en")).toBe("en-ET");
    expect(localeIntlTag("am")).toBe("am-ET");
    expect(localeIntlTag("om")).toBe("om-ET");
    expect(localeIntlTag("so")).toBe("so-ET");
    expect(localeIntlTag("ti")).toBe("ti-ET");
  });

  it("interpolates placeholders", () => {
    expect(interpolate("ends in {n} day(s)", { n: 3 })).toBe(
      "ends in 3 day(s)",
    );
  });

  it("returns locale chrome strings and falls back to English", () => {
    expect(translate("am", "nav.home")).toBe("መነሻ");
    expect(translate("om", "nav.home")).toBe("Seensa");
    expect(translate("so", "nav.home")).toBe("Bogga hore");
    expect(translate("ti", "nav.home")).toBe("መጀመርታ");
    expect(translate("en", "nav.home")).toBe("Home");
    expect(translate("am", "sync.pending", { n: 4 })).toBe("4 በመጠባበቅ");
    expect(translate("en", "does.not.exist")).toBe("does.not.exist");
  });

  it("keeps all locale keys in sync", () => {
    const englishKeys = Object.keys(messages.en).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(messages[locale.id]).sort()).toEqual(englishKeys);
    }
  });
});
