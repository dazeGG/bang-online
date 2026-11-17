import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Append-only list of schema migrations. Never edit an applied migration; add a new one.
 * Migrations are embedded in code so the compiled server needs no extra asset copy step.
 */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'private_lobby',
    sql: `
      CREATE TABLE rooms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL UNIQUE CHECK (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$'),
        ruleset_id text NOT NULL,
        status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby')),
        host_seat_id uuid,
        revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE seats (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
        seat_index smallint NOT NULL CHECK (seat_index BETWEEN 0 AND 6),
        display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 24),
        token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
        ready boolean NOT NULL DEFAULT false,
        joined_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT seats_room_seat_index_key UNIQUE (room_id, seat_index)
      );

      CREATE UNIQUE INDEX seats_room_name_key ON seats (room_id, lower(display_name));

      ALTER TABLE rooms
        ADD CONSTRAINT rooms_host_seat_fk FOREIGN KEY (host_seat_id)
        REFERENCES seats (id) ON DELETE SET NULL;
    `,
  },
  {
    version: 2,
    name: 'short_room_codes',
    sql: `
      ALTER TABLE rooms DROP CONSTRAINT rooms_code_check;
      ALTER TABLE rooms ADD CONSTRAINT rooms_code_check
        CHECK (code ~ '^([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}|[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10})$');
    `,
  },
  {
    version: 3,
    name: 'durable_classic_matches',
    sql: `
      ALTER TABLE rooms DROP CONSTRAINT rooms_status_check;
      ALTER TABLE rooms ADD CONSTRAINT rooms_status_check
        CHECK (status IN ('lobby', 'active', 'finished', 'aborted'));
      ALTER TABLE seats ADD CONSTRAINT seats_room_id_id_key UNIQUE (room_id, id);

      CREATE TABLE matches (
        id uuid PRIMARY KEY,
        room_id uuid NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE RESTRICT,
        revision integer NOT NULL CHECK (revision > 0),
        status text NOT NULL CHECK (status IN ('active', 'finished', 'aborted')),
        state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (id, room_id)
      );
      CREATE TABLE match_participants (
        match_id uuid NOT NULL,
        room_id uuid NOT NULL,
        seat_id uuid NOT NULL,
        PRIMARY KEY (match_id, seat_id),
        UNIQUE (room_id, seat_id),
        FOREIGN KEY (match_id, room_id) REFERENCES matches(id, room_id) ON DELETE RESTRICT,
        FOREIGN KEY (room_id, seat_id) REFERENCES seats(room_id, id) ON DELETE RESTRICT
      );
      CREATE TABLE game_command_receipts (
        room_id uuid NOT NULL,
        actor_seat_id uuid NOT NULL,
        command_id text NOT NULL CHECK (char_length(command_id) BETWEEN 1 AND 128),
        match_id uuid NOT NULL,
        fingerprint text NOT NULL,
        receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (room_id, actor_seat_id, command_id),
        FOREIGN KEY (match_id, room_id) REFERENCES matches(id, room_id) ON DELETE RESTRICT,
        FOREIGN KEY (room_id, actor_seat_id) REFERENCES match_participants(room_id, seat_id) ON DELETE RESTRICT
      );
    `,
  },
];

const MIGRATION_LOCK_KEY = 'bang:schema-migrations';

async function ensureMigrationTable(db: Queryable) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedVersions(db: Queryable): Promise<Set<number>> {
  const exists = await db.query<{ exists: boolean }>(
    `SELECT to_regclass('schema_migrations') IS NOT NULL AS exists`,
  );
  if (!exists.rows[0]?.exists) return new Set();

  const result = await db.query<{ version: number }>('SELECT version FROM schema_migrations');
  return new Set(result.rows.map((row) => row.version));
}

export async function pendingMigrations(db: Queryable): Promise<Migration[]> {
  const applied = await appliedVersions(db);
  const known = new Set(migrations.map((migration) => migration.version));
  const unknown = [...applied].filter((version) => !known.has(version));
  if (unknown.length > 0) {
    throw new Error('The database schema is newer than this server build.');
  }
  return migrations.filter((migration) => !applied.has(migration.version));
}

/** Applies pending migrations in order, each atomically, under a session advisory lock. */
export async function migrate(pool: Pool): Promise<number[]> {
  const client = await pool.connect();
  const applied: number[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_KEY]);
    try {
      await ensureMigrationTable(client);
      for (const migration of await pendingMigrations(client)) {
        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
            migration.version,
            migration.name,
          ]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
        applied.push(migration.version);
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
  return applied;
}
