import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Libraries that must come from the host rather than the Ubuntu build box:
// Wayland, because host Mesa and WebKitGTK need the matching ABI; PipeWire and
// its SPA modules, because libpipewire loads plugins from a directory baked in
// at build time (Ubuntu's multiarch path does not exist on Fedora), so a bundled
// copy silently fails to capture there. libpulse stays bundled: it only speaks a
// stable socket protocol to the daemon, and it dlopens its own libpulsecommon.
const hostLibraryPatterns = [
  /^libwayland-.*\.so(?:\..*)?$/,
  /^libpipewire-.*\.so(?:\..*)?$/,
  /^libspa-.*\.so(?:\..*)?$/,
];
const gdkBackendDefault = 'export GDK_BACKEND="${GDK_BACKEND:-x11,wayland}"';

function patchGtkHook(source) {
  if (source.includes(gdkBackendDefault)) {
    return source;
  }

  // Recent linuxdeploy-plugin-gtk versions ship the line commented out, so
  // GTK picks its own backend order. That is what every published AppImage
  // used (none was repacked), so it is kept as is.
  if (!/^[ \t]*export GDK_BACKEND=/m.test(source)) {
    return source;
  }

  // Older versions force X11: keep X11 preferred, but allow Wayland-only sessions and explicit overrides.
  const forcedX11 = /^export GDK_BACKEND=x11(?:[ \t]+#.*)?$/m;
  if (!forcedX11.test(source)) {
    throw new Error("Unrecognized GDK_BACKEND setting in AppImage GTK hook");
  }
  return source.replace(forcedX11, gdkBackendDefault);
}

function resolveBundleRoot(input) {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.split(path.sep).includes("..")
  ) {
    throw new Error("Invalid bundle directory");
  }
  return path.resolve(input);
}

function assertWithinBase(baseDirectory, candidate) {
  const base = path.resolve(baseDirectory);
  const target = path.resolve(candidate);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Path escapes the bundle directory: ${candidate}`);
  }
  return target;
}

async function findSingleBundleEntry(baseDirectory, suffix, isExpectedType) {
  const entries = await readdir(baseDirectory, { withFileTypes: true });
  const matches = entries.filter(
    (entry) => entry.name.endsWith(suffix) && isExpectedType(entry),
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${suffix} in ${baseDirectory}, found ${matches.length}`,
    );
  }

  return assertWithinBase(
    baseDirectory,
    path.join(baseDirectory, matches[0].name),
  );
}

export async function findBundledHostLibraries(
  directory,
  baseDirectory = path.resolve(directory),
) {
  const base = path.resolve(baseDirectory);
  const matches = [];

  async function walk(currentDirectory) {
    assertWithinBase(base, currentDirectory);
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = assertWithinBase(
        base,
        path.join(currentDirectory, entry.name),
      );
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (
        hostLibraryPatterns.some((pattern) => pattern.test(entry.name))
      ) {
        matches.push(entryPath);
      }
    }
  }

  await walk(directory);
  return matches.sort((left, right) => left.localeCompare(right));
}

function defaultPluginPath() {
  const cacheDirectory =
    process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
  return path.join(
    cacheDirectory,
    "tauri",
    "linuxdeploy-plugin-appimage.AppImage",
  );
}

function resolveExecutable(command) {
  if (command === "pnpm") return command;
  if (
    typeof command !== "string" ||
    !path.isAbsolute(command) ||
    command.split(path.sep).includes("..")
  ) {
    throw new Error(`Refusing to execute unsafe command: ${command}`);
  }
  return command;
}

function runCommand(command, args, options = {}) {
  const executable = resolveExecutable(command);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
        ),
      );
    });
  });
}

// Squashfs settings passed to mksquashfs through appimagetool: zstd level 19
// with 1 MiB blocks instead of the default level 15 and 128 KiB blocks. The
// type 2 AppImage runtime reads zstd natively (xz would be smaller but is not
// supported by the static runtime). Measured on v0.6.3: about -12 MiB.
export const squashfsOptions = ["-Xcompression-level", "19", "-b", "1M"];

const elfMagic = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const squashfsMagic = Buffer.from("hsqs");

// The AppImage runtime is a 64-bit ELF followed by the squashfs image. The ELF
// ends with its section header table, so the image starts right after it.
export function appImageRuntimeLength(header) {
  if (
    header.length < 64 ||
    !header.subarray(0, 4).equals(elfMagic) ||
    header[4] !== 2 ||
    header[5] !== 1
  ) {
    throw new Error("AppImage runtime is not a little-endian 64-bit ELF");
  }
  const sectionHeaderOffset = header.readBigUInt64LE(0x28);
  const sectionHeaderSize = header.readUInt16LE(0x3a);
  const sectionHeaderCount = header.readUInt16LE(0x3c);
  return Number(
    sectionHeaderOffset +
      BigInt(sectionHeaderSize) * BigInt(sectionHeaderCount),
  );
}

// Keeps the runtime Tauri already embedded, so the repack never downloads a
// different one and stays reproducible.
async function extractRuntime(appImage, destination) {
  const handle = await open(appImage, "r");
  try {
    const header = Buffer.alloc(64);
    await handle.read(header, 0, header.length, 0);
    const length = appImageRuntimeLength(header);
    const magic = Buffer.alloc(squashfsMagic.length);
    await handle.read(magic, 0, magic.length, length);
    if (!magic.equals(squashfsMagic)) {
      throw new Error(
        `No squashfs image after the AppImage runtime: ${appImage}`,
      );
    }
    const runtime = Buffer.alloc(length);
    await handle.read(runtime, 0, length, 0);
    await writeFile(destination, runtime, { mode: 0o755 });
  } finally {
    await handle.close();
  }
}

async function fileExists(file) {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function repackLinuxAppImage({
  bundleDirectory,
  arch = process.env.ARCH,
  pluginPath = process.env.TAURI_APPIMAGE_PLUGIN ?? defaultPluginPath(),
  run = runCommand,
}) {
  const baseDirectory = resolveBundleRoot(bundleDirectory);
  const resolvedPlugin = resolveExecutable(pluginPath);
  const appDirectory = await findSingleBundleEntry(
    baseDirectory,
    ".AppDir",
    (entry) => entry.isDirectory(),
  );
  const appImage = await findSingleBundleEntry(
    baseDirectory,
    ".AppImage",
    (entry) => entry.isFile(),
  );
  const hostLibraries = await findBundledHostLibraries(
    path.join(appDirectory, "usr"),
    baseDirectory,
  );
  const gtkHook = assertWithinBase(
    baseDirectory,
    path.join(appDirectory, "apprun-hooks", "linuxdeploy-plugin-gtk.sh"),
  );
  const originalGtkHook = await readFile(gtkHook, "utf8");
  const patchedGtkHook = patchGtkHook(originalGtkHook);
  const updatedGtkHook = originalGtkHook !== patchedGtkHook;

  if (!arch) {
    throw new Error("AppImage architecture is required for repacking");
  }

  try {
    await access(resolvedPlugin, constants.X_OK);
  } catch {
    throw new Error(
      `AppImage output plugin is not executable: ${resolvedPlugin}`,
    );
  }

  const toolDirectory = await mkdtemp(
    path.join(os.tmpdir(), "syntheo-appimagetool-"),
  );
  try {
    const runtime = path.join(toolDirectory, "runtime");
    await extractRuntime(appImage, runtime);

    // linuxdeploy-plugin-appimage cannot forward mksquashfs options, so the
    // appimagetool it ships is extracted and called directly.
    await run(resolvedPlugin, ["--appimage-extract"], { cwd: toolDirectory });
    const appimagetool = path.join(
      toolDirectory,
      "squashfs-root",
      "appimagetool-prefix",
      "AppRun",
    );
    try {
      await access(appimagetool, constants.X_OK);
    } catch {
      throw new Error(`appimagetool not found in ${resolvedPlugin}`);
    }

    if (updatedGtkHook) {
      await writeFile(gtkHook, patchedGtkHook);
    }
    await Promise.all(hostLibraries.map((library) => rm(library)));

    const remainingLibraries = await findBundledHostLibraries(
      path.join(appDirectory, "usr"),
      baseDirectory,
    );
    if (remainingLibraries.length > 0) {
      throw new Error(
        `Failed to remove bundled host libraries: ${remainingLibraries.join(", ")}`,
      );
    }
    if (hostLibraries.length > 0) {
      console.log(
        `Removed bundled host libraries:\n${hostLibraries.join("\n")}`,
      );
    }

    // An updater signature only exists when Tauri updater artifacts are
    // enabled. It signs the old bytes, so it is dropped and, if it existed,
    // regenerated from the repacked AppImage.
    const signature = `${appImage}.sig`;
    const wasSigned = await fileExists(signature);
    await rm(signature, { force: true });
    await rm(appImage);
    await run(
      appimagetool,
      [
        "--comp",
        "zstd",
        ...squashfsOptions.map((option) => `--mksquashfs-opt=${option}`),
        "--runtime-file",
        runtime,
        "--no-appstream",
        appDirectory,
        appImage,
      ],
      { env: { ...process.env, ARCH: arch } },
    );

    const appImageStat = await stat(appImage);
    if (appImageStat.size === 0) {
      throw new Error(`Repacked AppImage is empty: ${appImage}`);
    }

    if (wasSigned) {
      await run("pnpm", ["-F", "desktop", "tauri", "signer", "sign", appImage]);
      const signatureStat = await stat(signature);
      if (signatureStat.size === 0) {
        throw new Error(
          `Regenerated AppImage signature is empty: ${signature}`,
        );
      }
    }

    console.log(
      `Repacked AppImage (zstd ${squashfsOptions.join(" ")}): ${appImage}, ${appImageStat.size} bytes`,
    );
    return {
      appDirectory,
      appImage,
      removedLibraries: hostLibraries,
      updatedGtkHook,
      resigned: wasSigned,
    };
  } finally {
    await rm(toolDirectory, { force: true, recursive: true });
  }
}

async function main() {
  const bundleDirectory = process.argv[2];
  if (!bundleDirectory) {
    throw new Error(
      "Usage: node scripts/repack-linux-appimage.mjs <appimage-bundle-directory>",
    );
  }

  await repackLinuxAppImage({
    bundleDirectory: path.resolve(bundleDirectory),
  });
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
