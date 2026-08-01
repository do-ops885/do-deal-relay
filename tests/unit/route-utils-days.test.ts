import { describe, expect, it } from "vitest";
import { parseDaysParam } from "../../worker/routes/utils";

describe("parseDaysParam", () => {
  it("returns 30 when days is missing", () => {
    expect(parseDaysParam(new URL("https://example.com/api"))).toBe(30);
  });

  it("parses a valid days value", () => {
    expect(parseDaysParam(new URL("https://example.com/api?days=14"))).toBe(14);
  });

  it("falls back to the minimum for invalid values", () => {
    expect(parseDaysParam(new URL("https://example.com/api?days=abc"))).toBe(1);
    expect(parseDaysParam(new URL("https://example.com/api?days=NaN"))).toBe(1);
    expect(parseDaysParam(new URL("https://example.com/api?days="))).toBe(1);
  });

  it("clamps values to the default bounds", () => {
    expect(parseDaysParam(new URL("https://example.com/api?days=0"))).toBe(1);
    expect(parseDaysParam(new URL("https://example.com/api?days=-5"))).toBe(1);
    expect(parseDaysParam(new URL("https://example.com/api?days=400"))).toBe(
      365,
    );
  });

  it("supports route-specific defaults and bounds", () => {
    const url = new URL("https://example.com/api?days=400");

    expect(parseDaysParam(url, { defaultValue: 7, min: 1, max: 1000 })).toBe(
      400,
    );
    expect(
      parseDaysParam(new URL("https://example.com/api"), {
        defaultValue: 7,
        min: 1,
        max: 1000,
      }),
    ).toBe(7);
  });
});
