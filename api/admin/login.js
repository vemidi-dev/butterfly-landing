const { json, parseBody, setCors, handleOptions } = require('../lib/http');
const {
  verifyAdminPassword,
  createSessionToken,
  buildSessionCookie,
  buildClearSessionCookie,
  isAdminPasswordConfigured,
} = require('../lib/admin-auth');

module.exports = async function handler(req, res) {
  setCors(res, 'POST, DELETE, OPTIONS');
  if (handleOptions(req, res, 'POST, DELETE, OPTIONS')) return;

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', buildClearSessionCookie());
    return json(res, 200, { ok: true });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const parsed = parseBody(req);
  if (parsed.error) return json(res, 400, { ok: false, error: parsed.error });

  const password = String(parsed.body.password || '').trim();
  if (!password) {
    return json(res, 400, { ok: false, error: 'Въведи парола.' });
  }

  if (!isAdminPasswordConfigured()) {
    console.error('[admin/login] ADMIN_PASSWORD is not set');
    return json(res, 500, {
      ok: false,
      error: 'ADMIN_PASSWORD не е зададен в Vercel. Добави променливата и направи Redeploy.',
    });
  }

  if (!verifyAdminPassword(password)) {
    return json(res, 401, { ok: false, error: 'Грешна парола.' });
  }

  try {
    const token = createSessionToken();
    res.setHeader('Set-Cookie', buildSessionCookie(token));
    return json(res, 200, { ok: true, token });
  } catch (err) {
    console.error('[admin/login]', err.message);
    if (err.code === 'MISSING_ADMIN_PASSWORD') {
      return json(res, 500, {
        ok: false,
        error: 'ADMIN_PASSWORD не е конфигуриран на сървъра.',
      });
    }
    return json(res, 500, { ok: false, error: 'Възникна проблем при входа.' });
  }
};
