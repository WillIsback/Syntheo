// <TemplatesEditor> : la vue Modèles (customize-summaries.mdx). Reproduit
// apps/desktop/src/templates/template-sidebar.tsx et sidebar-groups.ts
// (groupes Automatique, Favoris, un groupe par dossier, Généraux),
// template-form.tsx, template-uses-input, template-generator-bar.tsx,
// sections-editor.tsx, template-preview.tsx et auto-form.tsx. Les 21
// modèles fournis sont repris de leur version française.

const SYN_CSS_TEMPLATES = `
.syn-tpl{display:flex;height:600px;background:var(--syn-background)}
.syn-tpl-side{flex:0 0 250px;display:flex;flex-direction:column;border-right:1px solid var(--syn-border);background:var(--syn-muted);padding:8px 10px 10px}
.syn-tpl-search{display:flex;align-items:center;gap:8px;height:32px;margin:8px 0 12px;border:1px solid var(--syn-border);border-radius:8px;background:var(--syn-card);padding:0 10px;color:var(--syn-faint)}
.syn-tpl-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--syn-foreground);font:400 13px/1.3 Geist,system-ui,sans-serif;outline:none}
.syn-tpl-search input::placeholder{color:var(--syn-faint)}
.syn-tpl-list{flex:1;min-height:0;display:flex;flex-direction:column;gap:14px;overflow-y:auto}
.syn-tpl-group h3{margin:0;padding:0 8px 4px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--syn-faint)}
.syn-tpl-item{display:flex;align-items:center;gap:6px;width:100%;border:0;border-radius:7px;background:transparent;color:var(--syn-foreground);padding:6px 8px;font:400 13.5px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-tpl-item:hover{background:color-mix(in srgb,var(--syn-foreground) 6%,transparent)}
.syn-tpl-item[aria-current=true]{background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:600}
.syn-tpl-item>span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.syn-tpl-main{flex:1;min-width:0;overflow-y:auto;padding:26px 36px 40px}
.syn-tpl-form{display:flex;flex-direction:column;gap:18px;max-width:640px}
.syn-tpl-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.syn-tpl-seg{display:inline-flex;overflow:hidden;border:1px solid var(--syn-input);border-radius:8px}
.syn-tpl-seg button{border:0;background:var(--syn-card);color:var(--syn-foreground);padding:6px 12px;font:400 13px/1.2 Geist,system-ui,sans-serif;cursor:pointer}
.syn-tpl-seg button+button{border-left:1px solid var(--syn-input)}
.syn-tpl-seg button[aria-pressed=true]{background:var(--syn-primary);color:var(--syn-primary-foreground);font-weight:600}
.syn-tpl-badge{border-radius:6px;background:var(--syn-accent);color:var(--syn-accent-foreground);padding:2px 8px;font-size:12px;font-weight:500}
.syn-tpl-inline{width:100%;border:0;border-radius:4px;background:transparent;padding:0;color:var(--syn-foreground);outline:none}
.syn-tpl-inline::placeholder{color:var(--syn-faint)}
.syn-tpl-uses{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px}
.syn-tpl-uses input{min-width:120px;border:1px solid var(--syn-input);border-radius:6px;background:transparent;color:var(--syn-foreground);padding:1px 8px;font:inherit}
.syn-tpl-add{border:0;background:none;padding:2px 4px;color:var(--syn-primary);font:600 13px/1.3 Geist,system-ui,sans-serif;cursor:pointer}
.syn-tpl-gen{display:flex;align-items:center;gap:8px;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-card);padding:6px 6px 6px 12px;color:var(--syn-primary)}
.syn-tpl-gen input{flex:1;min-width:0;border:0;background:transparent;color:var(--syn-foreground);font:400 13px/1.3 Geist,system-ui,sans-serif;outline:none}
.syn-tpl-secs{margin:0;padding:0;list-style:none;border-top:1px solid var(--syn-border)}
.syn-tpl-secs li{display:flex;align-items:flex-start;gap:8px;padding:10px 0;border-bottom:1px solid var(--syn-border)}
.syn-tpl-num{width:22px;padding-top:6px;font:500 12px/1 ui-monospace,monospace;color:var(--syn-faint)}
.syn-tpl-secs input{display:block;width:100%;border:0;background:transparent;padding:3px 0;color:var(--syn-foreground);font:500 15px/1.3 Geist,system-ui,sans-serif;outline:none}
.syn-tpl-secs input+input{font-weight:400;font-size:13px;color:var(--syn-muted-foreground)}
.syn-tpl-secs input::placeholder{color:var(--syn-faint)}
.syn-tpl-legend{display:flex;gap:16px;font-size:13px;color:var(--syn-muted-foreground)}
.syn-tpl-legend i{display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:2px}
.syn-tpl-preview{display:flex;flex-direction:column;gap:8px;border:1px solid var(--syn-border);border-radius:14px;background:var(--syn-card);padding:24px 28px}
.syn-tpl-preview h2{margin:0;font:500 28px/1.2 Newsreader,Georgia,serif}
.syn-tpl-preview h3{margin:8px 0 0;font:500 22px/1.35 Newsreader,Georgia,serif}
.syn-tpl-preview p{margin:0}
.syn-tpl-serif{margin:0;font:500 34px/1.1 Newsreader,Georgia,serif}
.syn-tpl-auto{width:100%;min-height:200px;border:1px solid var(--syn-border);border-radius:16px;background:var(--syn-card);color:var(--syn-foreground);padding:12px 16px;font:400 13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
.syn-tpl-status{min-height:20px;font-size:12px;color:var(--syn-muted-foreground)}
`;

// Repris de crates/db-app/migrations/20261024120000_syntheo_templates_fr.sql :
// id, titre, description, sections « titre::consigne » séparées par « || »,
// « Utilisé pour » (targets_json), favori.
const SYN_TPL_DATA = [
  ["syntheo-general","Réunion générale","Résumé standard : décisions et actions à suivre.","Participants::Liste les participants à la réunion avec leur rôle si mentionné.||Décisions actées::Résume les décisions importantes prises au cours de la réunion.||Actions à suivre::Liste les actions à réaliser, en précisant le responsable et le délai si mentionnés.||Prochaine étape::Décris la prochaine étape ou la date de la prochaine réunion.","",true],
  ["syntheo-compliance","Comité conformité / RGPD","Axé risques, décisions réglementaires, points bloquants.","Contexte::Résume le contexte réglementaire ou le sujet de conformité abordé.||Décisions actées::Liste les décisions réglementaires ou techniques prises.||Points bloquants avant production::Dresse la liste des obstacles identifiés qui empêchent le passage en production.||Risques résiduels::Identifie les risques non encore traités et leur impact potentiel.||Prochaine étape::Décris les actions immédiates et la date de révision.","",true],
  ["syntheo-project","Point projet / Sprint","Avancement, blocages, prochaines échéances.","Avancement::Résume les progrès réalisés depuis le dernier point.||Blocages::Liste les obstacles actuels avec leur impact sur le planning.||Prochaines étapes::Liste les tâches prioritaires et les échéances.","",true],
  ["syntheo-standup","Standup équipe","Format court : fait, en cours, bloquants.","Fait::Pour chaque intervenant, résume ce qui a été accompli depuis le dernier standup.||En cours::Pour chaque intervenant, liste les tâches en cours du jour.||Bloquants::Liste les blocages signalés et leur impact.","",true],
  ["default-board-meeting","Conseil d'administration","Pour les conseils d'administration et les sujets de gouvernance","Performance de l'entreprise::Point financier et opérationnel||Initiatives stratégiques::Avancement des priorités stratégiques||Revue financière::Budget, trésorerie et santé financière||Décisions du conseil::Résolutions et questions de gouvernance||Risques et conformité::Gestion des risques et point conformité||Prochaines étapes::Actions et suivis","Fondateur, PDG, Administrateur",false],
  ["default-brainstorming-session","Séance de brainstorming","Pour les séances de créativité et d'idéation","Objectif de la séance::Quel problème ou quelle opportunité explore-t-on ?||Idées émises::Toutes les idées recueillies pendant la séance||Pistes prometteuses::Idées à approfondir||Critères d'évaluation::Comment les idées seront évaluées||Prochaines étapes::Actions pour avancer","Chef de produit, Designer, Marketing",false],
  ["default-client-kickoff","Lancement client","Pour démarrer une mission client et cadrer les attentes","Présentation du projet::Périmètre, objectifs et livrables||Présentation des équipes::Rôles et responsabilités||Calendrier et jalons::Planning du projet et dates clés||Plan de communication::Fréquence des réunions et des points d'étape||Critères de réussite::Comment mesurer la réussite du projet||Prochaines étapes::Actions immédiates","Customer Success Manager, Responsable de compte, Responsable déploiement",false],
  ["default-customer-discovery","Entretien de découverte client","Pour les entretiens de découverte et la recherche utilisateur","Contexte::Contexte et profil du client||Fonctionnement actuel::Comment il résout le problème aujourd'hui||Points de douleur::Difficultés et frustrations||Besoins et objectifs::Ce qu'il cherche à accomplir||Retours sur la solution::Réactions à la solution proposée||Enseignements clés::Principaux constats et apprentissages","Chef de produit, Chercheur UX, Fondateur",false],
  ["default-daily-standup","Standup quotidien","Pour un point quotidien rapide sur l'avancement et les blocages","Réalisé hier::Qu'as-tu terminé hier ?||Prévu aujourd'hui::Sur quoi travailles-tu aujourd'hui ?||Blocages::Des obstacles ou un besoin d'aide ?||Infos d'équipe::Annonces ou informations importantes","Développeur, Engineering Manager, Scrum Master",false],
  ["default-executive-briefing","Point direction","Pour consigner les échanges stratégiques et les décisions de direction","Vue d'ensemble stratégique::Contexte et objectifs de haut niveau||Indicateurs clés::Indicateurs de performance et tendances||Décisions majeures::Décisions stratégiques et leur justification||Allocation des ressources::Engagements de budget et de ressources||Risques et opportunités::Risques stratégiques et leviers de croissance||Actions::Suivis au niveau de la direction","Dirigeant, PDG, Directeur",false],
  ["default-incident-postmortem","Post-mortem d'incident","Pour un post-mortem sans recherche de coupable après un incident ou une panne","Résumé de l'incident::Ce qui s'est passé et quand||Chronologie::Déroulé chronologique des événements||Analyse de la cause racine::Ce qui a provoqué l'incident||Évaluation de l'impact::Conséquences pour les utilisateurs et l'activité||Réponse et résolution::Comment l'incident a été résolu||Enseignements::Principaux enseignements||Actions::Mesures préventives et améliorations","Ingénieur plateforme, SRE, Ingénieur DevOps",false],
  ["default-investor-pitch","Rendez-vous investisseur","Pour les présentations à des investisseurs et fonds","Contexte du rendez-vous::Profil de l'investisseur et objet de la rencontre||Synthèse du pitch::Points clés présentés||Questions posées::Questions et réserves de l'investisseur||Retours reçus::Réactions et retours de l'investisseur||Intérêt pour l'investissement::Niveau d'intérêt et suite envisagée||Éléments à fournir::Informations demandées et actions","Fondateur, PDG, Directeur financier",false],
  ["default-lecture-notes","Notes de cours","Pour prendre et organiser des notes de cours","Informations sur le cours::Matière, date et sujet||Notions clés::Idées et théories principales abordées||Définitions importantes::Termes et définitions à retenir||Exemples et applications::Exemples et applications concrètes||Questions et points à éclaircir::Points à approfondir||À faire::Devoirs et prochaines étapes","Étudiant, Doctorant, Chercheur",false],
  ["default-one-on-one-meeting","Entretien individuel (1:1)","Pour des entretiens individuels structurés avec les membres de l'équipe","Actualités::Que s'est-il passé depuis la dernière fois ?||Réussites et difficultés::Saluer les succès et discuter des obstacles||Objectifs et progrès::Revoir les objectifs en cours et leur avancement||Feedback::Échange de feedback dans les deux sens||Actions::Prochaines étapes et engagements","Manager, Engineering Manager, Chef d'équipe",false],
  ["default-performance-review","Entretien annuel","Pour les entretiens d'évaluation et les échanges sur l'évolution de carrière","Bilan de la période::Vue d'ensemble de la période évaluée||Réalisations clés::Principales réussites et contributions||Points forts::Compétences et comportements à conserver||Axes de progrès::Opportunités de développement et améliorations||Objectifs de carrière::Aspirations et parcours de développement||Plan d'action::Objectifs de développement et prochaines étapes","Manager, Engineering Manager, RH",false],
  ["default-product-roadmap-review","Revue de roadmap produit","Pour revoir et aligner les priorités de la roadmap produit","État des lieux::Avancement des chantiers en cours||Fonctionnalités à venir::Priorités et calendrier du prochain trimestre||Retours clients::Enseignements clés des utilisateurs et clients||Indicateurs de succès::KPI et méthode de mesure||Allocation des ressources::Affectation des équipes et capacité||Décisions prises::Décisions clés et arbitrages","Chef de produit, Engineering Manager, Dirigeant",false],
  ["default-project-kickoff","Lancement de projet","Pour démarrer un projet avec des objectifs clairs et un alignement partagé","Présentation du projet::||Objectifs et indicateurs de succès::Définir ce qu'est la réussite||Parties prenantes et rôles::||Calendrier et jalons::||Risques et dépendances::||Prochaines étapes::","Chef de produit, Engineering Manager, Designer",false],
  ["default-sales-discovery-call","Appel de découverte commerciale","Pour qualifier un prospect et comprendre ses besoins","Présentation de l'entreprise::Contexte du prospect||Situation actuelle::Son fonctionnement aujourd'hui||Enjeux et points de douleur::Problèmes qu'il cherche à résoudre||Objectifs et critères de réussite::Ce qu'est la réussite pour lui||Budget et calendrier::Contraintes financières et de délai||Prochaines étapes::Actions de suivi et calendrier","Commercial grands comptes, Commercial, Business developer",false],
  ["default-sprint-planning","Planification de sprint","Pour planifier un sprint et fixer les objectifs de l'équipe","Objectif du sprint::Quel est l'objectif principal de ce sprint ?||Backlog du sprint::User stories et tâches engagées pour le sprint||Capacité et disponibilités::Disponibilités de l'équipe et estimation de capacité||Dépendances et risques::Dépendances externes et risques potentiels||Définition de « terminé »::Critères d'acceptation et standards de complétion","Engineering Manager, Chef de produit, Tech Lead",false],
  ["default-sprint-retrospective","Rétrospective de sprint","Pour prendre du recul sur le sprint et améliorer en continu les pratiques et la collaboration","Ce qui a bien marché::Saluer les réussites et les résultats positifs||Ce qui n'a pas marché::Identifier les difficultés et les problèmes||Ce que nous avons appris::Enseignements et constats clés||Actions::Mesures concrètes d'amélioration","Engineering Manager, Scrum Master, Tech Lead",false],
  ["default-technical-design-review","Revue de conception technique","Pour revoir une conception technique et les choix d'architecture","Énoncé du problème::Quel problème résout-on ?||Solution proposée::Approche technique et architecture||Alternatives étudiées::Autres options et compromis||Plan de mise en œuvre::Découpage du travail et calendrier||Stratégie de test::Comment valider la solution||Risques et parades::Problèmes potentiels et plans de repli||Décisions et actions::Résultats et prochaines étapes","Développeur, Tech Lead, Ingénieur plateforme",false],
];
// Modèles par défaut de dossier (folder-template.ts) : un groupe par dossier.
const SYN_TPL_FOLDERS = [["Clients", "default-client-kickoff"], ["RH", "default-one-on-one-meeting"], ["Produit", "syntheo-project"]];
const SYN_TPL_AUTO = "Commencez par les décisions. Listez ensuite les actions avec un responsable et une échéance. Limitez le contexte à trois puces.";

const synTplInitial = (start) => ({
  selected: start === "automatique" ? "auto" : "syntheo-project",
  search: "",
  mode: "edit",
  defaultId: "",
  created: 0,
  status: "",
  auto: SYN_TPL_AUTO,
  autoSaved: SYN_TPL_AUTO,
  templates: SYN_TPL_DATA.map(([id, title, description, sections, targets, pinned]) => ({
    id,
    title,
    description,
    pinned: Boolean(pinned),
    uses: id === "syntheo-project" ? ["Hebdo", "Équipe produit"] : targets ? targets.split(", ") : [],
    sections: sections.split("||").map((s, i) => ({ key: `${id}-${i}`, title: s.split("::")[0], description: s.split("::")[1] ?? "" })),
  })),
});

const synTplGroups = (state) => {
  const q = synNorm(state.search.trim());
  const foldersOf = (id) => SYN_TPL_FOLDERS.filter(([, t]) => t === id).map(([f]) => f).sort();
  const visible = state.templates.filter((t) => !q || synNorm(`${t.title} ${t.description}`).includes(q) || foldersOf(t.id).some((f) => synNorm(f).includes(q)));
  const byTitle = (a, b) => a.title.localeCompare(b.title, "fr");
  const groups = [];
  if (!q || synNorm(L("Automatic")).includes(q) || "auto".includes(q)) groups.push({ label: L("Automatic"), entries: ["auto"] });
  const favorites = visible.filter((t) => t.pinned);
  if (favorites.length) groups.push({ label: L("Favorites"), entries: favorites.map((t) => t.id) });
  const byFolder = {};
  const general = [];
  visible.filter((t) => !t.pinned).sort(byTitle).forEach((t) => {
    const folders = foldersOf(t.id);
    if (folders.length) byFolder[folders.join(", ")] = [...(byFolder[folders.join(", ")] ?? []), t.id];
    else general.push(t.id);
  });
  Object.keys(byFolder).sort((a, b) => a.localeCompare(b, "fr")).forEach((label) => groups.push({ label, entries: byFolder[label] }));
  if (general.length) groups.push({ label: L("General templates"), entries: general });
  return groups;
};

const SynTplSections = ({ sections, onChange, onStatus }) => {
  const listRef = useRef(null);
  const set = (i, p) => onChange(sections.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const onHandleKey = (e, i) => {
    const j = i + (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0);
    if (j === i || j < 0 || j >= sections.length) return;
    e.preventDefault();
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    onStatus(LF("Section moved to position {position} of {total}.", { position: j + 1, total: sections.length }));
    requestAnimationFrame(() => listRef.current?.querySelectorAll("[data-handle]")[j]?.focus());
  };
  return (
    <div>
      <ol className="syn-tpl-secs" aria-label={L("Sections")} ref={listRef}>
        {sections.map((s, i) => (
          <li key={s.key}>
            <button type="button" className="syn-icon-btn" data-handle="" style={{ cursor: "grab" }} aria-label={LF("Move section {position}", { position: i + 1 })} onKeyDown={(e) => onHandleKey(e, i)}>
              {h(SynIcon, { name: I("DotsSixVertical") })}
            </button>
            <span className="syn-tpl-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input type="text" aria-label={LF("Section {position} title", { position: i + 1 })} placeholder={L("Section title")} value={s.title} onChange={(e) => set(i, { title: e.target.value })} />
              <input type="text" aria-label={LF("Section {position} instruction", { position: i + 1 })} placeholder={L("Describe in one line what Syntheo should write here.")} value={s.description} onChange={(e) => set(i, { description: e.target.value })} />
            </div>
            <button type="button" className="syn-icon-btn" aria-label={LF("Delete section {position}", { position: i + 1 })} onClick={() => onChange(sections.filter((_, j) => j !== i))}>
              {h(SynIcon, { name: I("X") })}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="syn-tpl-add" style={{ padding: "12px 0" }} onClick={() => onChange([...sections, { key: `new-${Date.now()}`, title: "", description: "" }])}>
        {L("+ Add a section")}
      </button>
    </div>
  );
};

const SynTplUses = ({ uses, onChange }) => {
  const [adding, setAdding] = useState(false);
  const labelId = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="syn-tpl-uses" role="group" aria-labelledby={labelId}>
        <span id={labelId} className="syn-muted">{L("Used for")}</span>
        {uses.map((use) => (
          <span key={use} className="syn-chip">
            {use}
            <button type="button" className="syn-icon-btn" style={{ width: 16, height: 16 }} aria-label={LF("Remove {use}", { use })} onClick={() => onChange(uses.filter((u) => u !== use))}>
              {h(SynIcon, { name: I("X"), size: 12 })}
            </button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            aria-label={L("Add a use")}
            placeholder={L("e.g. Weekly, HR team")}
            onBlur={() => setAdding(false)}
            onKeyDown={(e) => {
              const value = e.currentTarget.value.trim();
              if (e.key === "Enter" && value) {
                onChange([...uses.filter((u) => u !== value), value]);
                e.currentTarget.value = "";
              } else if (e.key === "Escape") setAdding(false);
            }}
          />
        ) : (
          <button type="button" className="syn-tpl-add" onClick={() => setAdding(true)}>{L("+ Add")}</button>
        )}
      </div>
      <p className="syn-muted syn-small" style={{ margin: 0 }}>{L("The kinds of meeting this template is meant for (team, role, frequency…).")}</p>
    </div>
  );
};

const SynTplForm = ({ template, state, update, patch, markers }) => {
  const [describe, setDescribe] = useState("");
  const isDefault = state.defaultId === template.id;
  const suggest = () => {
    update({
      sections: [
        ["Incidents du mois", "Liste les incidents de sécurité et leur gravité."],
        ["Vulnérabilités ouvertes", "Résume les failles connues et leur échéance de correction."],
        ["Décisions", "Liste les décisions prises et leur responsable."],
        ["Prochaines actions", "Liste les actions avec un responsable et une date."],
      ].map(([title, description], i) => ({ key: `gen-${Date.now()}-${i}`, title, description })),
    });
    setDescribe("");
    patch({ status: "Sections proposées par votre serveur de synthèse. Relisez-les et ajustez-les." });
  };
  const duplicate = () => {
    const id = `copy-${state.created}`;
    patch({ templates: [...state.templates, { ...template, id, pinned: false, title: `${template.title} (copie)` }], selected: id, created: state.created + 1 });
  };
  return (
    <div className="syn-tpl-form">
      <div className="syn-tpl-bar" style={{ position: "relative" }}>
        <div className="syn-tpl-seg" role="group" aria-label={L("Display mode")}>
          {[["edit", L("Edit")], ["preview", L("Preview")]].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={state.mode === value} onClick={() => patch({ mode: value })}>{label}</button>
          ))}
        </div>
        {markers ? h(SynHotspot, { n: 3, style: { left: 150, top: 6 } }) : null}
        {isDefault ? <span className="syn-tpl-badge" style={{ marginLeft: markers ? 28 : 0 }}>{L("Default template")}</span> : null}
        <span style={{ flex: 1 }} />
        <button type="button" className="syn-icon-btn" aria-label={L("Template icon")}>{h(SynIcon, { name: I("FileText") })}</button>
        <button type="button" className="syn-ui-btn" data-variant="ghost" aria-pressed={template.pinned} style={{ color: template.pinned ? "var(--syn-primary)" : "var(--syn-muted-foreground)" }} onClick={() => update({ pinned: !template.pinned })}>
          {h(SynIcon, { name: I("Star"), size: 14 })}
          {template.pinned ? L("In favorites") : L("Add to favorites")}
        </button>
        {h(SynMenuButton, {
          label: L("More actions"),
          items: [
            { label: isDefault ? L("Stop using by default") : L("Use by default"), onSelect: () => patch({ defaultId: isDefault ? "" : template.id }) },
            { label: L("Duplicate"), onSelect: duplicate },
            { separator: true },
            { label: L("Delete"), onSelect: () => patch({ templates: state.templates.filter((t) => t.id !== template.id), selected: "auto" }) },
          ],
        })}
      </div>
      {state.mode === "preview" ? (
        <>
          <div className="syn-tpl-legend">
            <span><i aria-hidden="true" style={{ background: "var(--syn-foreground)" }} />{L("Written by Syntheo")}</span>
            <span><i aria-hidden="true" style={{ background: "var(--syn-faint)" }} />{L("Template instruction")}</span>
          </div>
          <article className="syn-tpl-preview" aria-label={L("Summary preview")}>
            <h2>{template.title.trim() || L("Untitled")} · lundi 9 novembre</h2>
            {template.sections.length === 0 ? <p className="syn-muted" style={{ fontSize: 14 }}>{L("Add sections to see the shape of the summary.")}</p> : null}
            {template.sections.map((s) => (
              <section key={s.key}>
                <h3>{s.title.trim() || L("Untitled section")}</h3>
                {s.description.trim() ? <p className="syn-muted" style={{ fontSize: 14, fontStyle: "italic" }}>{s.description}</p> : null}
                <p style={{ fontSize: 15 }}>{L("— Sample line written from this instruction.")}</p>
              </section>
            ))}
          </article>
        </>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input className="syn-tpl-inline syn-tpl-serif" aria-label={L("Template name")} placeholder={L("Template name")} value={template.title} onChange={(e) => update({ title: e.target.value })} />
            <input className="syn-tpl-inline syn-muted" style={{ fontSize: 15 }} aria-label={L("Description")} placeholder={L("What is this template for?")} value={template.description} onChange={(e) => update({ description: e.target.value })} />
          </div>
          {h(SynTplUses, { uses: template.uses, onChange: (uses) => update({ uses }) })}
          <div className="syn-tpl-gen" style={{ position: "relative" }}>
            {markers ? h(SynHotspot, { n: 4, style: { right: -11, top: -11 } }) : null}
            {h(SynIcon, { name: I("Sparkle") })}
            <input
              type="text"
              aria-label={L("Describe the meeting")}
              placeholder={L("Describe the meeting, Syntheo suggests the sections…")}
              value={describe}
              onChange={(e) => setDescribe(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && suggest()}
            />
            <button type="button" className="syn-ui-btn" style={{ minHeight: 32 }} onClick={suggest}>{L("Suggest sections")}</button>
          </div>
          <div style={{ position: "relative" }}>
            {markers ? h(SynHotspot, { n: 5, style: { left: -30, top: 8 } }) : null}
            {h(SynTplSections, { sections: template.sections, onChange: (sections) => update({ sections }), onStatus: (status) => patch({ status }) })}
          </div>
        </>
      )}
    </div>
  );
};

const SynTplAuto = ({ state, patch }) => {
  const isDefault = state.defaultId === "";
  return (
    <div className="syn-tpl-form" style={{ maxWidth: 700 }}>
      <div className="syn-tpl-bar" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ maxWidth: 440 }}>
          <h2 className="syn-tpl-serif">{L("Automatic")}</h2>
          <p className="syn-muted" style={{ margin: "4px 0 0", fontSize: 15 }}>{L("Syntheo structures the summary itself, without a fixed template. Used when no template is chosen for a meeting.")}</p>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button type="button" className="syn-ui-btn" data-variant="ghost" disabled={isDefault} style={isDefault ? { background: "var(--syn-accent)", color: "var(--syn-accent-foreground)", opacity: 1 } : undefined} onClick={() => patch({ defaultId: "" })}>
            {isDefault ? h(SynIcon, { name: I("Check"), size: 14 }) : null}
            {isDefault ? L("Default template") : L("Use by default")}
          </button>
          {h(SynMenuButton, { label: L("Template actions"), items: [{ label: L("Reset to default format"), onSelect: () => patch({ auto: "", autoSaved: "", status: "" }) }] })}
        </span>
      </div>
      <div className="syn-tpl-bar" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{L("Summary format")}</h3>
          <p className="syn-muted" style={{ margin: "4px 0 0", fontSize: 14 }}>{L("Choose how Auto structures and styles your summaries.")}</p>
        </div>
        <button type="button" className="syn-ui-btn">{h(SynIcon, { name: I("MagicWand") })}{L("Improve with examples")}</button>
      </div>
      <textarea className="syn-tpl-auto" aria-label={L("Auto summary format")} value={state.auto} onChange={(e) => patch({ auto: e.target.value })} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="syn-ui-btn" data-variant="primary" disabled={state.auto === state.autoSaved || !state.auto.trim()} onClick={() => patch({ autoSaved: state.auto, status: "Format « Automatique » enregistré." })}>
          {L("Save")}
        </button>
      </div>
    </div>
  );
};

/**
 * Vue Modèles. `start` : « modele » (Point projet / Sprint ouvert) ou
 * « automatique ». Repères : 1 groupes, 2 recherche, 3 Modifier / Aperçu,
 * 4 Proposer des sections, 5 sections.
 */
export const TemplatesEditor = ({ start = "modele", markers = true }) => {
  const [state, setState] = useState(() => synTplInitial(start));
  const [showMarkers, setShowMarkers] = useState(markers);
  const patch = (p) => setState((s) => ({ ...s, ...p }));
  const template = state.templates.find((t) => t.id === state.selected);
  const update = (p) => setState((s) => ({ ...s, templates: s.templates.map((t) => (t.id === s.selected ? { ...t, ...p } : t)) }));
  const groups = synTplGroups(state);
  const create = () => {
    const id = `new-${state.created}`;
    patch({ templates: [...state.templates, { id, title: L("New template"), description: "", pinned: false, uses: [], sections: [] }], selected: id, created: state.created + 1, mode: "edit", search: "" });
  };
  return h(
    SynFigure,
    { title: L("Templates"), width: 920, markers: showMarkers, setMarkers: setShowMarkers, onReset: () => setState(synTplInitial(start)) },
    <div className="syn-tpl">
      <div className="syn-tpl-side" style={{ position: "relative" }}>
        <button type="button" className="syn-icon-btn" aria-label={L("Go home")} title={L("Back")}>{h(SynIcon, { name: I("ArrowLeft") })}</button>
        <label className="syn-tpl-search" style={{ position: "relative" }}>
          {showMarkers ? h(SynHotspot, { n: 2, style: { right: -6, top: -12 } }) : null}
          {h(SynIcon, { name: I("MagnifyingGlass") })}
          <input type="text" aria-label={L("Search templates")} placeholder={L("Search a template")} value={state.search} onChange={(e) => patch({ search: e.target.value })} onKeyDown={(e) => e.key === "Escape" && patch({ search: "" })} />
          {state.search ? (
            <button type="button" className="syn-icon-btn" style={{ width: 18, height: 18 }} aria-label={L("Clear search")} onClick={() => patch({ search: "" })}>{h(SynIcon, { name: I("X"), size: 14 })}</button>
          ) : null}
        </label>
        <nav className="syn-tpl-list" aria-label={L("Templates")} style={{ position: "relative" }}>
          {showMarkers ? h(SynHotspot, { n: 1, style: { right: 4, top: 0 } }) : null}
          {groups.length === 0 ? <p className="syn-muted" style={{ textAlign: "center", fontSize: 14 }}>{L("No template found")}</p> : null}
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="syn-tpl-group">
              <h3 aria-hidden="true">{group.label}</h3>
              {group.entries.map((id) => {
                const t = state.templates.find((x) => x.id === id);
                return (
                  <button key={id} type="button" className="syn-tpl-item" aria-current={state.selected === id} onClick={() => patch({ selected: id, status: "" })}>
                    <span>{id === "auto" ? L("Automatic") : t.title.trim() || L("Untitled")}</span>
                    {id === "auto" && state.autoSaved.trim() ? <span className="syn-muted syn-small" style={{ fontWeight: 400 }}>{L("customized")}</span> : null}
                    {t && state.defaultId === id ? <span className="syn-muted syn-small" style={{ fontWeight: 400 }}>{L("default")}</span> : null}
                    {t?.pinned ? <span role="img" aria-label={L("In favorites")} style={{ display: "flex", color: "var(--syn-primary)" }}>{h(SynIcon, { name: I("Star"), size: 12 })}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <button type="button" className="syn-ui-btn" style={{ marginTop: 12, width: "100%" }} onClick={create}>{L("+ New template")}</button>
      </div>
      <div className="syn-tpl-main">
        {template ? h(SynTplForm, { key: template.id, template, state, update, patch, markers: showMarkers }) : h(SynTplAuto, { state, patch })}
        <p className="syn-tpl-status" role="status">{state.status}</p>
      </div>
    </div>
  );
};
