// Registration, login/logout (server-side sessions) and the profile.
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { HttpError, email, phone, str } from '../utils/validate.js';

const SQL = {
  insertUser: `
    INSERT INTO users (full_name, email, phone, password_hash)
    VALUES ($1, $2, $3, $4)
    RETURNING user_id, full_name, email, phone, role, created_at`,
  findByEmail: `SELECT * FROM users WHERE lower(email) = lower($1)`,
  updateProfile: `
    UPDATE users SET full_name = $2, phone = $3
    WHERE user_id = $1
    RETURNING user_id, full_name, email, phone, role, created_at`,
  passwordHash: `SELECT password_hash FROM users WHERE user_id = $1`,
  updatePassword: `UPDATE users SET password_hash = $2 WHERE user_id = $1`,
  // Profile statistics: aggregate over the user's bookings.
  stats: `
    SELECT COUNT(*)                                                         AS total_bookings,
           COUNT(*) FILTER (WHERE booking_status = 'CONFIRMED')             AS confirmed_bookings,
           COUNT(*) FILTER (WHERE booking_status = 'CANCELLED')             AS cancelled_bookings,
           COALESCE(SUM(total_amount) FILTER (WHERE booking_status = 'CONFIRMED'), 0) AS total_spent
    FROM bookings WHERE user_id = $1`,
};

const BCRYPT_ROUNDS = 10;
const password = (value, name = 'Password') => str(value, name, { min: 8, max: 72 });

function startSession(req, user) {
  return new Promise((resolve, reject) => {
    // Regenerate the session id at login to prevent session fixation.
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.user_id;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

const publicUser = ({ password_hash: _omit, ...user }) => user;

export async function register(req, res) {
  const fullName = str(req.body.full_name, 'Full name', { min: 2, max: 100 });
  const userEmail = email(req.body.email);
  const userPhone = phone(req.body.phone);
  const pass = password(req.body.password);
  if (!/[A-Za-z]/.test(pass) || !/\d/.test(pass)) {
    throw new HttpError(400, 'Password must contain at least one letter and one number');
  }
  const hash = await bcrypt.hash(pass, BCRYPT_ROUNDS);
  // The unique index on lower(email) rejects duplicates -> 409 via the error handler.
  const { rows } = await query(SQL.insertUser, [fullName, userEmail, userPhone, hash]);
  await startSession(req, rows[0]);
  res.status(201).json(rows[0]);
}

export async function login(req, res) {
  const userEmail = email(req.body.email);
  const pass = str(req.body.password, 'Password', { max: 72 });
  const { rows } = await query(SQL.findByEmail, [userEmail]);
  const user = rows[0];
  // Same message for unknown email and wrong password (do not reveal which accounts exist).
  if (!user || !(await bcrypt.compare(pass, user.password_hash))) {
    throw new HttpError(401, 'Incorrect email or password');
  }
  await startSession(req, user);
  res.json(publicUser(user));
}

export function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('tnt.sid');
    res.status(204).end();
  });
}

export async function me(req, res) {
  if (!req.user) return res.json(null);
  const { rows } = await query(SQL.stats, [req.user.user_id]);
  res.json({ ...req.user, stats: rows[0] });
}

export async function updateProfile(req, res) {
  const fullName = str(req.body.full_name, 'Full name', { min: 2, max: 100 });
  const userPhone = phone(req.body.phone);
  const { rows } = await query(SQL.updateProfile, [req.user.user_id, fullName, userPhone]);
  res.json(rows[0]);
}

export async function changePassword(req, res) {
  const current = str(req.body.current_password, 'Current password', { max: 72 });
  const next = password(req.body.new_password, 'New password');
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) {
    throw new HttpError(400, 'New password must contain at least one letter and one number');
  }
  const { rows } = await query(SQL.passwordHash, [req.user.user_id]);
  if (!(await bcrypt.compare(current, rows[0].password_hash))) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  await query(SQL.updatePassword, [req.user.user_id, await bcrypt.hash(next, BCRYPT_ROUNDS)]);
  res.status(204).end();
}
