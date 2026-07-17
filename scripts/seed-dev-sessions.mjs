import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const email = (process.env.DEV_SEED_EMAIL ?? "dev@syntheo.local").toLowerCase();

const pool = new Pool({ connectionString: databaseUrl });

// ── Helpers ────────────────────────────────────────────────────────────────

const parseTs = (ts) => {
  const [m, s] = ts.split(":").map(Number);
  return m * 60 + s;
};

const blocksToSegments = (blocks, speakers, durationS) => {
  const speakerMap = Object.fromEntries(speakers.map((sp) => [sp.id, sp.name]));
  return blocks.map((block, i) => ({
    speaker: speakerMap[block.speakerId] ?? block.speakerId,
    start: parseTs(block.ts),
    end: i < blocks.length - 1 ? parseTs(blocks[i + 1].ts) : durationS,
    text: block.text,
  }));
};

// ── Données mock converties ────────────────────────────────────────────────

const sessions = [
  {
    jobId: "11111111-1111-4111-a111-111111111111",
    name: "réunion-cadrage-mvp.mp3",
    durationMin: 42,
    speakers: [
      { id: "sp1", name: "Marianne R." },
      { id: "sp2", name: "Thomas V." },
      { id: "sp3", name: "Julie P." },
      { id: "sp4", name: "Henri L. (DPD)" },
    ],
    blocks: [
      {
        speakerId: "sp1",
        ts: "00:12",
        text: "Bonjour à tous. Avant de commencer, je vous rappelle que cette réunion est enregistrée et transcrite par Syntheo, un système d'intelligence artificielle. Vous avez tous été informés de cet enregistrement et avez donné votre accord. Le compte rendu sera disponible dans les minutes qui suivent la fin de la réunion.",
      },
      {
        speakerId: "sp2",
        ts: "01:03",
        text: "Parfait. L'ordre du jour d'aujourd'hui couvre trois points : la validation de l'architecture technique du MVP, le cadrage réglementaire avec Henri, et la définition du plan d'action priorisé. On a environ quarante minutes.",
      },
      {
        speakerId: "sp3",
        ts: "04:22",
        text: "Donc côté technique, on reste sur le VPS OVH. Tout tourne en Docker Swarm avec un rolling release pour le zéro downtime. WhisperX et vLLM sont dans des containers isolés, sans aucun port exposé à l'extérieur. Le frontend Next.js est le seul point d'entrée, via Traefik en reverse proxy avec TLS 1.3.",
      },
      {
        speakerId: "sp2",
        ts: "05:44",
        text: "Et pour l'observabilité, on a choisi OpenTelemetry comme collecteur central, avec Grafana pour les dashboards, Loki pour les logs et Tempo pour les traces distribuées. MLflow gère la traçabilité des inférences — chaque compte rendu sera lié à un run_id précis. C'est ce qui nous couvre sur l'IA Act.",
      },
      {
        speakerId: "sp4",
        ts: "18:45",
        text: "Ce qui me rassure c'est l'absence de conservation audio. C'est la décision la plus déterminante pour le périmètre de l'AIPD. On reste sur des données biométriques traitées de manière éphémère — ça change complètement le niveau de risque. Le point qui restera toujours en risque résiduel modéré, c'est le consentement des participants tiers. La dialog box est nécessaire, mais ce n'est pas une base légale en soi.",
      },
      {
        speakerId: "sp1",
        ts: "20:12",
        text: "On a prévu de traiter ça dans les CGU — l'utilisateur reconnaît explicitement être responsable d'avoir informé ses interlocuteurs. Le timestamp et le hash du consentement sont loggés en base à chaque session. Est-ce que ça vous convient comme mécanisme de preuve ?",
      },
      {
        speakerId: "sp4",
        ts: "20:58",
        text: "C'est le mécanisme raisonnable que la CNIL attend. Ce qu'il faut impérativement ajouter dans les CGU, c'est une clause qui décrit les conséquences pour l'utilisateur en cas de non-respect — perte de responsabilité de Syntheo, engagement de l'utilisateur à assumer les réclamations. Et je veux voir l'AIPD finalisée avant toute mise en production publique. C'est non-négociable.",
      },
      {
        speakerId: "sp3",
        ts: "38:10",
        text: "Pour le plan d'action, on a huit points. Les trois bloquants avant production : l'AIPD, le déploiement de Vault pour la gestion des clés, et le chiffrement LUKS du volume PostgreSQL. Tout le reste — CGU, droits utilisateurs, MFA, Loki append-only — c'est la V1 mais pas bloquant à proprement parler.",
      },
    ],
  },
  {
    jobId: "22222222-2222-4222-a222-222222222222",
    name: "revue-technique-backend.mp3",
    durationMin: 68,
    speakers: [
      { id: "sp5", name: "Thomas V." },
      { id: "sp6", name: "Karim B." },
    ],
    blocks: [
      {
        speakerId: "sp5",
        ts: "00:14",
        text: "On démarre par la revue des endpoints de transcription. Le rate-limiting est en place, mais il faut encore brancher le circuit breaker vers WhisperX.",
      },
      {
        speakerId: "sp6",
        ts: "01:40",
        text: "Côté queue, RabbitMQ tient la charge en test. Je propose qu'on ajoute un dead-letter queue avant la mise en prod.",
      },
      {
        speakerId: "sp5",
        ts: "22:30",
        text: "Sur la dette technique, le plus urgent reste la migration du store de sessions vers Postgres — on est encore sur du in-memory.",
      },
    ],
  },
  {
    jobId: "33333333-3333-4333-a333-333333333333",
    name: "point-dpd-conformite.mp3",
    durationMin: 28,
    speakers: [
      { id: "sp7", name: "Henri L. (DPD)" },
      { id: "sp8", name: "Marianne R." },
    ],
    blocks: [
      {
        speakerId: "sp7",
        ts: "00:20",
        text: "Je veux qu'on formalise le registre des traitements avant la prochaine revue. La base légale reste l'intérêt légitime pour la transcription, mais le consentement des tiers doit être documenté séparément.",
      },
      {
        speakerId: "sp8",
        ts: "02:05",
        text: "On peut ajouter une bannière de consentement obligatoire avant le démarrage de chaque session, avec horodatage loggé côté serveur.",
      },
    ],
  },
];

// ── Insertion ────────────────────────────────────────────────────────────────

try {
  const {
    rows: [user],
  } = await pool.query("SELECT uid FROM app_user WHERE email = $1", [email]);

  if (!user) {
    throw new Error(
      `Utilisateur ${email} introuvable. Lancez seed-dev-user.mjs d'abord.`,
    );
  }

  for (const session of sessions) {
    const durationS = session.durationMin * 60;
    const segments = blocksToSegments(
      session.blocks,
      session.speakers,
      durationS,
    );
    const txt = session.blocks.map((b) => b.text).join("\n\n");

    const transcriptPayload = {
      input: {
        filename: session.name,
        mimeType: "audio/mpeg",
        size: 0,
      },
      job: {
        status: "completed",
        job_id: session.jobId,
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
        user.uid,
      ]);
      await pool.query(
        `INSERT INTO app_session (user_uid, job_id, status, transcript_payload, exports_payload)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
         ON CONFLICT (job_id) DO NOTHING`,
        [
          user.uid,
          session.jobId,
          "completed",
          JSON.stringify(transcriptPayload),
          JSON.stringify(exportsPayload),
        ],
      );
      await pool.query("COMMIT");
      console.log(`Seeded: ${session.name}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  }

  console.log(`Done — ${sessions.length} sessions seedées pour ${email}.`);
} catch (err) {
  console.error("Erreur lors du seed :", err);
  process.exit(1);
} finally {
  await pool.end();
}
