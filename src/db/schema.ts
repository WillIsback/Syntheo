import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const appRoleEnum = pgEnum("app_role", ["admin", "user"]);

export const appUser = pgTable("app_user", {
  uid: uuid("uid").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  firstname: text("firstname").notNull(),
  lastname: text("lastname").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: appRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "string",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "string",
  })
    .defaultNow()
    .notNull(),
});

export const externalIdentity = pgTable(
  "external_identity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userUid: uuid("user_uid")
      .references(() => appUser.uid, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    subjectId: text("subject_id").notNull(),
    email: text("email"),
    claimsJson: jsonb("claims_json"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique().on(table.provider, table.subjectId),
    index("external_identity_user_id_idx").on(table.userUid),
  ],
);

export const appSession = pgTable(
  "app_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userUid: uuid("user_uid")
      .references(() => appUser.uid, { onDelete: "cascade" })
      .notNull(),
    jobId: uuid("job_id").notNull().unique(),
    name: text("name").notNull(),
    status: text("status")
      .$type<"pending" | "processing" | "completed" | "failed">()
      .default("pending")
      .notNull(),
    transcriptPayload: jsonb("transcript_payload").notNull(),
    exportsPayload: jsonb("exports_payload"),
    speakerNames: jsonb("speaker_names")
      .notNull()
      .default({})
      .$type<Record<string, string>>(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("app_session_user_uid_idx").on(table.userUid),
    index("app_session_created_at_idx").on(table.createdAt),
  ],
);

export const appUserRelations = relations(appUser, ({ many }) => ({
  identities: many(externalIdentity),
  sessions: many(appSession),
  templates: many(appTemplate),
}));

export const externalIdentityRelations = relations(
  externalIdentity,
  ({ one }) => ({
    user: one(appUser, {
      fields: [externalIdentity.userUid],
      references: [appUser.uid],
    }),
  }),
);

export const appTemplate = pgTable(
  "app_template",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userUid: uuid("user_uid")
      .references(() => appUser.uid, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon").notNull().default("📝"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("app_template_user_uid_idx").on(table.userUid)],
);

export const appReport = pgTable("app_report", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .references(() => appSession.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  userUid: uuid("user_uid")
    .references(() => appUser.uid, { onDelete: "cascade" })
    .notNull(),
  templateId: text("template_id").notNull(),
  templateName: text("template_name").notNull(),
  modelTag: text("model_tag").notNull(),
  speakerNames: jsonb("speaker_names")
    .notNull()
    .$type<Record<string, string>>(),
  sections: jsonb("sections")
    .notNull()
    .$type<Array<{ title: string; body: string }>>(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "string",
  })
    .defaultNow()
    .notNull(),
});

export const appSessionRelations = relations(appSession, ({ one }) => ({
  user: one(appUser, {
    fields: [appSession.userUid],
    references: [appUser.uid],
  }),
  report: one(appReport, {
    fields: [appSession.id],
    references: [appReport.sessionId],
  }),
}));

export const appTemplateRelations = relations(appTemplate, ({ one }) => ({
  user: one(appUser, {
    fields: [appTemplate.userUid],
    references: [appUser.uid],
  }),
}));

export const appReportRelations = relations(appReport, ({ one }) => ({
  session: one(appSession, {
    fields: [appReport.sessionId],
    references: [appSession.id],
  }),
  user: one(appUser, {
    fields: [appReport.userUid],
    references: [appUser.uid],
  }),
}));
