import { sql } from "@vercel/postgres";

export async function ensureConversationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id                  SERIAL PRIMARY KEY,
      session_id          TEXT,
      thread_id           TEXT,
      qualtrics_id        TEXT,
      prolific_id         TEXT,
      prolific_system_id  TEXT,
      condition           TEXT,
      source_url          TEXT,
      role                TEXT,
      message             TEXT,
      item_id             TEXT UNIQUE,
      thread_created_at   TIMESTAMPTZ,
      message_created_at  TIMESTAMPTZ,
      inserted_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function saveMessageToDB(params: {
  session_id: string;
  thread_id: string;
  qualtrics_id: string | null;
  prolific_id: string | null;
  prolific_system_id: string | null;
  condition: string | null;
  source_url: string | null;
  role: string;
  message: string;
  item_id: string;
  thread_created_at: Date | null;
  message_created_at: Date | null;
}) {
  await sql`
    INSERT INTO conversations (
      session_id, thread_id, qualtrics_id, prolific_id,
      prolific_system_id, condition, source_url,
      role, message, item_id,
      thread_created_at, message_created_at
    )
    VALUES (
      ${params.session_id}, ${params.thread_id}, ${params.qualtrics_id},
      ${params.prolific_id}, ${params.prolific_system_id}, ${params.condition},
      ${params.source_url}, ${params.role}, ${params.message}, ${params.item_id},
      ${params.thread_created_at?.toISOString() ?? null},
      ${params.message_created_at?.toISOString() ?? null}
    )
    ON CONFLICT (item_id) DO NOTHING
  `;
}