import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  mapSummaryVersionRow,
  parseSummaryGenerationMetadata,
  SUMMARY_VERSIONS_SQL,
} from "./summary-versions";

describe("parseSummaryGenerationMetadata", () => {
  it("reads the generation time and the source note fingerprint", () => {
    expect(
      parseSummaryGenerationMetadata(
        '{"generatedAt":"2026-11-08T09:00:00.000Z","sourceNoteFingerprint":"v1:abc"}',
      ),
    ).toEqual({
      generatedAt: "2026-11-08T09:00:00.000Z",
      sourceNoteFingerprint: "v1:abc",
    });
  });

  it("returns nulls for summaries generated before versions existed", () => {
    expect(parseSummaryGenerationMetadata("{}")).toEqual({
      generatedAt: null,
      sourceNoteFingerprint: null,
    });
    expect(parseSummaryGenerationMetadata("not json")).toEqual({
      generatedAt: null,
      sourceNoteFingerprint: null,
    });
  });
});

describe("summary versions query", () => {
  it("lists only the superseded versions of one summary, newest first", () => {
    const { DatabaseSync } = createRequire(import.meta.url)(
      "node:sqlite",
    ) as typeof import("node:sqlite");
    const database = new DatabaseSync(":memory:");
    try {
      database.exec(
        readFileSync(
          resolve(
            process.cwd(),
            "../../crates/db-app/migrations/20261108120000_session_summary_versions.sql",
          ),
          "utf8",
        ),
      );
      database.exec(
        `INSERT INTO session_summary_versions (id, document_id, session_id, version, title, body_format, body, generated_at, superseded_at)
         VALUES
           ('a', 'summary-1', 'session-1', 1, 'Summary', 'markdown', '# V1', '2026-11-08T09:00:00.000Z', '2026-11-08T10:00:00.000Z'),
           ('b', 'summary-1', 'session-1', 2, 'Summary', 'prosemirror_json', '{"type":"doc"}', '2026-11-08T10:00:00.000Z', '2026-11-08T11:00:00.000Z'),
           ('c', 'summary-2', 'session-1', 1, 'Other', 'prosemirror_json', '{"type":"doc"}', '', '2026-11-08T11:00:00.000Z');`,
      );

      const rows = database
        .prepare(SUMMARY_VERSIONS_SQL)
        .all("summary-1") as Parameters<typeof mapSummaryVersionRow>[0][];
      const versions = rows.map(mapSummaryVersionRow);

      expect(versions.map((version) => [version.id, version.version])).toEqual([
        ["b", 2],
        ["a", 1],
      ]);
      expect(versions[1]).toMatchObject({
        documentId: "summary-1",
        generatedAt: "2026-11-08T09:00:00.000Z",
        supersededAt: "2026-11-08T10:00:00.000Z",
        markdown: "# V1",
      });
    } finally {
      database.close();
    }
  });
});
