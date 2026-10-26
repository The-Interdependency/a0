#!/bin/bash
set -e

npm install
pip install -e . --quiet

# Pre-create any tables that drizzle-kit push would otherwise prompt about
# interactively (it uses a TTY picker for rename disambiguation; stdin is
# closed in the post-merge runner so the prompt hangs until timeout).
# Adding tables here is safe — node will no-op if the table already exists.
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stmts = [
  \`CREATE TABLE IF NOT EXISTS bandit_arms (
    id SERIAL PRIMARY KEY,
    domain TEXT NOT NULL,
    arm_name TEXT NOT NULL,
    pulls INTEGER NOT NULL DEFAULT 0,
    total_reward REAL NOT NULL DEFAULT 0,
    avg_reward REAL NOT NULL DEFAULT 0,
    ema_reward REAL NOT NULL DEFAULT 0,
    ucb_score REAL NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_pulled TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )\`
];
Promise.all(stmts.map(s => pool.query(s)))
  .then(() => { console.log('[post-merge] pre-create tables ok'); pool.end(); })
  .catch(e => { console.error('[post-merge] pre-create error:', e.message); pool.end(); process.exit(1); });
"

npm run db:push -- --force
python scripts/annotate.py
