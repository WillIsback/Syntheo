import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildThirdPartyLicenses,
  checkThirdPartyLicenses,
  checkTypesOnly,
  checkUnshippedDependencies,
  cratesFromMetadata,
  detectLicense,
  entryImports,
  licenseFromTexts,
  packagesFromPnpm,
  pnpmCommand,
  pnpmTreeDirs,
  readLicenseFiles,
  readTextFile,
  shippedPackageDirs,
  SYNTHEO_REPOSITORY,
  UNKNOWN_LICENSE,
  UNSHIPPED_DEPENDENCIES,
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

// Issue 780 (CodeQL js/file-system-race) : contrôle et lecture par le même
// descripteur ; dossiers, fichiers absents ou trop gros refusés.
test("reads a license file through one descriptor, bounded", () => {
  const root = mkdtempSync(join(tmpdir(), "licenses-"));
  writeFileSync(join(root, "LICENSE"), "  MIT\r\ntext  \r\n");
  writeFileSync(join(root, "LICENSE-BIG"), "x".repeat(128 * 1024 + 1));
  mkdirSync(join(root, "LICENSES"));
  assert.equal(readTextFile(join(root, "LICENSE")), "MIT\ntext");
  assert.equal(readTextFile(join(root, "LICENSE-BIG")), null);
  assert.equal(readTextFile(join(root, "LICENSES")), null);
  assert.equal(readTextFile(join(root, "missing")), null);
  assert.deepEqual(readLicenseFiles(root), ["MIT\ntext"]);
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

// Issue 775 : licence déduite du texte quand le champ est absent, liste npm
// limitée aux paquets livrés, dépôt de Syntheo.
const MIT_TEXT = `The MIT License (MIT)

Copyright (c) 2019-present Exemple

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction.

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.`;

const BSD_START =
  "Redistribution and use in source and binary forms, with or without\nmodification, are permitted provided that the following conditions are met:\n" +
  "1. Redistributions of source code must retain the above copyright notice.\n" +
  "2. Redistributions in binary form must reproduce the above copyright notice.\n";

test("detects MIT, ISC, Apache-2.0 and BSD texts, conservatively", () => {
  assert.equal(detectLicense(MIT_TEXT), "MIT");
  assert.equal(
    detectLicense(
      "ISC License\n\nPermission to use, copy, modify, and/or distribute this software for any\npurpose with or without fee is hereby granted.\n\n" +
        'THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.',
    ),
    "ISC",
  );
  assert.equal(
    detectLicense(
      "                                 Apache License\n                           Version 2.0, January 2004\n",
    ),
    "Apache-2.0",
  );
  assert.equal(
    detectLicense(`${BSD_START}3. Neither the name of Orion nor ...`),
    "BSD-3-Clause",
  );
  assert.equal(detectLicense(BSD_START), "BSD-2-Clause");
  assert.equal(
    detectLicense(`${BSD_START}3. All advertising materials ...`),
    null,
  );
  // MIT-0 : sans la condition de reproduction de l'avis.
  assert.equal(
    detectLicense(
      MIT_TEXT.replace(
        "The above copyright notice and this permission notice shall be included",
        "",
      ),
    ),
    null,
  );
  assert.equal(detectLicense("Copyright Orion. All rights reserved."), null);
});

test("deduces a license only when every text agrees", () => {
  assert.equal(licenseFromTexts([MIT_TEXT]), "MIT");
  assert.equal(licenseFromTexts([MIT_TEXT, MIT_TEXT]), "MIT");
  assert.equal(licenseFromTexts([MIT_TEXT, "Notice d'Orion"]), null);
  assert.equal(licenseFromTexts([]), null);
});

test("keeps the npm packages without license field as undeclared", () => {
  const packages = packagesFromPnpm({
    Unknown: [{ name: "khroma", versions: ["2.1.0"], paths: ["/x/khroma"] }],
  });
  assert.equal(packages[0].license, null);
});

// Arbre de `pnpm list --prod --json --depth Infinity` : un paquet n'est
// détaillé qu'une fois, ses autres occurrences sont `deduped`.
function pnpmTree() {
  const dep = (path, dependencies) => ({
    version: "1.0.0",
    path,
    ...(dependencies ? { dependencies } : { deduped: true }),
  });
  return [
    { path: "/w" },
    {
      name: "@syntheo/desktop",
      path: "/w/apps/desktop",
      dependencies: {
        "@syntheo/ui": { version: "link:../../packages/ui", path: "/w/ui" },
        "react-scan": dep("/m/react-scan", {
          bippy: dep("/m/bippy", {}),
          "react-doctor": dep("/m/react-doctor", {
            eslint: dep("/m/eslint", { esquery: dep("/m/esquery", {}) }),
          }),
        }),
        // Détaillé ici, mais aussi atteint par react-doctor plus haut.
        esquery: dep("/m/esquery"),
      },
    },
    {
      name: "@syntheo/ui",
      path: "/w/ui",
      dependencies: { clsx: dep("/m/clsx", {}), eslint: dep("/m/eslint") },
    },
  ];
}

test("ships the dependency closure without the unshipped edges", () => {
  const shipped = shippedPackageDirs(pnpmTree(), "@syntheo/desktop", {
    "react-scan": ["react-doctor"],
  });
  assert.deepEqual([...shipped].sort(), [
    "/m/bippy",
    "/m/clsx",
    "/m/eslint",
    "/m/esquery",
    "/m/react-scan",
    "/w/apps/desktop",
    "/w/ui",
  ]);
  const withoutUi = pnpmTree();
  delete withoutUi[2].dependencies.eslint;
  assert.equal(
    shippedPackageDirs(withoutUi, "@syntheo/desktop", {
      "react-scan": ["react-doctor"],
    }).has("/m/eslint"),
    false,
  );
  const packages = packagesFromPnpm(
    {
      MIT: [
        { name: "bippy", versions: ["1.0.0"], paths: ["/m/bippy"] },
        {
          name: "react-doctor",
          versions: ["1.0.0"],
          paths: ["/m/react-doctor"],
        },
      ],
    },
    shipped,
  );
  assert.deepEqual(
    packages.map((p) => p.name),
    ["bippy"],
  );
});

test("refuses to drop a dependency the entry module imports", () => {
  const root = mkdtempSync(join(tmpdir(), "licenses-"));
  const dir = crateDir(root, "outil", {
    "package.json": JSON.stringify({
      exports: { ".": { types: "./index.d.ts", import: "./index.mjs" } },
    }),
    "index.mjs":
      'import { a } from "./chunk.mjs";\nimport "node:fs";\nexport * from "@orion/runtime";',
    "chunk.mjs": 'export const a = await import("bippy/core");',
  });
  assert.deepEqual([...entryImports(dir)].sort(), ["@orion/runtime", "bippy"]);
  checkUnshippedDependencies([["outil", dir]], { outil: ["orion-cli"] });
  assert.throws(
    () => checkUnshippedDependencies([["outil", dir]], { outil: ["bippy"] }),
    /outil importe bippy/,
  );
});

test("follows directory and extensionless imports, and fails loudly", () => {
  const root = mkdtempSync(join(tmpdir(), "licenses-"));
  const dir = crateDir(root, "kit", {
    "package.json": JSON.stringify({ module: "es/index.js" }),
  });
  mkdirSync(join(dir, "es/Panel"), { recursive: true });
  mkdirSync(join(dir, "es/awesome"), { recursive: true });
  writeFileSync(
    join(dir, "es/index.js"),
    'export { default as Panel } from "./Panel";\nimport "./theme";\nconst a = "require(\'./package.json\')";',
  );
  writeFileSync(join(dir, "es/Panel/index.js"), 'import "@orion/panel";');
  writeFileSync(join(dir, "es/theme.js"), 'import "./theme.css";');
  writeFileSync(join(dir, "es/theme.css"), "");
  // Sous-chemin séparé, jamais atteint depuis l'entrée.
  writeFileSync(join(dir, "es/awesome/index.js"), 'import "@orion/forum";');
  assert.deepEqual([...entryImports(dir, ["./package.json"])].sort(), [
    "@orion/panel",
  ]);
  // Un import introuvable n'est plus ignoré.
  assert.throws(() => entryImports(dir), /import introuvable/);
  writeFileSync(join(dir, "es/theme.js"), 'import "./absent";');
  assert.throws(
    () => entryImports(dir, ["./package.json"]),
    /import introuvable : .*absent/,
  );
  writeFileSync(join(dir, "es/theme.js"), 'import "../../outside.js";');
  writeFileSync(join(root, "outside.js"), "");
  assert.throws(
    () => entryImports(dir, ["./package.json"]),
    /import hors du paquet/,
  );
  assert.throws(
    () => entryImports(join(root, "missing")),
    /package.json illisible/,
  );
  const noEntry = crateDir(root, "vide", {
    "package.json": JSON.stringify({ main: "dist/index.js" }),
  });
  assert.throws(() => entryImports(noEntry), /import introuvable/);
});

test("drops build-only and type-only packages of shipped ones", () => {
  assert.deepEqual(UNSHIPPED_DEPENDENCIES["@emotion/react"], [
    "@emotion/babel-plugin",
  ]);
  assert.deepEqual(UNSHIPPED_DEPENDENCIES["@lobehub/ui"], [
    "@giscus/react",
    "@splinetool/runtime",
  ]);
  const dep = (path, dependencies = {}) => ({
    version: "1.0.0",
    path,
    dependencies,
  });
  const tree = [
    {
      name: "@syntheo/desktop",
      path: "/w/apps/desktop",
      dependencies: {
        "@emotion/react": dep("/m/emotion-react", {
          "@emotion/babel-plugin": dep("/m/emotion-babel", {
            "babel-plugin-macros": dep("/m/macros"),
          }),
          "@emotion/cache": dep("/m/emotion-cache"),
          "@types/react": dep("/m/types-react"),
        }),
        "@lobehub/ui": dep("/m/lobehub-ui", {
          "@giscus/react": dep("/m/giscus-react", { giscus: dep("/m/giscus") }),
          "@splinetool/runtime": dep("/m/spline"),
          antd: dep("/m/antd"),
        }),
      },
    },
  ];
  assert.deepEqual([...shippedPackageDirs(tree, "@syntheo/desktop")].sort(), [
    "/m/antd",
    "/m/emotion-cache",
    "/m/emotion-react",
    "/m/lobehub-ui",
    "/w/apps/desktop",
  ]);
});

test("refuses a types package that carries scripts", () => {
  const root = mkdtempSync(join(tmpdir(), "licenses-"));
  const clean = crateDir(root, "types-a", {
    "index.d.ts": "export {};",
    "package.json": "{}",
  });
  checkTypesOnly([clean]);
  const odd = crateDir(root, "types-b", { "index.js": "export {};" });
  assert.throws(() => checkTypesOnly([clean, odd]), /porteurs de scripts/);
});

test("pnpm licenses list and pnpm list must agree exactly", () => {
  const tree = pnpmTreeDirs(pnpmTree());
  const shipped = shippedPackageDirs(pnpmTree(), "@syntheo/desktop", {
    "react-scan": ["react-doctor"],
  });
  const entry = (name, path) => ({ name, versions: ["1.0.0"], paths: [path] });
  const complete = [
    entry("bippy", "/m/bippy"),
    entry("clsx", "/m/clsx"),
    entry("eslint", "/m/eslint"),
    entry("esquery", "/m/esquery"),
    entry("react-scan", "/m/react-scan"),
    entry("react-doctor", "/m/react-doctor"),
  ];
  assert.equal(packagesFromPnpm({ MIT: complete }, shipped, tree).length, 5);
  // Un dossier livré sans entrée de licence.
  assert.throws(
    () => packagesFromPnpm({ MIT: complete.slice(1) }, shipped, tree),
    /livrés sans licence : \/m\/bippy/,
  );
  // Une entrée de licence hors de l'arbre de pnpm list.
  assert.throws(
    () =>
      packagesFromPnpm(
        { MIT: [...complete, entry("fantome", "/m/fantome")] },
        shipped,
        tree,
      ),
    /absents de pnpm list : fantome@1.0.0/,
  );
  assert.throws(
    () =>
      packagesFromPnpm(
        { MIT: [...complete, { name: "sans", versions: ["1.0.0"] }] },
        shipped,
        tree,
      ),
    /sans@1.0.0 \(sans dossier\)/,
  );
});

test("deduces the license of a component from its text, else marks it", () => {
  const root = mkdtempSync(join(tmpdir(), "licenses-"));
  writeFileSync(join(root, "LICENSE"), "Syntheo MIT");
  const khroma = crateDir(root, "khroma", { license: MIT_TEXT });
  const bare = crateDir(root, "bare", {});
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
    pnpm: {
      Unknown: [
        { name: "khroma", versions: ["2.1.0"], paths: [khroma] },
        { name: "bare", versions: ["1.0.0"], paths: [bare] },
      ],
    },
    speech: [],
  });
  const license = (name) =>
    data.components.find((c) => c.name === name).license;
  assert.equal(license("khroma"), "MIT");
  assert.equal(license("bare"), UNKNOWN_LICENSE);
  assert.equal(license("serde"), "MIT");
  assert.equal(data.syntheo.repository, SYNTHEO_REPOSITORY);
});

test("the interface translates the same unknown-license marker", () => {
  const page = readFileSync(
    new URL(
      "../apps/desktop/src/settings/general/third-party-licenses.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(
    page.includes(`export const UNKNOWN_LICENSE = "${UNKNOWN_LICENSE}";`),
  );
});
