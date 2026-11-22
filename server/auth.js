import crypto from 'node:crypto';

const COOKIE_NAME = 'moneta_session';
const SESSION_TTL_SEC = 60 * 10; // 10 minutes idle timeout

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function parseCookies(header = '') {
  const result = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(val);
  }
  return result;
}

export function createAuth({ secret } = {}) {
  const signingKey = sha256(secret || process.env.AUTH_SECRET || 'moneta-default-session-secret-change-me');
  const isProd = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');

  function signToken(userId, exp) {
    const payload = `v2.${userId}.${exp}`;
    const sig = crypto.createHmac('sha256', signingKey).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== 'v2') return null;
    const userId = Number(parts[1]);
    const exp = Number(parts[2]);
    if (!Number.isInteger(userId) || userId < 1) return null;
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
    const expected = signToken(userId, exp);
    if (!safeEqual(token, expected)) return null;
    return { userId };
  }

  function getSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    return verifyToken(cookies[COOKIE_NAME]);
  }

  function setSessionCookie(res, userId) {
    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
    const token = signToken(userId, exp);
    const attrs = [
      `${COOKIE_NAME}=${encodeURIComponent(token)}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Lax',
      `Max-Age=${SESSION_TTL_SEC}`,
    ];
    if (isProd) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
  }

  function clearSessionCookie(res) {
    const attrs = [
      `${COOKIE_NAME}=`,
      'HttpOnly',
      'Path=/',
      'SameSite=Lax',
      'Max-Age=0',
    ];
    if (isProd) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
  }

  function requireAuth(req, res, next) {
    const session = getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Sesi berakhir. Silakan login kembali.' });
    }
    req.userId = session.userId;
    setSessionCookie(res, session.userId);
    return next();
  }

  return {
    getSession,
    setSessionCookie,
    clearSessionCookie,
    requireAuth,
  };
}
