import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readlink, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const INSTALL_SH = path.join(path.dirname(fileURLToPath(import.meta.url)), "install.sh");

// curl factice : résout "latest" vers v9.9.9, sert l'AppImage factice pour le
// téléchargement et répond 404 au manifeste SHA256SUMS.
const FAKE_CURL = `#!/usr/bin/env bash
out=""
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -w) shift 2; printf 'https://github.com/WillIsback/Syntheo/releases/tag/v9.9.9'; exit 0 ;;
    *) url="$1"; shift ;;
  esac
done
case "$url" in
  *SHA256SUMS) exit 22 ;;
esac
[[ -n "$out" && "$out" != /dev/null ]] && cp "$FAKE_APPIMAGE" "$out"
exit 0
`;

// AppImage factice : --appimage-extract crée l'arborescence embarquée
// (entrée .desktop et icône) dans le répertoire courant.
const FAKE_APPIMAGE = `#!/usr/bin/env bash
[[ "$1" == "--appimage-extract" ]] || exit 0
[[ -n "$FAKE_EXTRACT_FAIL" ]] && exit 1
mkdir -p squashfs-root/usr/share/applications squashfs-root/usr/share/icons/hicolor/128x128/apps
cat > squashfs-root/usr/share/applications/Syntheo.desktop <<'EOF'
[Desktop Entry]
Categories=
Comment=Syntheo Desktop App
Exec=syntheo
StartupWMClass=syntheo
Icon=syntheo
Name=Syntheo
Terminal=false
Type=Application
MimeType=x-scheme-handler/syntheo
EOF
printf 'png' > squashfs-root/usr/share/icons/hicolor/128x128/apps/syntheo.png
`;

async function runInstall(t, { installDir, env = {} } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "syntheo-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "fakebin");
  const home = path.join(root, "home");
  await mkdir(bin, { recursive: true });
  await mkdir(home, { recursive: true });
  await writeFile(path.join(bin, "curl"), FAKE_CURL);
  await chmod(path.join(bin, "curl"), 0o755);
  const appImage = path.join(root, "fake.AppImage");
  await writeFile(appImage, FAKE_APPIMAGE);
  await chmod(appImage, 0o755);

  const target = installDir ?? path.join(home, ".local", "bin");
  const stdout = execFileSync("bash", [INSTALL_SH, "--to", target, "--dir", path.join(root, "dl")], {
    env: {
      HOME: home,
      PATH: `${bin}:/usr/bin:/bin`,
      FAKE_APPIMAGE: appImage,
      ...env,
    },
    encoding: "utf8",
  });
  return { root, home, target, stdout };
}

test("installe une entrée de lanceur à partir de celle embarquée", async (t) => {
  const { home, target, stdout } = await runInstall(t);
  const apps = path.join(home, ".local", "share", "applications");
  const desktop = await readFile(path.join(apps, "Syntheo.desktop"), "utf8");

  assert.match(desktop, new RegExp(`^Exec="${target}/syntheo"$`, "m"));
  assert.doesNotMatch(desktop, /^MimeType=/m);
  assert.doesNotMatch(desktop, /^Exec=syntheo$/m);
  assert.match(desktop, /^Icon=syntheo$/m);
  assert.match(desktop, /^StartupWMClass=syntheo$/m);
  assert.match(stdout, /Lanceur  : .*Syntheo\.desktop/);

  const icon = path.join(home, ".local", "share", "icons", "hicolor", "128x128", "apps", "syntheo.png");
  assert.equal(await readFile(icon, "utf8"), "png");
  assert.equal(await readlink(path.join(target, "syntheo")), path.join(target, "Syntheo-9.9.9.AppImage"));
});

test("respecte XDG_DATA_HOME", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "syntheo-xdg-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await runInstall(t, { env: { XDG_DATA_HOME: root } });
  await stat(path.join(root, "applications", "Syntheo.desktop"));
});

test("échappe un répertoire d'installation contenant des caractères spéciaux", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "syntheo-esc-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installDir = path.join(root, 'mes $apps "x"');
  const { home } = await runInstall(t, { installDir });
  const desktop = await readFile(
    path.join(home, ".local", "share", "applications", "Syntheo.desktop"),
    "utf8",
  );
  const escaped = installDir.replaceAll("$", "\\\\$").replaceAll('"', '\\\\"');
  assert.ok(desktop.includes(`Exec="${escaped}/syntheo"\n`), desktop);
});

test("crée une entrée par défaut si l'extraction échoue, sans faire échouer l'installation", async (t) => {
  const { home, target } = await runInstall(t, { env: { FAKE_EXTRACT_FAIL: "1" } });
  const desktop = await readFile(
    path.join(home, ".local", "share", "applications", "Syntheo.desktop"),
    "utf8",
  );
  assert.match(desktop, /^\[Desktop Entry\]$/m);
  assert.match(desktop, new RegExp(`^Exec="${target}/syntheo"$`, "m"));
  assert.match(desktop, /^Name=Syntheo$/m);
});

test("le script désinstalle l'entrée qu'il a créée", async () => {
  const uninstall = await readFile(path.join(path.dirname(INSTALL_SH), "uninstall.sh"), "utf8");
  assert.match(uninstall, /applications\/\*\[Ss\]yntheo\*\.desktop/);
});
