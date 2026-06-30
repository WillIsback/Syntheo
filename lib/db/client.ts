import { Pool, type PoolClient } from "pg";
import { getEncryptionKey } from "./vault";

let pool: Pool | null = null;

export function getPool(): Pool {
	if (!pool) {
		pool = new Pool({
			host: process.env.POSTGRES_HOST ?? "postgres",
			port: Number(process.env.POSTGRES_PORT ?? 5432),
			database: process.env.POSTGRES_DB ?? "syntheo",
			user: process.env.POSTGRES_APP_USER ?? "app",
			password: process.env.POSTGRES_APP_PASSWORD,
			max: 10,
		});
	}
	return pool;
}

export async function getDb(userId?: string): Promise<PoolClient> {
	const client = await getPool().connect();
	try {
		const encKey = await getEncryptionKey();
		// set_config works outside transactions (unlike SET LOCAL which is a no-op in autocommit)
		await client.query("SELECT set_config('app.enc_key', $1, false)", [encKey]);
		if (userId) {
			await client.query(
				"SELECT set_config('app.current_user_id', $1, false)",
				[userId],
			);
		}
		return client;
	} catch (err) {
		client.release();
		throw err;
	}
}
