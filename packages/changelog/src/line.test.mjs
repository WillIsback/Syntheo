import assert from "node:assert/strict";
import test from "node:test";

import { selectVersionLine } from "./line.ts";

const all = [
  "0.6.0",
  "0.7.0",
  "0.7.1",
  "0.7.2",
  "0.8.0",
  "0.8.1",
  "1.0.0",
  "1.0.1",
  "1.0.2",
  "1.1.0",
  "1.1.1",
  "1.2.0",
  "1.2.1",
  "1.2.2",
  "1.2.3",
];

test("le tableau de l'issue #536", () => {
  const cases = {
    "0.7.2": ["0.7.2", "0.7.1", "0.7.0"],
    "0.8.0": ["0.8.0"],
    "0.8.1": ["0.8.1", "0.8.0"],
    "1.0.0": ["1.0.0"],
    "1.0.2": ["1.0.2", "1.0.1", "1.0.0"],
    "1.2.3": ["1.2.3", "1.2.2", "1.2.1", "1.2.0", "1.0.0"],
  };
  for (const [current, expected] of Object.entries(cases)) {
    assert.deepEqual(selectVersionLine(all, current), expected, current);
  }
});

test("une alpha compte comme sa version de base", () => {
  assert.deepEqual(selectVersionLine(all, "0.7.1-3"), ["0.7.1", "0.7.0"]);
  assert.deepEqual(selectVersionLine(all, "v0.8.1"), ["0.8.1", "0.8.0"]);
});

test("un trou dans la ligne est sauté", () => {
  assert.deepEqual(selectVersionLine(["0.7.0", "0.7.2"], "0.7.2"), [
    "0.7.2",
    "0.7.0",
  ]);
  assert.deepEqual(selectVersionLine(["1.2.1", "1.2.3"], "1.2.3"), [
    "1.2.3",
    "1.2.1",
  ]);
});

test("une version future est ignorée", () => {
  assert.deepEqual(selectVersionLine([...all, "0.7.3"], "0.7.2"), [
    "0.7.2",
    "0.7.1",
    "0.7.0",
  ]);
});

test("ordre d'entrée indifférent, doublons et noms invalides", () => {
  assert.deepEqual(
    selectVersionLine(["0.7.0", "AGENTS", "0.7.1-2", "0.7.1"], "0.7.1"),
    ["0.7.1", "0.7.0"],
  );
  assert.deepEqual(selectVersionLine(all, "pas-une-version"), []);
});
