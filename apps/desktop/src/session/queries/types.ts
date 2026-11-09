export type SessionRecord = {
  id: string;
  user_id: string;
  created_at: string;
  folder_id: string;
  // Marqueur de la note de bienvenue (metadata_json.welcome_note), vide sinon.
  welcome_note: string;
  title: string;
  raw_md: string;
  raw_template_id: string;
  locked: boolean;
};

export type AppliedTemplateSnapshot = {
  templateId: string;
  sections: string[];
};

export type SessionChanges = Partial<
  Pick<
    SessionRecord,
    | "created_at"
    | "folder_id"
    | "locked"
    | "raw_md"
    | "raw_template_id"
    | "title"
  >
> & {
  raw_template_snapshot?: AppliedTemplateSnapshot;
};

export type SessionSummaryRecord = {
  id: string;
  title: string;
  created_at: string;
};

export type EnhancedNoteRecord = {
  id: string;
  sessionId: string;
  title: string;
  content: string;
  templateId: string;
  position: number;
  // Issue 415 : quand la synthèse a été générée, et l'empreinte de la note
  // brute qui a servi (null pour une synthèse plus ancienne).
  generatedAt?: string | null;
  sourceNoteFingerprint?: string | null;
  // Issue 417 : passages validés venus des notes ; null : aucune balise.
  notePassages?: string[] | null;
};

export type SessionParticipantRecord = {
  id: string;
  sessionId: string;
  humanId: string;
  source: string;
  name: string;
  email: string;
  jobTitle: string;
  linkedinUsername: string;
  organizationId: string;
  organizationName: string;
};
