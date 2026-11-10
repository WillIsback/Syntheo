import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Génère les snippets docs/snippets/*.gen.jsx (reproductions interactives de
// l'app pour la doc Mintlify) depuis les sources de l'app, pour qu'elles
// restent fidèles :
// - couleurs : packages/design-system/src/tokens.css (thèmes clair et sombre) ;
// - libellés : apps/desktop/src/i18n/locales/fr/messages.po, par msgid
//   (L, LP et LF dans les modèles) ;
// - icônes : les Hugeicons de packages/ui, par leur nom dans
//   packages/ui/src/components/icons-*.tsx (I("Folder") dans les modèles).
// Un snippet Mintlify ne peut importer ni un autre snippet ni du JSON : chaque
// sortie concatène les modèles communs (config.json, « shared ») et ceux de
// ses pages (« outputs »). Vérifie aussi que chaque étape d'un
// <SettingsPath steps={[…]}> des pages docs/ est un libellé français de l'app.
// --check échoue si un fichier généré diverge ou si un libellé n'existe plus
// (lancé par un test Vitest).

export const TEMPLATE_DIR = "scripts/docs-ui";
export const CONFIG_PATH = "scripts/docs-ui/config.json";
export const OUTPUT_DIR = "docs/snippets";
export const TOKENS_PATH = "packages/design-system/src/tokens.css";
export const MESSAGES_PATH = "apps/desktop/src/i18n/locales/fr/messages.po";
const UI_ICONS_DIR = "packages/ui/src/components";
const UI_ICON_FILES = ["icons-a-g.tsx", "icons-g-z.tsx"];

export const TOKEN_NAMES = [
  "background",
  "foreground",
  "card",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "border",
  "input",
  "primary",
  "primary-foreground",
  "recording",
  "seal",
  "user-ink",
  "alert",
  "alert-foreground",
  "alert-border",
  "faint",
  "destructive",
  "destructive-foreground",
  "popover",
  "ring",
];
export const RAW_TOKEN_NAMES = ["shadow-capsule"];

// Icônes absentes de packages/ui : nom utilisé par la doc -> export de
// @hugeicons/core-free-icons.
export const EXTRA_ICONS = {
  Location: "Location01Icon",
};
const ICON_STROKE_WIDTH = "1.5";

function block(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0)
    throw new Error(`${TOKENS_PATH} : bloc ${selector} introuvable`);
  return css.slice(start, css.indexOf("}", start));
}

export function parseTokens(css) {
  const read = (selector) => {
    const body = block(css, selector);
    const out = {};
    for (const name of [...TOKEN_NAMES, ...RAW_TOKEN_NAMES]) {
      const match = body.match(new RegExp(`--${name}:\\s*([^;]+);`));
      if (!match)
        throw new Error(`${TOKENS_PATH} : --${name} absent de ${selector}`);
      const value = match[1].trim();
      out[name] = TOKEN_NAMES.includes(name) ? `hsl(${value})` : value;
    }
    return out;
  };
  return { light: read(":root"), dark: read(".dark") };
}

function unquote(line) {
  return JSON.parse(line.slice(line.indexOf('"')));
}

// msgid sans contexte -> msgstr (les entrées avec msgctxt sont ignorées).
export function parseMessages(po) {
  const map = new Map();
  for (const entry of po.split(/\n\s*\n/)) {
    let field = null;
    const parts = { msgctxt: null, msgid: null, msgstr: null };
    for (const line of entry.split("\n")) {
      const head = line.match(/^(msgctxt|msgid|msgstr) "/);
      if (head) {
        field = head[1];
        parts[field] = unquote(line);
      } else if (line.startsWith('"') && field) {
        parts[field] += unquote(line);
      }
    }
    if (parts.msgid && parts.msgstr && parts.msgctxt === null) {
      map.set(parts.msgid, parts.msgstr);
    }
  }
  return map;
}

// L("msgid"), LP("msgid", n) et LF("msgid", { … }) dans les modèles.
export function usedLabels(template) {
  return [
    ...new Set(
      [...template.matchAll(/\bL[PF]?\("((?:[^"\\]|\\.)*)"/g)].map((m) =>
        JSON.parse(`"${m[1]}"`),
      ),
    ),
  ].sort();
}

// I("Folder") dans les modèles.
export function usedIcons(template) {
  return [
    ...new Set([...template.matchAll(/\bI\("(\w+)"\)/g)].map((m) => m[1])),
  ].sort();
}

// Nom de packages/ui -> export Hugeicons : export const X = createIcon(XIcon, …).
export function parseUiIcons(source) {
  const out = {};
  const pattern =
    /export const (\w+) = \/\* @__PURE__ \*\/ createIcon\(\s*(\w+),/g;
  for (const [, name, exportName] of source.matchAll(pattern)) {
    out[name] = exportName;
  }
  return out;
}

function mdxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "snippets" ? [] : mdxFiles(full);
    return entry.name.endsWith(".mdx") ? [full] : [];
  });
}

export function settingsPathSteps(mdx) {
  return [...mdx.matchAll(/<SettingsPath\s+steps=\{\[([^\]]*)\]\}/g)].flatMap(
    (m) =>
      [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((s) =>
        JSON.parse(`"${s[1]}"`),
      ),
  );
}

async function loadIcons(root, names) {
  const require = createRequire(path.join(root, "packages/ui/package.json"));
  const mod = await import(
    pathToFileURL(require.resolve("@hugeicons/core-free-icons")).href
  );
  const ui = parseUiIcons(
    UI_ICON_FILES.map((file) =>
      readFileSync(path.join(root, UI_ICONS_DIR, file), "utf8"),
    ).join("\n"),
  );
  const attr = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const icons = {};
  const errors = [];
  for (const name of names) {
    const exportName = ui[name] ?? EXTRA_ICONS[name];
    const icon = exportName ? mod[exportName] : undefined;
    if (!icon) {
      errors.push(
        `icône inconnue : I("${name}") (absente de ${UI_ICONS_DIR}/icons-*.tsx et de EXTRA_ICONS)`,
      );
      continue;
    }
    icons[name] = icon
      .map(([tag, attrs]) => {
        const rendered = Object.entries(attrs)
          .filter(([key]) => key !== "key")
          .map(
            ([key, value]) =>
              `${attr(key)}="${key === "strokeWidth" ? ICON_STROKE_WIDTH : value}"`,
          )
          .join(" ");
        return `<${tag} ${rendered}/>`;
      })
      .join("");
  }
  return { icons, errors };
}

// Retourne { "app.gen.jsx": contenu, … } pour chaque sortie de config.json.
export async function generate(root = process.cwd()) {
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  const config = JSON.parse(read(CONFIG_PATH));
  const tokens = parseTokens(read(TOKENS_PATH));
  const messages = parseMessages(read(MESSAGES_PATH));
  const errors = [];

  const french = new Set(messages.values());
  for (const file of mdxFiles(path.join(root, "docs"))) {
    for (const step of settingsPathSteps(readFileSync(file, "utf8"))) {
      if (!french.has(step)) {
        errors.push(
          `${path.relative(root, file)} : « ${step} » n'est pas un libellé de l'app (SettingsPath)`,
        );
      }
    }
  }

  const json = (value) => JSON.stringify(value, null, 2);
  const outputs = {};
  const checked = new Set();
  for (const [name, own] of Object.entries(config.outputs)) {
    const files = [...config.shared, ...own];
    const template = files
      .map((file) => read(path.join(TEMPLATE_DIR, file)).trimEnd())
      .join("\n\n");
    // Mintlify découpe un snippet selon les imports de la page : une balise
    // JSX d'un composant interne partagé entre deux imports n'y est plus
    // résolue. Les composants internes passent par h(SynX, props).
    for (const file of files) {
      if (checked.has(file)) continue;
      checked.add(file);
      const source = read(path.join(TEMPLATE_DIR, file));
      for (const m of source.matchAll(/<\/?(Syn[A-Z]\w*)/g)) {
        const line = source.slice(0, m.index).split("\n").length;
        errors.push(
          `${TEMPLATE_DIR}/${file}:${line} : balise <${m[1]}> interdite, écrire h(${m[1]}, { … })`,
        );
      }
    }
    const labels = {};
    for (const id of usedLabels(template)) {
      if (messages.has(id)) labels[id] = messages.get(id);
      else
        errors.push(
          `${name} : libellé absent de ${MESSAGES_PATH} : msgid "${id}"`,
        );
    }
    const loaded = await loadIcons(root, usedIcons(template));
    errors.push(...loaded.errors.map((error) => `${name} : ${error}`));
    // Feuilles de style propres à chaque modèle : const SYN_CSS_… = `…`.
    const cssParts = [...template.matchAll(/^const (SYN_CSS_\w+) = /gm)].map(
      (m) => m[1],
    );
    let output = template;
    const fill = (marker, value) => {
      const pattern = new RegExp(`/\\*@${marker}\\*/ (?:""|\\{\\}|\\[\\])`);
      if (!pattern.test(output)) {
        errors.push(`${TEMPLATE_DIR}/${files[0]} : marqueur @${marker} absent`);
        return;
      }
      output = output.replace(pattern, () => value);
    };
    fill("VERSION", json(config.version));
    fill("TOKENS_LIGHT", json(tokens.light));
    fill("TOKENS_DARK", json(tokens.dark));
    fill("LABELS", json(labels));
    fill("ICONS", json(loaded.icons));
    fill("CSS_PARTS", `[${cssParts.join(", ")}]`);
    const sources = files.map((file) => `${TEMPLATE_DIR}/${file}`).join(", ");
    outputs[name] =
      `// Fichier généré par scripts/sync-docs-ui.mjs depuis ${sources} : ne pas modifier.\n${output}\n`;
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return outputs;
}

async function main() {
  const check = process.argv.includes("--check");
  const root = process.cwd();
  let outputs;
  try {
    outputs = await generate(root);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const stale = [];
  for (const [name, output] of Object.entries(outputs)) {
    const target = path.join(root, OUTPUT_DIR, name);
    const current = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (current === output) continue;
    if (check) stale.push(`${OUTPUT_DIR}/${name}`);
    else writeFileSync(target, output);
  }
  if (stale.length) {
    console.error(
      `Pas à jour : ${stale.join(", ")}. Lancez node scripts/sync-docs-ui.mjs`,
    );
    process.exit(1);
  }
  const names = Object.keys(outputs).map((name) => `${OUTPUT_DIR}/${name}`);
  console.log(`${names.join(", ")} ${check ? "à jour" : "générés"}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
