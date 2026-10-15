import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const TOKEN_TTL_SECONDS = 12 * 60 * 60;

const base64url = (value) => Buffer.from(value).toString('base64url');

const getSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    const error = new Error('AUTH_SECRET wajib diisi minimal 32 karakter.');
    error.statusCode = 503;
    throw error;
  }
  return secret;
};

const sign = (payload) => crypto
  .createHmac('sha256', getSecret())
  .update(payload)
  .digest('base64url');

export const createSessionToken = (user) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: user.id,
    username: user.username,
    role: user.role,
    branchIds: Array.isArray(user.branchIds) ? user.branchIds : [],
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  }));
  return `${payload}.${sign(payload)}`;
};

export const verifySessionToken = (token) => {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const getRequestUser = (req) => {
  const header = req.headers.authorization || '';
  return verifySessionToken(header.startsWith('Bearer ') ? header.slice(7) : '');
};

export const requireUser = (req) => {
  const user = getRequestUser(req);
  if (!user) {
    const error = new Error('Sesi tidak valid atau sudah berakhir. Silakan login kembali.');
    error.statusCode = 401;
    throw error;
  }
  return user;
};

export const isAdmin = (user) => ['superadmin', 'admin', 'kepala_toko'].includes(user?.role);

export const verifyPassword = async (plain, stored) => {
  if (!stored) return false;
  if (stored.startsWith('$2')) return bcrypt.compare(plain, stored);
  const left = Buffer.from(String(plain));
  const right = Buffer.from(String(stored));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

export const hashPassword = (password) => bcrypt.hash(password, 12);

export const sendError = (res, error) => {
  const status = error.statusCode || 500;
  const isServerError = status >= 500;
  if (isServerError) console.error(error);
  res.status(status).json({
    data: null,
    error: {
      message: isServerError && process.env.NODE_ENV === 'production'
        ? 'Terjadi kesalahan pada server.'
        : error.message,
      code: error.code || `HTTP_${status}`
    }
  });
};
