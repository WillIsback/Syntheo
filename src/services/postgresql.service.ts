import { and, desc, eq, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "@/db/schema";
import { appReport, appSession, appTemplate } from "@/db/schema";
import type { ParsedSessionRow } from "@/lib/sessions";
import { parseSessionRow } from "@/lib/sessions";

export const dbListSessions = async (
  userUid: string,
  scopedDb: NodePgDatabase<typeof schema>,
): Promise<ParsedSessionRow[]> => {
  const rows = await scopedDb
    .select()
    .from(appSession)
    .where(eq(appSession.userUid, userUid))
    .orderBy(desc(appSession.createdAt));

  return rows.map(parseSessionRow);
};

export type ParsedReportRow = typeof appReport.$inferSelect;

export const dbGetSession = async (
  sessionId: string,
  userUid: string,
  scopedDb: NodePgDatabase<typeof schema>,
): Promise<(ParsedSessionRow & { report: ParsedReportRow | null }) | null> => {
  const [sessionRow] = await scopedDb
    .select()
    .from(appSession)
    .where(and(eq(appSession.id, sessionId), eq(appSession.userUid, userUid)))
    .limit(1);

  if (!sessionRow) return null;

  const [reportRow] = await scopedDb
    .select()
    .from(appReport)
    .where(
      and(eq(appReport.sessionId, sessionId), eq(appReport.userUid, userUid)),
    )
    .limit(1);

  return { ...parseSessionRow(sessionRow), report: reportRow ?? null };
};

export const dbSaveReport = async (
  data: {
    sessionId: string;
    userUid: string;
    templateId: string;
    templateName: string;
    modelTag: string;
    speakerNames: Record<string, string>;
    sections: Array<{ title: string; body: string }>;
  },
  scopedDb: NodePgDatabase<typeof schema>,
): Promise<ParsedReportRow> => {
  const [row] = await scopedDb
    .insert(appReport)
    .values(data)
    .onConflictDoUpdate({
      target: appReport.sessionId,
      set: {
        templateId: data.templateId,
        templateName: data.templateName,
        modelTag: data.modelTag,
        speakerNames: data.speakerNames,
        sections: data.sections,
        createdAt: new Date().toISOString(),
      },
    })
    .returning();

  return row;
};

export const dbDeleteSession = async (
  sessionId: string,
  userUid: string,
  scopedDb: NodePgDatabase<typeof schema>,
): Promise<boolean> => {
  const [deleted] = await scopedDb
    .delete(appSession)
    .where(and(eq(appSession.id, sessionId), eq(appSession.userUid, userUid)))
    .returning({ id: appSession.id });

  return !!deleted;
};

export const dbRenameSession = async (
  sessionId: string,
  userUid: string,
  name: string,
  scopedDb: NodePgDatabase<typeof schema>,
): Promise<ParsedSessionRow | null | "conflict"> => {
  const [conflict] = await scopedDb
    .select({ id: appSession.id })
    .from(appSession)
    .where(
      and(
        eq(appSession.userUid, userUid),
        eq(appSession.name, name),
        ne(appSession.id, sessionId),
      ),
    )
    .limit(1);

  if (conflict) return "conflict";

  const [row] = await scopedDb
    .update(appSession)
    .set({ name, updatedAt: new Date().toISOString() })
    .where(and(eq(appSession.id, sessionId), eq(appSession.userUid, userUid)))
    .returning();

  return row ? parseSessionRow(row) : null;
};

export const dbUpdateSpeakerNames = async (
  sessionId: string,
  userUid: string,
  speakerNames: Record<string, string>,
  scopedDb: NodePgDatabase<typeof schema>,
): Promise<boolean> => {
  const [row] = await scopedDb
    .update(appSession)
    .set({ speakerNames, updatedAt: new Date().toISOString() })
    .where(and(eq(appSession.id, sessionId), eq(appSession.userUid, userUid)))
    .returning({ id: appSession.id });
  return !!row;
};

export type ParsedTemplateRow = typeof appTemplate.$inferSelect;

export const dbListTemplates = async (
  userUid: string,
  scopedDb: NodePgDatabase<typeof schema>,
): Promise<ParsedTemplateRow[]> => {
  return scopedDb
    .select()
    .from(appTemplate)
    .where(eq(appTemplate.userUid, userUid))
    .orderBy(desc(appTemplate.createdAt));
};

export const dbGetTemplate = async (
  id: string,
  userUid: string,
  scopedDb: NodePgDatabase<typeof schema>,
): Promise<ParsedTemplateRow | null> => {
  const [row] = await scopedDb
    .select()
    .from(appTemplate)
    .where(and(eq(appTemplate.id, id), eq(appTemplate.userUid, userUid)))
    .limit(1);
  return row ?? null;
};

export const dbCreateTemplate = async (
  data: {
    userUid: string;
    name: string;
    description?: string | null;
    icon?: string;
    content: string;
  },
  scopedDb: NodePgDatabase<typeof schema>,
): Promise<ParsedTemplateRow> => {
  const [row] = await scopedDb
    .insert(appTemplate)
    .values({
      userUid: data.userUid,
      name: data.name,
      description: data.description ?? null,
      icon: data.icon ?? "📝",
      content: data.content,
    })
    .returning();
  return row;
};

export const dbUpdateTemplate = async (
  id: string,
  userUid: string,
  data: {
    name?: string;
    description?: string | null;
    icon?: string;
    content?: string;
  },
  scopedDb: NodePgDatabase<typeof schema>,
): Promise<ParsedTemplateRow | null> => {
  const updates: Partial<typeof appTemplate.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (data.name !== undefined) updates.name = data.name;
  if ("description" in data) updates.description = data.description;
  if (data.icon !== undefined) updates.icon = data.icon;
  if (data.content !== undefined) updates.content = data.content;

  const [row] = await scopedDb
    .update(appTemplate)
    .set(updates)
    .where(and(eq(appTemplate.id, id), eq(appTemplate.userUid, userUid)))
    .returning();
  return row ?? null;
};

export const dbDeleteTemplate = async (
  id: string,
  userUid: string,
  scopedDb: NodePgDatabase<typeof schema>,
): Promise<boolean> => {
  const [deleted] = await scopedDb
    .delete(appTemplate)
    .where(and(eq(appTemplate.id, id), eq(appTemplate.userUid, userUid)))
    .returning({ id: appTemplate.id });
  return !!deleted;
};
