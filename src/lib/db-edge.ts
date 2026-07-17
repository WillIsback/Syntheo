import { Pool, type PoolClient } from "@neondatabase/serverless";

const globalForEdgeDb = globalThis as unknown as {
  edgePool?: Pool;
};

const UUID_LIKE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EdgeDbTransaction<T> = (client: PoolClient) => Promise<T>;

/**
 * WebSocket-based Postgres pool for Edge Runtime routes, where `pg` (TCP)
 * cannot run. Mirrors getPool()/withUserDbContext() in db.ts for Node routes.
 */
export const getEdgePool = (): Pool => {
  if (globalForEdgeDb.edgePool) {
    return globalForEdgeDb.edgePool;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  globalForEdgeDb.edgePool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  return globalForEdgeDb.edgePool;
};

export const withUserDbContextEdge = async <T>(
  userUid: string,
  transaction: EdgeDbTransaction<T>,
): Promise<T> => {
  if (!UUID_LIKE_REGEX.test(userUid)) {
    throw new Error("Invalid user UID for DB context.");
  }

  const client = await getEdgePool().connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_uid', $1, true)", [
      userUid,
    ]);
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
