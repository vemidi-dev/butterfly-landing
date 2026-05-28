const { json, setCors, handleOptions } = require('./lib/http');
const { fetchOffices } = require('./lib/courier-offices');

function getParams(req) {
  const url = new URL(req.url, 'http://localhost');
  return {
    courier: String(url.searchParams.get('courier') || '').trim().toLowerCase(),
    city: String(url.searchParams.get('city') || '').trim(),
  };
}

module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (handleOptions(req, res, 'GET, OPTIONS')) return;

  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const { courier, city } = getParams(req);
  if (!['econt', 'speedy'].includes(courier)) {
    return json(res, 400, { ok: false, error: 'Невалиден courier. Използвай econt или speedy.' });
  }
  if (city.length < 2) {
    return json(res, 400, { ok: false, error: 'Въведи поне 2 символа за град.' });
  }

  try {
    const offices = await fetchOffices(courier, city);
    return json(res, 200, { ok: true, offices });
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
    console.error('[couriers]', { courier, status: err.status || null, message: err.message });
    return json(res, 502, {
      ok: false,
      error:
        courier === 'econt'
          ? 'Неуспешно зареждане на офиси от Еконт.'
          : 'Неуспешно зареждане на офиси от Спиди.',
    });
  }
};
