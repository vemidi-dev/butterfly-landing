'use strict';

const { json } = require('./lib/http');
const { consumeStoreHandoffCookie } = require('../lib/store-handoff-consume');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const result = consumeStoreHandoffCookie(req.headers.cookie || '');

  if (!result.ok) {
    return json(res, result.status || 400, { ok: false, error: result.error });
  }

  if (result.clearCookieHeader) {
    res.setHeader('Set-Cookie', result.clearCookieHeader);
  }

  res.setHeader('Cache-Control', 'no-store');
  return json(res, 200, { ok: true, formState: result.formState });
};
