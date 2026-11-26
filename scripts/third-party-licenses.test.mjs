import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildThirdPartyLicenses,
  checkThirdPartyLicenses,
  cratesFromMetadata,
  packagesFromPnpm,
  pnpmCommand,
  readLicenseFiles,
} from "./third-party-licenses.mjs";

// Issue 747 : génération de la page des licences, sur des données simulées.
// La liste réelle est contrôlée par `node scripts/third-party-licenses.mjs
// --check` (CI) et à chaque build de production (plugin Vite).

function crateDir(root, name, files = {}) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

function metadata(root) {
  const pkg = (name, source, extra = {}) => ({
    id: `${name}-id`,
    name,
    version: "1.0.0",
    license: "MIT",
    repository: `https://exemple.fr/${name}`,
    source,
    manifest_path: join(root, name, "Cargo.toml"),
    ...extra,
  });
  return {
    workspace_members: ["desktop-id", "inner-id"],
    packages: [
      pkg("desktop", null),
      pkg("inner", null),
      pkg("serde", "registry+https://github.com/rust-lang/crates.io-index"),
      pkg(
        "only-for-tests",
        "registry+https://github.com/rust-lang/crates.io-index",
      ),
      pkg("vendored", null, {
        manifest_path: join(root, "crates/x/vendor/vendored/Cargo.toml"),
      }),
    ],
    resolve: {
      nodes: [
        {
          id: "desktop-id",
          deps: [
            { pkg: "inner-id", dep_kinds: [{ kind: null }] },
            { pkg: "only-for-tests-id", dep_kinds: [{ kind: "dev" }] },
          ],
        },
        {
          id: "inner-id",
          deps: [
            { pkg: "serde-id", dep_kinds: [{ kind: null }] },
            { pkg: "vendored-id", dep_kinds: [{ kind: null }] },
          ],
        },
      ],
    },
  };
}

test("ships the normal dependencies only, workspace members excluded", () => {
  const root = mkdtempSync(join(tmpdir(), "licenses-"));
  const names = cratesFromMetadata(metadata(root), "desktop").map(
    (c) => c.name,
  );
  assert.deepEqual(names.sort(), ["serde", "vendored"]);
});

test("lists npm packages of the interface, without the workspace ones", () => {
  const packages = packagesFromPnpm({
    MIT: [
      {
        name: "react",
        versions: ["19.0.0"],
        paths: ["/x/react"],
        license: "MIT",
      },
      {
        name: "@syntheo/ui",
        versions: ["0.0.0"],
        paths: ["/x/ui"],
        license: "MIT",
      },
    ],
  });
  assert.deepEqual(
    packages.map((p) => [p.name, p.version, p.license, p.dir]),
    [["react", "19.0.0", "MIT", "/x/react"]],
  );
});

test("reads license, copying and notice files only", () => {
  const root = mkdtempSync(join(tmpdir(), "licenses-"));
  const dir = crateDir(root, "c", {
    "LICENSE-MIT": "MIT text",
    "LICENSE-APACHE": "Apache text",
    COPYING: "copying",
    "README.md": "not a license",
  });
  assert.deepEqual(readLicenseFiles(dir), [
    "copying",
    "Apache text",
    "MIT text",
  ]);
  assert.deepEqual(readLicenseFiles(join(root, "missing")), []);
});

test("keeps each identical license text once", () => {
  const root = mkdtempSync(join(tmpdir(), "licenses-"));
  writeFileSync(join(root, "LICENSE"), "Syntheo MIT");
  crateDir(root, "serde", { LICENSE: "Same MIT" });
  crateDir(root, "crates/x/vendor/vendored", { LICENSE: "Same MIT" });
  const react = crateDir(root, "react", { LICENSE: "React MIT" });
  const data = buildThirdPartyLicenses({
    root,
    appMetadata: metadata(root),
    speechMetadata: {
      workspace_members: ["syntheo-speech-id"],
      packages: [
        {
          id: "syntheo-speech-id",
          name: "syntheo-speech",
          version: "0.1.0",
          source: null,
          manifest_path: join(root, "speech/Cargo.toml"),
        },
      ],
      resolve: { nodes: [] },
    },
    pnpm: { MIT: [{ name: "react", versions: ["19.0.0"], paths: [react] }] },
    speech: [
      {
        kind: "model",
        name: "nemotron",
        version: "int8",
        license: "OpenMDW-1.1",
        url: "https://exemple.fr/nemotron",
        dir: root,
        only: ["LICENSE"],
      },
    ],
  });

  assert.equal(data.syntheo.text, "Syntheo MIT");
  assert.equal(data.syntheo.origin.project, "Anarlog");
  assert.deepEqual(
    data.components.map((c) => [c.kind, c.name]),
    [
      ["crate", "serde"],
      ["crate", "vendored"],
      ["model", "nemotron"],
      ["npm", "react"],
    ],
  );
  assert.deepEqual(data.texts, ["Same MIT", "Syntheo MIT", "React MIT"]);
  const serde = data.components.find((c) => c.name === "serde");
  const vendored = data.components.find((c) => c.name === "vendored");
  assert.deepEqual(serde.texts, vendored.texts);
});

test("the build check refuses an empty or incomplete list", () => {
  const empty = { syntheo: { text: "x" }, components: [], texts: [] };
  assert.throws(() => checkThirdPartyLicenses(empty), /aucune crate/);
  const complete = {
    syntheo: { text: "x" },
    texts: [],
    components: [
      { kind: "crate", name: "serde" },
      { kind: "crate", name: "tauri" },
      { kind: "npm", name: "react" },
      { kind: "model", name: "nemotron" },
    ],
  };
  assert.deepEqual(checkThirdPartyLicenses(complete), {
    crates: 2,
    npm: 1,
    native: 0,
    models: 1,
    texts: 0,
  });
});

// Alpha 0.8.2-1 : sous Windows, `pnpm` est un script `pnpm.cmd` qu'execFileSync
// ne lance pas sans shell. Pendant `pnpm build`, node lance le script de pnpm
// désigné par npm_execpath ; sinon le shell n'est pris que sous Windows.
test("launches pnpm through node when npm_execpath names its script", () => {
  const command = pnpmCommand({
    execPath: "C:\\node\\node.exe",
    npmExecPath: "C:\\pnpm\\bin\\pnpm.cjs",
    platform: "win32",
    exists: () => true,
  });
  assert.deepEqual(command, {
    file: "C:\\node\\node.exe",
    args: ["C:\\pnpm\\bin\\pnpm.cjs", "licenses", "list", "--prod", "--json"],
    shell: false,
  });
});

test("falls back to pnpm, through a shell on Windows only", () => {
  for (const [npmExecPath, exists] of [
    [undefined, () => true],
    ["C:\\pnpm\\pnpm.exe", () => true],
    ["C:\\pnpm\\bin\\pnpm.cjs", () => false],
  ]) {
    assert.deepEqual(
      pnpmCommand({ execPath: "node", npmExecPath, platform: "win32", exists }),
      {
        file: "pnpm",
        args: ["licenses", "list", "--prod", "--json"],
        shell: true,
      },
      String(npmExecPath),
    );
  }
  assert.equal(
    pnpmCommand({ npmExecPath: undefined, platform: "linux" }).shell,
    false,
  );
});
