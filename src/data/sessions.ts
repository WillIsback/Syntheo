export type Speaker = {
  id: string;
  name: string;
  initials: string;
  color: string;
  bg: string;
  share: number;
  timeLabel: string;
};

export type Segment = {
  id: string;
  label: string;
  ts: string;
  color: string;
  bg: string;
  inProgress?: boolean;
  /** Relative share of session duration, used for the SegmentTimeline widths. */
  share: number;
};

export type Block = {
  id: string;
  segId: string;
  speakerId: string;
  ts: string;
  text: string;
};

export type ReportSection = { title: string; body: string };

export type Report = {
  templateId: string;
  templateName: string;
  modelTag: string;
  sections: ReportSection[];
};

export type Session = {
  id: string;
  icon: string;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  dateLabel: string;
  updatedLabel: string;
  durationLabel: string;
  durationMin: number;
  runTag: string;
  speakers: Speaker[];
  segments: Segment[];
  blocks: Block[];
  speakerNames: Record<string, string>;
  report: Report | null;
};

/**
 * Placeholder data standing in for a sessions table + API. Replace with a real
 * fetch (e.g. `getSessionsForUser(userId)`) once session persistence exists —
 * see db/init/001_auth.sql, which only defines app_user/external_identity today.
 */
export const mockSessions: Session[] = [
  {
    id: "s1",
    icon: "🎙",
    status: "completed" as const,
    name: "Réunion cadrage MVP",
    dateLabel: "Il y a 3 min · 42 min",
    updatedLabel: "Dernière mise à jour : il y a 3 minutes",
    durationLabel: "42 min",
    durationMin: 42,
    runTag: "run #a3f8b2c · 14 juin 2025 10:47",
    speakers: [
      {
        id: "sp1",
        name: "Marianne R.",
        initials: "MR",
        color: "#1A73E8",
        bg: "#E8F0FE",
        share: 34,
        timeLabel: "14 min",
      },
      {
        id: "sp2",
        name: "Thomas V.",
        initials: "TV",
        color: "#0F9D58",
        bg: "#E6F4EA",
        share: 28,
        timeLabel: "12 min",
      },
      {
        id: "sp3",
        name: "Julie P.",
        initials: "JP",
        color: "#E37400",
        bg: "#FEF3E2",
        share: 22,
        timeLabel: "9 min",
      },
      {
        id: "sp4",
        name: "Henri L. (DPD)",
        initials: "HL",
        color: "#A142F4",
        bg: "#F3E8FD",
        share: 16,
        timeLabel: "7 min",
      },
    ],
    segments: [
      {
        id: "seg1",
        label: "Introduction",
        ts: "00:00",
        color: "#1A73E8",
        bg: "#E8F0FE",
        share: 15,
      },
      {
        id: "seg2",
        label: "Architecture stack",
        ts: "04:17",
        color: "#0F9D58",
        bg: "#E6F4EA",
        share: 34,
      },
      {
        id: "seg3",
        label: "Conformité RGPD",
        ts: "18:31",
        color: "#A142F4",
        bg: "#F3E8FD",
        share: 35,
      },
      {
        id: "seg4",
        label: "Plan d’action",
        ts: "38:05",
        color: "#E37400",
        bg: "#FEF3E2",
        inProgress: true,
        share: 16,
      },
    ],
    blocks: [
      {
        id: "b1",
        segId: "seg1",
        speakerId: "sp1",
        ts: "00:12",
        text: "Bonjour à tous. Avant de commencer, je vous rappelle que cette réunion est enregistrée et transcrite par Syntheo, un système d'intelligence artificielle. Vous avez tous été informés de cet enregistrement et avez donné votre accord. Le compte rendu sera disponible dans les minutes qui suivent la fin de la réunion.",
      },
      {
        id: "b2",
        segId: "seg1",
        speakerId: "sp2",
        ts: "01:03",
        text: "Parfait. L'ordre du jour d'aujourd'hui couvre trois points : la validation de l'architecture technique du MVP, le cadrage réglementaire avec Henri, et la définition du plan d'action priorisé. On a environ quarante minutes.",
      },
      {
        id: "b3",
        segId: "seg2",
        speakerId: "sp3",
        ts: "04:22",
        text: "Donc côté technique, on reste sur le VPS OVH. Tout tourne en Docker Swarm avec un rolling release pour le zéro downtime. WhisperX et vLLM sont dans des containers isolés, sans aucun port exposé à l'extérieur. Le frontend Next.js est le seul point d'entrée, via Traefik en reverse proxy avec TLS 1.3.",
      },
      {
        id: "b4",
        segId: "seg2",
        speakerId: "sp2",
        ts: "05:44",
        text: "Et pour l'observabilité, on a choisi OpenTelemetry comme collecteur central, avec Grafana pour les dashboards, Loki pour les logs et Tempo pour les traces distribuées. MLflow gère la traçabilité des inférences — chaque compte rendu sera lié à un run_id précis. C'est ce qui nous couvre sur l'IA Act.",
      },
      {
        id: "b5",
        segId: "seg3",
        speakerId: "sp4",
        ts: "18:45",
        text: "Ce qui me rassure c'est l'absence de conservation audio. C'est la décision la plus déterminante pour le périmètre de l'AIPD. On reste sur des données biométriques traitées de manière éphémère — ça change complètement le niveau de risque. Le point qui restera toujours en risque résiduel modéré, c'est le consentement des participants tiers. La dialog box est nécessaire, mais ce n'est pas une base légale en soi.",
      },
      {
        id: "b6",
        segId: "seg3",
        speakerId: "sp1",
        ts: "20:12",
        text: "On a prévu de traiter ça dans les CGU — l'utilisateur reconnaît explicitement être responsable d'avoir informé ses interlocuteurs. Le timestamp et le hash du consentement sont loggés en base à chaque session. Est-ce que ça vous convient comme mécanisme de preuve ?",
      },
      {
        id: "b7",
        segId: "seg3",
        speakerId: "sp4",
        ts: "20:58",
        text: "C'est le mécanisme raisonnable que la CNIL attend. Ce qu'il faut impérativement ajouter dans les CGU, c'est une clause qui décrit les conséquences pour l'utilisateur en cas de non-respect — perte de responsabilité de Syntheo, engagement de l'utilisateur à assumer les réclamations. Et je veux voir l'AIPD finalisée avant toute mise en production publique. C'est non-négociable.",
      },
      {
        id: "b8",
        segId: "seg4",
        speakerId: "sp3",
        ts: "38:10",
        text: "Pour le plan d'action, on a huit points. Les trois bloquants avant production : l'AIPD, le déploiement de Vault pour la gestion des clés, et le chiffrement LUKS du volume PostgreSQL. Tout le reste — CGU, droits utilisateurs, MFA, Loki append-only — c'est la V1 mais pas bloquant à proprement parler.",
      },
    ],
    speakerNames: {},
    report: null,
  },
  {
    id: "s2",
    icon: "📋",
    status: "completed" as const,
    name: "Revue technique backend",
    dateLabel: "Hier · 1h 08 min",
    updatedLabel: "Dernière mise à jour : hier",
    durationLabel: "1h 08",
    durationMin: 68,
    runTag: "run #b91c40e · hier",
    speakers: [
      {
        id: "sp5",
        name: "Thomas V.",
        initials: "TV",
        color: "#1A73E8",
        bg: "#E8F0FE",
        share: 52,
        timeLabel: "35 min",
      },
      {
        id: "sp6",
        name: "Karim B.",
        initials: "KB",
        color: "#0F9D58",
        bg: "#E6F4EA",
        share: 48,
        timeLabel: "33 min",
      },
    ],
    segments: [
      {
        id: "seg5",
        label: "Revue API",
        ts: "00:00",
        color: "#1A73E8",
        bg: "#E8F0FE",
        share: 60,
      },
      {
        id: "seg6",
        label: "Dette technique",
        ts: "22:10",
        color: "#0F9D58",
        bg: "#E6F4EA",
        share: 40,
      },
    ],
    blocks: [
      {
        id: "b9",
        segId: "seg5",
        speakerId: "sp5",
        ts: "00:14",
        text: "On démarre par la revue des endpoints de transcription. Le rate-limiting est en place, mais il faut encore brancher le circuit breaker vers WhisperX.",
      },
      {
        id: "b10",
        segId: "seg5",
        speakerId: "sp6",
        ts: "01:40",
        text: "Côté queue, RabbitMQ tient la charge en test. Je propose qu'on ajoute un dead-letter queue avant la mise en prod.",
      },
      {
        id: "b11",
        segId: "seg6",
        speakerId: "sp5",
        ts: "22:30",
        text: "Sur la dette technique, le plus urgent reste la migration du store de sessions vers Postgres — on est encore sur du in-memory.",
      },
    ],
    speakerNames: {},
    report: null,
  },
  {
    id: "s3",
    icon: "🔒",
    status: "completed" as const,
    name: "Point DPD — conformité",
    dateLabel: "12 juin · 28 min",
    updatedLabel: "Dernière mise à jour : 12 juin",
    durationLabel: "28 min",
    durationMin: 28,
    runTag: "run #c02f18a · 12 juin",
    speakers: [
      {
        id: "sp7",
        name: "Henri L. (DPD)",
        initials: "HL",
        color: "#A142F4",
        bg: "#F3E8FD",
        share: 58,
        timeLabel: "16 min",
      },
      {
        id: "sp8",
        name: "Marianne R.",
        initials: "MR",
        color: "#1A73E8",
        bg: "#E8F0FE",
        share: 42,
        timeLabel: "12 min",
      },
    ],
    segments: [
      {
        id: "seg7",
        label: "Cadrage AIPD",
        ts: "00:00",
        color: "#A142F4",
        bg: "#F3E8FD",
        share: 100,
      },
    ],
    blocks: [
      {
        id: "b12",
        segId: "seg7",
        speakerId: "sp7",
        ts: "00:20",
        text: "Je veux qu'on formalise le registre des traitements avant la prochaine revue. La base légale reste l'intérêt légitime pour la transcription, mais le consentement des tiers doit être documenté séparément.",
      },
      {
        id: "b13",
        segId: "seg7",
        speakerId: "sp8",
        ts: "02:05",
        text: "On peut ajouter une bannière de consentement obligatoire avant le démarrage de chaque session, avec horodatage loggé côté serveur.",
      },
    ],
    speakerNames: {},
    report: null,
  },
];

export type ReportTemplate = {
  id: string;
  icon: string;
  name: string;
  desc: string;
  content: string; // markdown avec # headings
};

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "general",
    icon: "📝",
    name: "Réunion générale",
    desc: "Résumé standard : décisions et actions à suivre.",
    content:
      "#Participants\nListe les participants à la réunion avec leur rôle si mentionné.\n\n#Décisions actées\nRésume les décisions importantes prises au cours de la réunion.\n\n#Actions à suivre\nListe les actions à réaliser, en précisant le responsable et le délai si mentionnés.\n\n#Prochaine étape\nDécris la prochaine étape ou la date de la prochaine réunion.",
  },
  {
    id: "compliance",
    icon: "🔒",
    name: "Comité conformité / RGPD",
    desc: "Axé risques, décisions réglementaires, points bloquants.",
    content:
      "#Contexte\nRésume le contexte réglementaire ou le sujet de conformité abordé.\n\n#Décisions actées\nListe les décisions réglementaires ou techniques prises.\n\n#Points bloquants avant production\nDresse la liste des obstacles identifiés qui empêchent le passage en production.\n\n#Risques résiduels\nIdentifie les risques non encore traités et leur impact potentiel.\n\n#Prochaine étape\nDécris les actions immédiates et la date de révision.",
  },
  {
    id: "project",
    icon: "📊",
    name: "Point projet / Sprint",
    desc: "Avancement, blocages, prochaines échéances.",
    content:
      "#Avancement\nRésume les progrès réalisés depuis le dernier point.\n\n#Blocages\nListe les obstacles actuels avec leur impact sur le planning.\n\n#Prochaines étapes\nListe les tâches prioritaires et les échéances.",
  },
  {
    id: "standup",
    icon: "⚡",
    name: "Standup équipe",
    desc: "Format court : fait, en cours, bloquants.",
    content:
      "#Fait\nPour chaque intervenant, résume ce qui a été accompli depuis le dernier standup.\n\n#En cours\nPour chaque intervenant, liste les tâches en cours du jour.\n\n#Bloquants\nListe les blocages signalés et leur impact.",
  },
];

export const REPORT_LOOKUP: Record<string, Record<string, ReportSection[]>> = {
  s1: {
    general: [
      {
        title: "Participants",
        body: "Marianne Rousseau, Thomas Valentin, Julie Pelletier, Henri Lefèvre (DPD).",
      },
      {
        title: "Décisions actées",
        body: "La stack technique est validée — VPS OVH, Docker Swarm, WhisperX + vLLM isolés, OpenTelemetry + MLflow pour l'observabilité et la traçabilité IA. Aucune conservation de l'audio brut.",
      },
      {
        title: "Actions à suivre",
        body: "Rédaction des CGU avec clause de responsabilité tiers, interface droits utilisateurs (export / suppression / rectification), MFA admin VPS, politique Loki append-only.",
      },
      {
        title: "Prochaine étape",
        body: "Julie transmet le draft AIPD à Henri avant le 21 juin pour relecture. Mise en production cible : début juillet sous réserve de validation DPD.",
      },
    ],
    compliance: [
      {
        title: "Contexte",
        body: "Réunion de cadrage MVP portant sur la validation de l'architecture technique et le cadrage réglementaire du traitement de données biométriques (voix).",
      },
      {
        title: "Décisions actées",
        body: "Aucune conservation de l'audio brut — traitement éphémère des données biométriques, ce qui réduit significativement le périmètre de l'AIPD.",
      },
      {
        title: "Points bloquants avant production",
        body: "AIPD complète cosignée par le DPD (obligatoire), déploiement de Vault pour la gestion des secrets, chiffrement LUKS du volume PostgreSQL.",
      },
      {
        title: "Risques résiduels",
        body: "Le consentement des participants tiers reste en risque résiduel modéré : la dialog box d'information n'est pas une base légale en soi. Traité contractuellement via les CGU (timestamp et hash de consentement loggés).",
      },
      {
        title: "Prochaine étape",
        body: "Draft AIPD transmis à Henri Lefèvre avant le 21 juin. Mise en production bloquée jusqu'à validation DPD.",
      },
    ],
  },
};
