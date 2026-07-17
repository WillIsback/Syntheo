import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const accountsFile =
  process.env.SEED_USERS_FILE ?? "scripts/seed-users.local.json";

let accounts;
try {
  accounts = JSON.parse(readFileSync(accountsFile, "utf8"));
} catch (error) {
  throw new Error(
    `Could not read accounts file at "${accountsFile}" (set SEED_USERS_FILE to override). ` +
      `Copy scripts/seed-users.example.json, fill in real accounts, and keep it out of git. ` +
      `Original error: ${error.message}`,
  );
}

const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

const generatePassword = (length = 14) =>
  Array.from(
    { length },
    () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)],
  ).join("");

const pool = new Pool({ connectionString: databaseUrl });

const results = [];

for (const account of accounts) {
  const password = generatePassword();
  const hash = await bcrypt.hash(password, 10);

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
    [account.email, account.firstname, account.lastname, hash, account.role],
  );

  results.push({ ...account, password });
}

await pool.end();

console.log(
  "Comptes créés/mis à jour (chaque exécution régénère les mots de passe) :\n",
);
for (const r of results) {
  console.log(`${r.email.padEnd(28)} ${r.password.padEnd(16)} (${r.role})`);
}
