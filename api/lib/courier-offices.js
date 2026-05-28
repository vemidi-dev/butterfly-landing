const { getEnv } = require('./supabase');

const SHAPE_KEYS = [
  'offices',
  'officeList',
  'office_list',
  'result',
  'results',
  'rows',
  'sites',
  'list',
  'items',
  'data',
  'objects',
  'officesResult',
];

function getCityFromReq(req) {
  const url = new URL(req.url, 'http://localhost');
  return String(url.searchParams.get('city') || '').trim();
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
    output[key] = containsSensitive(key) ? '***' : scrubSensitive(val, depth + 1);
  }
  return output;
}

function buildDebug(courier, city) {
  return {
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
}

function setDebugFromPayload(debug, payload) {
  debug.rawTopLevelKeys =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? Object.keys(payload).slice(0, 20)
      : [];
}

function getCourierConfig(courier) {
  const prefix = courier.toUpperCase();
  return {
    courier,
    officesUrl: getEnv(`${prefix}_OFFICES_API_URL`),
    officesMethod: (getEnv(`${prefix}_OFFICES_METHOD`) || 'GET').toUpperCase(),
    cityParam: getEnv(`${prefix}_CITY_PARAM`) || 'city',
    apiKey: getEnv(`${prefix}_API_KEY`),
    username: getEnv(`${prefix}_USERNAME`),
    password: getEnv(`${prefix}_PASSWORD`),
    authHeader: getEnv(`${prefix}_AUTH_HEADER`),
    authValue: getEnv(`${prefix}_AUTH_VALUE`),
    cityResolveUrl: getEnv(`${prefix}_CITY_RESOLVE_API_URL`),
    cityResolveParam: getEnv(`${prefix}_CITY_RESOLVE_PARAM`) || 'city',
    apiBaseUrl: getEnv(`${prefix}_API_BASE_URL`),
    sitesPath: getEnv(`${prefix}_SITES_PATH`) || '/location/site/',
    officesPath: getEnv(`${prefix}_OFFICES_PATH`) || '/location/office/',
    citiesUrl: getEnv(`${prefix}_CITIES_API_URL`),
  };
}

function buildHeaders(config, jsonBody = false) {
  const headers = { Accept: 'application/json' };
  if (jsonBody) headers['Content-Type'] = 'application/json';
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

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const suffix = String(path || '').replace(/^\/+/, '');
  return `${base}/${suffix}`;
}

function isEcontServicesBase(url) {
  return /econt\.com\/(?:ee\/)?services\/?$/.test(String(url || ''));
}

function getEcontMethodUrl(config, methodName) {
  if (!config.officesUrl) return '';
  if (isEcontServicesBase(config.officesUrl)) {
    return joinUrl(config.officesUrl, `Nomenclatures/NomenclaturesService.${methodName}.json`);
  }
  return config.officesUrl;
}

async function requestCourierApi(url, { method = 'GET', headers = {}, body } = {}, debug) {
  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (debug) {
    debug.requestUrl = sanitizeUrl(url);
    debug.method = method;
    debug.responseStatus = response.status;
    setDebugFromPayload(debug, payload);
  }
  if (!response.ok) {
    const err = new Error(`Courier API failed: ${response.status}`);
    err.code = 'COURIER_API_FAILED';
    err.status = response.status;
    err.details = text;
    err.debugInfo = debug || null;
    throw err;
  }
  return payload;
}

function pickArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  for (const key of SHAPE_KEYS) {
    if (Array.isArray(payload[key])) return payload[key];
    const nested = payload[key];
    if (nested && typeof nested === 'object') {
      for (const nestedKey of SHAPE_KEYS) {
        if (Array.isArray(nested[nestedKey])) return nested[nestedKey];
      }
    }
  }

  let best = [];
  const queue = [payload];
  const seen = new Set();
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      const first = node[0];
      if (node.length > best.length && (first == null || typeof first === 'object')) best = node;
      node.slice(0, 30).forEach((item) => {
        if (item && typeof item === 'object') queue.push(item);
      });
      continue;
    }
    Object.values(node).forEach((val) => {
      if (Array.isArray(val)) {
        const first = val[0];
        if (val.length > best.length && (first == null || typeof first === 'object')) best = val;
      }
      if (val && typeof val === 'object') queue.push(val);
    });
  }
  return best;
}

function normalizeOffice(raw, courier) {
  const addressObj = raw.address && typeof raw.address === 'object' ? raw.address : {};
  const cityObj = addressObj.city && typeof addressObj.city === 'object' ? addressObj.city : {};
  const addressFromParts = [raw.quarter, raw.streetName, raw.street, raw.num].filter(Boolean).join(' ');
  const id =
    raw.officeCode || raw.officeId || raw.id || raw.code || raw.siteId || raw.office_id || raw.pk;
  const name =
    raw.name ||
    raw.nameEn ||
    raw.officeName ||
    raw.siteName ||
    raw.site_name ||
    raw.office ||
    raw.label ||
    'Офис';
  const address =
    (typeof raw.address === 'string' ? raw.address : '') ||
    raw.addressFull ||
    raw.fullAddress ||
    raw.addressString ||
    raw.addressLine ||
    raw.address_full ||
    addressObj.fullAddress ||
    [addressObj.street, addressObj.num].filter(Boolean).join(' ') ||
    addressFromParts ||
    '';
  const city =
    raw.city ||
    raw.cityName ||
    raw.locality ||
    raw.town ||
    raw.municipality ||
    cityObj.name ||
    cityObj.nameEn ||
    '';

  if (!id && !name && !address) return null;
  return {
    id: String(id || `${courier}-${name}-${address}`),
    name: String(name || 'Офис'),
    address: String(address || ''),
    city: String(city || ''),
    courier,
  };
}

async function resolveEcontCity(city, config) {
  const citiesUrl = config.citiesUrl || getEcontMethodUrl(config, 'getCities');
  if (!citiesUrl || citiesUrl === config.officesUrl) return city;

  const payload = await requestCourierApi(
    citiesUrl,
    {
      method: 'POST',
      headers: buildHeaders(config, true),
      body: JSON.stringify({ countryCode: 'BGR', name: city }),
    },
    null
  );
  const cities = pickArrayPayload(payload);
  const normalizedInput = city.toLowerCase();
  const matched =
    cities.find((c) => String(c.name || '').toLowerCase() === normalizedInput) ||
    cities.find((c) => String(c.nameEn || '').toLowerCase() === normalizedInput) ||
    cities.find((c) => String(c.name || '').toLowerCase().includes(normalizedInput));

  return matched?.id || matched?.cityId || matched?.cityID || city;
}

async function resolveSpeedyCity(city, config) {
  if (!config.apiBaseUrl) return city;
  const candidates = [
    { name: city },
    { name: city, language: 'BG' },
    { filter: { name: city } },
    { filter: { word: city } },
  ];
  const siteUrl = joinUrl(config.apiBaseUrl, config.sitesPath);
  let payload = null;
  for (const candidate of candidates) {
    try {
      payload = await requestCourierApi(
        siteUrl,
        {
          method: 'POST',
          headers: buildHeaders(config, true),
          body: JSON.stringify(candidate),
        },
        null
      );
      const rows = pickArrayPayload(payload);
      if (rows.length) {
        const first = rows[0];
        return first.id || first.siteId || first.siteID || first.code || city;
      }
    } catch {
      // try next candidate
    }
  }
  return city;
}

function softenCityFilter(offices, city) {
  if (!city) return offices;
  if (offices.length <= 10) return offices;
  const filtered = offices.filter((office) =>
    `${office.city} ${office.address} ${office.name}`.toLowerCase().includes(city.toLowerCase())
  );
  return filtered.length ? filtered : offices;
}

async function fetchEcontOffices(city, options = {}) {
  const config = getCourierConfig('econt');
  const debug = options.debug ? buildDebug('econt', city) : null;
  if (!config.officesUrl) {
    const err = new Error('Missing ECONT_OFFICES_API_URL');
    err.code = 'MISSING_COURIER_ENV';
    err.debugInfo = debug;
    throw err;
  }

  let cityToken = city;
  try {
    cityToken = await resolveEcontCity(city, config);
  } catch {
    cityToken = city;
  }
  const method = config.officesMethod;
  const isNomenclature = isEcontServicesBase(config.officesUrl);
  let payload = {};
  let rawItems = [];

  if (isNomenclature) {
    const url = getEcontMethodUrl(config, 'getOffices');
    const candidates = [
      { countryCode: 'BGR', cityID: cityToken },
      { countryCode: 'BGR', cityId: cityToken },
      { countryCode: 'BGR', city: { id: cityToken } },
      { countryCode: 'BGR', city: { name: city } },
      { countryCode: 'BGR' },
    ];
    for (const body of candidates) {
      payload = await requestCourierApi(
        url,
        {
          method: 'POST',
          headers: buildHeaders(config, true),
          body: JSON.stringify(body),
        },
        debug
      );
      rawItems = pickArrayPayload(payload);
      if (rawItems.length) break;
    }
  } else {
    let url = config.officesUrl;
    const request = { method, headers: buildHeaders(config, method !== 'GET') };
    if (method === 'GET') {
      const u = new URL(config.officesUrl);
      u.searchParams.set(config.cityParam, cityToken);
      url = u.toString();
    } else {
      request.body = JSON.stringify({ [config.cityParam]: cityToken });
    }
    payload = await requestCourierApi(url, request, debug);
    rawItems = pickArrayPayload(payload);
  }

  if (debug) {
    debug.rawCount = rawItems.length;
    debug.firstRawItem = rawItems.length ? scrubSensitive(rawItems[0]) : null;
  }

  let offices = rawItems.map((row) => normalizeOffice(row, 'econt')).filter(Boolean);
  offices = softenCityFilter(offices, city);

  if (debug) {
    debug.normalizedCount = offices.length;
    debug.firstNormalizedItem = offices.length ? scrubSensitive(offices[0]) : null;
    return { offices, debugInfo: debug };
  }
  return offices;
}

async function fetchSpeedyOffices(city, options = {}) {
  const config = getCourierConfig('speedy');
  const debug = options.debug ? buildDebug('speedy', city) : null;

  // Legacy direct offices URL mode.
  if (config.officesUrl) {
    const method = config.officesMethod;
    let url = config.officesUrl;
    const request = { method, headers: buildHeaders(config, method !== 'GET') };
    if (method === 'GET') {
      const u = new URL(config.officesUrl);
      u.searchParams.set(config.cityParam, city);
      url = u.toString();
    } else {
      request.body = JSON.stringify({ [config.cityParam]: city });
    }
    const payload = await requestCourierApi(url, request, debug);
    const rawItems = pickArrayPayload(payload);
    if (debug) {
      debug.rawCount = rawItems.length;
      debug.firstRawItem = rawItems.length ? scrubSensitive(rawItems[0]) : null;
    }
    let offices = rawItems.map((row) => normalizeOffice(row, 'speedy')).filter(Boolean);
    offices = softenCityFilter(offices, city);
    if (debug) {
      debug.normalizedCount = offices.length;
      debug.firstNormalizedItem = offices.length ? scrubSensitive(offices[0]) : null;
      return { offices, debugInfo: debug };
    }
    return offices;
  }

  // Native Speedy mode using API base + siteId resolution.
  if (!config.apiBaseUrl || !config.username || !config.password) {
    const err = new Error('Missing Speedy base credentials');
    err.code = 'MISSING_COURIER_ENV';
    err.debugInfo = debug;
    throw err;
  }

  const siteId = await resolveSpeedyCity(city, config);
  const officeUrl = joinUrl(config.apiBaseUrl, config.officesPath);
  const officePayloadCandidates = [
    { siteId },
    { siteID: siteId },
    { filter: { siteId } },
    { filter: { siteID: siteId } },
    { language: 'BG', siteId },
  ];

  let payload = {};
  for (const candidate of officePayloadCandidates) {
    try {
      payload = await requestCourierApi(
        officeUrl,
        {
          method: 'POST',
          headers: buildHeaders(config, true),
          body: JSON.stringify(candidate),
        },
        debug
      );
      const raw = pickArrayPayload(payload);
      if (raw.length) break;
    } catch (err) {
      if (candidate === officePayloadCandidates[officePayloadCandidates.length - 1]) throw err;
    }
  }

  const rawItems = pickArrayPayload(payload);
  if (debug) {
    debug.rawCount = rawItems.length;
    debug.firstRawItem = rawItems.length ? scrubSensitive(rawItems[0]) : null;
  }
  let offices = rawItems.map((row) => normalizeOffice(row, 'speedy')).filter(Boolean);
  offices = softenCityFilter(offices, city);
  if (debug) {
    debug.normalizedCount = offices.length;
    debug.firstNormalizedItem = offices.length ? scrubSensitive(offices[0]) : null;
    return { offices, debugInfo: debug };
  }
  return offices;
}

async function fetchOffices(courier, city, options = {}) {
  if (courier === 'econt') return fetchEcontOffices(city, options);
  if (courier === 'speedy') return fetchSpeedyOffices(city, options);
  const err = new Error('Unsupported courier');
  err.code = 'INVALID_COURIER';
  throw err;
}

module.exports = {
  getCityFromReq,
  pickArrayPayload,
  normalizeOffice,
  resolveEcontCity,
  resolveSpeedyCity,
  fetchEcontOffices,
  fetchSpeedyOffices,
  fetchOffices,
};
