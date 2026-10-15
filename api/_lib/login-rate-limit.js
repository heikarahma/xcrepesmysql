import crypto from 'node:crypto';
import { getClientAddress } from './request-guard.js';

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

export const getLoginRateIdentity = (req, username) => {
  const addressHash = hash(getClientAddress(req));
  return {
    rateKey: hash(`${addressHash}:${String(username).toLowerCase()}`),
    addressHash
  };
};

export const assertLoginAllowed = async (db, rateKey, res) => {
  const [rows] = await db.execute(
    'SELECT blocked_until FROM login_rate_limits WHERE rate_key = ? LIMIT 1',
    [rateKey]
  );
  const blockedUntil = rows[0]?.blocked_until ? new Date(rows[0].blocked_until) : null;
  if (blockedUntil && blockedUntil.getTime() > Date.now()) {
    const retryAfter = Math.max(1, Math.ceil((blockedUntil.getTime() - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    const error = new Error('Terlalu banyak percobaan login. Coba lagi dalam 15 menit.');
    error.statusCode = 429;
    error.code = 'LOGIN_RATE_LIMITED';
    throw error;
  }
};

export const recordLoginFailure = async (db, { rateKey, addressHash, username }, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT failed_attempts, window_started_at, blocked_until FROM login_rate_limits WHERE rate_key = ? FOR UPDATE',
      [rateKey]
    );
    const now = Date.now();
    const current = rows[0];
    const windowStartedAt = current?.window_started_at ? new Date(current.window_started_at).getTime() : 0;
    const expired = !windowStartedAt || now - windowStartedAt >= WINDOW_MS;
    const failedAttempts = expired ? 1 : Number(current.failed_attempts || 0) + 1;
    const blockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now + WINDOW_MS) : null;

    await connection.execute(
      `INSERT INTO login_rate_limits
        (rate_key, username, ip_hash, failed_attempts, window_started_at, blocked_until)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         username = VALUES(username), ip_hash = VALUES(ip_hash),
         failed_attempts = VALUES(failed_attempts), window_started_at = VALUES(window_started_at),
         blocked_until = VALUES(blocked_until), updated_at = CURRENT_TIMESTAMP(3)`,
      [rateKey, username, addressHash, failedAttempts, new Date(expired ? now : windowStartedAt), blockedUntil]
    );
    await connection.commit();

    if (blockedUntil) {
      res.setHeader('Retry-After', String(Math.ceil(WINDOW_MS / 1000)));
      const error = new Error('Terlalu banyak percobaan login. Coba lagi dalam 15 menit.');
      error.statusCode = 429;
      error.code = 'LOGIN_RATE_LIMITED';
      throw error;
    }
  } catch (error) {
    try { await connection.rollback(); } catch { /* transaction might already be committed */ }
    throw error;
  } finally {
    connection.release();
  }
};

export const clearLoginFailures = async (db, rateKey) => {
  await db.execute('DELETE FROM login_rate_limits WHERE rate_key = ?', [rateKey]);
};
