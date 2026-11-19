import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildUpdaterManifest,
  checkUpdaterManifest,
  parseUpdaterManifest,
  signatureFields,
} from "./generate-updater-manifest.mjs";

// Même forme qu'un `.sig` de `tauri signer sign` : base64 d'une signature
// minisign dont le commentaire de confiance porte le fichier et la version.
function fakeSignature(file, version) {
  const comment = [`timestamp:1795000000`, `file:${file}`];
  if (version) comment.push(`version:${version}`);
  return Buffer.from(
    [
      "untrusted comment: signature from tauri secret key",
      "RUQoHakuGEYtaA==",
      `trusted comment: ${comment.join("\t")}`,
      "c2lnbmF0dXJl",
      "",
    ].join("\n"),
  ).toString("base64");
}

const REPO = "WillIsback/Syntheo";

function signaturesFor(version, signedVersion = version) {
  return (fileName) => fakeSignature(fileName, signedVersion);
}

test("reads the trusted comment of a Tauri signature", () => {
  assert.deepEqual(
    signatureFields(fakeSignature("Syntheo_0.7.3_amd64.AppImage", "0.7.3")),
    {
      timestamp: "1795000000",
      file: "Syntheo_0.7.3_amd64.AppImage",
      version: "0.7.3",
    },
  );
});

test("builds latest.json with the AppImage and NSIS entries only", async () => {
  const manifest = await buildUpdaterManifest({
    version: "v0.7.3",
    notes: "## 0.7.3\n\n- Sous-dossiers\n",
    repo: REPO,
    pubDate: "2026-11-20T10:00:00.123Z",
    readSignature: signaturesFor("0.7.3"),
  });

  assert.equal(manifest.version, "0.7.3");
  assert.equal(manifest.notes, "## 0.7.3\n\n- Sous-dossiers");
  assert.equal(manifest.pub_date, "2026-11-20T10:00:00Z");
  assert.deepEqual(Object.keys(manifest.platforms), [
    "linux-x86_64-appimage",
    "windows-x86_64-nsis",
  ]);
  assert.equal(
    manifest.platforms["linux-x86_64-appimage"].url,
    "https://github.com/WillIsback/Syntheo/releases/download/v0.7.3/Syntheo_0.7.3_amd64.AppImage",
  );
  assert.equal(
    manifest.platforms["windows-x86_64-nsis"].url,
    "https://github.com/WillIsback/Syntheo/releases/download/v0.7.3/Syntheo_0.7.3_x64-setup.exe",
  );
  // Ni clé générique, ni .deb, ni MSI : ces formats sont annoncés avec un lien.
  for (const key of [
    "linux-x86_64",
    "windows-x86_64",
    "linux-x86_64-deb",
    "windows-x86_64-msi",
  ]) {
    assert.equal(manifest.platforms[key], undefined, key);
  }
});

test("the signed version is the announced version", async () => {
  const manifest = await buildUpdaterManifest({
    version: "0.7.3",
    notes: "",
    repo: REPO,
    readSignature: signaturesFor("0.7.3"),
  });
  for (const entry of Object.values(manifest.platforms)) {
    assert.equal(signatureFields(entry.signature).version, manifest.version);
  }
});

test("refuses a signature bound to another version", async () => {
  await assert.rejects(
    buildUpdaterManifest({
      version: "0.7.3",
      notes: "",
      repo: REPO,
      readSignature: signaturesFor("0.7.3", "0.7.2"),
    }),
    /liée à la version « 0\.7\.2 », manifeste en 0\.7\.3/,
  );
});

test("refuses a signature without version (signed without --app-version)", async () => {
  await assert.rejects(
    buildUpdaterManifest({
      version: "0.7.3",
      notes: "",
      repo: REPO,
      readSignature: (fileName) => fakeSignature(fileName, null),
    }),
    /version « aucune »/,
  );
});

test("refuses a signature made for another file", async () => {
  await assert.rejects(
    buildUpdaterManifest({
      version: "0.7.3",
      notes: "",
      repo: REPO,
      readSignature: () => fakeSignature("Syntheo_0.7.3_amd64.deb", "0.7.3"),
    }),
    /faite pour « Syntheo_0\.7\.3_amd64\.deb »/,
  );
});

test("refuses a missing or empty signature", async () => {
  await assert.rejects(
    buildUpdaterManifest({
      version: "0.7.3",
      notes: "",
      repo: REPO,
      readSignature: () => "  \n",
    }),
    /signature vide/,
  );
  await assert.rejects(
    buildUpdaterManifest({
      version: "0.7.3",
      notes: "",
      repo: REPO,
      readSignature: () => {
        throw new Error("ENOENT");
      },
    }),
    /ENOENT/,
  );
});

test("refuses an invalid version or repository", async () => {
  await assert.rejects(
    buildUpdaterManifest({
      version: "latest",
      notes: "",
      repo: REPO,
      readSignature: signaturesFor("0.7.3"),
    }),
    /version invalide/,
  );
  await assert.rejects(
    buildUpdaterManifest({
      version: "0.7.3",
      notes: "",
      repo: "https://evil.example/x",
      readSignature: signaturesFor("0.7.3"),
    }),
    /dépôt invalide/,
  );
});

test("checks a manifest against the tag and dist/", async () => {
  const manifest = await buildUpdaterManifest({
    version: "0.7.3",
    notes: "",
    repo: REPO,
    readSignature: signaturesFor("0.7.3"),
  });
  const files = ["Syntheo_0.7.3_amd64.AppImage", "Syntheo_0.7.3_x64-setup.exe"];

  assert.deepEqual(
    checkUpdaterManifest(manifest, { version: "v0.7.3", repo: REPO, files }),
    [],
  );
  assert.match(
    checkUpdaterManifest(manifest, {
      version: "v0.7.4",
      repo: REPO,
      files,
    }).join("\n"),
    /version 0\.7\.3 ≠ tag 0\.7\.4/,
  );
  assert.match(
    checkUpdaterManifest(manifest, {
      version: "0.7.3",
      repo: REPO,
      files: files.slice(0, 1),
    }).join("\n"),
    /Syntheo_0\.7\.3_x64-setup\.exe absent de dist/,
  );
});

test("the check command refuses a missing signature file", async () => {
  const { execFile } = await import("node:child_process");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const dir = await mkdtemp(path.join(os.tmpdir(), "updater-manifest-"));
  try {
    const manifest = await buildUpdaterManifest({
      version: "0.7.3",
      notes: "",
      repo: REPO,
      readSignature: signaturesFor("0.7.3"),
    });
    await writeFile(path.join(dir, "latest.json"), JSON.stringify(manifest));
    for (const name of [
      "Syntheo_0.7.3_amd64.AppImage",
      "Syntheo_0.7.3_x64-setup.exe",
    ]) {
      await writeFile(path.join(dir, name), "x");
    }
    await writeFile(
      path.join(dir, "Syntheo_0.7.3_amd64.AppImage.sig"),
      fakeSignature("Syntheo_0.7.3_amd64.AppImage", "0.7.3"),
    );
    const script = fileURLToPath(
      new URL("./generate-updater-manifest.mjs", import.meta.url),
    );
    const args = [script, "check", "--version", "v0.7.3", "--dist", dir];
    await assert.rejects(
      run(process.execPath, [...args, "--repo", REPO]),
      (error) =>
        /Syntheo_0\.7\.3_x64-setup\.exe\.sig absent/.test(error.stderr),
    );
    await writeFile(
      path.join(dir, "Syntheo_0.7.3_x64-setup.exe.sig"),
      fakeSignature("Syntheo_0.7.3_x64-setup.exe", "0.7.3"),
    );
    const { stdout } = await run(process.execPath, [...args, "--repo", REPO]);
    assert.match(stdout, /latest\.json conforme : 0\.7\.3/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("without --base-url, the manifest is exactly the release one", async () => {
  const common = {
    version: "0.7.3",
    notes: "n",
    repo: REPO,
    pubDate: "2026-11-20T10:00:00Z",
    readSignature: signaturesFor("0.7.3"),
  };
  const release = await buildUpdaterManifest(common);
  const explicit = await buildUpdaterManifest({
    ...common,
    baseUrl: undefined,
  });
  assert.deepEqual(explicit, release);
  assert.deepEqual(
    Object.values(release.platforms).map((entry) => entry.url),
    [
      "https://github.com/WillIsback/Syntheo/releases/download/v0.7.3/Syntheo_0.7.3_amd64.AppImage",
      "https://github.com/WillIsback/Syntheo/releases/download/v0.7.3/Syntheo_0.7.3_x64-setup.exe",
    ],
  );
});

test("--base-url points the installers to a local test server", async () => {
  const manifest = await buildUpdaterManifest({
    version: "0.7.3-91",
    notes: "",
    repo: REPO,
    readSignature: signaturesFor("0.7.3-91"),
    baseUrl: "http://127.0.0.1:8765/",
  });
  assert.equal(
    manifest.platforms["linux-x86_64-appimage"].url,
    "http://127.0.0.1:8765/Syntheo_0.7.3-91_amd64.AppImage",
  );
  assert.deepEqual(
    checkUpdaterManifest(manifest, {
      version: "0.7.3-91",
      repo: REPO,
      baseUrl: "http://127.0.0.1:8765",
      files: [
        "Syntheo_0.7.3-91_amd64.AppImage",
        "Syntheo_0.7.3-91_x64-setup.exe",
      ],
    }),
    [],
  );
  await assert.rejects(
    buildUpdaterManifest({
      version: "0.7.3-91",
      notes: "",
      repo: REPO,
      readSignature: signaturesFor("0.7.3-91"),
      baseUrl: "file:///etc/passwd",
    }),
    /adresse de base invalide/,
  );
});

// Issue 601 : un latest.json précédé d'un BOM est refusé par le plugin. Le
// contrôle le dit clairement au lieu d'un SyntaxError.
test("refuses a manifest that starts with a UTF-8 BOM", async () => {
  assert.deepEqual(parseUpdaterManifest('{"version":"0.7.4"}'), {
    version: "0.7.4",
  });
  assert.throws(
    () => parseUpdaterManifest('\uFEFF{"version":"0.7.4"}'),
    /BOM UTF-8.*error decoding response body/,
  );
  assert.throws(() => parseUpdaterManifest("{"), /n'est pas un JSON valide/);

  const { execFile } = await import("node:child_process");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { promisify } = await import("node:util");
  const dir = await mkdtemp(path.join(os.tmpdir(), "updater-manifest-bom-"));
  try {
    const manifest = await buildUpdaterManifest({
      version: "0.7.3",
      notes: "",
      repo: REPO,
      readSignature: signaturesFor("0.7.3"),
    });
    // Écrit avec BOM, comme le ferait un éditeur Windows.
    await writeFile(
      path.join(dir, "latest.json"),
      `\uFEFF${JSON.stringify(manifest)}`,
    );
    const script = fileURLToPath(
      new URL("./generate-updater-manifest.mjs", import.meta.url),
    );
    await assert.rejects(
      promisify(execFile)(process.execPath, [
        script,
        "check",
        "--version",
        "v0.7.3",
        "--dist",
        dir,
        "--repo",
        REPO,
      ]),
      (error) => /BOM UTF-8/.test(error.stderr),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
