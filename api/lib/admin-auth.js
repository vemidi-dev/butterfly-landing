const crypto = require('crypto');
const { getEnv } = require('./supabase');

const COOKIE_NAME = 'admin_session';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getSigningSecret() {
  return getEnv('ADMIN_PASSWORD');
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function signPayload(encodedPayload) {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');
}

function createSessionToken() {
  const secret = getSigningSecret();
  if (!secret) {
    const err = new Error('ADMIN_PASSWORD is not configured.');
    err.code = 'MISSING_ADMIN_PASSWORD';
    throw err;
  }

  const payload = {
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

function verifySessionToken(token) {
  const secret = getSigningSecret();
  if (!secret || !token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [encoded, signature] = parts;
  const expected = signPayload(encoded);
  if (!timingSafeEqual(signature, expected)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.role !== 'admin') return false;
    if (!payload.exp || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return;
    cookies[key] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

function getTokenFromRequest(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] || '';
}

function requireAdmin(req) {
  const token = getTokenFromRequest(req);
  if (!verifySessionToken(token)) {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  return token;
}

function buildSessionCookie(token) {
  const maxAge = Math.floor(TOKEN_TTL_MS / 1000);
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function buildClearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function verifyAdminPassword(password) {
  const expected = getEnv('ADMIN_PASSWORD');
  if (!expected) return false;
  return timingSafeEqual(password, expected);
}

module.exports = {
  COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
  getTokenFromRequest,
  requireAdmin,
  buildSessionCookie,
  buildClearSessionCookie,
  verifyAdminPassword,
};
