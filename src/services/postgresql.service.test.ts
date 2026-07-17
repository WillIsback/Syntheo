import assert from "node:assert/strict";
import test from "node:test";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/db/schema";
import {
  dbCreateTemplate,
  dbDeleteTemplate,
  dbGetSession,
  dbGetTemplate,
  dbListSessions,
  dbListTemplates,
  dbRenameSession,
  dbUpdateTemplate,
} from "@/services/postgresql.service";

const USER_UID = "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74";
const SESSION_ID = "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899";
const JOB_ID = "b6507a86-0d79-43db-8c09-8eb76cb2633b";

const BASE_PAYLOAD = {
  input: { filename: "meeting.wav", mimeType: "audio/wav", size: 1024 },
  job: null,
  error: null,
};

const makeRow = (overrides = {}) => ({
  id: SESSION_ID,
  userUid: USER_UID,
  jobId: JOB_ID,
  name: "meeting.wav",
  status: "completed" as const,
  createdAt: "2026-07-11T11:56:21.049142+00:00",
  updatedAt: "2026-07-11T11:56:21.049142+00:00",
  transcriptPayload: BASE_PAYLOAD,
  exportsPayload: null,
  ...overrides,
});

const asScopedDb = <T>(db: T) => db as unknown as NodePgDatabase<typeof schema>;

// ── Builders qui simulent la chaîne Drizzle ──────────────────────────────────

// dbGetSession uses two sequential queries:
//   1. select().from(appSession).where().limit()  → session row
//   2. select().from(appReport).where().limit()   → report row
class LimitResult {
  constructor(private readonly rows: unknown[]) {}
  async limit() {
    return this.rows;
  }
}
class LimitWhere {
  constructor(private readonly rows: unknown[]) {}
  where() {
    return new LimitResult(this.rows);
  }
}
class LimitFrom {
  constructor(private readonly rows: unknown[]) {}
  from() {
    return new LimitWhere(this.rows);
  }
}
// TwoQueryDb: first select() returns sessionRows, second returns reportRows
class LimitSelect {
  private callCount = 0;
  constructor(
    private readonly sessionRows: unknown[],
    private readonly reportRows: unknown[] = [],
  ) {}
  select() {
    const rows = this.callCount === 0 ? this.sessionRows : this.reportRows;
    this.callCount++;
    return new LimitFrom(rows);
  }
}

class OrderResult {
  constructor(
    private readonly rows: unknown[],
    private readonly onOrderBy: () => void,
  ) {}
  async orderBy() {
    this.onOrderBy();
    return this.rows;
  }
}
class OrderWhere {
  constructor(
    private readonly rows: unknown[],
    private readonly onOrderBy: () => void,
  ) {}
  where() {
    return new OrderResult(this.rows, this.onOrderBy);
  }
}
class OrderFrom {
  constructor(
    private readonly rows: unknown[],
    private readonly onOrderBy: () => void,
  ) {}
  from() {
    return new OrderWhere(this.rows, this.onOrderBy);
  }
}
class OrderSelect {
  constructor(
    private readonly rows: unknown[],
    private readonly onOrderBy: () => void,
  ) {}
  select() {
    return new OrderFrom(this.rows, this.onOrderBy);
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("dbListSessions retourne les sessions parsées et appelle orderBy", async () => {
  let orderByCalled = false;
  const row = makeRow();
  const db = asScopedDb(
    new OrderSelect([row], () => {
      orderByCalled = true;
    }),
  );

  const result = await dbListSessions(USER_UID, db);

  assert.equal(orderByCalled, true);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, SESSION_ID);
});

test("dbListSessions retourne un tableau vide si aucune session", async () => {
  const db = asScopedDb(new OrderSelect([], () => {}));

  const result = await dbListSessions(USER_UID, db);

  assert.deepEqual(result, []);
});

test("dbGetSession retourne la session parsée si elle existe", async () => {
  const row = makeRow();
  const db = asScopedDb(new LimitSelect([row], []));

  const result = await dbGetSession(SESSION_ID, USER_UID, db);

  assert.ok(result !== null);
  assert.equal(result.id, SESSION_ID);
  assert.equal(result.jobId, JOB_ID);
  assert.equal(result.report, null);
});

test("dbGetSession retourne null si aucune ligne trouvée", async () => {
  const db = asScopedDb(new LimitSelect([], []));

  const result = await dbGetSession(SESSION_ID, USER_UID, db);

  assert.equal(result, null);
});

// ── Template constants ────────────────────────────────────────────────────────

const TEMPLATE_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const TEMPLATE_CONTENT = "#Section\nDécris le contenu de cette section.";

const makeTemplateRow = (overrides = {}) => ({
  id: TEMPLATE_ID,
  userUid: USER_UID,
  name: "Mon template",
  description: null,
  icon: "📝",
  content: TEMPLATE_CONTENT,
  createdAt: "2026-07-15T10:00:00.000+00:00",
  updatedAt: "2026-07-15T10:00:00.000+00:00",
  ...overrides,
});

// ── Template mock builders ────────────────────────────────────────────────────

class TplReturning {
  constructor(private readonly rows: unknown[]) {}
  async returning() {
    return this.rows;
  }
}
class TplWhere {
  constructor(private readonly rows: unknown[]) {}
  where() {
    return new TplReturning(this.rows);
  }
  async returning() {
    return this.rows;
  }
}
class TplValuesSet {
  constructor(private readonly rows: unknown[]) {}
  values() {
    return new TplReturning(this.rows);
  }
  set() {
    return new TplWhere(this.rows);
  }
}
class TplFromWhere {
  constructor(private readonly rows: unknown[]) {}
  from() {
    return new TplFromWhereChain(this.rows);
  }
  insert() {
    return new TplValuesSet(this.rows);
  }
  update() {
    return new TplValuesSet(this.rows);
  }
  delete() {
    return new TplWhere(this.rows);
  }
}
class TplFromWhereChain {
  constructor(private readonly rows: unknown[]) {}
  where() {
    return new TplOrderLimit(this.rows);
  }
}
class TplOrderLimit {
  constructor(private readonly rows: unknown[]) {}
  async orderBy() {
    return this.rows;
  }
  where() {
    return new TplLimitResult(this.rows);
  }
  async limit() {
    return this.rows;
  }
}
class TplLimitResult {
  constructor(private readonly rows: unknown[]) {}
  async limit() {
    return this.rows;
  }
}

class TplDb {
  constructor(private readonly rows: unknown[]) {}
  select() {
    return new TplFromWhere(this.rows);
  }
  insert() {
    return new TplValuesSet(this.rows);
  }
  update() {
    return new TplValuesSet(this.rows);
  }
  delete() {
    return new TplWhere(this.rows);
  }
}

// ── Template CRUD tests ───────────────────────────────────────────────────────

test("dbListTemplates retourne les templates", async () => {
  const row = makeTemplateRow();
  const db = asScopedDb(new TplDb([row]));
  const result = await dbListTemplates(USER_UID, db);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, TEMPLATE_ID);
  assert.equal(result[0].content, TEMPLATE_CONTENT);
});

test("dbListTemplates retourne un tableau vide", async () => {
  const db = asScopedDb(new TplDb([]));
  const result = await dbListTemplates(USER_UID, db);
  assert.deepEqual(result, []);
});

test("dbGetTemplate retourne le template si trouvé", async () => {
  const row = makeTemplateRow();
  const db = asScopedDb(new TplDb([row]));
  const result = await dbGetTemplate(TEMPLATE_ID, USER_UID, db);
  assert.ok(result !== null);
  assert.equal(result?.id, TEMPLATE_ID);
  assert.equal(result?.content, TEMPLATE_CONTENT);
});

test("dbGetTemplate retourne null si non trouvé", async () => {
  const db = asScopedDb(new TplDb([]));
  const result = await dbGetTemplate(TEMPLATE_ID, USER_UID, db);
  assert.equal(result, null);
});

test("dbCreateTemplate retourne la ligne créée", async () => {
  const row = makeTemplateRow();
  const db = asScopedDb(new TplDb([row]));
  const result = await dbCreateTemplate(
    {
      userUid: USER_UID,
      name: "Mon template",
      icon: "📝",
      content: TEMPLATE_CONTENT,
    },
    db,
  );
  assert.equal(result.id, TEMPLATE_ID);
  assert.equal(result.content, TEMPLATE_CONTENT);
});

test("dbDeleteTemplate retourne true si supprimé", async () => {
  const db = asScopedDb(new TplDb([{ id: TEMPLATE_ID }]));
  const result = await dbDeleteTemplate(TEMPLATE_ID, USER_UID, db);
  assert.equal(result, true);
});

test("dbDeleteTemplate retourne false si non trouvé", async () => {
  const db = asScopedDb(new TplDb([]));
  const result = await dbDeleteTemplate(TEMPLATE_ID, USER_UID, db);
  assert.equal(result, false);
});

test("dbUpdateTemplate retourne la ligne mise à jour", async () => {
  const updated = makeTemplateRow({ name: "Modifié" });
  const db = asScopedDb(new TplDb([updated]));
  const result = await dbUpdateTemplate(
    TEMPLATE_ID,
    USER_UID,
    { name: "Modifié" },
    db,
  );
  assert.ok(result !== null);
  assert.equal(result?.name, "Modifié");
});

test("dbUpdateTemplate retourne null si non trouvé", async () => {
  const db = asScopedDb(new TplDb([]));
  const result = await dbUpdateTemplate(
    TEMPLATE_ID,
    USER_UID,
    { name: "Modifié" },
    db,
  );
  assert.equal(result, null);
});

// ── RenameSession mock builder ────────────────────────────────────────────────

class RenameDb {
  constructor(
    private readonly conflictRows: unknown[],
    private readonly updatedRows: unknown[],
  ) {}

  select() {
    this.callCount++;
    const conflictRows = this.conflictRows;
    return {
      from: () => ({
        where: () => ({
          limit: async () => conflictRows,
        }),
      }),
    };
  }

  update() {
    const updatedRows = this.updatedRows;
    return {
      set: () => ({
        where: () => ({
          returning: async () => updatedRows,
        }),
      }),
    };
  }
}

// ── dbRenameSession tests ─────────────────────────────────────────────────────

test("dbRenameSession renomme la session si le nom est unique", async () => {
  const row = makeRow();
  const renamed = { ...row, name: "Nouveau nom" };
  const db = new RenameDb([], [renamed]);

  const result = await dbRenameSession(
    SESSION_ID,
    USER_UID,
    "Nouveau nom",
    asScopedDb(db),
  );

  assert.ok(result !== null && result !== "conflict");
  assert.equal(result.name, "Nouveau nom");
});

test("dbRenameSession retourne 'conflict' si le nom est déjà utilisé", async () => {
  const row = makeRow({ id: "autre-session-id" });
  const db = new RenameDb([row], []);

  const result = await dbRenameSession(
    SESSION_ID,
    USER_UID,
    "meeting.wav",
    asScopedDb(db),
  );

  assert.equal(result, "conflict");
});

test("dbRenameSession retourne null si la session n'existe pas", async () => {
  const db = new RenameDb([], []);

  const result = await dbRenameSession(
    SESSION_ID,
    USER_UID,
    "Nouveau nom",
    asScopedDb(db),
  );

  assert.equal(result, null);
});
