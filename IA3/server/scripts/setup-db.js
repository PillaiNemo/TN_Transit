// Creates the database (if missing) and runs the SQL files in order:
//   schema.sql -> functions.sql -> views.sql -> seed.sql
// Usage:  npm run db:setup            (all four files)
//         npm run db:setup -- --no-seed
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(here, '../../database');
const dbName = process.env.PGDATABASE || 'tn_transit';
const files = ['schema.sql', 'functions.sql', 'views.sql'];
if (!process.argv.includes('--no-seed')) files.push('seed.sql');

if (!/^[a-z_][a-z0-9_]*$/.test(dbName)) {
  console.error(`Refusing unusual database name "${dbName}"`);
  process.exit(1);
}

async function ensureDatabase() {
  const admin = new pg.Client({ database: process.env.PG_ADMIN_DATABASE || 'postgres' });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (rowCount === 0) {
    // Identifiers cannot be parameterised; dbName was validated by the regex above.
    await admin.query(`CREATE DATABASE ${dbName} ENCODING 'UTF8' TEMPLATE template0`);
    console.log(`Created database ${dbName}`);
  }
  await admin.end();
}

async function runFiles() {
  const client = new pg.Client({ database: dbName });
  await client.connect();
  await client.query(`ALTER DATABASE ${dbName} SET timezone TO 'Asia/Kolkata'`);
  await client.query(`SET timezone TO 'Asia/Kolkata'`);
  for (const file of files) {
    const started = Date.now();
    await client.query(fs.readFileSync(path.join(sqlDir, file), 'utf8'));
    console.log(`  ran ${file.padEnd(14)} (${Date.now() - started} ms)`);
  }
  const { rows } = await client.query(`
    SELECT (SELECT count(*) FROM services)  AS services,
           (SELECT count(*) FROM schedules) AS schedules,
           (SELECT count(*) FROM seats)     AS seats,
           (SELECT count(*) FROM bookings)  AS bookings`);
  console.log('  loaded:', rows[0]);
  await client.end();
}

try {
  console.log(`Setting up "${dbName}" on ${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}`);
  await ensureDatabase();
  await runFiles();
  console.log('Database ready.');
} catch (err) {
  console.error('\nDatabase setup failed:', err.message);
  if (err.where) console.error(err.where);
  process.exit(1);
}
