import { describe, expect, it } from "vitest";

import {
  createEnhanceValidator,
  normalizeForComparison,
} from "./enhance-validator";

describe("normalizeForComparison", () => {
  it("normalizes ampersands, punctuation, case, and whitespace", () => {
    expect(normalizeForComparison("Status & Upload")).toBe("status and upload");
    expect(normalizeForComparison("  Hello,  World!  ")).toBe("hello world");
  });

  it("drops accents instead of the accented letters", () => {
    expect(normalizeForComparison("Résumé")).toBe("resume");
    expect(normalizeForComparison("Décisions clés")).toBe("decisions cles");
  });
});

describe("createEnhanceValidator", () => {
  const template = {
    title: "",
    description: null,
    sections: [
      { title: "Data File Status and Upload Testing", description: null },
      { title: "API Integration Issues", description: null },
    ],
  };

  it.each([
    "# Data File Status and Upload Testing",
    "# Data File",
    "# data file status & upload testing",
    "Here is the summary:\n# Data File Status and Upload Testing",
    // Issue 417 : les balises de provenance ne comptent pas.
    "# ⟦Data File",
    "⟦# Data File Status⟧ and Upload Testing",
    // Issue 779 : un titre de niveau 2 ne relance plus la génération.
    "## Data File Status",
    "# Data File Status and Upload Testing\n\n- Upl",
  ])("accepts valid heading input: %s", (input) => {
    expect(createEnhanceValidator(template)(input)).toEqual({ valid: true });
  });

  it.each([
    "Here is the summary:\n\nThe team",
    "**Data File Status**\n\nThe",
    "# Something Entirely Different",
    "### Data File Status",
  ])("rejects invalid heading input: %s", (input) => {
    expect(createEnhanceValidator(template)(input)).toMatchObject({
      valid: false,
    });
  });

  it.each(["Here is the summary", "Voici le compte rendu :\n\n"])(
    "waits for more text while a one-line preamble may precede the heading: %s",
    (input) => {
      expect(createEnhanceValidator(template)(input)).toEqual({
        pending: true,
      });
    },
  );

  it("matches section headings regardless of accents", () => {
    const frenchTemplate = {
      title: "",
      description: null,
      sections: [{ title: "Résumé", description: null }],
    };
    const validator = createEnhanceValidator(frenchTemplate);

    expect(validator("# Resume\n\n- Budget")).toEqual({ valid: true });
    expect(validator("## Résumé\n\n- Budget")).toEqual({ valid: true });
    expect(validator("# Ordre du jour\n\n- Budget")).toMatchObject({
      valid: false,
    });
  });

  it.each([
    {
      template: null,
      input: "Sure, here you go:\n# Any Heading",
    },
    {
      template: { title: "", description: null, sections: [] },
      input: "# Any Heading Works",
    },
  ])(
    "accepts heading input without section matching: $input",
    ({ template: inputTemplate, input }) => {
      expect(createEnhanceValidator(inputTemplate)(input)).toEqual({
        valid: true,
      });
    },
  );

  it("allows custom instructions to replace heading and template format requirements", () => {
    const validator = createEnhanceValidator(template, {
      overrideTemplateFormatting: true,
    });

    expect(validator("Decisions\n- Ship it")).toEqual({ valid: true });
    expect(validator("# Custom Heading")).toEqual({ valid: true });
  });
});
