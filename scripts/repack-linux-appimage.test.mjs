import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appImageRuntimeLength,
  repackLinuxAppImage,
  squashfsOptions,
} from "./repack-linux-appimage.mjs";

// Plus petite AppImage acceptée par le script : un en-tête ELF 64 bits dont la
// table des sections se termine à l'octet 64, suivi de la signature squashfs.
function fakeAppImage(payload = "original-appimage") {
  const header = Buffer.alloc(64);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]).copy(header);
  header.writeBigUInt64LE(64n, 0x28);
  return Buffer.concat([header, Buffer.from(`hsqs${payload}`)]);
}

// Simule le greffon et appimagetool : l'extraction du greffon crée l'AppRun
// d'appimagetool, appimagetool écrit la nouvelle AppImage.
function fakeRun(fixture, commands = [], content = "repacked-appimage") {
  return async (command, args, options) => {
    commands.push({ command, args, options });
    if (command === fixture.plugin) {
      const tool = path.join(
        options.cwd,
        "squashfs-root",
        "appimagetool-prefix",
        "AppRun",
      );
      await mkdir(path.dirname(tool), { recursive: true });
      await writeFile(tool, "appimagetool");
      await chmod(tool, 0o755);
    } else if (command === "pnpm") {
      await writeFile(`${fixture.appImage}.sig`, "fresh-signature");
    } else {
      // L'AppImage d'origine doit avoir été supprimée avant le
      // rempaquetage. La création exclusive (flag "wx") échoue avec
      // EEXIST si le fichier est encore présent.
      await writeFile(fixture.appImage, content, { flag: "wx" });
    }
  };
}

async function createFixture(
  t,
  {
    withWaylandLibraries = true,
    withAudioLibraries = false,
    patchedGtkHook = false,
    signed = true,
  } = {},
) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "syntheo-appimage-repack-"),
  );
  t.after(() => rm(directory, { force: true, recursive: true }));

  const appDirectory = path.join(directory, "Syntheo.AppDir");
  const libraryDirectory = path.join(appDirectory, "usr", "lib");
  const nestedLibraryDirectory = path.join(libraryDirectory, "gtk-3.0");
  const appImage = path.join(directory, "Syntheo_1.4.5_amd64.AppImage");
  const gtkHook = path.join(
    appDirectory,
    "apprun-hooks",
    "linuxdeploy-plugin-gtk.sh",
  );
  const plugin = path.join(
    directory,
    "tools",
    "linuxdeploy-plugin-appimage.AppImage",
  );

  await mkdir(nestedLibraryDirectory, { recursive: true });
  await mkdir(path.dirname(plugin), { recursive: true });
  await mkdir(path.dirname(gtkHook), { recursive: true });
  await writeFile(
    gtkHook,
    [
      "#!/usr/bin/env bash",
      "export GTK_DATA_PREFIX=unchanged",
      patchedGtkHook
        ? 'export GDK_BACKEND="${GDK_BACKEND:-x11,wayland}"'
        : "export GDK_BACKEND=x11 # Crash with Wayland backend on Wayland",
      "",
    ].join("\n"),
  );
  await chmod(gtkHook, 0o755);
  await writeFile(path.join(libraryDirectory, "libgtk-3.so.0"), "gtk");
  if (withWaylandLibraries) {
    await writeFile(
      path.join(libraryDirectory, "libwayland-client.so.0"),
      "wayland-client",
    );
    await writeFile(
      path.join(nestedLibraryDirectory, "libwayland-cursor.so.0.22.0"),
      "wayland-cursor",
    );
  }
  if (withAudioLibraries) {
    for (const name of [
      "libpipewire-0.3.so.0",
      "libpipewire-0.3.so.0.1000.0",
      "libspa-support.so",
      "libpulse.so.0",
      "libpulsecommon-16.1.so",
    ]) {
      await writeFile(path.join(libraryDirectory, name), name);
    }
  }
  await writeFile(appImage, fakeAppImage());
  if (signed) await writeFile(`${appImage}.sig`, "stale-signature");
  await writeFile(plugin, "plugin");
  await chmod(plugin, 0o755);

  return { directory, appDirectory, appImage, plugin, gtkHook };
}

test("removes Wayland libraries, recompresses with zstd 19, and re-signs", async (t) => {
  const fixture = await createFixture(t);
  const commands = [];

  const result = await repackLinuxAppImage({
    arch: "x86_64",
    bundleDirectory: fixture.directory,
    pluginPath: fixture.plugin,
    run: fakeRun(fixture, commands),
  });

  assert.equal(result.removedLibraries.length, 2);
  assert.equal(result.updatedGtkHook, true);
  assert.equal(result.resigned, true);
  await access(fixture.gtkHook, constants.X_OK);
  await assert.rejects(
    access(
      path.join(fixture.appDirectory, "usr", "lib", "libwayland-client.so.0"),
      constants.F_OK,
    ),
  );
  await assert.rejects(
    access(
      path.join(
        fixture.appDirectory,
        "usr",
        "lib",
        "gtk-3.0",
        "libwayland-cursor.so.0.22.0",
      ),
      constants.F_OK,
    ),
  );
  assert.equal(
    await readFile(
      path.join(fixture.appDirectory, "usr", "lib", "libgtk-3.so.0"),
      "utf8",
    ),
    "gtk",
  );
  assert.equal(await readFile(fixture.appImage, "utf8"), "repacked-appimage");
  assert.equal(
    await readFile(`${fixture.appImage}.sig`, "utf8"),
    "fresh-signature",
  );

  const [extract, pack, sign] = commands;
  assert.deepEqual(extract.args, ["--appimage-extract"]);
  const toolDirectory = extract.options.cwd;
  assert.equal(
    pack.command,
    path.join(toolDirectory, "squashfs-root", "appimagetool-prefix", "AppRun"),
  );
  assert.deepEqual(pack.args, [
    "--comp",
    "zstd",
    "--mksquashfs-opt=-Xcompression-level",
    "--mksquashfs-opt=19",
    "--mksquashfs-opt=-b",
    "--mksquashfs-opt=1M",
    "--runtime-file",
    path.join(toolDirectory, "runtime"),
    "--no-appstream",
    fixture.appDirectory,
    fixture.appImage,
  ]);
  assert.equal(pack.options.env.ARCH, "x86_64");
  assert.deepEqual(sign, {
    command: "pnpm",
    args: ["-F", "desktop", "tauri", "signer", "sign", fixture.appImage],
    options: undefined,
  });
  // Le dossier d'outils temporaire (runtime, appimagetool extrait) est supprimé.
  await assert.rejects(access(toolDirectory, constants.F_OK));
});

test("reuses the runtime embedded in the original AppImage", async (t) => {
  const fixture = await createFixture(t);
  const run = fakeRun(fixture);
  let runtime;
  await repackLinuxAppImage({
    arch: "x86_64",
    bundleDirectory: fixture.directory,
    pluginPath: fixture.plugin,
    run: async (command, args, options) => {
      if (args.includes("--runtime-file")) {
        runtime = await readFile(args[args.indexOf("--runtime-file") + 1]);
      }
      await run(command, args, options);
    },
  });
  assert.deepEqual(runtime, fakeAppImage().subarray(0, 64));
});

test("recompresses an unsigned AppImage without creating a signature", async (t) => {
  const fixture = await createFixture(t, {
    withWaylandLibraries: false,
    patchedGtkHook: true,
    signed: false,
  });
  const commands = [];

  const result = await repackLinuxAppImage({
    arch: "x86_64",
    bundleDirectory: fixture.directory,
    pluginPath: fixture.plugin,
    run: fakeRun(fixture, commands),
  });

  // Même sans bibliothèque à retirer, l'AppImage est recompressée.
  assert.deepEqual(result.removedLibraries, []);
  assert.equal(result.updatedGtkHook, false);
  assert.equal(result.resigned, false);
  assert.equal(commands.length, 2);
  assert.equal(
    commands.some((command) => command.command === "pnpm"),
    false,
  );
  assert.equal(await readFile(fixture.appImage, "utf8"), "repacked-appimage");
  await assert.rejects(access(`${fixture.appImage}.sig`, constants.F_OK));
});

test("removes bundled PipeWire libraries and SPA modules but keeps PulseAudio", async (t) => {
  const fixture = await createFixture(t, {
    withWaylandLibraries: false,
    withAudioLibraries: true,
    patchedGtkHook: true,
  });

  const result = await repackLinuxAppImage({
    arch: "aarch64",
    bundleDirectory: fixture.directory,
    pluginPath: fixture.plugin,
    run: fakeRun(fixture),
  });

  assert.deepEqual(
    result.removedLibraries.map((library) => path.basename(library)),
    [
      "libpipewire-0.3.so.0",
      "libpipewire-0.3.so.0.1000.0",
      "libspa-support.so",
    ],
  );
  assert.equal(result.updatedGtkHook, false);
  for (const kept of ["libpulse.so.0", "libpulsecommon-16.1.so"]) {
    assert.equal(
      await readFile(
        path.join(fixture.appDirectory, "usr", "lib", kept),
        "utf8",
      ),
      kept,
    );
  }
  assert.equal(
    await readFile(
      path.join(fixture.appDirectory, "usr", "lib", "libgtk-3.so.0"),
      "utf8",
    ),
    "gtk",
  );
  assert.equal(await readFile(fixture.appImage, "utf8"), "repacked-appimage");
});

test("repacks a hook-only fix and preserves explicit GTK backend preferences", async (t) => {
  const fixture = await createFixture(t, { withWaylandLibraries: false });
  const result = await repackLinuxAppImage({
    arch: "x86_64",
    bundleDirectory: fixture.directory,
    pluginPath: fixture.plugin,
    run: fakeRun(fixture),
  });
  assert.deepEqual(result.removedLibraries, []);
  assert.equal(result.updatedGtkHook, true);

  for (const [preference, expected] of [
    [undefined, "x11,wayland"],
    ["", "x11,wayland"],
    ["wayland", "wayland"],
    ["x11", "x11"],
    ["wayland,x11", "wayland,x11"],
  ]) {
    const env = { ...process.env };
    delete env.GDK_BACKEND;
    if (preference !== undefined) env.GDK_BACKEND = preference;
    const backend = execFileSync(
      "bash",
      [
        "-c",
        '. "$1"; printf "%s" "$GDK_BACKEND:$GTK_DATA_PREFIX"',
        "bash",
        fixture.gtkHook,
      ],
      { env, encoding: "utf8" },
    );
    assert.equal(backend, `${expected}:unchanged`);
  }
});

test("reads the runtime length from the ELF section header table", () => {
  const header = Buffer.alloc(64);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]).copy(header);
  header.writeBigUInt64LE(943_352n, 0x28);
  header.writeUInt16LE(64, 0x3a);
  header.writeUInt16LE(20, 0x3c);
  assert.equal(appImageRuntimeLength(header), 944_632);
  assert.throws(
    () => appImageRuntimeLength(Buffer.alloc(64)),
    /not a little-endian 64-bit ELF/,
  );
  assert.deepEqual(squashfsOptions, ["-Xcompression-level", "19", "-b", "1M"]);
});

for (const [name, prepare, options, error] of [
  [
    "an unfamiliar GTK hook",
    (fixture) => writeFile(fixture.gtkHook, "export GDK_BACKEND=unknown\n"),
    {},
    /Unrecognized GDK_BACKEND/,
  ],
  [
    "an unavailable AppImage output plugin",
    () => {},
    { pluginPath: "missing-plugin" },
    /AppImage output plugin is not executable/,
  ],
  [
    "an ambiguous AppImage bundle",
    (fixture) =>
      writeFile(
        path.join(fixture.directory, "Syntheo_1.4.5_arm64.AppImage"),
        "other-appimage",
      ),
    {},
    /Expected exactly one \.AppImage.*found 2/,
  ],
  [
    "an AppImage without a squashfs image",
    (fixture) => writeFile(fixture.appImage, fakeAppImage().subarray(0, 64)),
    {},
    /No squashfs image after the AppImage runtime/,
  ],
  [
    "a missing architecture",
    () => {},
    { arch: "" },
    /AppImage architecture is required/,
  ],
]) {
  test(`refuses ${name} before mutating the bundle`, async (t) => {
    const fixture = await createFixture(t);
    await prepare(fixture);
    const prepared = await readFile(fixture.appImage);

    await assert.rejects(
      repackLinuxAppImage({
        arch: "x86_64",
        bundleDirectory: fixture.directory,
        run: fakeRun(fixture),
        ...options,
        pluginPath: path.join(
          fixture.directory,
          options.pluginPath ??
            path.relative(fixture.directory, fixture.plugin),
        ),
      }),
      error,
    );

    assert.deepEqual(await readFile(fixture.appImage), prepared);
    assert.equal(
      await readFile(`${fixture.appImage}.sig`, "utf8"),
      "stale-signature",
    );
    assert.equal(
      await readFile(
        path.join(fixture.appDirectory, "usr", "lib", "libwayland-client.so.0"),
        "utf8",
      ),
      "wayland-client",
    );
  });
}
