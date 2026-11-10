import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyBump,
  bumpFromSubjects,
  nextReleaseVersion,
  parseNote,
  releaseNotes,
  releaseNotesFile,
} from "./next-release-version.mjs";

const SCRIPT = fileURLToPath(
  new URL("./next-release-version.mjs", import.meta.url),
);

test("bump : même règle que l'ancien release.yml", () => {
  assert.equal(bumpFromSubjects([]), "none");
  assert.equal(bumpFromSubjects(["docs: x", "chore(deps): y"]), "none");
  assert.equal(bumpFromSubjects(["fix: x"]), "patch");
  assert.equal(bumpFromSubjects(["perf(stt): x"]), "patch");
  assert.equal(bumpFromSubjects(["fix: x", "feat(ui): y"]), "minor");
  assert.equal(bumpFromSubjects(["refactor!: x", "feat: y"]), "major");
  assert.equal(bumpFromSubjects(["feat(a)!: x"]), "major");
  // Sans deux-points juste après le type : non éligible.
  assert.equal(bumpFromSubjects(["fixup x", "feature: y"]), "none");
});

test("application du bump", () => {
  assert.equal(applyBump("v0.7.0", "patch"), "v0.7.1");
  assert.equal(applyBump("v0.7.3", "minor"), "v0.8.0");
  assert.equal(applyBump("v0.7.3", "major"), "v1.0.0");
  assert.equal(applyBump("", "patch"), "v0.0.1");
});

test("décision : skip, bump forcé, titre de PR", () => {
  assert.deepEqual(
    nextReleaseVersion({
      lastTag: "v0.7.0",
      subjects: ["fix: a"],
      skipSubject: "fix: a [skip release]",
    }).version,
    "skipped",
  );
  assert.equal(
    nextReleaseVersion({ lastTag: "v0.7.0", subjects: ["docs: a"] }).version,
    "skipped",
  );
  assert.equal(
    nextReleaseVersion({ lastTag: "v0.7.0", subjects: [], bump: "minor" })
      .version,
    "v0.8.0",
  );
  assert.equal(
    nextReleaseVersion({ lastTag: "v0.7.0", subjects: [], bump: "none" })
      .version,
    "skipped",
  );
  // Le marqueur n'est lu que si on le demande (push, pas workflow_dispatch).
  assert.equal(
    nextReleaseVersion({
      lastTag: "v0.7.0",
      subjects: ["fix: a [skip release]"],
    }).version,
    "v0.7.1",
  );
});

test("note : frontmatter retiré, résumé gardé", () => {
  assert.deepEqual(
    parseNote(
      '---\ndate: "2026-11-10"\nsummary: "Résumé."\n---\n\n## A\n\n- b\n',
    ),
    { summary: "Résumé.", body: "## A\n\n- b" },
  );
  assert.deepEqual(parseNote("---\ndate: x\n---\n\n"), {
    summary: null,
    body: "",
  });
});

test("CLI dans un dépôt git jetable", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "next-release-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  const run = (...args) => {
    try {
      return {
        code: 0,
        out: execFileSync("node", [SCRIPT, ...args], {
          cwd: dir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      };
    } catch (error) {
      return { code: error.status, out: error.stdout };
    }
  };
  const commit = (subject) =>
    git("commit", "-q", "--allow-empty", "-m", subject);

  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  commit("feat: départ");
  git("tag", "v0.7.0");
  commit("docs: a [skip release]");

  await t.test("rien d'éligible", () => {
    assert.equal(run().out, "version=skipped\nbump=none\n");
  });

  await t.test("titre de PR compté, marqueur honoré", () => {
    assert.equal(
      run("--pr-title", "fix: b").out,
      "version=v0.7.1\nbump=patch\n",
    );
    assert.equal(
      run("--pr-title", "feat: b [skip release]", "--honor-skip").out,
      "version=skipped\nbump=none\n",
    );
    // Sans titre, --honor-skip lit le dernier commit.
    commit("fix: c [skip release]");
    assert.equal(run("--honor-skip").out, "version=skipped\nbump=none\n");
    assert.equal(run().out, "version=v0.7.1\nbump=patch\n");
  });

  // Le `fix: c` ci-dessus, déjà sur main sans release, rend toute PR
  // suivante publiable : la release le compterait aussi.
  await t.test("--check-changelog exige la note dans le diff", () => {
    const base = git("rev-parse", "HEAD").trim();
    commit("chore: travail");
    assert.equal(
      run("--pr-title", "fix: d", "--check-changelog", base).code,
      1,
    );
    assert.equal(
      run(
        "--pr-title",
        "docs: d [skip release]",
        "--honor-skip",
        "--check-changelog",
        base,
      ).code,
      0,
    );

    const notes = path.join(dir, "packages/changelog/content/desktop");
    mkdirSync(notes, { recursive: true });
    writeFileSync(path.join(notes, "0.7.1.md"), '---\nsummary: "S"\n---\n');
    git("add", ".");
    commit("chore: note vide");
    assert.equal(
      run("--pr-title", "fix: d", "--check-changelog", base).code,
      1,
    );

    writeFileSync(
      path.join(notes, "0.7.1.md"),
      '---\nsummary: "S"\n---\n\n## Corrections\n\n- x\n',
    );
    git("commit", "-q", "-am", "chore: note");
    assert.equal(
      run("--pr-title", "fix: d", "--check-changelog", base).code,
      0,
    );
    // Un feat calcule 0.8.0 : la note 0.7.1 ne suffit plus.
    assert.equal(
      run("--pr-title", "feat: d", "--check-changelog", base).code,
      1,
    );
    assert.equal(run("--notes", "v0.7.1").out, "S\n\n## Corrections\n\n- x\n");
    assert.equal(run("--notes", "v0.9.0").code, 1);
  });
});

test("note de release : la version ne sort pas du dossier des notes", () => {
  const root = path.join(tmpdir(), "syntheo-notes");
  const expected = path.join(
    root,
    "packages/changelog/content/desktop/0.7.1.md",
  );
  assert.equal(releaseNotesFile("v0.7.1", root), expected);
  assert.equal(releaseNotesFile("0.7.1", root), expected);
  for (const version of [
    "../../../etc/passwd",
    "v0.7.1/../../x",
    "0.7.1-2",
    "/etc/passwd",
    "0.7",
    undefined,
  ]) {
    assert.throws(() => releaseNotes(version, root), /Version invalide/);
  }
});
