export type HumanSqlRow = {
  id: string;
  owner_user_id: string;
  created_at: string;
  organization_id: string;
  name: string;
  email: string;
  phone: string;
  job_title: string;
  linkedin_username: string;
  memo: string;
  pinned: boolean | number;
  pin_order: number | null;
  avatar_data_url: string | null;
  contact_summary_json: string | null;
  additional_emails_json?: string | null;
};

export type ContactSummaryRecord = {
  facts: string[];
  sourceHash: string;
  promptKey: string;
  generatedAt: string;
  sources: Array<{ id: string; updatedAt: string }>;
};

export type HumanRecord = {
  id: string;
  userId: string;
  createdAt: string;
  organizationId: string;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  linkedinUsername: string;
  memo: string;
  pinned: boolean;
  pinOrder: number | null;
  avatarDataUrl: string | null;
  summary: ContactSummaryRecord | null;
  additionalEmails: string[];
};

export type HumanDisplaySqlRow = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
};

export type HumanDisplayRecord = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
};

export type OrganizationSqlRow = {
  id: string;
  owner_user_id: string;
  created_at: string;
  name: string;
  memo: string;
  pinned: boolean | number;
  pin_order: number | null;
  avatar_data_url: string | null;
  team_workspace: boolean | number | null;
};

export type OrganizationRecord = {
  id: string;
  userId: string;
  createdAt: string;
  name: string;
  memo: string;
  pinned: boolean;
  pinOrder: number | null;
  avatarDataUrl: string | null;
  teamWorkspace: boolean;
};

export type OrganizationDisplaySqlRow = {
  id: string;
  name: string;
};

export type OrganizationDisplayRecord = {
  id: string;
  name: string;
};

export const AVATAR_SQL = `CASE
  WHEN json_valid(metadata_json)
  THEN json_extract(metadata_json, '$.avatarDataUrl')
END AS avatar_data_url`;

export const CONTACT_SUMMARY_SQL = `CASE
  WHEN json_valid(metadata_json)
  THEN json_extract(metadata_json, '$.contactSummary')
END AS contact_summary_json`;

export const ADDITIONAL_EMAILS_SQL = `CASE
  WHEN json_valid(metadata_json)
    AND json_type(metadata_json, '$.additionalEmails') = 'array'
  THEN json_extract(metadata_json, '$.additionalEmails')
END AS additional_emails_json`;

export const ADDITIONAL_EMAILS_JSON_EACH_SQL = `json_each(CASE
  WHEN json_valid(humans.metadata_json)
    AND json_type(humans.metadata_json, '$.additionalEmails') = 'array'
  THEN json_extract(humans.metadata_json, '$.additionalEmails')
  ELSE '[]'
END)`;

export const TEAM_WORKSPACE_SQL = `CASE
  WHEN json_valid(metadata_json)
  THEN COALESCE(json_extract(metadata_json, '$.teamWorkspace'), 0)
  ELSE 0
END AS team_workspace`;

export type HumanSessionSqlRow = {
  id: string;
  title: string;
  created_at: string;
  source_updated_at: string;
};

export type HumanSessionRecord = {
  id: string;
  title: string;
  createdAt: string;
  sourceUpdatedAt: string;
};

export type ContactSearchSqlRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  job_title: string;
  organization_name: string;
  memo: string;
};

export type ContactSearchRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  organization: string | null;
  memo: string | null;
};

export const EMPTY_HUMANS: HumanRecord[] = [];
export const EMPTY_ORGANIZATIONS: OrganizationRecord[] = [];
export const EMPTY_HUMAN_DISPLAY_RECORDS: HumanDisplayRecord[] = [];
export const EMPTY_ORGANIZATION_DISPLAY_RECORDS: OrganizationDisplayRecord[] =
  [];
export const EMPTY_HUMAN_SESSIONS: HumanSessionRecord[] = [];

export function mapHumanRow(row: HumanSqlRow): HumanRecord {
  return {
    id: row.id,
    userId: row.owner_user_id,
    createdAt: row.created_at,
    organizationId: row.organization_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    jobTitle: row.job_title,
    linkedinUsername: row.linkedin_username,
    memo: row.memo,
    pinned: Boolean(row.pinned),
    pinOrder: row.pin_order,
    avatarDataUrl: row.avatar_data_url ?? null,
    summary: parseContactSummary(row.contact_summary_json),
    additionalEmails: parseAdditionalEmails(row.additional_emails_json),
  };
}

function parseAdditionalEmails(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (email): email is string => typeof email === "string" && !!email.trim(),
    );
  } catch {
    return [];
  }
}

function parseContactSummary(value: string | null | undefined) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ContactSummaryRecord>;
    const facts = Array.isArray(parsed.facts)
      ? parsed.facts.filter(
          (fact): fact is string => typeof fact === "string" && !!fact.trim(),
        )
      : [];
    if (
      facts.length < 3 ||
      typeof parsed.sourceHash !== "string" ||
      typeof parsed.generatedAt !== "string"
    ) {
      return null;
    }

    const sources = Array.isArray(parsed.sources)
      ? parsed.sources.filter(
          (source) =>
            typeof source?.id === "string" &&
            typeof source?.updatedAt === "string",
        )
      : [];

    return {
      facts,
      sourceHash: parsed.sourceHash,
      promptKey: typeof parsed.promptKey === "string" ? parsed.promptKey : "",
      generatedAt: parsed.generatedAt,
      sources,
    };
  } catch {
    return null;
  }
}

export function mapOrganizationRow(
  row: OrganizationSqlRow,
): OrganizationRecord {
  return {
    id: row.id,
    userId: row.owner_user_id,
    createdAt: row.created_at,
    name: row.name,
    memo: row.memo,
    pinned: Boolean(row.pinned),
    pinOrder: row.pin_order,
    avatarDataUrl: row.avatar_data_url ?? null,
    teamWorkspace: Boolean(row.team_workspace),
  };
}
