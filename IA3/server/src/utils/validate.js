// Small, explicit request validators. Each returns a clean value or throws HttpError(400).
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const fail = (message) => {
  throw new HttpError(400, message);
};

const isBlank = (value) => value === undefined || value === null || value === '';

export function int(value, name, { min = -2147483648, max = 2147483647, optional = false } = {}) {
  if (isBlank(value)) return optional ? null : fail(`${name} is required`);
  const n = Number(value);
  if (!Number.isInteger(n)) fail(`${name} must be a whole number`);
  if (n < min || n > max) fail(`${name} must be between ${min} and ${max}`);
  return n;
}

export function num(value, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if (isBlank(value)) return optional ? null : fail(`${name} is required`);
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`${name} must be a number`);
  if (n < min || n > max) fail(`${name} must be between ${min} and ${max}`);
  return Math.round(n * 100) / 100;
}

export function str(value, name, { min = 1, max = 255, optional = false, pattern, patternMessage } = {}) {
  if (isBlank(value) || (typeof value === 'string' && value.trim() === '')) {
    return optional ? null : fail(`${name} is required`);
  }
  if (typeof value !== 'string') fail(`${name} must be text`);
  const s = value.trim();
  if (s.length < min) fail(`${name} must be at least ${min} characters`);
  if (s.length > max) fail(`${name} must be at most ${max} characters`);
  if (pattern && !pattern.test(s)) fail(patternMessage || `${name} has an invalid format`);
  return s;
}

export function oneOf(value, name, allowed, { optional = false } = {}) {
  if (isBlank(value)) return optional ? null : fail(`${name} is required`);
  if (!allowed.includes(value)) fail(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

export function bool(value, name, { optional = false } = {}) {
  if (isBlank(value)) return optional ? null : fail(`${name} is required`);
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fail(`${name} must be true or false`);
}

export function date(value, name, { optional = false } = {}) {
  const s = str(value, name, { optional, pattern: /^\d{4}-\d{2}-\d{2}$/, patternMessage: `${name} must be YYYY-MM-DD` });
  if (s && Number.isNaN(Date.parse(`${s}T00:00:00Z`))) fail(`${name} is not a valid date`);
  return s;
}

export function time(value, name, { optional = false } = {}) {
  return str(value, name, {
    optional,
    pattern: /^([01]\d|2[0-3]):[0-5]\d$/,
    patternMessage: `${name} must be HH:MM (24-hour)`,
  });
}

export const email = (value, name = 'Email') =>
  str(value, name, { max: 150, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, patternMessage: `${name} is not a valid email address` }).toLowerCase();

export const phone = (value, name = 'Phone') =>
  str(value, name, { pattern: /^[6-9]\d{9}$/, patternMessage: `${name} must be a 10-digit Indian mobile number` });

/** Comma-separated list from a query string, e.g. "0,2" -> [0, 2]. */
export function list(value, mapItem = (x) => x) {
  if (isBlank(value)) return null;
  const items = String(value).split(',').map((x) => x.trim()).filter(Boolean).map(mapItem);
  return items.length ? items : null;
}
