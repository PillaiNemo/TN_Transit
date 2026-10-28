import connectPgSimple from 'connect-pg-simple';
import express from 'express';
import session from 'express-session';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db/pool.js';
import { attachUser } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import publicRoutes from './routes/publicRoutes.js';

const PgSession = connectPgSimple(session);
const isProduction = process.env.NODE_ENV === 'production';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (isProduction) app.set('trust proxy', 1);

  app.use(express.json({ limit: '100kb' }));

  // Server-managed sessions: the browser holds only a signed, httpOnly cookie with the
  // session id; the session data itself is a row in the user_sessions table.
  app.use(session({
    name: 'tnt.sid',
    store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 1000 * 60 * 60 * 24 * 7 },
  }));
  app.use(attachUser);

  app.get('/api/health', async (_req, res) => {
    const { rows } = await pool.query('SELECT now() AS db_time, current_database() AS database');
    res.json({ status: 'ok', ...rows[0] });
  });
  app.use('/api', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));

  // In production, serve the built React app from client/dist.
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
