import { describe, expect, it } from "vitest";

import { isMeasurementOutdated, MEASUREMENT_OUTDATED_SQL } from "./outdated";

// Issue 734 : « mesure à refaire » seulement quand toutes les mesures de la
// synthèse datent d'une règle antérieure.
describe("isMeasurementOutdated", () => {
  it("flags a summary measured only under an older rule", () => {
    expect(isMeasurementOutdated({ measured: 1, current: 0 })).toBe(true);
  });

  it("stays quiet without measurement or with one at the current rule", () => {
    expect(isMeasurementOutdated({ measured: 0, current: 0 })).toBe(false);
    expect(isMeasurementOutdated({ measured: 1, current: 1 })).toBe(false);
    expect(isMeasurementOutdated(undefined)).toBe(false);
  });

  it("reads counts only, never text", () => {
    expect(MEASUREMENT_OUTDATED_SQL).toContain("rule_version = ?2");
    expect(MEASUREMENT_OUTDATED_SQL).not.toMatch(/body|title|text/i);
  });
});
