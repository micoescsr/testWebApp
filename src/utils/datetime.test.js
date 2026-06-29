// utils/datetime.test.js
import { describe, test, expect } from "vitest";
import { formatManila } from "./datetime";

describe("formatManila", () => {
  // Confirmed backend value: UTC with +00:00 offset → Asia/Manila is UTC+8.
  test("converts an offset-bearing UTC timestamp to Manila time", () => {
    expect(formatManila("2026-06-29T09:05:49.379+00:00")).toBe(
      "06/29/2026, 05:05:49 PM",
    );
  });

  test("accepts a Z-suffixed UTC timestamp identically", () => {
    expect(formatManila("2026-06-29T09:05:49.379Z")).toBe(
      "06/29/2026, 05:05:49 PM",
    );
  });

  test("dateOnly drops the time portion", () => {
    expect(formatManila("2026-06-29T09:05:49.379+00:00", { dateOnly: true })).toBe(
      "06/29/2026",
    );
  });

  test("returns null for missing/invalid input", () => {
    expect(formatManila(null)).toBeNull();
    expect(formatManila(undefined)).toBeNull();
    expect(formatManila("")).toBeNull();
    expect(formatManila("not-a-date")).toBeNull();
  });
});
