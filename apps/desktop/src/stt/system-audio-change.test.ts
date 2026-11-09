import { describe, expect, it } from "vitest";

import { detectSystemAudioChange } from "./system-audio-change";

const speakers = { name: "Haut-parleurs (Realtek)", headphone: false };
const headset = { name: "Casque (Jabra Evolve2)", headphone: true };
const hdmi = { name: "HDMI — GPU NVIDIA", headphone: false };

describe("detectSystemAudioChange (issue 450)", () => {
  it("stays quiet until the capture is known and while it does not move", () => {
    expect(detectSystemAudioChange(null, speakers, [speakers.name])).toBeNull();
    expect(
      detectSystemAudioChange(speakers, { ...speakers }, [speakers.name]),
    ).toBeNull();
    // Une lecture manquée ne vaut pas un changement.
    expect(detectSystemAudioChange(speakers, null, [speakers.name])).toBeNull();
  });

  it("says the headset was unplugged when it left the list", () => {
    expect(detectSystemAudioChange(headset, speakers, [speakers.name])).toEqual(
      { kind: "headphones-unplugged", output: speakers.name },
    );
  });

  it("says a headset was plugged in when the capture moved to it", () => {
    expect(
      detectSystemAudioChange(speakers, headset, [speakers.name, headset.name]),
    ).toEqual({ kind: "headphones-plugged", output: headset.name });
  });

  it("names a chosen output that disappeared and the fallback", () => {
    expect(detectSystemAudioChange(hdmi, speakers, [speakers.name])).toEqual({
      kind: "output-unavailable",
      previous: hdmi.name,
      output: speakers.name,
    });
  });

  it("falls back to a generic message otherwise", () => {
    // Le casque est toujours branché, mais le système a changé de défaut.
    expect(
      detectSystemAudioChange(headset, hdmi, [
        speakers.name,
        headset.name,
        hdmi.name,
      ]),
    ).toEqual({ kind: "output-changed", output: hdmi.name });
  });
});
