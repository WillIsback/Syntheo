import { i18n } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildSpeakerCards,
  displaySpeakerLabel,
  isAnonymousSpeakerLabel,
  pickSpeakerExcerpts,
  summaryMentionsAnonymousSpeakers,
} from "./speakers";

import { messages as frMessages } from "~/i18n/locales/fr/messages";
import type { Segment } from "~/stt/live-segment";

let nextWord = 0;

function segment(
  label: string,
  text: string,
  options: {
    channel?: "DirectMic" | "RemoteParty" | "MixedCapture";
    speakerIndex?: number | null;
    humanId?: string | null;
  } = {},
): Segment {
  const channel = options.channel ?? "MixedCapture";
  const words = text.split(/\s+/).map((word) => {
    nextWord += 1;
    return {
      id: `w${nextWord}`,
      text: word,
      start_ms: nextWord * 100,
      end_ms: nextWord * 100 + 50,
      channel,
      is_final: true,
    };
  });
  return {
    id: `seg-${nextWord}`,
    key: {
      channel,
      speaker_index:
        options.speakerIndex === undefined ? 0 : options.speakerIndex,
      speaker_human_id: options.humanId ?? null,
    },
    speaker_label: label,
    start_ms: words[0]?.start_ms ?? 0,
    end_ms: words[words.length - 1]?.end_ms ?? 0,
    text,
    words,
  } as unknown as Segment;
}

describe("isAnonymousSpeakerLabel", () => {
  it("recognizes the renderer's anonymous labels only", () => {
    expect(isAnonymousSpeakerLabel("Speaker 1")).toBe(true);
    expect(isAnonymousSpeakerLabel("Speaker 12")).toBe(true);
    expect(isAnonymousSpeakerLabel("Speaker B")).toBe(true);
    expect(isAnonymousSpeakerLabel("Marie Dupont")).toBe(false);
    expect(isAnonymousSpeakerLabel("You")).toBe(false);
    expect(isAnonymousSpeakerLabel("Speaker 1 bis")).toBe(false);
  });
});

describe("pickSpeakerExcerpts", () => {
  it("keeps the two longest, most distinctive sentences in spoken order", () => {
    const excerpts = pickSpeakerExcerpts(
      [
        "Oui.",
        "Je pense que le budget de la médiathèque doit être revu avant mars.",
        "Bon, on verra bien.",
        "La médiathèque ouvrira le samedi matin dès le printemps prochain.",
      ],
      new Set(["médiathèque", "budget", "samedi", "printemps"]),
    );

    expect(excerpts).toEqual([
      "Je pense que le budget de la médiathèque doit être revu avant mars.",
      "La médiathèque ouvrira le samedi matin dès le printemps prochain.",
    ]);
  });

  it("prefers distinctive words over sheer length", () => {
    const excerpts = pickSpeakerExcerpts(
      [
        "Alors donc voilà en fait je ne sais pas trop quoi dire là-dessus.",
        "Le marché public de déneigement arrive à échéance.",
        "Ensuite on a parlé de choses et d'autres pendant un moment.",
      ],
      new Set(["marché", "public", "déneigement", "échéance"]),
    );

    // La phrase la plus courte l'emporte sur la troisième, plus longue mais
    // sans mot propre au locuteur.
    expect(excerpts).toEqual([
      "Alors donc voilà en fait je ne sais pas trop quoi dire là-dessus.",
      "Le marché public de déneigement arrive à échéance.",
    ]);
  });

  it("never returns the same sentence twice and skips filler", () => {
    const excerpts = pickSpeakerExcerpts(
      [
        "D'accord.",
        "Nous validons le calendrier.",
        "Nous validons le calendrier.",
      ],
      new Set(),
    );

    expect(excerpts).toEqual(["Nous validons le calendrier."]);
  });

  it("falls back to short turns when the speaker only said a few words", () => {
    expect(pickSpeakerExcerpts(["Oui.", "Merci."], new Set())).toEqual([
      "Oui.",
      "Merci.",
    ]);
  });

  it("shortens very long sentences at a word boundary", () => {
    const long = Array.from({ length: 60 }, (_, index) => `mot${index}`).join(
      " ",
    );
    const [excerpt] = pickSpeakerExcerpts([long], new Set());

    expect(excerpt?.length).toBeLessThanOrEqual(181);
    expect(excerpt?.endsWith("…")).toBe(true);
    expect(excerpt?.startsWith("mot0 mot1")).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const texts = [
      "Le premier point concerne la voirie du quartier nord.",
      "Le second point concerne la voirie du quartier sud.",
    ];
    expect(pickSpeakerExcerpts(texts, new Set())).toEqual(texts);
    expect(pickSpeakerExcerpts(texts, new Set())).toEqual(
      pickSpeakerExcerpts(texts, new Set()),
    );
  });
});

describe("buildSpeakerCards", () => {
  it("lists anonymous speakers from the most to the least present", () => {
    const cards = buildSpeakerCards([
      {
        transcriptId: "t1",
        segments: [
          segment("Speaker 1", "Bonjour à tous, merci d'être venus ce matin.", {
            speakerIndex: 0,
          }),
          segment("Speaker 2", "Je présente le budget de la médiathèque.", {
            speakerIndex: 1,
          }),
          segment("Marie Dupont", "Je prends note.", { humanId: "marie" }),
          segment("Speaker 2", "Le budget augmente de cinq pour cent.", {
            speakerIndex: 1,
          }),
          segment("Speaker 2", "Nous ouvrirons aussi le samedi.", {
            speakerIndex: 1,
          }),
        ],
      },
    ]);

    expect(cards.map((card) => [card.number, card.turns])).toEqual([
      ["2", 3],
      ["1", 1],
    ]);
    expect(cards[0]?.part).toBeNull();
    expect(cards[0]?.excerpts).toHaveLength(2);
  });

  it("keeps one card per speaker and per capture, without merging indexes", () => {
    // Deux captures (pause d'écoute, issue 353) : le même index n'est pas la
    // même personne d'une capture à l'autre.
    const before = segment(
      "Speaker 1",
      "Avant la pause nous parlions voirie.",
      { speakerIndex: 0 },
    );
    const after = segment(
      "Speaker 1",
      "Après la pause nous reprenons le chantier de la voirie.",
      { speakerIndex: 0 },
    );
    const afterAgain = segment("Speaker 1", "Le chantier commence lundi.", {
      speakerIndex: 0,
    });
    const cards = buildSpeakerCards([
      { transcriptId: "t1", segments: [before] },
      { transcriptId: "t2", segments: [after, afterAgain] },
    ]);

    expect(
      cards.map((card) => [card.transcriptId, card.part, card.turns]),
    ).toEqual([
      ["t2", 2, 2],
      ["t1", 1, 1],
    ]);
    expect(cards[1]?.excerpts).toEqual([
      "Avant la pause nous parlions voirie.",
    ]);
    expect(cards[0]?.targets).toEqual([
      {
        key: after.key,
        wordIds: [
          ...after.words.map((word) => word.id),
          ...afterAgain.words.map((word) => word.id),
        ],
      },
    ]);
  });

  it("breaks ties in presence by capture then first appearance", () => {
    const cards = buildSpeakerCards([
      {
        transcriptId: "t1",
        segments: [
          segment("Speaker 2", "Premier à parler ici.", { speakerIndex: 1 }),
          segment("Speaker 1", "Second à parler ici.", { speakerIndex: 0 }),
        ],
      },
    ]);

    expect(cards.map((card) => card.number)).toEqual(["2", "1"]);
  });

  it("ignores captures and segments without words", () => {
    const empty = { ...segment("Speaker 3", "x"), words: [], text: "" };
    expect(
      buildSpeakerCards([
        { transcriptId: "t1", segments: [empty as Segment] },
        { transcriptId: "t2", segments: [] },
      ]),
    ).toEqual([]);
  });
});

describe("summaryMentionsAnonymousSpeakers", () => {
  it("detects anonymous speakers mentioned in French or English", () => {
    expect(
      summaryMentionsAnonymousSpeakers("Le locuteur 2 propose un vote."),
    ).toBe(true);
    expect(summaryMentionsAnonymousSpeakers("- **Speaker 1** : accord")).toBe(
      true,
    );
    expect(summaryMentionsAnonymousSpeakers("Intervenant 3 s'abstient.")).toBe(
      true,
    );
    expect(
      summaryMentionsAnonymousSpeakers("Marie Dupont propose 2 dates."),
    ).toBe(false);
  });
});

describe("displaySpeakerLabel", () => {
  beforeEach(() => {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
  });

  afterEach(() => {
    i18n.activate("en");
  });

  it("traduit les libellés anonymes produits par le rendu", () => {
    expect(displaySpeakerLabel("Speaker 2")).toBe("Locuteur 2");
    expect(displaySpeakerLabel("Speaker B")).toBe("Locuteur B");
    expect(displaySpeakerLabel("You")).toBe("Vous");
  });

  it("laisse les noms tels quels", () => {
    expect(displaySpeakerLabel("Alice")).toBe("Alice");
    expect(displaySpeakerLabel("Speaker 2 bis")).toBe("Speaker 2 bis");
  });
});
