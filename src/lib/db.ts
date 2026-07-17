import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "@/db/schema";

const globalForDb = globalThis as unknown as {
  pool?: Pool;
  drizzleDb?: NodePgDatabase<typeof schema>;
};

const UUID_LIKE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DbTransaction<T> = (client: PoolClient) => Promise<T>;

export const getPool = (): Pool => {
  if (globalForDb.pool) {
    return globalForDb.pool;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  globalForDb.pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  return globalForDb.pool;
};

export const getDb = () => {
  if (globalForDb.drizzleDb) {
    return globalForDb.drizzleDb;
  }

  globalForDb.drizzleDb = drizzle(getPool(), { schema });
  return globalForDb.drizzleDb;
};

export const withTransaction = async <T>(
  transaction: DbTransaction<T>,
): Promise<T> => {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await transaction(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Runs a transaction with Postgres RLS context pinned to one authenticated user.
 * The app_session RLS policies rely on app.user_uid being set per transaction.
 */
export const withUserDbContext = async <T>(
  userUid: string,
  transaction: DbTransaction<T>,
): Promise<T> => {
  if (!UUID_LIKE_REGEX.test(userUid)) {
    throw new Error("Invalid user UID for DB context.");
  }

  return withTransaction(async (client) => {
    await client.query("SELECT set_config('app.user_uid', $1, true)", [
      userUid,
    ]);
    return transaction(client);
  });
};
