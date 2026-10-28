import { query } from '../db/pool.js';
import { HttpError } from '../utils/validate.js';

// Loads the logged-in user from the database on every request that carries a session.
// The role is re-read from the users table each time, so a demoted admin loses access
// immediately rather than when their session expires.
export async function attachUser(req, _res, next) {
  req.user = null;
  const userId = req.session?.userId;
  if (userId) {
    const { rows } = await query(
      'SELECT user_id, full_name, email, phone, role, created_at FROM users WHERE user_id = $1',
      [userId],
    );
    req.user = rows[0] ?? null;
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Please log in to continue');
  next();
}

// Server-side role check. Hiding admin links in React is only cosmetic; this is the real guard.
export function requireAdmin(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Please log in to continue');
  if (req.user.role !== 'ADMIN') throw new HttpError(403, 'Administrator access required');
  next();
}
