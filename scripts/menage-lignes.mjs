// Mesure des lignes de la code base (ménage, issue 457).
//
// Compte les lignes (comme `wc -l`) des fichiers suivis par git en TS/TSX,
// Rust, CSS, MJS et Swift, hors fichiers générés et traductions, par catégorie
// (code / tests) et par zone, puis compare à une référence git (par défaut le
// point bas 81fb059a).
//
// Usage :
//   node scripts/menage-lignes.mjs [--ref <rev>] [--base <rev>] [--zones N]
//                                  [--gros N] [--json]
// --ref    révision mesurée (défaut : HEAD)
// --base   révision de référence (défaut : 81fb059a ; « none » pour ne rien comparer)
// --zones  nombre de zones affichées, triées par écart (défaut : 25)
// --gros   nombre de fichiers de plus de 500 lignes (hors tests) affichés (défaut : 0)
// --json   sortie JSON brute

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { resolveExecutable } from "./lib/resolve-executable.mjs";

export const POINT_BAS = "81fb059a";
const LANGS = {
  ts: "ts",
  tsx: "ts",
  mts: "ts",
  rs: "rust",
  css: "css",
  mjs: "mjs",
  swift: "swift",
};
const GENERATED =
  /(bindings\.gen|routeTree\.gen|tauri\.gen|\.d\.ts$|\/locales\/)/;
const TEST =
  /(\.(test|spec|bench)\.[^/]+$|(^|\/)(tests?|__tests__|__mocks__|e2e|testing|test-utils|fixtures)\/|(^|\/)tests?\.rs$|_tests?\.rs$|(^|\/)test-(setup|utils)\.[^/]+$)/;

export function langOf(path) {
  const ext = path.slice(path.lastIndexOf(".") + 1);
  return path.includes(".") ? (LANGS[ext] ?? null) : null;
}

export function isGenerated(path) {
  return GENERATED.test(path);
}

export function categoryOf(path) {
  return TEST.test(path) ? "tests" : "code";
}

// Zone : apps/<app>/src/<dossier>, sinon les deux premiers segments
// (crates/<crate>, plugins/<plugin>, packages/<paquet>, apps/<app>/src-tauri).
export function zoneOf(path) {
  const parts = path.split("/");
  if (parts[0] === "apps" && parts[2] === "src" && parts.length > 4)
    return parts.slice(0, 4).join("/");
  if (parts[0] === "apps" && parts.length > 3)
    return parts.slice(0, 3).join("/");
  return parts.length > 2 ? parts.slice(0, 2).join("/") : parts[0];
}

export function countLines(buffer) {
  let n = 0;
  for (let i = 0; i < buffer.length; i++) if (buffer[i] === 10) n++;
  return n;
}

const git = (args, input) =>
  execFileSync(resolveExecutable("git"), args, { input, maxBuffer: 1 << 30 });

export function measure(ref) {
  const entries = git(["ls-tree", "-r", "-z", ref])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split("\t");
      const [, type, sha] = meta.split(" ");
      return { type, sha, path };
    })
    .filter((e) => e.type === "blob" && langOf(e.path) && !isGenerated(e.path));

  const out = git(
    ["cat-file", "--batch"],
    entries.map((e) => e.sha).join("\n") + "\n",
  );
  const files = [];
  let offset = 0;
  for (const entry of entries) {
    const eol = out.indexOf(10, offset);
    const size = Number(out.subarray(offset, eol).toString().split(" ")[2]);
    const lines = countLines(out.subarray(eol + 1, eol + 1 + size));
    offset = eol + 1 + size + 1;
    files.push({
      path: entry.path,
      lines,
      lang: langOf(entry.path),
      cat: categoryOf(entry.path),
      zone: zoneOf(entry.path),
    });
  }
  return summarize(files);
}

export function summarize(files) {
  const add = (map, key, n) => map.set(key, (map.get(key) ?? 0) + n);
  const byCat = new Map();
  const byLang = new Map();
  const byZone = new Map();
  let total = 0;
  for (const f of files) {
    total += f.lines;
    add(byCat, f.cat, f.lines);
    add(byLang, `${f.lang}/${f.cat}`, f.lines);
    add(byZone, f.zone, f.lines);
  }
  const big = files
    .filter((f) => f.cat === "code" && f.lines > 500)
    .sort((a, b) => b.lines - a.lines);
  return { total, files: files.length, byCat, byLang, byZone, big };
}

const fmt = (n) => n.toLocaleString("fr-FR").replace(/ | /g, " ");
const delta = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt(Math.abs(n));

function table(title, now, base, limit = Infinity) {
  const keys = [...new Set([...now.keys(), ...(base?.keys() ?? [])])];
  const rows = keys
    .map((k) => ({
      k,
      n: now.get(k) ?? 0,
      d: (now.get(k) ?? 0) - (base?.get(k) ?? 0),
    }))
    .sort(
      (a, b) =>
        (base ? Math.abs(b.d) - Math.abs(a.d) : b.n - a.n) ||
        a.k.localeCompare(b.k),
    )
    .slice(0, limit);
  console.log(`\n${title}`);
  for (const r of rows)
    console.log(
      `  ${r.k.padEnd(48)} ${fmt(r.n).padStart(9)}${base ? `  ${delta(r.d).padStart(9)}` : ""}`,
    );
}

function main(argv) {
  const opt = { ref: "HEAD", base: POINT_BAS, zones: 25, gros: 0, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opt.json = true;
    else if (["--ref", "--base", "--zones", "--gros"].includes(a))
      opt[a.slice(2)] = argv[++i];
    else throw new Error(`Option inconnue : ${a}`);
  }
  const now = measure(opt.ref);
  const base = opt.base === "none" ? null : measure(opt.base);
  if (opt.json) {
    const plain = (s) =>
      s && {
        ...s,
        byCat: Object.fromEntries(s.byCat),
        byLang: Object.fromEntries(s.byLang),
        byZone: Object.fromEntries(s.byZone),
        big: s.big.map(({ path, lines }) => ({ path, lines })),
      };
    console.log(
      JSON.stringify(
        {
          ref: opt.ref,
          base: opt.base,
          now: plain(now),
          baseline: plain(base),
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(
    `Lignes de ${opt.ref} (${fmt(now.files)} fichiers) : ${fmt(now.total)}`,
  );
  if (base)
    console.log(
      `Référence ${opt.base} : ${fmt(base.total)}  écart ${delta(now.total - base.total)} (${((100 * (now.total - base.total)) / base.total).toFixed(1).replace(".", ",")} %)`,
    );
  table("Par catégorie", now.byCat, base?.byCat);
  table("Par langage / catégorie", now.byLang, base?.byLang);
  table(
    `Par zone (${opt.zones} premières)`,
    now.byZone,
    base?.byZone,
    Number(opt.zones),
  );
  console.log(
    `\nFichiers de plus de 500 lignes hors tests : ${now.big.length}${base ? ` (référence : ${base.big.length})` : ""}`,
  );
  for (const f of now.big.slice(0, Number(opt.gros)))
    console.log(`  ${fmt(f.lines).padStart(7)}  ${f.path}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv.slice(2));
