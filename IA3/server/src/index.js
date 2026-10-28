import 'dotenv/config';
import { createApp } from './app.js';
import { pool } from './db/pool.js';

const port = Number(process.env.PORT || 4000);

try {
  await pool.query('SELECT 1');
} catch (err) {
  console.error(`Cannot connect to PostgreSQL (${err.message}). Check server/.env, then run: npm run db:setup`);
  process.exit(1);
}

createApp().listen(port, () => {
  console.log(`TN Transit API listening on http://localhost:${port}`);
});
