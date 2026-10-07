import { describe, expect, it } from "vitest";
import {
  assertPrepTag,
  prepKindForItem,
  stationForKind,
  withPrepKind,
} from "./prep-station";

describe("prep station", () => {
  it("requires exactly one of food or drink", () => {
    expect(assertPrepTag(["spicy", "drink"])).toBe("drink");
    expect(assertPrepTag(["food"])).toBe("food");
    expect(() => assertPrepTag(["spicy"])).toThrow(/Food or Drink/);
    expect(() => assertPrepTag(["food", "drink"])).toThrow(/Food or Drink/);
  });

  it("sends drinks to the barista and food to the kitchen", () => {
    expect(stationForKind("drink")).toBe("barista");
    expect(stationForKind("food")).toBe("kitchen");
  });

  it("keeps one station tag", () => {
    expect(withPrepKind(["food", "spicy", "drink"], "drink")).toEqual([
      "spicy",
      "drink",
    ]);
  });

  it("routes older items by category when the tag is missing", () => {
    expect(prepKindForItem({ category: "hot-drinks", tags: [] })).toBe("drink");
    expect(prepKindForItem({ category: "food", tags: [] })).toBe("food");
    expect(
      prepKindForItem({ category: "hot-drinks", tags: ["food"] }),
    ).toBe("food");
  });
});
