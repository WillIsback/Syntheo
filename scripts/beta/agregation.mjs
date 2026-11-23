// Agrégation des exports de mesure de la bêta (issue 673).
//
// Lit un dossier d'exports `*.json` produits à la main par les testeurs
// (schéma crates/mesure/schema/export-v1.json) et en tire la synthèse décrite
// par la spécification de mesure : reprise de fond par testeur, verdict selon
// les seuils pré-enregistrés, taux d'abandon, garde-fou des sections Décisions
// et Actions, effet du dictionnaire avec groupe témoin.
//
// Chaque export est une donnée non fiable : taille plafonnée avant lecture,
// validation stricte par le schéma, contrôles de cohérence. Un fichier refusé
// est listé avec une raison fixe, sans rien recopier de son contenu, et
// n'empêche pas l'agrégation des autres. Aucun accès réseau.
//
// Usage :
//   node scripts/beta/agregation.mjs <dossier-exports> [--out <dossier-sortie>]
//
// Sans --out, le rapport Markdown est écrit sur la sortie standard. Avec
// --out, le dossier reçoit rapport.md, rapport.json et testeurs.csv.

import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { compileSchema } from "./schema.mjs";

function deepFreeze(value) {
  for (const inner of Object.values(value)) {
    if (typeof inner === "object" && inner !== null) deepFreeze(inner);
  }
  return Object.freeze(value);
}

// Seuils pré-enregistrés (spécification de mesure, §3 et §4, version du
// 2026-11-21). Ils ne sont réglables ni par la ligne de commande ni par un
// fichier de configuration : toute modification passe par un commit qui
// incrémente `version` et date la raison du changement.
export const SEUILS = deepFreeze({
  version: 1,
  date: "2026-11-21",
  testeur_qualifie_reunions_min: 5,
  publiable_testeurs_min: 5,
  succes: {
    mediane_fond_max: 100,
    part_testeurs: { num: 2, den: 3 },
    abandon_max: 0.2,
  },
  echec: {
    // Strictement au-dessus, chez une majorité stricte des testeurs qualifiés.
    mediane_fond_au_dessus_de: 250,
  },
  garde_fou_section: {
    roles: ["decisions", "actions"],
    ajouts_max: 50,
    part_testeurs: { num: 1, den: 3 },
  },
  abandon_jours: 7,
  dictionnaire: {
    erreurs_entree: 2,
    delai_ajout_reunions: 2,
    fenetre_reunions: 5,
    fenetre_reunions_min: 3,
    termes_traites_min: 20,
    termes_temoins_min: 20,
    testeurs_min: 3,
  },
  bootstrap: { tirages: 2000, graine: 20261121, niveau: 0.95 },
});

// Version de l'outil (format de sortie et interprétations documentées dans
// le README). Distincte de la version des seuils.
export const VERSION_AGREGATION = 1;
export const TAILLE_MAX_OCTETS = 2 * 1024 * 1024;
export const FICHIERS_MAX = 1000;

const SCHEMA_URL = new URL(
  "../../crates/mesure/schema/export-v1.json",
  import.meta.url,
);
const SCHEMA = JSON.parse(readFileSync(SCHEMA_URL, "utf8"));
export const VERSION_SCHEMA = SCHEMA.properties.schema_version.const;
const validateSchema = compileSchema(SCHEMA);

// Raisons de refus : textes fixes, jamais dérivés du contenu du fichier.
export const RAISONS = deepFreeze({
  non_fichier: "n'est pas un fichier ordinaire",
  illisible: "illisible",
  trop_gros: `dépasse ${TAILLE_MAX_OCTETS} octets`,
  trop_de_fichiers: `au-delà des ${FICHIERS_MAX} premiers fichiers`,
  json_invalide: "JSON ou UTF-8 invalide",
  hors_schema: "hors schéma",
  incoherent: "incohérent",
  pseudonyme_remplace: "pseudonyme repris par un export plus récent",
  pseudonyme_ambigu: "deux exports différents du même pseudonyme au même jour",
  doublon_identique: "copie identique d'un export déjà retenu",
});

// ---------------------------------------------------------------------------
// Lecture et contrôle d'un export

function readCapped(path) {
  // Tout ce qui n'est pas un fichier ordinaire (dossier, lien, tube nommé,
  // périphérique, socket) est refusé : O_NOFOLLOW refuse un lien, O_NONBLOCK
  // ouvre un tube nommé sans attendre d'écrivain, puis fstat sur le
  // descripteur ouvert décide, sans course entre contrôle et ouverture.
  // Sous Windows, ces deux options valent 0 : le contrôle fstat reste.
  const flags =
    constants.O_RDONLY |
    (constants.O_NOFOLLOW ?? 0) |
    (constants.O_NONBLOCK ?? 0);
  let fd;
  try {
    fd = openSync(path, flags);
  } catch (error) {
    return { refus: error?.code === "ELOOP" ? "non_fichier" : "illisible" };
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { refus: "non_fichier" };
    if (stat.size > TAILLE_MAX_OCTETS) return { refus: "trop_gros" };
    const buffer = Buffer.alloc(TAILLE_MAX_OCTETS + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
    }
    if (length > TAILLE_MAX_OCTETS) return { refus: "trop_gros" };
    return { bytes: buffer.subarray(0, length) };
  } catch {
    return { refus: "illisible" };
  } finally {
    closeSync(fd);
  }
}

// Contrôle un export déjà décodé. Rend `{ export }` ou `{ refus, detail }`,
// où `detail` est un code fixe (mot-clé du schéma ou règle de cohérence).
export function checkExport(data) {
  const keyword = validateSchema(data);
  if (keyword) return { refus: "hors_schema", detail: keyword };
  const incoherence = coherence(data);
  if (incoherence) return { refus: "incoherent", detail: incoherence };
  return { export: data };
}

export function checkBytes(bytes) {
  let data;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    data = JSON.parse(text);
  } catch {
    return { refus: "json_invalide" };
  }
  return checkExport(data);
}

const COUNTER_KEYS = [
  "generated",
  "added",
  "deleted",
  "replaced_content",
  "replaced_lexical",
];

function coherence(data) {
  const enrolled = data.enrolled_days;
  const summaries = new Map();
  for (const summary of data.summaries) {
    if (summaries.has(summary.summary)) return "synthese_doublon";
    summaries.set(summary.summary, summary);
    const g = summary.generated_day;
    if (g > enrolled) return "jour_apres_export";
    for (const key of ["measured", "exported", "shared"]) {
      const day = summary[key];
      if (day === null) continue;
      if (day > enrolled) return "jour_apres_export";
      if (day < g) return "jour_avant_generation";
    }
  }

  const meetings = new Map();
  const measuredSummaries = new Set();
  let previousDay = 0;
  for (const meeting of data.meetings) {
    if (meetings.has(meeting.meeting)) return "reunion_doublon";
    meetings.set(meeting.meeting, meeting);
    const summary = summaries.get(meeting.summary);
    if (!summary) return "synthese_inconnue";
    if (summary.measured === null) return "synthese_non_mesuree";
    if (measuredSummaries.has(meeting.summary))
      return "synthese_mesuree_deux_fois";
    measuredSummaries.add(meeting.summary);
    if (meeting.day > enrolled) return "jour_apres_export";
    if (meeting.day < summary.generated_day) return "jour_avant_generation";
    if (meeting.day < previousDay) return "ordre_des_reunions";
    previousDay = meeting.day;
    if (meeting.headings_matched > meeting.headings_generated) {
      return "titres_incoherents";
    }
    const indexes = new Set();
    const sum = Object.fromEntries(COUNTER_KEYS.map((key) => [key, 0]));
    for (const section of meeting.sections) {
      if (indexes.has(section.index)) return "section_doublon";
      indexes.add(section.index);
      for (const key of COUNTER_KEYS) sum[key] += section.counters[key];
    }
    // Sans mot généré, rien ne peut avoir été supprimé ni remplacé.
    if (
      meeting.total.generated === 0 &&
      (meeting.total.deleted > 0 ||
        meeting.total.replaced_content > 0 ||
        meeting.total.replaced_lexical > 0)
    ) {
      return "compteurs_incoherents";
    }
    // Le total est la somme des sections, plus les mots des sections
    // présentes seulement dans la version envoyée (comptés en ajouts).
    if (meeting.sections.length > 0) {
      for (const key of COUNTER_KEYS) {
        const extra = key === "added" ? meeting.unmatched_sent_words : 0;
        if (sum[key] + extra !== meeting.total[key]) {
          return "compteurs_incoherents";
        }
      }
    } else if (meeting.unmatched_sent_words > meeting.total.added) {
      return "compteurs_incoherents";
    }
  }

  const terms = new Set();
  for (const term of data.terms) {
    if (terms.has(term.term)) return "terme_doublon";
    terms.add(term.term);
    if (term.added_after !== null && !meetings.has(term.added_after)) {
      return "reunion_inconnue";
    }
    const seen = new Set();
    for (const error of term.errors) {
      const meeting = meetings.get(error.meeting);
      if (!meeting) return "reunion_inconnue";
      if (seen.has(error.meeting)) return "erreur_doublon";
      seen.add(error.meeting);
      // Chaque erreur est un remplacement lexical d'au moins un mot : un terme
      // ne peut pas avoir plus d'erreurs dans une réunion que celle-ci n'a de
      // mots remplacés en correction lexicale.
      if (error.count > meeting.total.replaced_lexical) {
        return "erreurs_au_dela_des_compteurs";
      }
    }
  }
  return null;
}

// Un nom de fichier n'est recopié que s'il a une forme sûre ; sinon il est
// désigné par son rang.
export function displayName(name, rank) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name)
    ? name
    : `fichier n°${rank} (nom non affiché)`;
}

// Lit le dossier et sépare exports retenus et fichiers refusés. Les doublons
// de pseudonyme gardent l'export au plus grand `enrolled_days` (le plus
// récent) ; deux exports différents au même `enrolled_days` sont refusés
// tous les deux ; deux exports identiques comptent pour un.
export function loadDirectory(dir) {
  const names = readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort();
  const refused = [];
  const candidates = [];
  names.forEach((name, i) => {
    const file = displayName(name, i + 1);
    if (i >= FICHIERS_MAX) {
      refused.push({ fichier: file, raison: "trop_de_fichiers" });
      return;
    }
    const read = readCapped(join(dir, name));
    if (read.refus) {
      refused.push({ fichier: file, raison: read.refus });
      return;
    }
    const checked = checkBytes(read.bytes);
    if (checked.refus) {
      refused.push({
        fichier: file,
        raison: checked.refus,
        ...(checked.detail ? { detail: checked.detail } : {}),
      });
      return;
    }
    candidates.push({ fichier: file, export: checked.export });
  });
  return resolveDuplicates(candidates, refused);
}

export function resolveDuplicates(candidates, refused = []) {
  const byPseudonym = new Map();
  for (const candidate of candidates) {
    const key = candidate.export.pseudonym;
    if (!byPseudonym.has(key)) byPseudonym.set(key, []);
    byPseudonym.get(key).push(candidate);
  }
  const accepted = [];
  for (const group of byPseudonym.values()) {
    const latest = Math.max(...group.map((c) => c.export.enrolled_days));
    const top = group.filter((c) => c.export.enrolled_days === latest);
    const canonical = top.map((c) => JSON.stringify(c.export));
    const ambiguous = canonical.some((text) => text !== canonical[0]);
    for (const candidate of group) {
      if (ambiguous && top.includes(candidate)) {
        refused.push({
          fichier: candidate.fichier,
          raison: "pseudonyme_ambigu",
        });
      } else if (candidate !== top[0]) {
        refused.push({
          fichier: candidate.fichier,
          raison: top.includes(candidate)
            ? "doublon_identique"
            : "pseudonyme_remplace",
        });
      } else {
        accepted.push(candidate);
      }
    }
  }
  accepted.sort((a, b) => a.export.pseudonym.localeCompare(b.export.pseudonym));
  return { accepted, refused };
}

// ---------------------------------------------------------------------------
// Calculs

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const atLeastShare = (count, total, { num, den }) =>
  total > 0 && count * den >= num * total;

// Générateur pseudo-aléatoire déterministe (mulberry32).
export function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function testerStats(data) {
  const measured = data.meetings.filter((m) => m.total.generated > 0);
  const content = measured.map(
    (m) =>
      ((m.total.added + m.total.deleted + m.total.replaced_content) /
        m.total.generated) *
      1000,
  );
  const lexical = measured.map(
    (m) => (m.total.replaced_lexical / m.total.generated) * 1000,
  );

  // Garde-fou : ajouts par section de rôle Décisions ou Actions, médiane par
  // testeur sur les réunions qui ont une telle section.
  const guard = {};
  for (const role of SEUILS.garde_fou_section.roles) {
    const values = [];
    for (const meeting of measured) {
      let added = 0;
      let generated = 0;
      for (const section of meeting.sections) {
        if (section.role !== role) continue;
        added += section.counters.added;
        generated += section.counters.generated;
      }
      if (generated > 0) values.push((added / generated) * 1000);
    }
    guard[role] = median(values);
  }
  const guardValues = Object.values(guard).filter((v) => v !== null);
  const guardComputable = guardValues.length > 0;
  const guardExceeded =
    guardComputable &&
    guardValues.some((v) => v > SEUILS.garde_fou_section.ajouts_max);

  // Abandon : synthèse sans mesure, export ni partage dans les 7 jours. Les
  // synthèses générées moins de 7 jours avant l'export sont exclues du
  // dénominateur : leur fenêtre n'est pas encore close.
  const window = SEUILS.abandon_jours;
  let eligible = 0;
  let abandoned = 0;
  for (const summary of data.summaries) {
    if (summary.generated_day + window > data.enrolled_days) continue;
    eligible++;
    const limit = summary.generated_day + window;
    const used = [summary.measured, summary.exported, summary.shared].some(
      (day) => day !== null && day <= limit,
    );
    if (!used) abandoned++;
  }

  const base = {
    reunions_mesurees: measured.length,
    reunions_sans_mot_genere: data.meetings.length - measured.length,
    qualifie: measured.length >= SEUILS.testeur_qualifie_reunions_min,
  };
  // Testeur non qualifié : « insuffisant », sans chiffre, y compris dans la
  // sortie JSON.
  if (!base.qualifie) {
    return {
      ...base,
      mediane_fond: null,
      mediane_lexicale: null,
      garde_fou: { decisions: null, actions: null },
      garde_fou_calculable: false,
      garde_fou_depasse: false,
      syntheses_eligibles: null,
      syntheses_abandonnees: null,
      taux_abandon: null,
    };
  }
  return {
    ...base,
    mediane_fond: median(content),
    mediane_lexicale: median(lexical),
    garde_fou: guard,
    garde_fou_calculable: guardComputable,
    garde_fou_depasse: guardExceeded,
    syntheses_eligibles: eligible,
    syntheses_abandonnees: abandoned,
    taux_abandon: eligible > 0 ? abandoned / eligible : null,
  };
}

// Termes du dispositif §3 pour un testeur.
export function dictionaryTerms(data) {
  const d = SEUILS.dictionnaire;
  // Seules les réunions mesurées (au moins un mot généré) forment la suite
  // des réunions : celles à G = 0 sont ignorées, comme dans testerStats, et
  // ne comptent pas dans le minimum de réunions par fenêtre. Une réunion
  // ignorée n'a aucune erreur (contrôlé par coherence) ; un ajout désigné
  // par elle se rapporte à la dernière réunion mesurée qui la précède.
  const measured = data.meetings.filter((m) => m.total.generated > 0);
  const index = new Map(measured.map((m, i) => [m.meeting, i]));
  const position = new Map();
  let last = -1;
  for (const m of data.meetings) {
    if (index.has(m.meeting)) last = index.get(m.meeting);
    position.set(m.meeting, last);
  }
  const generated = measured.map((m) => m.total.generated);
  const n = measured.length;
  const out = [];
  const excluded = {
    non_entre: 0,
    ajoute_avant_entree: 0,
    fenetre_courte: 0,
  };
  for (const term of data.terms) {
    const errors = new Array(n).fill(0);
    for (const e of term.errors) {
      if (index.has(e.meeting)) errors[index.get(e.meeting)] += e.count;
    }
    let cumulative = 0;
    let entry = -1;
    for (let i = 0; i < n; i++) {
      cumulative += errors[i];
      if (cumulative >= d.erreurs_entree) {
        entry = i;
        break;
      }
    }
    if (entry < 0) {
      excluded.non_entre++;
      continue;
    }
    const added =
      term.added_after === null ? null : position.get(term.added_after);
    if (added !== null && added < entry) {
      excluded.ajoute_avant_entree++;
      continue;
    }
    const treated = added !== null && added <= entry + d.delai_ajout_reunions;
    const rate = (from, to) => {
      let err = 0;
      let words = 0;
      for (let i = from; i <= to; i++) {
        err += errors[i];
        words += generated[i];
      }
      return { count: to - from + 1, words, rate: (err / words) * 1000 };
    };
    const before = rate(Math.max(0, entry - d.fenetre_reunions), entry - 1);
    const after = rate(entry + 1, Math.min(n - 1, entry + d.fenetre_reunions));
    if (
      before.count < d.fenetre_reunions_min ||
      after.count < d.fenetre_reunions_min ||
      before.words === 0 ||
      after.words === 0
    ) {
      excluded.fenetre_courte++;
      continue;
    }
    out.push({
      traite: treated,
      avant: before.rate,
      apres: after.rate,
      ecart: after.rate - before.rate,
    });
  }
  return { terms: out, excluded };
}

function effectOf(terms) {
  const treated = terms.filter((t) => t.traite).map((t) => t.ecart);
  const control = terms.filter((t) => !t.traite).map((t) => t.ecart);
  if (treated.length === 0 || control.length === 0) return null;
  return mean(treated) - mean(control);
}

function quantile(sorted, q) {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

// Intervalle par rééchantillonnage des testeurs (avec remise), graine fixe.
export function bootstrapByTester(termsByTester, options = SEUILS.bootstrap) {
  const units = termsByTester.filter((terms) => terms.length > 0);
  const random = rng(options.graine);
  const effects = [];
  for (let b = 0; b < options.tirages; b++) {
    const sample = [];
    for (let k = 0; k < units.length; k++) {
      sample.push(...units[Math.floor(random() * units.length)]);
    }
    const effect = effectOf(sample);
    if (effect !== null) effects.push(effect);
  }
  if (effects.length === 0) return null;
  effects.sort((a, b) => a - b);
  const alpha = (1 - options.niveau) / 2;
  return {
    bas: quantile(effects, alpha),
    haut: quantile(effects, 1 - alpha),
    tirages_utilises: effects.length,
  };
}

export function insufficientMessage(missingTerms, missingTesters) {
  if (missingTerms > 0) return `insuffisant : il manque ${missingTerms} termes`;
  return `insuffisant : il manque ${missingTesters} testeurs`;
}

function dictionaryEffect(perTester) {
  const d = SEUILS.dictionnaire;
  const all = perTester.flat();
  const treated = all.filter((t) => t.traite);
  const control = all.filter((t) => !t.traite);
  const testers = perTester.filter((terms) => terms.length > 0).length;
  const missingTerms =
    Math.max(0, d.termes_traites_min - treated.length) +
    Math.max(0, d.termes_temoins_min - control.length);
  const missingTesters = Math.max(0, d.testeurs_min - testers);
  const base = {
    termes_traites: treated.length,
    termes_temoins: control.length,
    testeurs: testers,
  };
  if (missingTerms > 0 || missingTesters > 0) {
    return {
      ...base,
      affiche: false,
      message: insufficientMessage(missingTerms, missingTesters),
    };
  }
  return {
    ...base,
    affiche: true,
    effet: effectOf(all),
    intervalle: bootstrapByTester(perTester),
    frequence_depart_traites: mean(treated.map((t) => t.avant)),
    frequence_depart_temoins: mean(control.map((t) => t.avant)),
    ecart_moyen_traites: mean(treated.map((t) => t.ecart)),
    ecart_moyen_temoins: mean(control.map((t) => t.ecart)),
  };
}

function verdictOf(qualified) {
  const n = qualified.length;
  if (n < SEUILS.publiable_testeurs_min) {
    return { code: "non_publiable", abandon_median: null };
  }
  const low = qualified.filter(
    (t) => t.mediane_fond <= SEUILS.succes.mediane_fond_max,
  ).length;
  const high = qualified.filter(
    (t) => t.mediane_fond > SEUILS.echec.mediane_fond_au_dessus_de,
  ).length;
  const abandonRates = qualified
    .map((t) => t.taux_abandon)
    .filter((rate) => rate !== null);
  const abandon = median(abandonRates);
  const abandonOk = abandon !== null && abandon <= SEUILS.succes.abandon_max;
  let code = "zone_grise";
  if (atLeastShare(low, n, SEUILS.succes.part_testeurs) && abandonOk) {
    code = "succes";
  } else if (high * 2 > n) {
    code = "echec";
  }
  return {
    code,
    testeurs_sous_seuil_succes: low,
    testeurs_au_dessus_seuil_echec: high,
    abandon_median: abandon,
  };
}

// Agrège des exports déjà contrôlés.
export function aggregate(accepted, refused = []) {
  const testers = accepted.map((candidate, i) => ({
    libelle: `T${i + 1}`,
    pseudonyme: candidate.export.pseudonym,
    app_version: candidate.export.app_version,
    rule_version: candidate.export.rule_version,
    ...testerStats(candidate.export),
  }));
  const qualified = testers.filter((t) => t.qualifie);

  const computable = qualified.filter((t) => t.garde_fou_calculable);
  const exceeded = computable.filter((t) => t.garde_fou_depasse).length;
  const guard = {
    testeurs_calculables: computable.length,
    testeurs_non_calculables: qualified.length - computable.length,
    testeurs_au_dessus: exceeded,
    signale: atLeastShare(
      exceeded,
      computable.length,
      SEUILS.garde_fou_section.part_testeurs,
    ),
  };

  const excluded = { non_entre: 0, ajoute_avant_entree: 0, fenetre_courte: 0 };
  const perTester = accepted.map((candidate) => {
    const result = dictionaryTerms(candidate.export);
    for (const key of Object.keys(excluded)) {
      excluded[key] += result.excluded[key];
    }
    return result.terms;
  });

  return {
    versions: {
      agregation: VERSION_AGREGATION,
      seuils: SEUILS.version,
      seuils_date: SEUILS.date,
      schema: VERSION_SCHEMA,
      regles: [...new Set(testers.map((t) => t.rule_version))].sort(
        (a, b) => a - b,
      ),
    },
    seuils: SEUILS,
    fichiers_retenus: accepted.length,
    fichiers_refuses: refused,
    testeurs: testers,
    testeurs_qualifies: qualified.length,
    publiable: qualified.length >= SEUILS.publiable_testeurs_min,
    verdict: verdictOf(qualified),
    garde_fou_section: guard,
    dictionnaire: { ...dictionaryEffect(perTester), termes_exclus: excluded },
  };
}

// ---------------------------------------------------------------------------
// Rendus

const fmt = (value, digits = 1) =>
  value === null || value === undefined ? "n/d" : value.toFixed(digits);

// Arrondit sans jamais changer la position de la valeur par rapport aux
// seuils qui décident du verdict : près d'un seuil, des décimales sont
// ajoutées jusqu'à ce que l'arrondi tombe du même côté que la valeur exacte
// (ou sur le seuil seulement si elle y est exactement).
export function fmtSeuils(value, thresholds, digits = 1) {
  if (value === null || value === undefined) return "n/d";
  const crossed = (text) =>
    thresholds.find(
      (t) => Math.sign(Number(text) - t) !== Math.sign(value - t),
    );
  for (let k = digits; k <= 12; k++) {
    const text = value.toFixed(k);
    if (crossed(text) === undefined) return text;
  }
  // Écart au seuil sous 10^-12 : on écrit le côté plutôt qu'un chiffre.
  const t = crossed(value.toFixed(12));
  return `${value > t ? ">" : "<"} ${t}`;
}

const SEUILS_FOND = [
  SEUILS.succes.mediane_fond_max,
  SEUILS.echec.mediane_fond_au_dessus_de,
];
const SEUILS_SECTION = [SEUILS.garde_fou_section.ajouts_max];
const fond = (value) => fmtSeuils(value, SEUILS_FOND);
const section = (value) => fmtSeuils(value, SEUILS_SECTION);
const pct = (value) =>
  value === null
    ? "n/d"
    : `${fmtSeuils(value * 100, [SEUILS.succes.abandon_max * 100], 0)} %`;

const VERDICTS = {
  non_publiable:
    "Non publiable : moins de 5 testeurs qualifiés. Chiffres testeur par testeur, sans conclusion.",
  succes: "Succès selon les seuils pré-enregistrés.",
  echec: "Échec net selon les seuils pré-enregistrés.",
  zone_grise:
    "Zone grise : ni succès ni échec net selon les seuils pré-enregistrés.",
};

export function renderMarkdown(result) {
  const lines = [];
  const v = result.versions;
  lines.push("# Bêta Syntheo — agrégation des exports de mesure", "");
  lines.push(
    `Seuils v${v.seuils} (${v.seuils_date}) · schéma d'export v${v.schema} · règle de calcul ${
      v.regles.length ? v.regles.map((r) => `v${r}`).join(", ") : "n/d"
    } · outil v${v.agregation}`,
    "",
  );
  lines.push(
    `Exports retenus : ${result.fichiers_retenus} · refusés : ${result.fichiers_refuses.length} · testeurs qualifiés (au moins ${SEUILS.testeur_qualifie_reunions_min} réunions mesurées) : ${result.testeurs_qualifies}`,
    "",
  );

  lines.push("## Verdict", "", VERDICTS[result.verdict.code], "");
  if (result.verdict.code !== "non_publiable") {
    lines.push(
      `- Testeurs qualifiés à médiane de fond ≤ ${SEUILS.succes.mediane_fond_max} ‰ : ${result.verdict.testeurs_sous_seuil_succes} sur ${result.testeurs_qualifies}`,
      `- Testeurs qualifiés à médiane de fond > ${SEUILS.echec.mediane_fond_au_dessus_de} ‰ : ${result.verdict.testeurs_au_dessus_seuil_echec} sur ${result.testeurs_qualifies}`,
      `- Taux d'abandon médian des testeurs qualifiés : ${pct(result.verdict.abandon_median)} (seuil ${pct(
        SEUILS.succes.abandon_max,
      )})`,
      "",
    );
  }

  const g = result.garde_fou_section;
  lines.push("## Garde-fou des sections Décisions et Actions", "");
  if (g.signale) {
    lines.push(
      `**Signalé** : ajouts > ${SEUILS.garde_fou_section.ajouts_max} ‰ chez ${g.testeurs_au_dessus} testeurs qualifiés sur ${g.testeurs_calculables} (seuil : un tiers).`,
    );
  } else {
    lines.push(
      `Non déclenché : ajouts > ${SEUILS.garde_fou_section.ajouts_max} ‰ chez ${g.testeurs_au_dessus} testeurs qualifiés sur ${g.testeurs_calculables}.`,
    );
  }
  if (g.testeurs_non_calculables > 0) {
    lines.push(
      "",
      `Garde-fou non calculable pour ${g.testeurs_non_calculables} testeurs.`,
    );
  }
  lines.push("");

  lines.push("## Testeurs", "");
  lines.push(
    "| Testeur | Réunions mesurées | Médiane fond (‰) | Médiane lexicale (‰) | Ajouts Décisions (‰) | Ajouts Actions (‰) | Abandon |",
    "|---|---|---|---|---|---|---|",
  );
  for (const t of result.testeurs) {
    if (!t.qualifie) {
      lines.push(
        `| ${t.libelle} | ${t.reunions_mesurees} | insuffisant | insuffisant | insuffisant | insuffisant | insuffisant |`,
      );
      continue;
    }
    lines.push(
      `| ${t.libelle} | ${t.reunions_mesurees} | ${fond(t.mediane_fond)} | ${fmt(t.mediane_lexicale)} | ${section(
        t.garde_fou.decisions,
      )} | ${section(t.garde_fou.actions)} | ${pct(t.taux_abandon)} (${t.syntheses_abandonnees}/${t.syntheses_eligibles}) |`,
    );
  }
  lines.push("");

  const d = result.dictionnaire;
  lines.push("## Effet du dictionnaire", "");
  lines.push(
    `Termes traités : ${d.termes_traites} · témoins : ${d.termes_temoins} · testeurs : ${d.testeurs}`,
    "",
  );
  if (d.affiche) {
    const ci = d.intervalle;
    lines.push(
      `- Effet (écart après − avant des traités − celui des témoins, erreurs pour 1 000 mots) : ${fmt(d.effet, 2)}`,
      `- Intervalle à ${(SEUILS.bootstrap.niveau * 100).toFixed(0)} % (bootstrap par testeur, ${SEUILS.bootstrap.tirages} tirages, graine ${SEUILS.bootstrap.graine}) : ${
        ci ? `[${fmt(ci.bas, 2)} ; ${fmt(ci.haut, 2)}]` : "n/d"
      }`,
      `- Fréquence de départ : traités ${fmt(d.frequence_depart_traites, 2)}, témoins ${fmt(d.frequence_depart_temoins, 2)}`,
    );
  } else {
    lines.push(d.message);
  }
  lines.push("");

  if (result.fichiers_refuses.length > 0) {
    lines.push("## Fichiers refusés", "");
    for (const r of result.fichiers_refuses) {
      const detail = r.detail ? ` (${r.detail})` : "";
      lines.push(`- ${r.fichier} : ${RAISONS[r.raison]}${detail}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// Neutralise une cellule qu'un tableur lirait comme une formule.
export function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function renderCsv(result) {
  const header = [
    "testeur",
    "reunions_mesurees",
    "qualifie",
    "mediane_fond",
    "mediane_lexicale",
    "ajouts_decisions",
    "ajouts_actions",
    "taux_abandon",
  ];
  const rows = result.testeurs.map((t) =>
    t.qualifie
      ? [
          t.libelle,
          t.reunions_mesurees,
          "oui",
          fond(t.mediane_fond),
          fmt(t.mediane_lexicale),
          section(t.garde_fou.decisions),
          section(t.garde_fou.actions),
          t.taux_abandon === null
            ? "n/d"
            : fmtSeuils(t.taux_abandon, [SEUILS.succes.abandon_max], 3),
        ]
      : [t.libelle, t.reunions_mesurees, "insuffisant", "", "", "", "", ""],
  );
  return (
    [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n"
  );
}

// ---------------------------------------------------------------------------
// Ligne de commande

function main(argv) {
  const args = [...argv];
  let out = null;
  const outIndex = args.indexOf("--out");
  if (outIndex >= 0) {
    out = args[outIndex + 1];
    args.splice(outIndex, 2);
  }
  const usage =
    "Usage : node scripts/beta/agregation.mjs <dossier-exports> [--out <dossier-sortie>]\n";
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(usage);
    return 0;
  }
  if (args.length !== 1 || out === undefined || args[0].startsWith("-")) {
    process.stderr.write(usage);
    return 2;
  }
  const dir = resolve(args[0]);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    process.stderr.write(`Dossier d'exports introuvable : ${args[0]}\n`);
    return 2;
  }
  const { accepted, refused } = loadDirectory(dir);
  const result = aggregate(accepted, refused);
  const markdown = renderMarkdown(result);
  if (out === null) {
    process.stdout.write(`${markdown}\n`);
    return 0;
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "rapport.md"), `${markdown}\n`);
  writeFileSync(
    join(out, "rapport.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  writeFileSync(join(out, "testeurs.csv"), renderCsv(result));
  process.stdout.write(
    `Rapport écrit dans ${out} (${accepted.length} exports retenus, ${refused.length} refusés).\n`,
  );
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = main(process.argv.slice(2));
}
