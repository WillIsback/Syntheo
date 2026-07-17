import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { blocksToSegments, mockSessions } from "./mock-sessions-data.mjs";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const accountsFile =
  process.env.SEED_USERS_FILE ?? "scripts/seed-users.local.json";

let accounts;
try {
  accounts = JSON.parse(readFileSync(accountsFile, "utf8"));
} catch (error) {
  throw new Error(
    `Could not read accounts file at "${accountsFile}" (set SEED_USERS_FILE to override). ` +
      `Original error: ${error.message}`,
  );
}

const pool = new Pool({ connectionString: databaseUrl });

const seedForUser = async (userUid, email) => {
  let seeded = 0;
  for (const session of mockSessions) {
    const durationS = session.durationMin * 60;
    const segments = blocksToSegments(
      session.blocks,
      session.speakers,
      durationS,
    );
    const txt = session.blocks.map((b) => b.text).join("\n\n");

    const transcriptPayload = {
      input: { filename: session.name, mimeType: "audio/mpeg", size: 0 },
      job: {
        status: "completed",
        job_id: randomUUID(),
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        error: null,
        duration_s: durationS,
        num_speakers: session.speakers.length,
        segments,
      },
      error: null,
    };
    const exportsPayload = { txt };

    await pool.query("BEGIN");
    try {
      await pool.query("SELECT set_config('app.user_uid', $1, true)", [
        userUid,
      ]);
      const { rows: existing } = await pool.query(
        "SELECT 1 FROM app_session WHERE user_uid = $1 AND name = $2",
        [userUid, session.name],
      );
      if (existing.length > 0) {
        await pool.query("COMMIT");
        continue;
      }
      await pool.query(
        `INSERT INTO app_session (user_uid, job_id, name, status, transcript_payload, exports_payload)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [
          userUid,
          transcriptPayload.job.job_id,
          session.name,
          "completed",
          JSON.stringify(transcriptPayload),
          JSON.stringify(exportsPayload),
        ],
      );
      await pool.query("COMMIT");
      seeded += 1;
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  }
  console.log(
    `${email}: ${seeded} session(s) seedée(s), ${mockSessions.length - seeded} déjà présente(s).`,
  );
};

try {
  for (const account of accounts) {
    const {
      rows: [user],
    } = await pool.query("SELECT uid FROM app_user WHERE email = $1", [
      account.email.toLowerCase(),
    ]);

    if (!user) {
      console.warn(`Ignoré (utilisateur introuvable) : ${account.email}`);
      continue;
    }

    await seedForUser(user.uid, account.email);
  }

  console.log("Terminé.");
} finally {
  await pool.end();
}
