import crypto from 'node:crypto';

const buckets = new Map();
let lastCleanupAt = 0;

const clientAddress = (req) => {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown').slice(0, 128);
};

const compactKey = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const cleanupBuckets = (now) => {
  if (now - lastCleanupAt < 60_000) return;
  lastCleanupAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

export const assertJsonBodyLimit = (req, maxBytes = 2_000_000) => {
  const contentLength = Number(req.headers?.['content-length'] || 0);
  let actualBytes = contentLength;
  if (!actualBytes && req.body !== undefined) {
    try { actualBytes = Buffer.byteLength(JSON.stringify(req.body), 'utf8'); } catch { actualBytes = maxBytes + 1; }
  }
  if (actualBytes > maxBytes) {
    const error = new Error(`Ukuran request melebihi batas ${Math.floor(maxBytes / 1_000_000)} MB.`);
    error.statusCode = 413;
    error.code = 'PAYLOAD_TOO_LARGE';
    throw error;
  }
};

export const enforceBurstLimit = (req, res, {
  namespace = 'api',
  identity = '',
  limit = 120,
  windowMs = 60_000
} = {}) => {
  const now = Date.now();
  cleanupBuckets(now);
  const source = identity || clientAddress(req);
  const key = `${namespace}:${compactKey(source)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    const error = new Error('Terlalu banyak request. Silakan tunggu sebentar.');
    error.statusCode = 429;
    error.code = 'RATE_LIMITED';
    throw error;
  }
};

export const getClientAddress = clientAddress;
