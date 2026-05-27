function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string' && body.length) {
    try {
      body = JSON.parse(body);
    } catch {
      return { error: 'Invalid JSON body.' };
    }
  }
  if (body && typeof body === 'object') return { body };
  return { body: {} };
}

function setCors(res, methods = 'GET, POST, PATCH, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );
}

function handleOptions(req, res, methods) {
  if (req.method === 'OPTIONS') {
    setCors(res, methods);
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { json, parseBody, setCors, handleOptions };
