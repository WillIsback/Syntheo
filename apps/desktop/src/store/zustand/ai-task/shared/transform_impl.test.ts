import type { TextStreamPart, ToolSet } from "ai";
import { describe, expect, it } from "vitest";

import { normalizeBulletPoints } from "./transform_impl";
import type { StreamTransform } from "./transform_infra";

async function run(
  chunks: TextStreamPart<ToolSet>[],
  transform: StreamTransform,
): Promise<TextStreamPart<ToolSet>[]> {
  const source = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  const stream = source.pipeThrough(
    transform({ tools: {}, stopStream: () => {} }),
  );
  const reader = stream.getReader();
  const results: TextStreamPart<ToolSet>[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    results.push(value);
  }

  return results;
}

describe("normalizeBulletPoints", () => {
  it("normalizes bullets at line starts across text chunks", async () => {
    const results = await run(
      [
        { type: "text-delta", id: "1", text: "• one\n  • two\n" },
        { type: "text-delta", id: "1", text: "• three\n•no-space" },
      ],
      normalizeBulletPoints(),
    );

    expect(
      results
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.text),
    ).toEqual(["- one\n  - two\n", "- three\n•no-space"]);
  });
});
