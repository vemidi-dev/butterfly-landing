const { getEnv } = require('./supabase');

const SHAPE_KEYS = [
  'offices',
  'officeList',
  'office_list',
  'data',
  'results',
  'objects',
  'sites',
  'items',
  'rows',
  'result',
  'list',
  'officesResult',
];

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
    cityResolveUrl: getEnv(`${prefix}_CITY_RESOLVE_API_URL`),
    cityResolveParam: getEnv(`${prefix}_CITY_RESOLVE_PARAM`) || 'city',
  };
}

function containsSensitive(key) {
  return /(pass|password|secret|token|api[-_]?key|authorization|auth|username)/i.test(key);
}

function sanitizeUrl(raw) {
  try {
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (containsSensitive(key)) parsed.searchParams.set(key, '***');
    }
    return parsed.toString();
  } catch {
    return String(raw || '');
  }
}

function scrubSensitive(value, depth = 0) {
  if (depth > 2) return '[trimmed]';
  if (Array.isArray(value)) return value.slice(0, 8).map((v) => scrubSensitive(v, depth + 1));
  if (!value || typeof value !== 'object') return value;

  const output = {};
  for (const [key, val] of Object.entries(value)) {
    if (containsSensitive(key)) {
      output[key] = '***';
      continue;
    }
    output[key] = scrubSensitive(val, depth + 1);
  }
  return output;
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

  // Most common top-level keys first.
  for (const key of SHAPE_KEYS) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === 'object') {
      for (const nestedKey of SHAPE_KEYS) {
        if (Array.isArray(payload[key][nestedKey])) return payload[key][nestedKey];
      }
    }
  }

  // Generic deep scan: pick the largest array of objects.
  let best = [];
  const visited = new Set();
  const queue = [payload];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) continue;
    visited.add(node);

    if (Array.isArray(node)) {
      const first = node[0];
      if (node.length > best.length && (first == null || typeof first === 'object')) best = node;
      for (const item of node.slice(0, 30)) {
        if (item && typeof item === 'object') queue.push(item);
      }
      continue;
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        const first = value[0];
        if (value.length > best.length && (first == null || typeof first === 'object')) best = value;
      }
      if (value && typeof value === 'object') queue.push(value);
    }
  }

  if (best.length) return best;
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeOffice(raw, courier) {
  const officeLikeAddress = [raw.quarter, raw.streetName, raw.street, raw.num]
    .filter(Boolean)
    .join(' ')
    .trim();

  const id =
    raw.id ||
    raw.code ||
    raw.officeCode ||
    raw.officeId ||
    raw.siteId ||
    raw.office_id ||
    raw.num ||
    raw.pk;
  const name =
    raw.name ||
    raw.nameEn ||
    raw.officeName ||
    raw.office_code_name ||
    raw.label ||
    raw.siteName ||
    raw.site_name ||
    raw.office ||
    raw.description ||
    raw.address_full ||
    'Офис';
  const address =
    raw.address ||
    raw.addressFull ||
    raw.addressLine ||
    raw.addressString ||
    raw.fullAddress ||
    raw.address_full ||
    officeLikeAddress ||
    '';
  const city =
    raw.city ||
    raw.cityName ||
    raw.locality ||
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

async function resolveEcontCity(city) {
  // Optional resolver for APIs that need site/city IDs first.
  return city;
}

async function resolveSpeedyCity(city) {
  // Optional resolver for APIs that need site/city IDs first.
  return city;
}

async function resolveCityToken(config, city, courier) {
  if (!config.cityResolveUrl) {
    return courier === 'econt' ? resolveEcontCity(city) : resolveSpeedyCity(city);
  }

  const url = new URL(config.cityResolveUrl);
  url.searchParams.set(config.cityResolveParam, city);
  const response = await fetch(url.toString(), { method: 'GET', headers: buildHeaders(config) });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) return city;
  const rows = pickArrayPayload(payload);
  const first = rows[0] || payload;
  return (
    first.siteId ||
    first.siteID ||
    first.cityId ||
    first.cityID ||
    first.id ||
    first.code ||
    city
  );
}

async function fetchOffices(courier, city, options = {}) {
  const debug = Boolean(options.debug);
  const debugInfo = {
    courier,
    city,
    requestUrl: '',
    method: '',
    responseStatus: null,
    rawTopLevelKeys: [],
    rawCount: 0,
    normalizedCount: 0,
    firstRawItem: null,
    firstNormalizedItem: null,
  };

  const config = getCourierConfig(courier);
  if (!config.officesUrl) {
    const err = new Error(`Missing ${courier.toUpperCase()}_OFFICES_API_URL`);
    err.code = 'MISSING_COURIER_ENV';
    err.debugInfo = debugInfo;
    throw err;
  }

  const method = String(config.method || 'GET').toUpperCase();
  const headers = buildHeaders(config);
  const cityToken = await resolveCityToken(config, city, courier);
  let targetUrl = config.officesUrl;
  const requestOptions = { method, headers };

  if (method === 'GET') {
    const url = new URL(config.officesUrl);
    url.searchParams.set(config.cityParam, cityToken);
    targetUrl = url.toString();
  } else {
    headers['Content-Type'] = 'application/json';
    requestOptions.body = JSON.stringify({ [config.cityParam]: cityToken });
  }

  debugInfo.requestUrl = sanitizeUrl(targetUrl);
  debugInfo.method = method;

  const response = await fetch(targetUrl, requestOptions);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  debugInfo.responseStatus = response.status;
  debugInfo.rawTopLevelKeys =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? Object.keys(payload).slice(0, 20)
      : [];

  if (!response.ok) {
    const err = new Error(`Courier API failed: ${response.status}`);
    err.code = 'COURIER_API_FAILED';
    err.status = response.status;
    err.details = text;
    err.debugInfo = debugInfo;
    throw err;
  }

  const rawItems = pickArrayPayload(payload);
  debugInfo.rawCount = rawItems.length;
  debugInfo.firstRawItem = rawItems.length ? scrubSensitive(rawItems[0]) : null;

  let offices = rawItems
    .map((row) => normalizeOffice(row, courier))
    .filter(Boolean);

  // Soft filter: only narrow results when there are many and clear city matches exist.
  if (city && offices.length > 10) {
    const narrowed = offices.filter((office) => {
      const haystack = `${office.city} ${office.address} ${office.name}`.toLowerCase();
      return haystack.includes(city.toLowerCase());
    });
    if (narrowed.length > 0) offices = narrowed;
  }

  debugInfo.normalizedCount = offices.length;
  debugInfo.firstNormalizedItem = offices.length ? scrubSensitive(offices[0]) : null;

  return debug ? { offices, debugInfo } : offices;
}

module.exports = {
  getCityFromReq,
  pickArrayPayload,
  normalizeOffice,
  resolveEcontCity,
  resolveSpeedyCity,
  fetchOffices,
};
