// PostgreSQL access and migrations for the A0 application database.
// OpenBao owns a separate database and role; see operations/README.md.
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const query = (text, params) => pool.query(text, params);

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const MIGRATIONS = [
  {
    version: '0001_initial',
    up: `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      user_agent TEXT,
      ip TEXT
    );
    CREATE INDEX sessions_user_idx ON sessions(user_id);

    CREATE TABLE projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT 'New conversation',
      harness_version TEXT NOT NULL,
      context_policy JSONB NOT NULL DEFAULT '{"mode":"all","selectedMessageIds":[]}',
      archived BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX conversations_user_idx ON conversations(user_id);

    CREATE TABLE participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      settings JSONB NOT NULL DEFAULT '{}',
      credential_ref TEXT NOT NULL DEFAULT '',
      capabilities JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX participants_user_idx ON participants(user_id);

    CREATE TABLE messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
      content TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text',
      status TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('complete','streaming','stopped','failed','partial')),
      provider TEXT,
      model TEXT,
      participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
      round INTEGER NOT NULL DEFAULT 0,
      parent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
      included_in_context BOOLEAN NOT NULL DEFAULT true,
      meta JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX messages_conversation_idx ON messages(conversation_id, round, created_at);

    CREATE TABLE attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
      message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('image','file','audio')),
      mime TEXT NOT NULL,
      filename TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('uploading','ready','delivering','failed','removed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX attachments_user_idx ON attachments(user_id);

    CREATE TABLE context_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      harness_version TEXT NOT NULL,
      snapshot JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(conversation_id, round)
    );

    CREATE TABLE runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      harness_version TEXT NOT NULL,
      snapshot_id UUID REFERENCES context_snapshots(id) ON DELETE SET NULL,
      mode TEXT NOT NULL DEFAULT 'single' CHECK (mode IN ('single','compare')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','streaming','complete','stopped','failed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    );
    CREATE INDEX runs_conversation_idx ON runs(conversation_id, round);

    CREATE TABLE run_participants (
      run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','streaming','complete','stopped','failed')),
      error TEXT,
      usage JSONB,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      PRIMARY KEY (run_id, participant_id)
    );

    CREATE TABLE tool_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      requester_participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
      executor_participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
      mcp_connection_id UUID,
      tool_name TEXT NOT NULL,
      arguments JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','authorized','executing','complete','failed','cancelled','unknown')),
      result JSONB,
      error TEXT,
      idempotency_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX tool_actions_conversation_idx ON tool_actions(conversation_id, created_at);

    CREATE TABLE mcp_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none','bearer','header')),
      vault_ref TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT true,
      allow_private_network BOOLEAN NOT NULL DEFAULT false,
      tools JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','connecting','connected','failed','disabled')),
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE credential_references (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL UNIQUE,
      vault_path TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE usage_observations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
      participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    `,
  },
  {
    version: '0002_context_and_usage',
    up: `
    ALTER TABLE usage_observations ADD COLUMN IF NOT EXISTS cache_read_tokens INTEGER;
    ALTER TABLE usage_observations ADD COLUMN IF NOT EXISTS cache_write_tokens INTEGER;
    ALTER TABLE usage_observations ADD COLUMN IF NOT EXISTS reasoning_tokens INTEGER;
    ALTER TABLE usage_observations ADD COLUMN IF NOT EXISTS raw_usage JSONB;

    CREATE TABLE context_revisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      parent_revision_id UUID REFERENCES context_revisions(id) ON DELETE SET NULL,
      blocks JSONB NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(conversation_id, revision)
    );
    CREATE INDEX context_revisions_conversation_idx ON context_revisions(conversation_id, revision DESC);

    ALTER TABLE runs ADD COLUMN IF NOT EXISTS context_revision_id UUID REFERENCES context_revisions(id) ON DELETE SET NULL;
    `,
  },
  {
    version: '0003_owner_settings',
    up: `
    ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
    `,
  },
  {
    version: '0004_agents_and_modules',
    up: `
    CREATE TABLE agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      forge_template_id TEXT NOT NULL,
      effective_instructions TEXT NOT NULL,
      original_definition JSONB NOT NULL,
      participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
      conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
      context_revision_id UUID REFERENCES context_revisions(id) ON DELETE SET NULL,
      task TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      parent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
      root_id UUID REFERENCES agents(id) ON DELETE SET NULL,
      lineage JSONB NOT NULL DEFAULT '[]'::jsonb,
      tool_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
      budget JSONB NOT NULL DEFAULT '{}'::jsonb,
      ptcna_summary JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      retired_at TIMESTAMPTZ
    );
    CREATE INDEX agents_user_idx ON agents(user_id, created_at DESC);

    CREATE TABLE agent_modules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      schema_version INTEGER NOT NULL DEFAULT 1,
      renderer TEXT NOT NULL DEFAULT 'agent-panel',
      descriptor JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      previous_renderer TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      retired_at TIMESTAMPTZ
    );
    CREATE INDEX agent_modules_agent_idx ON agent_modules(agent_id, created_at DESC);
    `,
  },
];

export async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const done = new Set(
    (await query('SELECT version FROM schema_migrations')).rows.map((r) => r.version),
  );
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await withTransaction(async (client) => {
      await client.query(m.up);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
    });
    console.log(`[db] applied migration ${m.version}`);
  }
}
