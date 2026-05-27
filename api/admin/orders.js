const { json, parseBody, setCors, handleOptions } = require('../lib/http');
const { requireAdmin } = require('../lib/admin-auth');
const { listOrders, updateOrderStatus, mapSupabaseError } = require('../lib/supabase');
const { mapOrderRow } = require('../lib/orders-format');
const { ORDER_STATUSES, STATUS_LABELS } = require('../lib/constants');

module.exports = async function handler(req, res) {
  setCors(res, 'GET, PATCH, OPTIONS');
  if (handleOptions(req, res, 'GET, PATCH, OPTIONS')) return;

  try {
    requireAdmin(req);
  } catch {
    return json(res, 401, { ok: false, error: 'Необходим е вход в админ панела.' });
  }

  if (req.method === 'GET') {
    try {
      const url = new URL(req.url, 'http://localhost');
      const status = url.searchParams.get('status') || 'all';
      const search = url.searchParams.get('q') || '';

      const rows = await listOrders({ status, search });
      const orders = (rows || []).map(mapOrderRow);

      return json(res, 200, {
        ok: true,
        orders,
        statuses: ORDER_STATUSES.map((value) => ({
          value,
          label: STATUS_LABELS[value],
        })),
      });
    } catch (err) {
      console.error('[admin/orders] GET failed:', err.message);
      const mapped = mapSupabaseError(res, err);
      if (mapped) return mapped;
      return json(res, 500, { ok: false, error: 'Неуспешно зареждане на поръчките.' });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = parseBody(req);
    if (parsed.error) return json(res, 400, { ok: false, error: parsed.error });

    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id') || parsed.body.id;
    const status = String(parsed.body.status || '').trim();

    if (!id) return json(res, 400, { ok: false, error: 'Липсва ID на поръчката.' });
    if (!ORDER_STATUSES.includes(status)) {
      return json(res, 400, { ok: false, error: 'Невалиден статус.' });
    }

    try {
      const updated = await updateOrderStatus(id, status);
      if (!updated) return json(res, 404, { ok: false, error: 'Поръчката не е намерена.' });
      return json(res, 200, { ok: true, order: mapOrderRow(updated) });
    } catch (err) {
      console.error('[admin/orders] PATCH failed:', err.message);
      const mapped = mapSupabaseError(res, err);
      if (mapped) return mapped;
      return json(res, 500, { ok: false, error: 'Неуспешна смяна на статус.' });
    }
  }

  return json(res, 405, { ok: false, error: 'Method not allowed' });
};
