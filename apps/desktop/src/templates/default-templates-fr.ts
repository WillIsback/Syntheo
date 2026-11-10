// Textes français des modèles fournis, tels que les écrit la migration
// `crates/db-app/migrations/20261024120000_syntheo_templates_fr.sql`.
// Ils doivent rester identiques à la migration : c'est ainsi qu'on reconnaît un
// modèle que l'utilisateur n'a pas modifié (voir `default-templates-locale.ts`).
import type { DefaultTemplateText } from "./default-templates-locale";

export const DEFAULT_TEMPLATES_FR: Readonly<
  Record<string, DefaultTemplateText>
> = {
  "default-board-meeting": {
    title: "Conseil d'administration",
    description:
      "Pour les conseils d'administration et les sujets de gouvernance",
    category: "Direction",
    targets: ["Fondateur", "PDG", "Administrateur"],
    sections: [
      ["Performance de l'entreprise", "Point financier et opérationnel"],
      ["Initiatives stratégiques", "Avancement des priorités stratégiques"],
      ["Revue financière", "Budget, trésorerie et santé financière"],
      ["Décisions du conseil", "Résolutions et questions de gouvernance"],
      ["Risques et conformité", "Gestion des risques et point conformité"],
      ["Prochaines étapes", "Actions et suivis"],
    ],
  },
  "default-brainstorming-session": {
    title: "Séance de brainstorming",
    description: "Pour les séances de créativité et d'idéation",
    category: "Produit",
    targets: ["Chef de produit", "Designer", "Marketing"],
    sections: [
      [
        "Objectif de la séance",
        "Quel problème ou quelle opportunité explore-t-on ?",
      ],
      ["Idées émises", "Toutes les idées recueillies pendant la séance"],
      ["Pistes prometteuses", "Idées à approfondir"],
      ["Critères d'évaluation", "Comment les idées seront évaluées"],
      ["Prochaines étapes", "Actions pour avancer"],
    ],
  },
  "default-client-kickoff": {
    title: "Lancement client",
    description: "Pour démarrer une mission client et cadrer les attentes",
    category: "Succès client",
    targets: [
      "Customer Success Manager",
      "Responsable de compte",
      "Responsable déploiement",
    ],
    sections: [
      ["Présentation du projet", "Périmètre, objectifs et livrables"],
      ["Présentation des équipes", "Rôles et responsabilités"],
      ["Calendrier et jalons", "Planning du projet et dates clés"],
      ["Plan de communication", "Fréquence des réunions et des points d'étape"],
      ["Critères de réussite", "Comment mesurer la réussite du projet"],
      ["Prochaines étapes", "Actions immédiates"],
    ],
  },
  "default-customer-discovery": {
    title: "Entretien de découverte client",
    description:
      "Pour les entretiens de découverte et la recherche utilisateur",
    category: "Produit",
    targets: ["Chef de produit", "Chercheur UX", "Fondateur"],
    sections: [
      ["Contexte", "Contexte et profil du client"],
      ["Fonctionnement actuel", "Comment il résout le problème aujourd'hui"],
      ["Points de douleur", "Difficultés et frustrations"],
      ["Besoins et objectifs", "Ce qu'il cherche à accomplir"],
      ["Retours sur la solution", "Réactions à la solution proposée"],
      ["Enseignements clés", "Principaux constats et apprentissages"],
    ],
  },
  "default-daily-standup": {
    title: "Standup quotidien",
    description:
      "Pour un point quotidien rapide sur l'avancement et les blocages",
    category: "Ingénierie",
    targets: ["Développeur", "Engineering Manager", "Scrum Master"],
    sections: [
      ["Réalisé hier", "Qu'as-tu terminé hier ?"],
      ["Prévu aujourd'hui", "Sur quoi travailles-tu aujourd'hui ?"],
      ["Blocages", "Des obstacles ou un besoin d'aide ?"],
      ["Infos d'équipe", "Annonces ou informations importantes"],
    ],
  },
  "default-executive-briefing": {
    title: "Point direction",
    description:
      "Pour consigner les échanges stratégiques et les décisions de direction",
    category: "Direction",
    targets: ["Dirigeant", "PDG", "Directeur"],
    sections: [
      ["Vue d'ensemble stratégique", "Contexte et objectifs de haut niveau"],
      ["Indicateurs clés", "Indicateurs de performance et tendances"],
      ["Décisions majeures", "Décisions stratégiques et leur justification"],
      ["Allocation des ressources", "Engagements de budget et de ressources"],
      [
        "Risques et opportunités",
        "Risques stratégiques et leviers de croissance",
      ],
      ["Actions", "Suivis au niveau de la direction"],
    ],
  },
  "default-incident-postmortem": {
    title: "Post-mortem d'incident",
    description:
      "Pour un post-mortem sans recherche de coupable après un incident ou une panne",
    category: "Ingénierie",
    targets: ["Ingénieur plateforme", "SRE", "Ingénieur DevOps"],
    sections: [
      ["Résumé de l'incident", "Ce qui s'est passé et quand"],
      ["Chronologie", "Déroulé chronologique des événements"],
      ["Analyse de la cause racine", "Ce qui a provoqué l'incident"],
      [
        "Évaluation de l'impact",
        "Conséquences pour les utilisateurs et l'activité",
      ],
      ["Réponse et résolution", "Comment l'incident a été résolu"],
      ["Enseignements", "Principaux enseignements"],
      ["Actions", "Mesures préventives et améliorations"],
    ],
  },
  "default-investor-pitch": {
    title: "Rendez-vous investisseur",
    description: "Pour les présentations à des investisseurs et fonds",
    category: "Levée de fonds",
    targets: ["Fondateur", "PDG", "Directeur financier"],
    sections: [
      [
        "Contexte du rendez-vous",
        "Profil de l'investisseur et objet de la rencontre",
      ],
      ["Synthèse du pitch", "Points clés présentés"],
      ["Questions posées", "Questions et réserves de l'investisseur"],
      ["Retours reçus", "Réactions et retours de l'investisseur"],
      ["Intérêt pour l'investissement", "Niveau d'intérêt et suite envisagée"],
      ["Éléments à fournir", "Informations demandées et actions"],
    ],
  },
  "default-lecture-notes": {
    title: "Notes de cours",
    description: "Pour prendre et organiser des notes de cours",
    category: "Formation",
    targets: ["Étudiant", "Doctorant", "Chercheur"],
    sections: [
      ["Informations sur le cours", "Matière, date et sujet"],
      ["Notions clés", "Idées et théories principales abordées"],
      ["Définitions importantes", "Termes et définitions à retenir"],
      ["Exemples et applications", "Exemples et applications concrètes"],
      ["Questions et points à éclaircir", "Points à approfondir"],
      ["À faire", "Devoirs et prochaines étapes"],
    ],
  },
  "default-one-on-one-meeting": {
    title: "Entretien individuel (1:1)",
    description:
      "Pour des entretiens individuels structurés avec les membres de l'équipe",
    category: "Management",
    targets: ["Manager", "Engineering Manager", "Chef d'équipe"],
    sections: [
      ["Actualités", "Que s'est-il passé depuis la dernière fois ?"],
      [
        "Réussites et difficultés",
        "Saluer les succès et discuter des obstacles",
      ],
      [
        "Objectifs et progrès",
        "Revoir les objectifs en cours et leur avancement",
      ],
      ["Feedback", "Échange de feedback dans les deux sens"],
      ["Actions", "Prochaines étapes et engagements"],
    ],
  },
  "default-performance-review": {
    title: "Entretien annuel",
    description:
      "Pour les entretiens d'évaluation et les échanges sur l'évolution de carrière",
    category: "Management",
    targets: ["Manager", "Engineering Manager", "RH"],
    sections: [
      ["Bilan de la période", "Vue d'ensemble de la période évaluée"],
      ["Réalisations clés", "Principales réussites et contributions"],
      ["Points forts", "Compétences et comportements à conserver"],
      ["Axes de progrès", "Opportunités de développement et améliorations"],
      ["Objectifs de carrière", "Aspirations et parcours de développement"],
      ["Plan d'action", "Objectifs de développement et prochaines étapes"],
    ],
  },
  "default-product-roadmap-review": {
    title: "Revue de roadmap produit",
    description: "Pour revoir et aligner les priorités de la roadmap produit",
    category: "Produit",
    targets: ["Chef de produit", "Engineering Manager", "Dirigeant"],
    sections: [
      ["État des lieux", "Avancement des chantiers en cours"],
      [
        "Fonctionnalités à venir",
        "Priorités et calendrier du prochain trimestre",
      ],
      ["Retours clients", "Enseignements clés des utilisateurs et clients"],
      ["Indicateurs de succès", "KPI et méthode de mesure"],
      ["Allocation des ressources", "Affectation des équipes et capacité"],
      ["Décisions prises", "Décisions clés et arbitrages"],
    ],
  },
  "default-project-kickoff": {
    title: "Lancement de projet",
    description:
      "Pour démarrer un projet avec des objectifs clairs et un alignement partagé",
    category: "Produit",
    targets: ["Chef de produit", "Engineering Manager", "Designer"],
    sections: [
      ["Présentation du projet", ""],
      ["Objectifs et indicateurs de succès", "Définir ce qu'est la réussite"],
      ["Parties prenantes et rôles", ""],
      ["Calendrier et jalons", ""],
      ["Risques et dépendances", ""],
      ["Prochaines étapes", ""],
    ],
  },
  "default-sales-discovery-call": {
    title: "Appel de découverte commerciale",
    description: "Pour qualifier un prospect et comprendre ses besoins",
    category: "Ventes",
    targets: ["Commercial grands comptes", "Commercial", "Business developer"],
    sections: [
      ["Présentation de l'entreprise", "Contexte du prospect"],
      ["Situation actuelle", "Son fonctionnement aujourd'hui"],
      ["Enjeux et points de douleur", "Problèmes qu'il cherche à résoudre"],
      ["Objectifs et critères de réussite", "Ce qu'est la réussite pour lui"],
      ["Budget et calendrier", "Contraintes financières et de délai"],
      ["Prochaines étapes", "Actions de suivi et calendrier"],
    ],
  },
  "default-sprint-planning": {
    title: "Planification de sprint",
    description: "Pour planifier un sprint et fixer les objectifs de l'équipe",
    category: "Ingénierie",
    targets: ["Engineering Manager", "Chef de produit", "Tech Lead"],
    sections: [
      ["Objectif du sprint", "Quel est l'objectif principal de ce sprint ?"],
      ["Backlog du sprint", "User stories et tâches engagées pour le sprint"],
      [
        "Capacité et disponibilités",
        "Disponibilités de l'équipe et estimation de capacité",
      ],
      ["Dépendances et risques", "Dépendances externes et risques potentiels"],
      [
        "Définition de « terminé »",
        "Critères d'acceptation et standards de complétion",
      ],
    ],
  },
  "default-sprint-retrospective": {
    title: "Rétrospective de sprint",
    description:
      "Pour prendre du recul sur le sprint et améliorer en continu les pratiques et la collaboration",
    category: "Ingénierie",
    targets: ["Engineering Manager", "Scrum Master", "Tech Lead"],
    sections: [
      [
        "Ce qui a bien marché",
        "Saluer les réussites et les résultats positifs",
      ],
      ["Ce qui n'a pas marché", "Identifier les difficultés et les problèmes"],
      ["Ce que nous avons appris", "Enseignements et constats clés"],
      ["Actions", "Mesures concrètes d'amélioration"],
    ],
  },
  "default-technical-design-review": {
    title: "Revue de conception technique",
    description:
      "Pour revoir une conception technique et les choix d'architecture",
    category: "Ingénierie",
    targets: ["Développeur", "Tech Lead", "Ingénieur plateforme"],
    sections: [
      ["Énoncé du problème", "Quel problème résout-on ?"],
      ["Solution proposée", "Approche technique et architecture"],
      ["Alternatives étudiées", "Autres options et compromis"],
      ["Plan de mise en œuvre", "Découpage du travail et calendrier"],
      ["Stratégie de test", "Comment valider la solution"],
      ["Risques et parades", "Problèmes potentiels et plans de repli"],
      ["Décisions et actions", "Résultats et prochaines étapes"],
    ],
  },
  "syntheo-general": {
    title: "Réunion générale",
    description: "Résumé standard : décisions et actions à suivre.",
    category: "Général",
    targets: [],
    sections: [
      [
        "Participants",
        "Liste les participants à la réunion avec leur rôle si mentionné.",
      ],
      [
        "Décisions actées",
        "Résume les décisions importantes prises au cours de la réunion.",
      ],
      [
        "Actions à suivre",
        "Liste les actions à réaliser, en précisant le responsable et le délai si mentionnés.",
      ],
      [
        "Prochaine étape",
        "Décris la prochaine étape ou la date de la prochaine réunion.",
      ],
    ],
  },
  "syntheo-compliance": {
    title: "Comité conformité / RGPD",
    description: "Axé risques, décisions réglementaires, points bloquants.",
    category: "Conformité",
    targets: [],
    sections: [
      [
        "Contexte",
        "Résume le contexte réglementaire ou le sujet de conformité abordé.",
      ],
      [
        "Décisions actées",
        "Liste les décisions réglementaires ou techniques prises.",
      ],
      [
        "Points bloquants avant production",
        "Dresse la liste des obstacles identifiés qui empêchent le passage en production.",
      ],
      [
        "Risques résiduels",
        "Identifie les risques non encore traités et leur impact potentiel.",
      ],
      [
        "Prochaine étape",
        "Décris les actions immédiates et la date de révision.",
      ],
    ],
  },
  "syntheo-project": {
    title: "Point projet / Sprint",
    description: "Avancement, blocages, prochaines échéances.",
    category: "Projet",
    targets: [],
    sections: [
      ["Avancement", "Résume les progrès réalisés depuis le dernier point."],
      [
        "Blocages",
        "Liste les obstacles actuels avec leur impact sur le planning.",
      ],
      ["Prochaines étapes", "Liste les tâches prioritaires et les échéances."],
    ],
  },
  "syntheo-standup": {
    title: "Standup équipe",
    description: "Format court : fait, en cours, bloquants.",
    category: "Projet",
    targets: [],
    sections: [
      [
        "Fait",
        "Pour chaque intervenant, résume ce qui a été accompli depuis le dernier standup.",
      ],
      [
        "En cours",
        "Pour chaque intervenant, liste les tâches en cours du jour.",
      ],
      ["Bloquants", "Liste les blocages signalés et leur impact."],
    ],
  },
};
