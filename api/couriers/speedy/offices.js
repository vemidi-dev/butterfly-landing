const { json, setCors, handleOptions } = require('../../../lib/http');
const { getCityFromReq, fetchOffices } = require('../../../lib/courier-offices');

module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (handleOptions(req, res, 'GET, OPTIONS')) return;

  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const city = getCityFromReq(req);
  if (city.length < 2) {
    return json(res, 400, { ok: false, error: 'Въведи поне 2 символа за град.' });
  }

  try {
    const offices = await fetchOffices('speedy', city);
    return json(res, 200, { ok: true, offices });
  } catch (err) {
    if (err.code === 'MISSING_COURIER_ENV') {
      return json(res, 500, { ok: false, error: 'Липсва конфигурация за Спиди API.' });
    }
    console.error('[couriers/speedy/offices]', {
      status: err.status || null,
      message: err.message,
    });
    return json(res, 502, { ok: false, error: 'Неуспешно зареждане на офиси от Спиди.' });
  }
};
