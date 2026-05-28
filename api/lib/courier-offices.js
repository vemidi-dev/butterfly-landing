const { getEnv } = require('./supabase');

const SHAPE_KEYS = ['offices', 'data', 'results', 'objects', 'sites', 'items'];

function getCityFromReq(req) {
  const url = new URL(req.url, 'http://localhost');
  return String(url.searchParams.get('city') || '').trim();
}

function getCourierConfig(courier) {
  const prefix = courier.toUpperCase();
  return {
    courier,
    officesUrl: getEnv(`${prefix}_OFFICES_API_URL`),
    method: getEnv(`${prefix}_OFFICES_METHOD`) || 'GET',
    cityParam: getEnv(`${prefix}_CITY_PARAM`) || 'city',
    apiKey: getEnv(`${prefix}_API_KEY`),
    username: getEnv(`${prefix}_USERNAME`),
    password: getEnv(`${prefix}_PASSWORD`),
    authHeader: getEnv(`${prefix}_AUTH_HEADER`),
    authValue: getEnv(`${prefix}_AUTH_VALUE`),
  };
}

function buildHeaders(config) {
  const headers = { Accept: 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  if (!headers.Authorization && config.username && config.password) {
    const basic = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    headers.Authorization = `Basic ${basic}`;
  }
  if (config.authHeader && config.authValue) {
    headers[config.authHeader] = config.authValue;
  }
  return headers;
}

function pickArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of SHAPE_KEYS) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeOffice(raw, courier) {
  const id =
    raw.id ||
    raw.code ||
    raw.officeCode ||
    raw.siteId ||
    raw.office_id ||
    raw.num ||
    raw.pk;
  const name =
    raw.name ||
    raw.officeName ||
    raw.label ||
    raw.siteName ||
    raw.description ||
    raw.address_full ||
    'Офис';
  const address =
    raw.address ||
    raw.addressLine ||
    raw.addressString ||
    raw.fullAddress ||
    raw.address_full ||
    [raw.street, raw.num].filter(Boolean).join(' ') ||
    '';
  const city =
    raw.city ||
    raw.cityName ||
    raw.town ||
    raw.municipality ||
    raw.postTown ||
    '';

  if (!id && !name && !address) return null;
  return {
    id: String(id || name || address),
    name: String(name || 'Офис'),
    address: String(address || ''),
    city: String(city || ''),
    courier,
  };
}

async function fetchOffices(courier, city) {
  const config = getCourierConfig(courier);
  if (!config.officesUrl) {
    const err = new Error(`Missing ${courier.toUpperCase()}_OFFICES_API_URL`);
    err.code = 'MISSING_COURIER_ENV';
    throw err;
  }

  const method = String(config.method || 'GET').toUpperCase();
  const headers = buildHeaders(config);
  let targetUrl = config.officesUrl;
  const requestOptions = { method, headers };

  if (method === 'GET') {
    const url = new URL(config.officesUrl);
    url.searchParams.set(config.cityParam, city);
    targetUrl = url.toString();
  } else {
    headers['Content-Type'] = 'application/json';
    requestOptions.body = JSON.stringify({ [config.cityParam]: city });
  }

  const response = await fetch(targetUrl, requestOptions);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const err = new Error(`Courier API failed: ${response.status}`);
    err.code = 'COURIER_API_FAILED';
    err.status = response.status;
    err.details = text;
    throw err;
  }

  const offices = pickArrayPayload(payload)
    .map((row) => normalizeOffice(row, courier))
    .filter(Boolean)
    .filter((office) =>
      city
        ? `${office.city} ${office.address} ${office.name}`.toLowerCase().includes(city.toLowerCase())
        : true
    );

  return offices;
}

module.exports = {
  getCityFromReq,
  fetchOffices,
};
