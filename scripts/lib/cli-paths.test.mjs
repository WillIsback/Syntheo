import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { existingDirectory, existingFile, outputFile } from "./cli-paths.mjs";

function scratch(t) {
  const directory = realpathSync(
    mkdtempSync(path.join(tmpdir(), "syntheo-cli-paths-")),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("existing files and directories are resolved", (t) => {
  const directory = scratch(t);
  const file = path.join(directory, "run.json");
  writeFileSync(file, "{}");

  assert.equal(existingFile(file, "--run"), file);
  assert.equal(existingDirectory(directory, "--evidence-dir"), directory);
});

test("missing paths and wrong kinds are rejected", (t) => {
  const directory = scratch(t);
  assert.throws(
    () => existingFile(path.join(directory, "nope.json"), "--run"),
    /does not exist/,
  );
  assert.throws(() => existingFile(directory, "--run"), /is not a file/);
  assert.throws(
    () => existingDirectory(undefined, "--evidence-dir"),
    /Missing/,
  );
  assert.throws(() => existingFile("a\0b", "--run"), /Missing or invalid/);
});

test("output files need an existing parent and must not be symlinks", (t) => {
  const directory = scratch(t);
  const output = path.join(directory, "result.json");
  assert.equal(outputFile(output, "--output"), output);

  assert.throws(
    () =>
      outputFile(path.join(directory, "missing", "result.json"), "--output"),
    /does not exist/,
  );

  mkdirSync(path.join(directory, "dir"));
  assert.throws(
    () => outputFile(path.join(directory, "dir"), "--output"),
    /regular file/,
  );

  if (process.platform !== "win32") {
    const outside = path.join(directory, "outside.json");
    writeFileSync(outside, "untouched");
    symlinkSync(outside, path.join(directory, "link.json"));
    assert.throws(
      () => outputFile(path.join(directory, "link.json"), "--output"),
      /regular file/,
    );
  }
});
