import { useRef } from "react";

import {
  ADDITIONAL_EMAILS_JSON_EACH_SQL,
  ADDITIONAL_EMAILS_SQL,
  AVATAR_SQL,
  CONTACT_SUMMARY_SQL,
  type ContactSearchRecord,
  type ContactSearchSqlRow,
  EMPTY_HUMANS,
  EMPTY_HUMAN_DISPLAY_RECORDS,
  EMPTY_HUMAN_SESSIONS,
  EMPTY_ORGANIZATIONS,
  EMPTY_ORGANIZATION_DISPLAY_RECORDS,
  type HumanDisplayRecord,
  type HumanDisplaySqlRow,
  type HumanRecord,
  type HumanSessionRecord,
  type HumanSessionSqlRow,
  type HumanSqlRow,
  type OrganizationDisplayRecord,
  type OrganizationDisplaySqlRow,
  type OrganizationRecord,
  type OrganizationSqlRow,
  TEAM_WORKSPACE_SQL,
  mapHumanRow,
  mapOrganizationRow,
} from "./queries-rows";

import { liveQueryClient, useLiveQuery } from "~/db";

export function useHumans(): HumanRecord[] {
  const { data = EMPTY_HUMANS } = useLiveQuery<HumanSqlRow, HumanRecord[]>({
    sql: `
      SELECT
        id,
        owner_user_id,
        created_at,
        organization_id,
        name,
        email,
        phone,
        job_title,
        linkedin_username,
        memo,
        pinned,
        pin_order,
        ${AVATAR_SQL},
        ${CONTACT_SUMMARY_SQL},
        ${ADDITIONAL_EMAILS_SQL}
      FROM humans
      WHERE deleted_at IS NULL
      ORDER BY name, email, id
    `,
    mapRows: (rows) => rows.map(mapHumanRow),
  });
  return data;
}

export function useOrganizations(): OrganizationRecord[] {
  const { data = EMPTY_ORGANIZATIONS } = useLiveQuery<
    OrganizationSqlRow,
    OrganizationRecord[]
  >({
    sql: `
      SELECT id, owner_user_id, created_at, name, memo, pinned, pin_order,
        ${AVATAR_SQL},
        ${TEAM_WORKSPACE_SQL}
      FROM organizations
      WHERE deleted_at IS NULL
      ORDER BY name, id
    `,
    mapRows: (rows) => rows.map(mapOrganizationRow),
  });
  return data;
}

export function useHumanDisplayRecordsByIds(
  humanIds: readonly string[],
): HumanDisplayRecord[] {
  const uniqueIds = [...new Set(humanIds.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const enabled = uniqueIds.length > 0;
  const { data } = useLiveQuery<HumanDisplaySqlRow, HumanDisplayRecord[]>({
    sql: `
      SELECT id, organization_id, name, email
      FROM humans
      WHERE id IN (${placeholders || "NULL"})
        AND deleted_at IS NULL
      ORDER BY id
    `,
    params: uniqueIds,
    enabled,
    mapRows: (rows) =>
      rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        email: row.email,
      })),
  });
  return useHeldLiveQueryRows(data, EMPTY_HUMAN_DISPLAY_RECORDS, enabled);
}

export function useOrganizationDisplayRecordsByIds(
  organizationIds: readonly string[],
): OrganizationDisplayRecord[] {
  const uniqueIds = [...new Set(organizationIds.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const enabled = uniqueIds.length > 0;
  const { data } = useLiveQuery<
    OrganizationDisplaySqlRow,
    OrganizationDisplayRecord[]
  >({
    sql: `
      SELECT id, name
      FROM organizations
      WHERE id IN (${placeholders || "NULL"})
        AND deleted_at IS NULL
      ORDER BY id
    `,
    params: uniqueIds,
    enabled,
  });
  return useHeldLiveQueryRows(
    data,
    EMPTY_ORGANIZATION_DISPLAY_RECORDS,
    enabled,
  );
}

export async function loadHuman(humanId: string): Promise<HumanRecord | null> {
  if (!humanId) return null;
  const rows = await loadHumansByIds([humanId]);
  return rows[0] ?? null;
}

export async function loadHumansByIds(
  humanIds: readonly string[],
): Promise<HumanRecord[]> {
  const uniqueIds = [...new Set(humanIds.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  if (uniqueIds.length === 0) return [];

  const rows = await liveQueryClient.execute<HumanSqlRow>(
    `
      SELECT
        id,
        owner_user_id,
        created_at,
        organization_id,
        name,
        email,
        phone,
        job_title,
        linkedin_username,
        memo,
        pinned,
        pin_order,
        ${AVATAR_SQL},
        ${CONTACT_SUMMARY_SQL},
        ${ADDITIONAL_EMAILS_SQL}
      FROM humans
      WHERE id IN (${uniqueIds.map(() => "?").join(", ")})
        AND deleted_at IS NULL
      ORDER BY id
    `,
    uniqueIds,
  );
  return rows.map(mapHumanRow);
}

export async function loadOrganization(
  organizationId: string,
): Promise<OrganizationRecord | null> {
  if (!organizationId) return null;
  const rows = await liveQueryClient.execute<OrganizationSqlRow>(
    `
      SELECT id, owner_user_id, created_at, name, memo, pinned, pin_order,
        ${AVATAR_SQL},
        ${TEAM_WORKSPACE_SQL}
      FROM organizations
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    [organizationId],
  );
  return rows[0] ? mapOrganizationRow(rows[0]) : null;
}

export function useHumanSessions(humanId: string): HumanSessionRecord[] {
  const { data = EMPTY_HUMAN_SESSIONS } = useLiveQuery<
    HumanSessionSqlRow,
    HumanSessionRecord[]
  >({
    sql: `
      SELECT
        sessions.id,
        sessions.title,
        sessions.created_at,
        MAX(
          sessions.updated_at,
          COALESCE((
            SELECT MAX(mapping.updated_at)
            FROM session_participants AS mapping
            WHERE mapping.session_id = sessions.id
              AND mapping.human_id = ?
              AND mapping.source <> 'excluded'
              AND mapping.deleted_at IS NULL
          ), ''),
          COALESCE((
            SELECT MAX(document.updated_at)
            FROM session_documents AS document
            WHERE document.session_id = sessions.id
              AND document.kind IN ('note', 'summary', 'template_output')
              AND document.deleted_at IS NULL
          ), ''),
          COALESCE((
            SELECT MAX(transcript.updated_at)
            FROM transcripts AS transcript
            WHERE transcript.session_id = sessions.id
              AND transcript.deleted_at IS NULL
          ), '')
        ) AS source_updated_at
      FROM sessions
      WHERE sessions.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM session_participants AS mapping
          WHERE mapping.session_id = sessions.id
            AND mapping.human_id = ?
            AND mapping.source <> 'excluded'
            AND mapping.deleted_at IS NULL
        )
      ORDER BY sessions.created_at DESC, sessions.id
    `,
    params: [humanId, humanId],
    mapRows: (rows) =>
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        sourceUpdatedAt: row.source_updated_at,
      })),
  });
  return data;
}

export async function searchContacts(
  query: string,
  limit: number,
): Promise<ContactSearchRecord[]> {
  const normalizedQuery = query.trim().toLowerCase();
  const rows = await liveQueryClient.execute<ContactSearchSqlRow>(
    `
      SELECT
        humans.id,
        humans.name,
        humans.email,
        humans.phone,
        humans.job_title,
        COALESCE(organizations.name, '') AS organization_name,
        humans.memo
      FROM humans
      LEFT JOIN organizations
        ON organizations.id = humans.organization_id
        AND organizations.deleted_at IS NULL
      WHERE humans.deleted_at IS NULL
        AND (
          ? = '' OR lower(
            humans.name || char(10) ||
            humans.email || char(10) ||
            humans.phone || char(10) ||
            humans.job_title || char(10) ||
            humans.memo || char(10) ||
            COALESCE(organizations.name, '') || char(10) ||
            COALESCE((
              SELECT group_concat(additional_email.value, char(10))
              FROM ${ADDITIONAL_EMAILS_JSON_EACH_SQL} AS additional_email
            ), '')
          ) LIKE '%' || ? || '%'
        )
      ORDER BY humans.created_at DESC, humans.id
      LIMIT ?
    `,
    [normalizedQuery, normalizedQuery, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email || null,
    phone: row.phone || null,
    jobTitle: row.job_title || null,
    organization: row.organization_name || null,
    memo: row.memo || null,
  }));
}

export function usePersonalContact(humanId: string) {
  return useLiveQuery<HumanSqlRow, HumanRecord | null>({
    sql: `SELECT *, ${AVATAR_SQL}, ${CONTACT_SUMMARY_SQL},
        ${ADDITIONAL_EMAILS_SQL}
      FROM humans WHERE id = ? AND deleted_at IS NULL`,
    params: [humanId],
    mapRows: (rows) => (rows[0] ? mapHumanRow(rows[0]) : null),
  });
}

function useHeldLiveQueryRows<T>(
  data: T[] | undefined,
  empty: T[],
  enabled: boolean,
): T[] {
  const previous = useRef(empty);
  if (data !== undefined) {
    previous.current = data;
  }
  if (!enabled) {
    previous.current = empty;
    return empty;
  }
  return data ?? previous.current;
}
