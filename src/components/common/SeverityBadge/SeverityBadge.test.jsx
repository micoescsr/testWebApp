import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SeverityBadge from "./SeverityBadge";

/**
 * Locks the level -> class contract. This is the guard for the bug where
 * ThreatDetail hardcoded the "critical" class so every threat rendered red
 * regardless of its actual severity. If a future change breaks the
 * level -> severity-badge--{level} mapping, these fail immediately.
 *
 * Rendered with renderToStaticMarkup (ships with react-dom) so no DOM
 * environment or testing-library dependency is required.
 */
describe("SeverityBadge level -> class mapping", () => {
  const cases = [
    ["critical", "severity-badge--critical"],
    ["high", "severity-badge--high"],
    ["medium", "severity-badge--medium"],
    ["low", "severity-badge--low"],
    ["info", "severity-badge--info"],
    ["none", "severity-badge--none"],
  ];

  it.each(cases)("renders %s as %s", (level, expectedClass) => {
    const html = renderToStaticMarkup(<SeverityBadge level={level} />);
    expect(html).toContain(expectedClass);
  });

  it("is case-insensitive (CRITICAL -> critical class)", () => {
    const html = renderToStaticMarkup(<SeverityBadge level="CRITICAL" />);
    expect(html).toContain("severity-badge--critical");
  });

  it("maps unrecognized values to the unknown class", () => {
    const html = renderToStaticMarkup(<SeverityBadge level="banana" />);
    expect(html).toContain("severity-badge--unknown");
  });

  it("maps null/empty to the unknown class", () => {
    expect(renderToStaticMarkup(<SeverityBadge level={null} />)).toContain(
      "severity-badge--unknown",
    );
    expect(renderToStaticMarkup(<SeverityBadge level="" />)).toContain(
      "severity-badge--unknown",
    );
  });

  it("does not apply a sibling level class (critical is not high)", () => {
    const html = renderToStaticMarkup(<SeverityBadge level="low" />);
    expect(html).not.toContain("severity-badge--critical");
    expect(html).not.toContain("severity-badge--high");
  });
});
