#!/usr/bin/env node
// Version de la prochaine release, calculée comme l'a toujours fait
// release.yml : dernier tag `v*` + sujets des commits depuis ce tag (seuls
// feat / fix / perf et les breaking changes `!` déclenchent une release).
// Partagé par release.yml (étape detect), la gate de PR `ci-changelog` et
// preflight.sh, pour qu'une seule logique décide de la version (issue #536).
//
// Usage :
//   node scripts/next-release-version.mjs [options]
//     --bump <auto|patch|minor|major|none>  bump forcé (défaut : auto)
//     --head <ref>          fin de l'intervalle des commits (défaut : HEAD)
//     --pr-title <titre>    sujet du futur commit squash, compté en plus
//     --include-range <a..b>  sujets supplémentaires (préflight sans PR)
//     --honor-skip          `[skip release]` dans le titre de PR (ou, sans
//                           titre, dans le dernier commit de --head) : pas de
//                           release
//     --check-changelog <base>  la release exige
//                           packages/changelog/content/desktop/<version>.md
//                           modifié entre <base> et HEAD, et non vide
//   node scripts/next-release-version.mjs --notes <vX.Y.Z>
//     écrit la note de version sans frontmatter (résumé puis corps) ; code 1
//     si le fichier manque ou est vide.
//
// Sortie standard : `version=vX.Y.Z|skipped` et `bump=…`, au format de
// $GITHUB_OUTPUT. Les explications vont sur la sortie d'erreur.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const NOTES_DIR = "packages/changelog/content/desktop";
const BUMPS = ["auto", "patch", "minor", "major", "none"];
const SKIP_MARKER = /\[skip release\]/i;

/** Bump le plus fort parmi les sujets de commit (même règle que release.yml). */
export function bumpFromSubjects(subjects) {
  let bump = "none";
  for (const subject of subjects) {
    if (!subject) continue;
    if (/^[a-zA-Z]+(\(.+\))?!:/.test(subject)) bump = "major";
    else if (/^feat(\(.+\))?:/.test(subject) && bump !== "major") {
      bump = "minor";
    } else if (/^(fix|perf)(\(.+\))?:/.test(subject) && bump === "none") {
      bump = "patch";
    }
  }
  return bump;
}

/** `v1.2.3` + bump → `v1.3.0` ; sans tag, on part de `v0.0.0`. */
export function applyBump(lastTag, bump) {
  const [major, minor, patch] = (lastTag || "v0.0.0")
    .replace(/^v/, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);
  if (bump === "major") return `v${major + 1}.0.0`;
  if (bump === "minor") return `v${major}.${minor + 1}.0`;
  if (bump === "patch") return `v${major}.${minor}.${patch + 1}`;
  throw new Error(`bump inconnu : ${bump}`);
}

/**
 * Décision complète, sans accès à git.
 * @returns {{ version: string, bump: string, reason: string }}
 */
export function nextReleaseVersion({
  lastTag = "",
  subjects = [],
  bump = "auto",
  skipSubject = null,
}) {
  if (skipSubject !== null && SKIP_MARKER.test(skipSubject)) {
    return {
      version: "skipped",
      bump: "none",
      reason: "marqué [skip release]",
    };
  }
  const effective = bump && bump !== "auto" ? bump : bumpFromSubjects(subjects);
  if (effective === "none") {
    return {
      version: "skipped",
      bump: "none",
      reason: "aucun commit éligible (feat/fix/perf)",
    };
  }
  return {
    version: applyBump(lastTag, effective),
    bump: effective,
    reason: bump && bump !== "auto" ? "bump forcé" : "commits depuis le tag",
  };
}

/** Sépare le frontmatter (`date`, `summary`) du corps d'une note. */
export function parseNote(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^---[ \t\r]*\n([\s\S]*?)\n---[ \t\r]*(?:\n([\s\S]*))?$/,
  );
  if (!match) return { summary: null, body: trimmed };
  const summaryLine = match[1].match(/^summary:\s*(.+)$/m);
  let summary = summaryLine ? summaryLine[1].trim() : null;
  if (summary && /^(["']).*\1$/.test(summary)) summary = summary.slice(1, -1);
  return { summary, body: (match[2] ?? "").trim() };
}

/**
 * Chemin de la note d'une version `vX.Y.Z` ou `X.Y.Z` ; refusé hors de ce
 * format ou hors du dossier des notes.
 */
export function releaseNotesFile(version, root = process.cwd()) {
  const match = /^v?(\d+\.\d+\.\d+)$/.exec(String(version));
  if (!match) throw new Error(`Version invalide : ${version}`);
  const dir = path.resolve(root, NOTES_DIR);
  const file = path.resolve(dir, `${match[1]}.md`);
  if (path.relative(dir, file) !== `${match[1]}.md`) {
    throw new Error(`Note hors de ${NOTES_DIR} : ${file}`);
  }
  return file;
}

/** Note de release : résumé puis corps, ou null si le fichier manque/est vide. */
export function releaseNotes(version, root = process.cwd()) {
  const file = releaseNotesFile(version, root);
  if (!existsSync(file)) return null;
  const { summary, body } = parseNote(readFileSync(file, "utf8"));
  if (!body) return null;
  return summary ? `${summary}\n\n${body}\n` : `${body}\n`;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function lines(text) {
  return text ? text.split("\n") : [];
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      bump: { type: "string", default: "auto" },
      head: { type: "string", default: "HEAD" },
      "pr-title": { type: "string" },
      "include-range": { type: "string" },
      "honor-skip": { type: "boolean", default: false },
      "check-changelog": { type: "string" },
      notes: { type: "string" },
    },
  });

  if (values.notes !== undefined) {
    if (!/^v?\d+\.\d+\.\d+$/.test(values.notes)) {
      console.error(`Version invalide : ${values.notes}`);
      return 2;
    }
    const notes = releaseNotes(values.notes);
    if (!notes) {
      console.error(
        `Pas de note ${NOTES_DIR}/${values.notes.replace(/^v/, "")}.md (ou vide).`,
      );
      return 1;
    }
    process.stdout.write(notes);
    return 0;
  }

  if (!BUMPS.includes(values.bump || "auto")) {
    console.error(`--bump attend : ${BUMPS.join(", ")}`);
    return 2;
  }

  const lastTag =
    lines(git(["tag", "-l", "v[0-9]*", "--sort=-version:refname"]))[0] || "";
  const range = lastTag ? `${lastTag}..${values.head}` : values.head;
  const subjects = lines(git(["log", "--format=%s", range]));
  if (values["include-range"]) {
    subjects.push(
      ...lines(git(["log", "--format=%s", values["include-range"]])),
    );
  }
  const prTitle = values["pr-title"];
  if (prTitle !== undefined) subjects.push(prTitle);
  const skipSubject = values["honor-skip"]
    ? (prTitle ?? git(["log", "-1", "--format=%s", values.head]))
    : null;

  const result = nextReleaseVersion({
    lastTag,
    subjects,
    bump: values.bump,
    skipSubject,
  });
  console.error(
    `Dernier tag : ${lastTag || "aucun"} — bump : ${result.bump} (${result.reason}) — version : ${result.version}`,
  );
  process.stdout.write(`version=${result.version}\nbump=${result.bump}\n`);

  const base = values["check-changelog"];
  if (base === undefined || result.version === "skipped") {
    if (base !== undefined)
      console.error("ℹ️  Pas de release : journal non exigé.");
    return 0;
  }
  const file = `${NOTES_DIR}/${result.version.replace(/^v/, "")}.md`;
  const changed = lines(
    git([
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      base,
      "HEAD",
      "--",
      file,
    ]),
  );
  if (!changed.includes(file)) {
    console.error(
      `❌ Cette PR publie ${result.version} : ajoutez ou complétez ${file} dans la PR (le nom suit la version calculée).`,
    );
    return 1;
  }
  if (!releaseNotes(result.version)) {
    console.error(`❌ ${file} est vide (hors frontmatter).`);
    return 1;
  }
  console.error(`✅ ${file} présent dans la PR.`);
  return 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
