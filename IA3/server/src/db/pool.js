// PostgreSQL connection pool + transaction helper.
// Connection settings come from the standard PG* environment variables
// (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE) — see .env.example.
import pg from 'pg';

// Type parsing:
//  - TIMESTAMP (1114) and DATE (1082) are IST wall-clock values; keep them as plain strings
//    so Node never shifts them into the server's local timezone.
//  - NUMERIC (1700) money values fit comfortably in a JS number at this scale.
//  - BIGINT (20) is what COUNT(*) returns.
pg.types.setTypeParser(1114, (value) => value);
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));
pg.types.setTypeParser(20, (value) => Number.parseInt(value, 10));

export const pool = new pg.Pool({
  database: process.env.PGDATABASE || 'tn_transit',
  max: Number(process.env.PG_POOL_MAX || 10),
  options: '-c timezone=Asia/Kolkata',
});

pool.on('error', (err) => console.error('Idle PostgreSQL client error:', err.message));

/** Run a single parameterized statement on any pooled connection. */
export function query(text, params = []) {
  return pool.query(text, params);
}

/**
 * Run `work(client)` inside BEGIN ... COMMIT on ONE dedicated connection.
 * Every statement must use the `client` passed in (not `query`), otherwise it would
 * run on a different connection, outside the transaction. Any thrown error triggers
 * ROLLBACK, so partial work is never left behind.
 */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
