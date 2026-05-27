const { json, setCors, handleOptions } = require('../lib/http');
const { verifySessionToken, getTokenFromRequest } = require('../lib/admin-auth');

module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (handleOptions(req, res, 'GET, OPTIONS')) return;

  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const token = getTokenFromRequest(req);
  const valid = verifySessionToken(token);
  return json(res, 200, { ok: true, authenticated: valid });
};
