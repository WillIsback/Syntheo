import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

// Vitest s'exécute depuis apps/desktop : la racine du dépôt est deux niveaux
// au-dessus.
const ROOT = join(process.cwd(), "..", "..");

it("docs_rgpd_is_referenced", () => {
  const rgpd = readFileSync(join(ROOT, "docs/fr/conformite/rgpd.md"), "utf8");
  for (const section of [
    "## Données stockées",
    "## Flux réseau",
    "## Garanties techniques",
    "## Responsabilités de l'utilisateur",
  ]) {
    expect(rgpd).toContain(section);
  }
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  expect(readme).toMatch(/conformite\/rgpd/);
});

it("docs_rgpd_lists_every_known_flow_and_store", () => {
  const rgpd = readFileSync(join(ROOT, "docs/fr/conformite/rgpd.md"), "utf8");
  // Stockages locaux annexes.
  for (const store of ["app.log", "tantivy", "export"]) {
    expect(rgpd).toContain(store);
  }
  // Télémétrie : retirée du code, plus seulement neutralisée.
  expect(rgpd).toContain("Aucune télémétrie");
  expect(rgpd).not.toContain("neutralisés");
  expect(rgpd).not.toContain("**Aucun autre flux**");
});

it("docs_rgpd_reflects_capture_without_audio", () => {
  const rgpd = readFileSync(join(ROOT, "docs/fr/conformite/rgpd.md"), "utf8");
  expect(rgpd).not.toContain("le conserve par défaut (`forever`)");
  expect(rgpd).not.toContain(
    "l'enregistrement audio est encore écrit sur\n>   disque pendant la capture",
  );
  expect(rgpd).toContain("dictée");
  expect(rgpd).toContain("import");
});

it("docs_rgpd_states_no_audio_is_ever_written", () => {
  const rgpd = readFileSync(join(ROOT, "docs/fr/conformite/rgpd.md"), "utf8");
  expect(rgpd).not.toContain("reste dans le dossier temporaire");
  expect(rgpd).not.toContain("import dont la transcription échoue");
  expect(rgpd).not.toContain("copie normalisée");
  expect(rgpd).toMatch(/ne touche plus jamais le disque/i);
  expect(rgpd).toContain("même temporairement");
});

it("rgpd_lists_stt_as_on_prem_only", () => {
  const rgpd = readFileSync(join(ROOT, "docs/fr/conformite/rgpd.md"), "utf8");
  // Adaptateurs STT cloud retirés (04b-1) et providers LLM cloud retirés
  // (04b-3) : il ne reste que les endpoints configurés.
  expect(rgpd).not.toContain("Deepgram");
  // La transcription NVIDIA passe par NeMo-Speech.cpp (open source).
  expect(rgpd).toContain("NVIDIA NeMo-Speech.cpp");
  expect(rgpd).not.toContain("NIM");
});

it("rgpd_lists_no_model_download", () => {
  const rgpd = readFileSync(join(ROOT, "docs/fr/conformite/rgpd.md"), "utf8");
  // Inférence embarquée retirée (04b-2) : plus aucun modèle téléchargé.
  expect(rgpd).not.toContain("models.anarlog.so");
  expect(rgpd).toContain("models/stt");
  expect(rgpd).toContain("models/llm");
  // Modèles d'annulation d'écho téléchargés par les versions 0.7.x (issue 702).
  expect(rgpd).toContain("models/aec");
  expect(rgpd).not.toMatch(/diarisation locale/i);
});

it("rgpd_documents_legacy_voiceprint_purge", () => {
  const rgpd = readFileSync(join(ROOT, "docs/fr/conformite/rgpd.md"), "utf8");
  // Empreintes vocales d'une version antérieure : effacées au démarrage.
  expect(rgpd).toMatch(/empreintes vocales[^.]*effacées au démarrage/i);
});

it("rgpd_lists_only_the_configured_llm_endpoint", () => {
  const rgpd = readFileSync(join(ROOT, "docs/fr/conformite/rgpd.md"), "utf8");
  // Providers LLM cloud retirés (04b-3) : seul l'endpoint configuré reçoit
  // les prompts, sans en-tête d'empreinte d'appareil.
  expect(rgpd).not.toMatch(/openrouter|anthropic/i);
  expect(rgpd).toContain("endpoint LLM configuré");
  expect(rgpd).toMatch(/empreinte d'appareil/);
});

it("docs_never_mention_nvidia_nim", () => {
  // Décision de William (#567) : ni la transcription ni la synthèse ne passent
  // par un NIM. Toute la doc publiée et les README le reflètent.
  const files = [
    "README.md",
    "README.fr.md",
    "AGENTS.md",
    ...readdirSync(join(ROOT, "docs"), { recursive: true, encoding: "utf8" })
      .filter((path) => /\.(mdx?|json|jsx)$/.test(path))
      .map((path) => join("docs", path)),
  ];
  const offenders = files.filter((path) =>
    /\bNIM\b/i.test(readFileSync(join(ROOT, path), "utf8")),
  );
  expect(offenders).toEqual([]);
});

// Les icônes iconify ne partent plus : la CSP de production (connect-src sans
// origine https) bloque leur requête. La doc ne doit plus les lister comme un
// flux sortant (issue 666 ; retrait du composant suivi dans issue 658).
it("docs_do_not_list_iconify_as_a_network_flow", () => {
  for (const page of [
    "docs/fr/conformite/rgpd.md",
    "docs/en/conformite/rgpd.md",
    "docs/fr/security.mdx",
    "docs/en/security.mdx",
    "docs/fr/data-and-privacy.mdx",
    "docs/en/data-and-privacy.mdx",
    "SECURITY.md",
  ]) {
    expect(readFileSync(join(ROOT, page), "utf8")).not.toContain(
      "api.iconify.design",
    );
  }
});

// Issue 678 : le chargement d'une image distante au clic est retiré ; la doc
// ne doit plus le présenter comme un flux sortant.
it("docs_do_not_list_click_to_load_images_as_a_network_flow", () => {
  for (const page of [
    "docs/fr/conformite/rgpd.md",
    "docs/en/conformite/rgpd.md",
    "docs/fr/data-and-privacy.mdx",
    "docs/en/data-and-privacy.mdx",
    "SECURITY.md",
  ]) {
    const text = readFileSync(join(ROOT, page), "utf8");
    expect(text).not.toContain("Charger l'image");
    expect(text).not.toContain("Load image");
  }
});

// Issue 702 : hors serveurs de l'utilisateur, il ne reste que trois flux
// (recherche de mise à jour, installeur au clic, modèles « Sur ce poste » au
// clic). La fiche RGPD, en français et en anglais, les déclare tous, avec le
// réglage géré qui les coupe ; les flux disparus n'y figurent plus.
it("rgpd_lists_exactly_the_remaining_outbound_flows", () => {
  const sheets = {
    fr: {
      path: "docs/fr/conformite/rgpd.md",
      flows: [
        // (a) Recherche de mise à jour : hôte réel, délai, réglage géré.
        "github.com/WillIsback/Syntheo/releases/latest/download/latest.json",
        "15 secondes après le démarrage",
        "`automatic_updates` à `false`",
        "à la demande de l'utilisateur",
        // (b) Installeur, au clic.
        "téléchargement de l'installeur d'une mise à jour",
        // (c) Modèles « Sur ce poste » : sources, miroir, réglage géré.
        "Télécharger les modèles",
        "release-assets.githubusercontent.com",
        "huggingface.co",
        "speech_models_urls",
        "`on_device_transcription_enabled` à `false`",
      ],
    },
    en: {
      path: "docs/en/conformite/rgpd.md",
      flows: [
        "github.com/WillIsback/Syntheo/releases/latest/download/latest.json",
        "15 seconds after startup",
        "`automatic_updates` set to `false`",
        "on the user's request",
        "download of the installer of an update",
        "Download the models",
        "release-assets.githubusercontent.com",
        "huggingface.co",
        "speech_models_urls",
        "`on_device_transcription_enabled` set to `false`",
      ],
    },
  };
  for (const { path, flows } of Object.values(sheets)) {
    // Retours à la ligne du Markdown ramenés à une espace.
    const sheet = readFileSync(join(ROOT, path), "utf8").replace(/\s+/g, " ");
    for (const flow of flows) {
      expect(sheet, `${path} : ${flow}`).toContain(flow);
    }
    // Flux disparus : notes de version d'une autre version (0.7.1),
    // téléchargement des modèles d'annulation d'écho (0.8.0).
    for (const gone of ["api.github.com", "raw.githubusercontent.com"]) {
      expect(sheet, `${path} : ${gone}`).not.toContain(gone);
    }
    expect(sheet).not.toMatch(
      /afficher celles d'une autre version|showing those of another version/,
    );
  }
});

// Ni les notes de version d'une autre version, ni des icônes distantes, ni le
// téléchargement des modèles d'annulation d'écho ne sont des flux réseau.
it("docs_do_not_list_removed_flows", () => {
  for (const page of [
    "docs/fr/security.mdx",
    "docs/en/security.mdx",
    "docs/fr/data-and-privacy.mdx",
    "docs/en/data-and-privacy.mdx",
    "docs/fr/offline.mdx",
    "docs/en/offline.mdx",
    "docs/fr/philosophy.mdx",
    "docs/en/philosophy.mdx",
    "SECURITY.md",
  ]) {
    const text = readFileSync(join(ROOT, page), "utf8");
    for (const gone of [
      "notes de version sur GitHub",
      "release notes on GitHub",
      "notes de version d'une",
      "release notes of a version other",
      "icônes d'interface",
      "interface icons",
      "raw.githubusercontent.com",
      "api.github.com",
    ]) {
      expect(text, `${page} : ${gone}`).not.toContain(gone);
    }
  }
});
