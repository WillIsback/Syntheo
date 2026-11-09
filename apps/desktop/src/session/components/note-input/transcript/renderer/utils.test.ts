import chroma from "chroma-js";
import { describe, expect, it } from "vitest";

import { DesignColors } from "@syntheo/design-system";

import { getSegmentColorVars } from "./utils";

import type { SegmentKey } from "~/stt/live-segment";

const getSegmentColor = (key: SegmentKey) =>
  getSegmentColorVars(key)["--segment-color-light"];

describe("transcript renderer utils", () => {
  it("distingue les personnes partageant un canal et un index", () => {
    const key: SegmentKey = {
      channel: "MixedCapture",
      speaker_index: null,
      speaker_human_id: "person-1",
    };
    const first = getSegmentColor(key);
    const second = getSegmentColor({
      ...key,
      speaker_human_id: "person-2",
    });

    expect(chroma.deltaE(first, second)).toBeGreaterThan(20);
    expect(
      getSegmentColor({ ...key, channel: "RemoteParty", speaker_index: 3 }),
    ).toBe(first);
  });

  it("cycle dans la palette s1–s4 pour les locuteurs non identifiés", () => {
    const colors = Array.from({ length: 6 }, (_, speaker_index) =>
      getSegmentColor({
        channel: "MixedCapture",
        speaker_index,
        speaker_human_id: null,
      }),
    );

    expect(new Set(colors).size).toBe(4);
    expect(colors[0]).toBe(colors[4]);
    expect(colors[1]).toBe(colors[5]);
  });

  it("expose la variante claire et la variante sombre du jeton chart", () => {
    const key: SegmentKey = {
      channel: "DirectMic",
      speaker_index: 0,
      speaker_human_id: null,
    };

    expect(getSegmentColorVars(key)).toEqual({
      "--segment-color-light": getSegmentColor(key),
      "--segment-color-dark": DesignColors.dark.chart2,
    });
    expect(getSegmentColor(key)).toBe(DesignColors.light.chart2);
  });
});
