import { describe, it, expect } from "vitest";
import { slugify, resolveFilename } from "./naming";

describe("slugify", () => {
  it("transliterates Ukrainian", () => {
    expect(slugify("Комплект боді і штанці")).toBe("komplekt-bodi-i-shtantsi");
  });

  it("handles specific Ukrainian letters", () => {
    expect(slugify("Ґудзик їжак є й")).toBe("gudzyk-izhak-ie-i");
  });

  it("collapses punctuation and spaces into single dashes", () => {
    expect(slugify("  Боді — «Ведмедик», 2 шт.  ")).toBe("bodi-vedmedyk-2-sht");
  });

  it("strips curly apostrophe", () => {
    expect(slugify("м'яч")).toBe("miach");
  });
});

describe("resolveFilename", () => {
  it("prefers SKU over product name", () => {
    expect(resolveFilename({ sku: "AB-123", productName: "Боді" })).toBe("ab-123");
  });

  it("falls back to product name", () => {
    expect(resolveFilename({ productName: "Боді синє" })).toBe("bodi-synie");
  });

  it("throws when both are missing or blank", () => {
    expect(() => resolveFilename({})).toThrow();
    expect(() => resolveFilename({ sku: "  " })).toThrow();
  });
});
