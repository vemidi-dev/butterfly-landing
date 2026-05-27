const { json } = require('./http');

function getEnv(name) {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : '';
}

function getSupabaseConfig() {
  const url = getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const missing = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return { url, serviceKey, missing };
}

function assertSupabaseConfig() {
  const config = getSupabaseConfig();
  if (config.missing.length) {
    const err = new Error(`Missing: ${config.missing.join(', ')}`);
    err.code = 'MISSING_SUPABASE_ENV';
    err.missing = config.missing;
    throw err;
  }
  if (!/^https?:\/\//.test(config.url)) {
    const err = new Error('Supabase URL must start with http/https.');
    err.code = 'INVALID_SUPABASE_URL';
    throw err;
  }
  return config;
}

async function supabaseRequest(path, options = {}) {
  const { url, serviceKey } = assertSupabaseConfig();
  const base = url.replace(/\/$/, '');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const err = new Error(`Supabase request failed: ${response.status}`);
    err.code = 'SUPABASE_REQUEST_FAILED';
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

async function insertOrder(record) {
  const rows = await supabaseRequest('orders', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(record),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function listOrders({ status, search } = {}) {
  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('order', 'created_at.desc');

  if (status && status !== 'all') {
    params.set('status', `eq.${status}`);
  }

  let rows = await supabaseRequest(`orders?${params.toString()}`, { method: 'GET' });
  if (!Array.isArray(rows)) rows = [];

  const term = String(search || '').trim().toLowerCase();
  if (term) {
    rows = rows.filter((row) => {
      const haystack = [row.customer_name, row.customer_phone, row.child_name]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return haystack.includes(term);
    });
  }

  return rows;
}

async function updateOrderStatus(id, status) {
  const rows = await supabaseRequest(`orders?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status }),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

function mapSupabaseError(res, err) {
  if (err.code === 'MISSING_SUPABASE_ENV') {
    const missing = Array.isArray(err.missing) ? err.missing : [];
    return json(res, 500, {
      ok: false,
      error: `Липсва конфигурация: ${missing.join(', ')}.`,
      missing,
    });
  }
  if (err.code === 'INVALID_SUPABASE_URL') {
    return json(res, 500, {
      ok: false,
      error: 'SUPABASE_URL не е валиден.',
    });
  }
  if (err.code === 'SUPABASE_REQUEST_FAILED') {
    if (err.status === 404) {
      return json(res, 404, { ok: false, error: 'Поръчката не е намерена.' });
    }
    return json(res, 500, {
      ok: false,
      error: 'Грешка при връзка с базата данни.',
    });
  }
  return null;
}

module.exports = {
  getEnv,
  getSupabaseConfig,
  assertSupabaseConfig,
  supabaseRequest,
  insertOrder,
  listOrders,
  updateOrderStatus,
  mapSupabaseError,
};
