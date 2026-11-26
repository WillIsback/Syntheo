// Carte interactive de la code base (issue 761).
//
// Lit l'index CodeGraph local (.codegraph/codegraph.db, en lecture seule),
// regroupe les symboles par zone avec le découpage de scripts/menage-lignes.mjs,
// pondère les liens entre zones (appels, imports, références, instanciations),
// calcule une disposition déterministe et écrit deux snippets Mintlify :
// docs/snippets/code-map.gen.jsx (français) et docs/snippets/en/code-map.gen.jsx
// (anglais). Même index, même commit = mêmes fichiers.
//
// L'index n'existe pas en CI : lancer le script en local, après
// `codegraph index`, dans la PR de chaque version mineure ou majeure.
//
// Usage : node scripts/code-map.mjs [--db <chemin>] [--min-poids N] [--check]
// --db         base CodeGraph (défaut : .codegraph/codegraph.db)
// --min-poids  poids minimal d'un lien affiché (défaut : 8)
// --check      échoue si les snippets ne sont pas à jour, sans les écrire

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveExecutable } from "./lib/resolve-executable.mjs";
import {
  categoryOf,
  isGenerated,
  listFiles,
  summarize,
  zoneOf,
} from "./menage-lignes.mjs";

export const EDGE_KINDS = ["calls", "imports", "references", "instantiates"];
export const MIN_WEIGHT = 8;
export const WIDTH = 1000;
export const HEIGHT = 700;
const SEED = 761;
const ITERATIONS = 400;

export const OUTPUTS = {
  fr: "docs/snippets/code-map.gen.jsx",
  en: "docs/snippets/en/code-map.gen.jsx",
};

export function layerOf(zone) {
  const top = zone.split("/")[0];
  return ["apps", "plugins", "crates", "packages"].includes(top)
    ? top
    : "autres";
}

// Une zone de tests : tous ses fichiers sont des tests (e2e/, …) ou son
// chemin désigne un dossier de tests.
export function isTestZone(zone) {
  return categoryOf(`${zone}/x.ts`) === "tests";
}

// Lignes de code par zone (hors tests, générés et zones de tests).
export function zoneLines(files) {
  const code = files.filter(
    (f) => f.cat === "code" && !isGenerated(f.path) && !isTestZone(f.zone),
  );
  return summarize(code).byZone;
}

// rows : [{ sf, tf, n }] (fichier source, fichier cible, nombre d'arêtes).
// Retourne les liens orientés entre zones distinctes connues, et ce qui est
// écarté (fichiers de tests, sources générées, zones hors comptage).
export function aggregateLinks(rows, zones) {
  const weights = new Map();
  const dropped = { tests: 0, generated: 0, unknown: 0 };
  for (const { sf, tf, n } of rows) {
    if (categoryOf(sf) === "tests" || categoryOf(tf) === "tests") {
      dropped.tests += n;
      continue;
    }
    // Une cible générée (liaisons Tauri bindings.gen.ts) appartient à la
    // zone qui la génère : c'est le pont entre le front et les plugins.
    if (isGenerated(sf)) {
      dropped.generated += n;
      continue;
    }
    const a = zoneOf(sf);
    const b = zoneOf(tf);
    if (a === b) continue;
    if (!zones.has(a) || !zones.has(b)) {
      dropped.unknown += n;
      continue;
    }
    const key = `${a}\0${b}`;
    weights.set(key, (weights.get(key) ?? 0) + n);
  }
  const links = [...weights]
    .map(([key, poids]) => {
      const [source, cible] = key.split("\0");
      return { source, cible, poids };
    })
    .sort(
      (x, y) =>
        y.poids - x.poids ||
        x.source.localeCompare(y.source) ||
        x.cible.localeCompare(y.cible),
    );
  return { links, dropped };
}

// Garde les liens d'au moins `min` arêtes ; retourne aussi les écartés.
export function filterLinks(links, min) {
  const kept = links.filter((l) => l.poids >= min);
  const weak = links.filter((l) => l.poids < min);
  return { kept, weak };
}

// Générateur pseudo-aléatoire à graine fixe (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const radiusOf = (lines) =>
  Math.round(Math.max(4, Math.min(42, Math.sqrt(lines) / 4.2)) * 10) / 10;

const LAYER_ANGLE = {
  apps: Math.PI,
  plugins: Math.PI / 2,
  crates: 0,
  packages: -Math.PI / 2,
  autres: (-3 * Math.PI) / 4,
};

// Disposition par forces (Fruchterman-Reingold) : graine, itérations et
// arrondis fixes, zones triées par identifiant. Chaque couche part de son
// secteur, puis les liens rapprochent les zones qui dépendent l'une de l'autre.
export function layout(zones, links, { width = WIDTH, height = HEIGHT } = {}) {
  const nodes = [...zones].sort((a, b) => a.id.localeCompare(b.id));
  const index = new Map(nodes.map((z, i) => [z.id, i]));
  const random = rng(SEED);
  const n = nodes.length;
  if (n === 0) return [];
  const pos = nodes.map((z) => {
    const angle = (LAYER_ANGLE[z.couche] ?? 0) + (random() - 0.5) * 1.2;
    const dist = 120 + random() * 160;
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
  });
  const r = nodes.map((z) => radiusOf(z.lignes));
  const undirected = new Map();
  for (const l of links) {
    const i = index.get(l.source);
    const j = index.get(l.cible);
    if (i === undefined || j === undefined) continue;
    const key = i < j ? `${i},${j}` : `${j},${i}`;
    undirected.set(key, (undirected.get(key) ?? 0) + l.poids);
  }
  const springs = [...undirected]
    .map(([key, w]) => {
      const [i, j] = key.split(",").map(Number);
      return { i, j, w: Math.log2(1 + w) };
    })
    .sort((a, b) => a.i - b.i || a.j - b.j);
  const k = Math.sqrt((width * height) / n) * 0.55;
  let temp = width / 8;
  for (let it = 0; it < ITERATIONS; it++) {
    const dx = new Float64Array(n);
    const dy = new Float64Array(n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let vx = pos[i].x - pos[j].x;
        let vy = pos[i].y - pos[j].y;
        let d = Math.hypot(vx, vy);
        if (d < 0.01) {
          vx = 0.01 * (i - j);
          vy = 0.01;
          d = Math.hypot(vx, vy);
        }
        const gap = Math.max(d - r[i] - r[j], 1);
        const f = (k * k) / gap;
        dx[i] += (vx / d) * f;
        dy[i] += (vy / d) * f;
        dx[j] -= (vx / d) * f;
        dy[j] -= (vy / d) * f;
      }
    for (const { i, j, w } of springs) {
      const vx = pos[i].x - pos[j].x;
      const vy = pos[i].y - pos[j].y;
      const d = Math.max(Math.hypot(vx, vy), 0.01);
      const f = ((d * d) / k) * (0.15 + w * 0.08);
      dx[i] -= (vx / d) * f;
      dy[i] -= (vy / d) * f;
      dx[j] += (vx / d) * f;
      dy[j] += (vy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      // Gravité légère vers le centre, pour garder les zones isolées.
      dx[i] -= pos[i].x * 0.02 * k;
      dy[i] -= pos[i].y * 0.02 * k;
      const d = Math.max(Math.hypot(dx[i], dy[i]), 0.01);
      const step = Math.min(d, temp);
      pos[i].x += (dx[i] / d) * step;
      pos[i].y += (dy[i] / d) * step;
    }
    temp = Math.max(temp * 0.985, 1);
  }
  // Séparation finale des disques qui se chevauchent.
  for (let pass = 0; pass < 60; pass++)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const vx = pos[j].x - pos[i].x;
        const vy = pos[j].y - pos[i].y;
        const d = Math.max(Math.hypot(vx, vy), 0.01);
        const min = r[i] + r[j] + 3;
        if (d >= min) continue;
        const push = (min - d) / 2;
        pos[i].x -= (vx / d) * push;
        pos[i].y -= (vy / d) * push;
        pos[j].x += (vx / d) * push;
        pos[j].y += (vy / d) * push;
      }
  const xs = pos.map((p, i) => [p.x - r[i], p.x + r[i]]).flat();
  const ys = pos.map((p, i) => [p.y - r[i], p.y + r[i]]).flat();
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const margin = 20;
  const scale = Math.min(
    (width - 2 * margin) / Math.max(maxX - minX, 1),
    (height - 2 * margin) / Math.max(maxY - minY, 1),
  );
  const offX = (width - (maxX - minX) * scale) / 2;
  const offY = (height - (maxY - minY) * scale) / 2;
  const round = (v) => Math.round(v * 10) / 10;
  return nodes.map((z, i) => ({
    ...z,
    x: round(offX + (pos[i].x - minX) * scale),
    y: round(offY + (pos[i].y - minY) * scale),
    r: round(Math.max(r[i] * scale, 3)),
  }));
}

// Première page de code/doc-map.mdx dont la colonne Sources cite une zone.
export function docLinks(mdx) {
  const links = new Map();
  for (const line of mdx.split("\n")) {
    const row = /^\| \[([^\]]+)\]\((\/[^)]*)\) \| (.*) \|$/.exec(line);
    if (!row) continue;
    const [, titre, href, sources] = row;
    for (const [, raw] of sources.matchAll(/`([^`]+)`/g)) {
      const path = raw.replace(/ \(.*\)$/, "").replace(/\/$/, "");
      // Un dossier cité (sans extension) est rangé comme un fichier qu'il contient.
      const last = path.slice(path.lastIndexOf("/") + 1);
      const zone = zoneOf(last.includes(".") ? path : `${path}/_`);
      if (!links.has(zone)) links.set(zone, { titre, href });
    }
  }
  return links;
}

const fmtInt = (n, locale) => n.toLocaleString(locale).replace(/ | /g, " ");

export function lastVersionTag(tags) {
  return (
    tags
      .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
      .map((t) => ({ t, v: t.slice(1).split(".").map(Number) }))
      .sort((a, b) => b.v[0] - a.v[0] || b.v[1] - a.v[1] || b.v[2] - a.v[2])[0]
      ?.t ?? "v0.0.0"
  );
}

// Construit les données de la carte à partir de comptages et d'arêtes.
export function buildMap({ files, rows, minWeight = MIN_WEIGHT, docs = {} }) {
  const lines = zoneLines(files);
  const zoneSet = new Set([...lines.keys()].filter((z) => lines.get(z) > 0));
  const { links: all, dropped } = aggregateLinks(rows, zoneSet);
  const { kept, weak } = filterLinks(all, minWeight);
  const zones = layout(
    [...zoneSet].map((id) => ({
      id,
      couche: layerOf(id),
      lignes: lines.get(id),
    })),
    kept,
  );
  const withDocs = (lang) =>
    zones.map((z) => {
      const doc = docs[lang]?.get(z.id);
      return doc ? { ...z, doc } : z;
    });
  return {
    zones,
    links: kept,
    weak,
    dropped,
    fr: withDocs("fr"),
    en: withDocs("en"),
    totalLines: zones.reduce((s, z) => s + z.lignes, 0),
    totalEdges: all.reduce((s, l) => s + l.poids, 0),
  };
}

const TEXT = {
  fr: {
    locale: "fr-FR",
    layers: {
      apps: "Applications",
      plugins: "Plugins",
      crates: "Crates",
      packages: "Paquets",
      autres: "Autres",
    },
    ui: {
      title: "Carte de la code base",
      meta: "Version {version} du {date}, commit {commit}",
      totals: "{zones} zones, {lines} lignes de code, {links} liens affichés",
      search: "Rechercher une zone",
      zoomIn: "Zoomer",
      zoomOut: "Dézoomer",
      reset: "Recentrer",
      layers: "Couches",
      hint: "Molette ou boutons pour zoomer, glisser pour déplacer, clic ou Entrée sur une zone pour le détail.",
      lines: "lignes de code",
      out: "Dépend de",
      inc: "Utilisée par",
      none: "Aucun lien au-dessus du seuil.",
      doc: "Page de la documentation",
      noDoc: "Aucune page utilisateur ne cite cette zone.",
      close: "Fermer",
      empty: "Cliquez une zone pour afficher ses dépendances.",
      map: "Carte des zones de la code base et de leurs dépendances",
      results: "Résultats",
    },
  },
  en: {
    locale: "en-US",
    layers: {
      apps: "Apps",
      plugins: "Plugins",
      crates: "Crates",
      packages: "Packages",
      autres: "Other",
    },
    ui: {
      title: "Codebase map",
      meta: "Version {version} of {date}, commit {commit}",
      totals: "{zones} zones, {lines} lines of code, {links} links shown",
      search: "Search a zone",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      reset: "Reset view",
      layers: "Layers",
      hint: "Scroll or use the buttons to zoom, drag to pan, click or press Enter on a zone for details.",
      lines: "lines of code",
      out: "Depends on",
      inc: "Used by",
      none: "No link above the threshold.",
      doc: "Documentation page",
      noDoc: "No user page cites this zone.",
      close: "Close",
      empty: "Click a zone to show its dependencies.",
      map: "Map of the codebase zones and their dependencies",
      results: "Results",
    },
  },
};

const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (_, key) => values[key]);

// Code du widget, identique dans les deux langues (seules les constantes
// changent). Préfixe CSS : .cm-
const WIDGET = String.raw`
const CM_COLORS = {
  apps: "hsl(142 45% 42%)",
  plugins: "hsl(212 62% 54%)",
  crates: "hsl(28 78% 52%)",
  packages: "hsl(282 45% 58%)",
  autres: "hsl(95 6% 55%)",
};

const CM_CSS = ${"`"}
.cm-root{--cm-bg:hsl(48 100% 99%);--cm-fg:hsl(100 8% 15%);--cm-muted:hsl(95 6% 36%);--cm-border:hsl(55 18% 87%);--cm-surface:hsl(53 22% 92%);--cm-ring:hsl(142 36% 30%);font-family:Geist,system-ui,sans-serif;color:var(--cm-fg);font-size:14px;line-height:1.5;margin:20px 0}
html.dark .cm-root{--cm-bg:hsl(103 10% 14%);--cm-fg:hsl(46 25% 90%);--cm-muted:hsl(86 8% 65%);--cm-border:hsl(105 7% 21%);--cm-surface:hsl(105 9% 18%);--cm-ring:hsl(142 34% 62%)}
.cm-root *{box-sizing:border-box}
.cm-root :is(button,input,a,g[tabindex],svg[tabindex]):focus-visible{outline:2px solid var(--cm-ring);outline-offset:2px}
.cm-head{display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline;margin-bottom:8px}
.cm-head strong{font-size:15px}
.cm-small{font-size:12px;color:var(--cm-muted)}
.cm-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
.cm-btn{border:1px solid var(--cm-border);background:var(--cm-bg);color:inherit;font:inherit;font-size:13px;border-radius:8px;padding:3px 10px;cursor:pointer;min-width:32px}
.cm-chip{display:inline-flex;gap:6px;align-items:center;font-size:13px;cursor:pointer;border:1px solid var(--cm-border);border-radius:999px;padding:2px 10px;background:var(--cm-bg)}
.cm-chip input{margin:0;accent-color:var(--cm-ring)}
.cm-dot{width:10px;height:10px;border-radius:999px;display:inline-block}
.cm-search{flex:1 1 180px;min-width:0;border:1px solid var(--cm-border);background:var(--cm-bg);color:inherit;font:inherit;font-size:13px;border-radius:8px;padding:4px 10px}
.cm-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
@media (min-width:900px){.cm-grid{grid-template-columns:minmax(0,1fr) 260px}}
.cm-stage{border:1px solid var(--cm-border);border-radius:12px;background:var(--cm-surface);overflow:hidden;touch-action:none}
.cm-stage svg{display:block;width:100%;height:auto;cursor:grab;user-select:none}
.cm-panel{border:1px solid var(--cm-border);border-radius:12px;background:var(--cm-bg);padding:12px;min-width:0;font-size:13px}
.cm-panel h4{margin:0 0 2px;font-size:14px;font-weight:600;word-break:break-all}
.cm-panel h5{margin:10px 0 4px;font-size:12px;font-weight:600;color:var(--cm-muted);text-transform:uppercase;letter-spacing:.04em}
.cm-panel ul{list-style:none;margin:0;padding:0}
.cm-panel li{margin:0}
.cm-link{border:0;background:none;padding:2px 0;font:inherit;color:inherit;cursor:pointer;text-align:left;display:flex;gap:6px;width:100%;justify-content:space-between}
.cm-link span:first-child{word-break:break-all}
.cm-panel a{color:var(--cm-ring)}
.cm-results{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
${"`"};

const cmShort = (id) => id.split("/").pop();
const cmFmt = (n) => n.toLocaleString(CM_DATA.locale).replace(/ | /g, " ");

export const CodeMap = () => {
  const T = CM_DATA.ui;
  const byId = useMemo(() => new Map(CM_ZONES.map((z) => [z.id, z])), []);
  const neighbours = useMemo(() => {
    const m = new Map(CM_ZONES.map((z) => [z.id, { out: [], inc: [] }]));
    for (const l of CM_LINKS) {
      m.get(l.source).out.push(l);
      m.get(l.cible).inc.push(l);
    }
    return m;
  }, []);
  const [layers, setLayers] = useState(() => Object.fromEntries(Object.keys(CM_COLORS).map((k) => [k, true])));
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef(null);
  const drag = useRef(null);
  const dragged = useRef(false);

  const visible = (id) => layers[byId.get(id).couche];
  const q = query.trim().toLowerCase();
  const matches = q ? CM_ZONES.filter((z) => visible(z.id) && z.id.toLowerCase().includes(q)) : [];
  const focus = hover ? hover : selected;
  const lit = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const l of neighbours.get(focus).out) s.add(l.cible);
    for (const l of neighbours.get(focus).inc) s.add(l.source);
    return s;
  }, [focus, neighbours]);

  const zoomAt = (factor, cx, cy) =>
    setView((v) => {
      const k = Math.min(8, Math.max(0.5, v.k * factor));
      const px = cx === undefined ? CM_W / 2 : cx;
      const py = cy === undefined ? CM_H / 2 : cy;
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });

  const toSvg = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * CM_W, y: ((e.clientY - rect.top) / rect.height) * CM_H };
  };

  useEffect(() => {
    const svg = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const p = toSvg(e);
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e) => {
    dragged.current = false;
    drag.current = { start: toSvg(e), view, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = toSvg(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) svgRef.current.setPointerCapture(d.id);
    d.moved = true;
    setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved) {
      dragged.current = true;
      svgRef.current.releasePointerCapture(d.id);
    }
    if (d && !d.moved && !hover) setSelected(null);
  };
  const onKey = (e) => {
    const step = 40;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.target !== svgRef.current) return;
    if (e.key === "+" || e.key === "=") zoomAt(1.25);
    else if (e.key === "-") zoomAt(0.8);
    else if (moves[e.key]) setView((v) => ({ ...v, x: v.x + moves[e.key][0], y: v.y + moves[e.key][1] }));
    else return;
    e.preventDefault();
  };

  const select = (id) => {
    setSelected(id);
    const z = byId.get(id);
    setView((v) => ({ k: Math.max(v.k, 1.6), x: CM_W / 2 - z.x * Math.max(v.k, 1.6), y: CM_H / 2 - z.y * Math.max(v.k, 1.6) }));
  };

  const linkList = (list, key) => {
    const top = list.filter((l) => visible(l[key])).slice(0, 5);
    if (top.length === 0) return <p className="cm-small" style={{ margin: 0 }}>{T.none}</p>;
    return (
      <ul>
        {top.map((l) => (
          <li key={l[key]}>
            <button type="button" className="cm-link" onClick={() => select(l[key])}>
              <span><span className="cm-dot" style={{ background: CM_COLORS[byId.get(l[key]).couche], marginRight: 6 }} />{l[key]}</span>
              <span className="cm-small">{cmFmt(l.poids)}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const sel = selected ? byId.get(selected) : null;
  const k = view.k;
  return (
    <div className="not-prose cm-root">
      <style>{CM_CSS}</style>
      <div className="cm-head">
        <strong>{T.title}</strong>
        <span className="cm-small">{CM_DATA.meta}</span>
        <span className="cm-small">{CM_DATA.totals}</span>
      </div>
      <div className="cm-bar">
        <input className="cm-search" type="search" aria-label={T.search} placeholder={T.search} value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && matches.length > 0) select(matches[0].id); }} />
        <button type="button" className="cm-btn" aria-label={T.zoomIn} title={T.zoomIn} onClick={() => zoomAt(1.25)}>+</button>
        <button type="button" className="cm-btn" aria-label={T.zoomOut} title={T.zoomOut} onClick={() => zoomAt(0.8)}>−</button>
        <button type="button" className="cm-btn" onClick={() => setView({ x: 0, y: 0, k: 1 })}>{T.reset}</button>
      </div>
      <fieldset className="cm-bar" style={{ border: 0, padding: 0, margin: "0 0 8px" }}>
        <legend className="cm-small" style={{ float: "left", marginRight: 4 }}>{T.layers}</legend>
        {Object.keys(CM_COLORS).map((c) => (
          <label key={c} className="cm-chip">
            <input type="checkbox" checked={layers[c]} onChange={() => setLayers({ ...layers, [c]: !layers[c] })} />
            <span className="cm-dot" style={{ background: CM_COLORS[c] }} />
            {CM_DATA.layers[c]} ({CM_ZONES.filter((z) => z.couche === c).length})
          </label>
        ))}
      </fieldset>
      {matches.length > 0 ? (
        <div className="cm-results" aria-label={T.results}>
          {matches.slice(0, 8).map((z) => (
            <button key={z.id} type="button" className="cm-btn" onClick={() => select(z.id)}>{z.id}</button>
          ))}
        </div>
      ) : null}
      <div className="cm-grid">
        <div className="cm-stage">
          <svg ref={svgRef} viewBox={${"`"}0 0 ${"$"}{CM_W} ${"$"}{CM_H}${"`"}} role="group" aria-label={T.map} tabIndex={0}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKey}>
            <g transform={${"`"}translate(${"$"}{view.x} ${"$"}{view.y}) scale(${"$"}{k})${"`"}}>
              {CM_LINKS.filter((l) => visible(l.source) && visible(l.cible)).map((l) => {
                const a = byId.get(l.source);
                const b = byId.get(l.cible);
                const on = focus ? l.source === focus || l.cible === focus : false;
                return (
                  <line key={l.source + ">" + l.cible} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={on ? CM_COLORS[(l.source === focus ? b : a).couche] : "currentColor"}
                    strokeOpacity={focus ? (on ? 0.85 : 0.04) : 0.12}
                    strokeWidth={(0.4 + Math.log2(l.poids) * 0.25) / Math.sqrt(k)} />
                );
              })}
              {CM_ZONES.filter((z) => visible(z.id)).map((z) => {
                const dim = (lit && !lit.has(z.id)) || (q && !z.id.toLowerCase().includes(q));
                const label = z.r * k > 14 || (lit && lit.has(z.id)) || z.id === selected;
                return (
                  <g key={z.id} tabIndex={0} role="button" aria-label={${"`"}${"$"}{z.id}, ${"$"}{cmFmt(z.lignes)} ${"$"}{T.lines}${"`"}}
                    aria-pressed={z.id === selected} style={{ cursor: "pointer", opacity: dim ? 0.18 : 1 }}
                    onMouseEnter={() => setHover(z.id)} onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(z.id)} onBlur={() => setHover(null)}
                    onClick={() => { if (!dragged.current) setSelected(z.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(z.id); } }}>
                    <title>{${"`"}${"$"}{z.id} · ${"$"}{cmFmt(z.lignes)} ${"$"}{T.lines}${"`"}}</title>
                    <circle cx={z.x} cy={z.y} r={z.r} fill={CM_COLORS[z.couche]} fillOpacity={0.85}
                      stroke={z.id === selected ? "currentColor" : "var(--cm-bg)"} strokeWidth={(z.id === selected ? 2.5 : 1) / k} />
                    {label ? (
                      <text x={z.x} y={z.y + z.r + 11 / k} textAnchor="middle" fontSize={11 / k} fill="currentColor"
                        stroke="var(--cm-surface)" strokeWidth={3 / k} paintOrder="stroke" style={{ pointerEvents: "none" }}>
                        {cmShort(z.id)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <aside className="cm-panel" aria-live="polite">
          {sel ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <h4>{sel.id}</h4>
                <button type="button" className="cm-btn" aria-label={T.close} onClick={() => setSelected(null)}>×</button>
              </div>
              <div className="cm-small">
                <span className="cm-dot" style={{ background: CM_COLORS[sel.couche], marginRight: 6 }} />
                {CM_DATA.layers[sel.couche]} · {cmFmt(sel.lignes)} {T.lines}
              </div>
              <h5>{T.out}</h5>
              {linkList(neighbours.get(sel.id).out, "cible")}
              <h5>{T.inc}</h5>
              {linkList(neighbours.get(sel.id).inc, "source")}
              <h5>{T.doc}</h5>
              {sel.doc ? <a href={sel.doc.href}>{sel.doc.titre}</a> : <p className="cm-small" style={{ margin: 0 }}>{T.noDoc}</p>}
            </div>
          ) : (
            <p className="cm-small" style={{ margin: 0 }}>{T.empty}</p>
          )}
        </aside>
      </div>
      <p className="cm-small" style={{ margin: "8px 0 0" }}>{T.hint}</p>
    </div>
  );
};
`;

export function render(map, lang, meta) {
  const t = TEXT[lang];
  const zones = map[lang].map((z) => {
    const out = {
      id: z.id,
      couche: z.couche,
      lignes: z.lignes,
      x: z.x,
      y: z.y,
      r: z.r,
    };
    if (z.doc) out.doc = z.doc;
    return out;
  });
  const data = {
    locale: t.locale,
    version: meta.version,
    date: meta.date,
    commit: meta.commit,
    meta: fill(t.ui.meta, meta),
    totals: fill(t.ui.totals, {
      zones: fmtInt(zones.length, t.locale),
      lines: fmtInt(map.totalLines, t.locale),
      links: fmtInt(map.links.length, t.locale),
    }),
    layers: t.layers,
    ui: t.ui,
  };
  const json = (v) => JSON.stringify(v);
  return [
    "// Fichier généré par scripts/code-map.mjs depuis l'index CodeGraph : ne pas modifier.",
    "// Carte interactive de la code base (issue 761). Relancer `node scripts/code-map.mjs`",
    "// après `codegraph index` dans la PR de chaque version mineure ou majeure.",
    "// Mintlify fournit React et ses hooks sans import ; le snippet est autonome.",
    "",
    `const CM_W = ${WIDTH};`,
    `const CM_H = ${HEIGHT};`,
    `const CM_DATA = ${json(data)};`,
    "const CM_ZONES = [",
    ...zones.map((z) => `  ${json(z)},`),
    "];",
    "const CM_LINKS = [",
    ...map.links.map((l) => `  ${json(l)},`),
    "];",
    WIDGET,
  ].join("\n");
}

const git = (root, args) =>
  execFileSync(resolveExecutable("git"), ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();

async function readRows(dbPath) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const kinds = EDGE_KINDS.map((k) => `'${k}'`).join(",");
    return db
      .prepare(
        `SELECT s.file_path AS sf, t.file_path AS tf, COUNT(*) AS n
         FROM edges e JOIN nodes s ON s.id = e.source JOIN nodes t ON t.id = e.target
         WHERE e.kind IN (${kinds}) AND s.file_path <> t.file_path
         GROUP BY sf, tf ORDER BY sf, tf`,
      )
      .all()
      .map((r) => ({ sf: r.sf, tf: r.tf, n: Number(r.n) }));
  } finally {
    db.close();
  }
}

async function main(argv) {
  const root = process.cwd();
  const opt = {
    db: ".codegraph/codegraph.db",
    "min-poids": MIN_WEIGHT,
    check: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") opt.check = true;
    else if (a === "--db" || a === "--min-poids") opt[a.slice(2)] = argv[++i];
    else throw new Error(`Option inconnue : ${a}`);
  }
  const dbPath = join(root, opt.db);
  if (!existsSync(dbPath))
    throw new Error(
      `${opt.db} introuvable : lancer \`codegraph index\` à la racine du dépôt.`,
    );
  const rows = await readRows(dbPath);
  const docs = {
    fr: docLinks(readFileSync(join(root, "docs/fr/code/doc-map.mdx"), "utf8")),
    en: docLinks(readFileSync(join(root, "docs/en/code/doc-map.mdx"), "utf8")),
  };
  const map = buildMap({
    files: listFiles("HEAD"),
    rows,
    minWeight: Number(opt["min-poids"]),
    docs,
  });
  const meta = {
    version: lastVersionTag(git(root, ["tag", "--merged", "HEAD"]).split("\n")),
    date: git(root, ["log", "-1", "--format=%cs"]),
    commit: git(root, ["rev-parse", "--short=8", "HEAD"]),
  };
  const weakWeight = map.weak.reduce((s, l) => s + l.poids, 0);
  console.log(
    `${map.zones.length} zones, ${map.links.length} liens (poids ≥ ${opt["min-poids"]}), ${map.totalLines} lignes, ${map.totalEdges} arêtes entre zones.`,
  );
  console.log(
    `Écartés : ${map.weak.length} liens faibles (${weakWeight} arêtes), arêtes touchant des tests ${map.dropped.tests}, partant de fichiers générés ${map.dropped.generated}, des zones hors comptage ${map.dropped.unknown}.`,
  );
  let stale = false;
  for (const lang of ["fr", "en"]) {
    const path = join(root, OUTPUTS[lang]);
    const content = render(map, lang, meta);
    if (opt.check) {
      if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
        console.error(`${OUTPUTS[lang]} n'est plus à jour.`);
        stale = true;
      }
    } else {
      writeFileSync(path, content);
      console.log(
        `${OUTPUTS[lang]} : ${(Buffer.byteLength(content) / 1024).toFixed(1)} Ko`,
      );
    }
  }
  if (stale) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  await main(process.argv.slice(2));
