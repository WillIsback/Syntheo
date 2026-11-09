import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Génère docs/snippets/app.gen.jsx (reproductions interactives de l'app pour
// la doc Mintlify) depuis les sources de l'app, pour qu'elles restent fidèles :
// - couleurs : packages/design-system/src/tokens.css (thèmes clair et sombre) ;
// - libellés : apps/desktop/src/i18n/locales/fr/messages.po, par msgid ;
// - icônes : les Hugeicons qu'utilise packages/ui.
// Vérifie aussi que chaque étape d'un <SettingsPath steps={[…]}> des pages
// docs/ est un libellé français de l'app. --check échoue si le fichier généré
// diverge ou si un libellé n'existe plus (lancé par un test Vitest).

export const TEMPLATE_PATH = "scripts/docs-ui/app.jsx.tpl";
export const CONFIG_PATH = "scripts/docs-ui/config.json";
export const OUTPUT_PATH = "docs/snippets/app.gen.jsx";
export const TOKENS_PATH = "packages/design-system/src/tokens.css";
export const MESSAGES_PATH = "apps/desktop/src/i18n/locales/fr/messages.po";

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
];
export const RAW_TOKEN_NAMES = ["shadow-capsule"];

// Nom utilisé par la doc -> export de @hugeicons/core-free-icons, comme dans
// packages/ui/src/components/icons-*.tsx.
export const ICONS = {
  Microphone: "Mic01Icon",
  MicrophoneSlash: "MicOff01Icon",
  SpeakerHigh: "VolumeHighIcon",
  SpeakerX: "VolumeXIcon",
  Pause: "PauseIcon",
  Play: "PlayIcon",
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

export function usedLabels(template) {
  return [
    ...new Set(
      [...template.matchAll(/\bL\("((?:[^"\\]|\\.)*)"\)/g)].map((m) =>
        JSON.parse(`"${m[1]}"`),
      ),
    ),
  ].sort();
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

async function loadIcons(root) {
  const require = createRequire(path.join(root, "packages/ui/package.json"));
  const mod = await import(
    pathToFileURL(require.resolve("@hugeicons/core-free-icons")).href
  );
  const attr = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const out = {};
  for (const [name, exportName] of Object.entries(ICONS)) {
    const icon = mod[exportName];
    if (!icon)
      throw new Error(`@hugeicons/core-free-icons : ${exportName} introuvable`);
    out[name] = icon
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
  return out;
}

export async function generate(root = process.cwd()) {
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  const template = read(TEMPLATE_PATH);
  const { version } = JSON.parse(read(CONFIG_PATH));
  const tokens = parseTokens(read(TOKENS_PATH));
  const messages = parseMessages(read(MESSAGES_PATH));
  const errors = [];

  const labels = {};
  for (const id of usedLabels(template)) {
    if (messages.has(id)) labels[id] = messages.get(id);
    else errors.push(`libellé absent de ${MESSAGES_PATH} : msgid "${id}"`);
  }

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
  if (errors.length) throw new Error(errors.join("\n"));

  const json = (value) => JSON.stringify(value, null, 2);
  const fill = (marker, value) => {
    const pattern = new RegExp(`/\\*@${marker}\\*/ (?:""|\\{\\})`);
    if (!pattern.test(template))
      throw new Error(`${TEMPLATE_PATH} : marqueur @${marker} absent`);
    return (text) => text.replace(pattern, () => value);
  };
  let output = template;
  output = fill("VERSION", json(version))(output);
  output = fill("TOKENS_LIGHT", json(tokens.light))(output);
  output = fill("TOKENS_DARK", json(tokens.dark))(output);
  output = fill("LABELS", json(labels))(output);
  output = fill("ICONS", json(await loadIcons(root)))(output);
  return `// Fichier généré par scripts/sync-docs-ui.mjs depuis ${TEMPLATE_PATH} : ne pas modifier.\n${output}`;
}

async function main() {
  const check = process.argv.includes("--check");
  const root = process.cwd();
  const target = path.join(root, OUTPUT_PATH);
  let output;
  try {
    output = await generate(root);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (check) {
    const current = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (current !== output) {
      console.error(
        `${OUTPUT_PATH} n'est plus à jour : lancez node scripts/sync-docs-ui.mjs`,
      );
      process.exit(1);
    }
    console.log(`${OUTPUT_PATH} à jour.`);
    return;
  }
  writeFileSync(target, output);
  console.log(`${OUTPUT_PATH} généré.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
