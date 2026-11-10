import braces from "braces";
import decode from "decode-uri-component";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("braces rejects deeply nested patterns before recursive walkers exhaust the stack", () => {
  const input = "{".repeat(4_000) + "a,b" + "}".repeat(4_000);
  for (const operation of [braces.compile, braces.expand]) {
    assert.throws(() => operation(input), {
      name: "SyntaxError",
      message: /nesting depth/,
    });
  }
  assert.deepEqual(braces.expand("{one,two}"), ["one", "two"]);
});

test("malformed URI decoding stays bounded and preserves valid UTF-8", () => {
  assert.equal(decode("%E2%82%AC%FF"), "€%FF");
  assert.equal(decode("a+b"), "a+b");
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import decode from 'decode-uri-component'; const s='%FF'.repeat(5000); if(decode(s)!==s) process.exit(1);",
    ],
    { timeout: 3_000, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});
