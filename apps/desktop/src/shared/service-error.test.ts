import { describe, expect, it } from "vitest";

import { describeServiceError, sanitizeErrorText } from "./service-error";

// Issue 713 : messages traduits et utiles, sans URL complète ni clé.
describe("describeServiceError", () => {
  it("explains raw transport and server errors without the address", () => {
    const cases: Array<[unknown, RegExp]> = [
      [
        new Error(
          "error sending request for url (http://192.168.1.87:8000/v1/chat/completions)",
        ),
        /could not be reached/,
      ],
      [
        new Error('UnexpectedStatus { status: 500, body: "boom" }'),
        /returned an error \(500\)/,
      ],
      [
        "Authentication failed. Please check your API key in settings.",
        /rejected the API key/,
      ],
      ["end of stream", /connection to the server was interrupted/],
      [new Error("Request timed out"), /took too long/],
      [new Error("HTTP 429 Too Many Requests"), /busy or the quota/],
      [new Error("status code 403"), /refused the request/],
      [
        new Error(
          "This proposal is stale. The meeting changed after it was created.",
        ),
        /out of date/,
      ],
      [
        new Error("Not enough transcript recorded to summarize."),
        /Not enough transcript/,
      ],
    ];
    for (const [error, expected] of cases) {
      const message = describeServiceError(error);
      expect(message, String(error)).toMatch(expected);
      expect(message).not.toMatch(/http:\/\//);
    }
  });

  it("cleans an unknown message: host only, secrets masked, bounded", () => {
    const text = sanitizeErrorText(
      "weird failure at https://llm.example.com/v1/x?key=1 with Bearer abcdefghijkl and sk-1234567890abcdef",
    );
    expect(text).toContain("llm.example.com");
    expect(text).not.toContain("https://");
    expect(text).not.toContain("abcdefghijkl");
    expect(text).not.toContain("sk-1234567890abcdef");
    expect(sanitizeErrorText("x".repeat(500)).length).toBe(200);
    expect(describeServiceError(new Error(""))).toMatch(/Something went wrong/);
  });

  it("does not read a status code in unrelated numbers", () => {
    expect(describeServiceError(new Error("disk has 500 GB free"))).toBe(
      "disk has 500 GB free",
    );
  });
});
