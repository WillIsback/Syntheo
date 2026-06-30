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
		await client.query(
			`SET LOCAL app.enc_key = '${encKey.replace(/'/g, "''")}'`,
		);
		if (userId) {
			await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
		}
		return client;
	} catch (err) {
		client.release();
		throw err;
	}
}
