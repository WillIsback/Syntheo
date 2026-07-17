import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const password = process.env.DEV_SEED_PASSWORD;
if (!password) {
  throw new Error("DEV_SEED_PASSWORD is required.");
}

const email = (process.env.DEV_SEED_EMAIL ?? "dev@syntheo.local").toLowerCase();
const fullName = process.env.DEV_SEED_NAME ?? "Dev User";
const role = process.env.DEV_SEED_ROLE ?? "admin";
const [firstname, ...lastnameParts] = fullName.trim().split(/\s+/);
const lastname = lastnameParts.join(" ");

const pool = new Pool({ connectionString: databaseUrl });

const hash = await bcrypt.hash(password, 12);

await pool.query(
  `
    INSERT INTO app_user (email, firstname, lastname, password_hash, role)
    VALUES ($1, $2, $3, $4, $5::app_role)
    ON CONFLICT (email) DO UPDATE
    SET firstname = EXCLUDED.firstname,
        lastname = EXCLUDED.lastname,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        updated_at = NOW()
  `,
  [email, firstname || "Dev", lastname, hash, role],
);

await pool.end();

console.log(`Seeded user: ${email} (role: ${role})`);
