const { json, setCors, handleOptions } = require('./lib/http');
const { fetchOffices } = require('./lib/courier-offices');

function getParams(req) {
  const url = new URL(req.url, 'http://localhost');
  return {
    courier: String(url.searchParams.get('courier') || '').trim().toLowerCase(),
    city: String(url.searchParams.get('city') || '').trim(),
    debug: url.searchParams.get('debug') === '1',
  };
}

function canUseDebug(reqDebug) {
  if (!reqDebug) return false;
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.ALLOW_COURIER_DEBUG === '1';
}

module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (handleOptions(req, res, 'GET, OPTIONS')) return;

  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const { courier, city, debug: requestedDebug } = getParams(req);
  const debug = canUseDebug(requestedDebug);
  if (!['econt', 'speedy'].includes(courier)) {
    return json(res, 400, { ok: false, error: 'Невалиден courier. Използвай econt или speedy.' });
  }
  if (city.length < 2) {
    return json(res, 400, { ok: false, error: 'Въведи поне 2 символа за град.' });
  }

  try {
    const result = await fetchOffices(courier, city, { debug });
    const offices = debug ? result.offices : result;
    const payload = { ok: true, offices };
    if (debug) payload.debug = result.debugInfo;
    return json(res, 200, payload);
  } catch (err) {
    if (err.code === 'MISSING_COURIER_ENV') {
      return json(res, 500, {
        ok: false,
        error:
          courier === 'econt'
            ? 'Липсва конфигурация за Еконт API.'
            : 'Липсва конфигурация за Спиди API.',
      });
    }
    console.error('[couriers]', {
      courier,
      status: err.status || null,
      message: err.message,
      debug: debug ? err.debugInfo || null : null,
    });
    const payload = {
      ok: false,
      error:
        courier === 'econt'
          ? 'Неуспешно зареждане на офиси от Еконт.'
          : 'Неуспешно зареждане на офиси от Спиди.',
    };
    if (debug && err.debugInfo) payload.debug = err.debugInfo;
    return json(res, 502, payload);
  }
};
