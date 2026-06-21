'use strict';

const CAMPAIGN = 'butterflies';
const SOURCE = 'campaign-butterflies';
const DEFAULT_STORE_URL = 'https://vemidi-crafts.com';
const DEFAULT_LANDING_URL = 'https://special.vemidi-crafts.com/valshebni-peperudi';
const DEFAULT_PRODUCT_ID = 'd594ddce-2fb5-49e0-859d-9ff91e752b9d';
const DEFAULT_PRODUCT_SLUG = 'tvorcheski-komplekt-valshebni-peperudi';
/** Safe product-page CTA until store POST handoff is verified in production */
const DEFAULT_SAFE_HANDOFF_FALLBACK = true;
const LEGACY_PERSONALIZATION_FIELD_KEY = 'field_e0bd392877ce4fa2841f3c81ac0b21db';
const LEGACY_PERSONALIZATION_POST_KEY = `pf_${LEGACY_PERSONALIZATION_FIELD_KEY}`;
const PERSONALIZATION_MAX_LENGTH = 50;
const CAMPAIGN_CHECKOUT_POST_PATH = '/api/campaign-checkout';

const FORBIDDEN_QUERY_KEYS = new Set([
  'price',
  'total',
  'totalPrice',
  'discount',
  'promo',
  'promotion',
  'email',
  'phone',
  'customerName',
  'customerPhone',
  'customerEmail',
  'address',
  'city',
  'note',
  'orderNote',
  'childName',
  'child_name',
  'option_text_child_name',
]);

const FORBIDDEN_POST_FIELD_NAMES = new Set([
  'price',
  'total',
  'totalprice',
  'discount',
  'promo',
  'promotion',
  'email',
  'phone',
  'customername',
  'customerphone',
  'customeremail',
  'address',
  'city',
  'note',
  'ordernote',
  'childname',
  'child_name',
  'option_text_child_name',
  'option_personalization',
]);

const ALLOWED_POST_FIELD_NAMES = new Set([
  'product',
  'campaign',
  'source',
  'landing',
  'quantity',
  'option_razmer_na_komplekta',
  'option_coloring',
  LEGACY_PERSONALIZATION_POST_KEY,
]);

const STORE_OPTION_MAPPING = {
  kitSize: {
    groupKey: 'razmer_na_komplekta',
    landingField: 'size',
    values: {
      '3': 'komplekt_mini_1_peperuda_2_vodni_koncheta',
      '5': 'komplekt_standart_2_peperuda_3_vodni_koncheta',
      '7': 'komplekt_maksi_3_peperuda_4_vodni_koncheta',
    },
  },
  coloring: {
    groupKey: 'coloring',
    landingField: 'coloring',
    values: {
      paints: 'paints',
      markers: 'markers',
    },
  },
};

/**
 * @param {string | undefined | null} value
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
function parseBooleanEnv(value, defaultValue) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

/**
 * @param {Record<string, string | undefined>} [env]
 */
function resolvePublicConfig(env = {}) {
  const storeUrl = String(env.NEXT_PUBLIC_STORE_URL || '').trim() || DEFAULT_STORE_URL;
  const productId =
    String(env.NEXT_PUBLIC_STORE_PRODUCT_ID || '').trim() || DEFAULT_PRODUCT_ID;
  const productSlug =
    String(env.NEXT_PUBLIC_STORE_PRODUCT_SLUG || '').trim() || DEFAULT_PRODUCT_SLUG;
  const landingUrl = String(env.NEXT_PUBLIC_LANDING_URL || '').trim() || DEFAULT_LANDING_URL;
  const safeHandoffFallback = parseBooleanEnv(
    env.NEXT_PUBLIC_SAFE_HANDOFF_FALLBACK,
    DEFAULT_SAFE_HANDOFF_FALLBACK
  );

  return {
    storeUrl,
    productId,
    productSlug,
    landingUrl,
    campaign: CAMPAIGN,
    source: SOURCE,
    safeHandoffFallback,
  };
}

/** @param {string} value */
function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** @param {string} value */
function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  );
}

/** @param {string} value */
function sanitizePersonalizationName(value) {
  let cleaned = String(value || '').trim();
  cleaned = cleaned
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
  return cleaned.slice(0, PERSONALIZATION_MAX_LENGTH);
}

/**
 * @typedef {{ size?: string, coloring?: string, personalize?: boolean, personalizationName?: string, childName?: string }} FormState
 * @typedef {{ storeUrl: string, productId: string, productSlug?: string, landingUrl: string, campaign?: string, source?: string, safeHandoffFallback?: boolean }} PublicConfig
 * @typedef {{ ok: false, error: string }} HandoffError
 * @typedef {{ ok: true, mode: 'get', target: 'product-page', url: string }} HandoffGetSuccess
 * @typedef {{ ok: true, mode: 'post', target: 'checkout', action: string, fields: Record<string, string> }} HandoffPostSuccess
 * @typedef {HandoffError | HandoffGetSuccess | HandoffPostSuccess} HandoffResult
 * @typedef {{ ok: false, error: string }} ConfigValidationError
 * @typedef {{ ok: true, storeUrl: string, productId: string, landingUrl: string }} ConfigValidationSuccess
 * @typedef {ConfigValidationError | ConfigValidationSuccess} ConfigValidationResult
 * @typedef {{ ok: true, storeUrl: string, productId: string, landingUrl: string, productSlug: string }} SafeFallbackValidationSuccess
 * @typedef {ConfigValidationError | SafeFallbackValidationSuccess} SafeFallbackValidationResult
 */

/**
 * @param {FormState | undefined} formState
 * @returns {Record<string, string>}
 */
function mapProductOptions(formState = {}) {
  /** @type {Record<string, string>} */
  const params = {};

  for (const mapping of Object.values(STORE_OPTION_MAPPING)) {
    const rawValue =
      mapping.landingField === 'size'
        ? formState.size
        : mapping.landingField === 'coloring'
          ? formState.coloring
          : undefined;
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      continue;
    }

    const lookupKey = String(rawValue);
    /** @type {Record<string, string>} */
    const valueMap = mapping.values;
    const storeValue = valueMap[lookupKey];
    if (!storeValue) {
      continue;
    }

    params[`option_${mapping.groupKey}`] = storeValue;
  }

  return params;
}

/**
 * @typedef {{ ok: false, error: string }} FormValidationError
 * @typedef {{ ok: true, options: Record<string, string> }} FormValidationSuccess
 * @typedef {FormValidationError | FormValidationSuccess} FormValidationResult
 */

/** @param {FormState | undefined} formState @returns {FormValidationResult} */
function validateFormStateForHandoff(formState = {}) {
  const options = mapProductOptions(formState);
  const missing = [];

  if (!options.option_razmer_na_komplekta) {
    missing.push('размер на комплекта');
  }
  if (!options.option_coloring) {
    missing.push('оцветяване');
  }

  if (missing.length) {
    return {
      ok: false,
      error: `Избраната конфигурация не е пълна (${missing.join(', ')}). Моля, провери опциите и опитай отново.`,
    };
  }

  if (formState.personalize) {
    const name = sanitizePersonalizationName(
      formState.personalizationName ?? formState.childName ?? ''
    );
    if (!name) {
      return {
        ok: false,
        error: 'Моля, въведи име за персонализация на дървената закачалка.',
      };
    }
  }

  return { ok: true, options };
}

/**
 * @param {PublicConfig} config
 * @returns {ConfigValidationResult}
 */
function validateHandoffConfig(config) {
  const storeUrl = String(config?.storeUrl || '').trim();
  const productId = String(config?.productId || '').trim();
  const landingUrl = String(config?.landingUrl || '').trim();

  if (!storeUrl) {
    return { ok: false, error: 'Липсва адресът на магазина. Моля, опитай отново по-късно.' };
  }

  if (!isValidHttpUrl(storeUrl)) {
    return { ok: false, error: 'Конфигурацията на магазина е невалидна. Моля, свържи се с нас.' };
  }

  if (!productId) {
    return {
      ok: false,
      error: 'Поръчката временно не е налична. Моля, свържи се с нас на info@vemidi-crafts.com.',
    };
  }

  if (!isUuid(productId)) {
    return {
      ok: false,
      error: 'Конфигурацията на продукта е невалидна. Моля, свържи се с нас.',
    };
  }

  if (!landingUrl || !isValidHttpUrl(landingUrl)) {
    return {
      ok: false,
      error: 'Конфигурацията на landing страницата е невалидна. Моля, свържи се с нас.',
    };
  }

  return { ok: true, storeUrl, productId, landingUrl };
}

/**
 * @param {PublicConfig} config
 * @returns {SafeFallbackValidationResult}
 */
function validateSafeFallbackConfig(config) {
  const storeUrl = String(config?.storeUrl || '').trim() || DEFAULT_STORE_URL;
  const productSlug = String(config?.productSlug || '').trim() || DEFAULT_PRODUCT_SLUG;
  const landingUrl = String(config?.landingUrl || '').trim() || DEFAULT_LANDING_URL;

  if (!storeUrl) {
    return { ok: false, error: 'Липсва адресът на магазина. Моля, опитай отново по-късно.' };
  }

  if (!isValidHttpUrl(storeUrl)) {
    return { ok: false, error: 'Конфигурацията на магазина е невалидна. Моля, свържи се с нас.' };
  }

  if (!productSlug) {
    return {
      ok: false,
      error: 'Конфигурацията на продукта е невалидна. Моля, свържи се с нас.',
    };
  }

  if (!landingUrl || !isValidHttpUrl(landingUrl)) {
    return {
      ok: false,
      error: 'Конфигурацията на landing страницата е невалидна. Моля, свържи се с нас.',
    };
  }

  return { ok: true, storeUrl, productId: '', landingUrl, productSlug };
}

/**
 * Temporary safe handoff: store product page with attribution only (no option mapping, no PII).
 * @param {PublicConfig} config
 * @returns {HandoffError | HandoffGetSuccess}
 */
function buildSafeStoreProductUrl(config) {
  const validation = validateSafeFallbackConfig(config);
  if (!validation.ok) {
    return validation;
  }

  const { storeUrl, productSlug, landingUrl } = validation;
  const productBase = new URL(
    `/produkti/${encodeURIComponent(productSlug)}`,
    storeUrl
  );
  const params = new URLSearchParams();
  params.set('campaign', CAMPAIGN);
  params.set('source', SOURCE);
  params.set('landing', landingUrl);
  productBase.search = params.toString();

  return { ok: true, mode: 'get', target: 'product-page', url: productBase.toString() };
}

/**
 * Secure POST handoff to store /api/campaign-checkout (no PII in URL).
 * @param {PublicConfig} config
 * @param {FormState} [formState]
 * @returns {HandoffResult}
 */
function buildCampaignCheckoutPostHandoff(config, formState = {}) {
  const validation = validateHandoffConfig(config);
  if (!validation.ok) {
    return validation;
  }

  const formValidation = validateFormStateForHandoff(formState);
  if (!formValidation.ok) {
    return /** @type {HandoffError} */ (formValidation);
  }

  const { storeUrl, productId, landingUrl } = validation;
  const action = new URL(CAMPAIGN_CHECKOUT_POST_PATH, storeUrl).toString();

  /** @type {Record<string, string>} */
  const fields = {
    product: productId,
    campaign: CAMPAIGN,
    source: SOURCE,
    landing: landingUrl,
    quantity: '1',
    ...formValidation.options,
  };

  if (formState.personalize) {
    const name = sanitizePersonalizationName(
      formState.personalizationName ?? formState.childName ?? ''
    );
    if (name) {
      fields[LEGACY_PERSONALIZATION_POST_KEY] = name;
    }
  }

  assertPostFieldsSafe(fields);

  return { ok: true, mode: 'post', target: 'checkout', action, fields };
}

/**
 * @param {PublicConfig} config
 * @param {FormState} [formState]
 * @returns {HandoffResult}
 */
function resolveStoreHandoff(config, formState = {}) {
  if (config?.safeHandoffFallback !== false) {
    return buildSafeStoreProductUrl(config);
  }

  return buildCampaignCheckoutPostHandoff(config, formState);
}

/** @param {Record<string, string>} fields */
function assertPostFieldsSafe(fields) {
  for (const key of Object.keys(fields)) {
    if (!ALLOWED_POST_FIELD_NAMES.has(key)) {
      throw new Error(`Forbidden POST field in handoff payload: ${key}`);
    }
    if (FORBIDDEN_POST_FIELD_NAMES.has(key.toLowerCase())) {
      throw new Error(`Forbidden POST field in handoff payload: ${key}`);
    }
  }
  return true;
}

/** @param {string} url */
function assertHandoffUrlSafe(url) {
  const parsed = new URL(url);
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (FORBIDDEN_QUERY_KEYS.has(key)) {
      throw new Error(`Forbidden query parameter in handoff URL: ${key}`);
    }
    if (key.startsWith('pf_')) {
      throw new Error(`Forbidden query parameter in handoff URL: ${key}`);
    }
    if (key.startsWith('option_')) {
      throw new Error(`Forbidden query parameter in handoff URL: ${key}`);
    }
  }
  return true;
}

/**
 * @param {HandoffPostSuccess} handoff
 * @param {{ document?: Document, appendChild?: (node: HTMLElement) => void }} [deps]
 */
function submitCampaignCheckoutPostHandoff(handoff, deps = {}) {
  const doc = deps.document ?? (typeof document !== 'undefined' ? document : null);
  if (!doc || !doc.body) {
    throw new Error('Document is not available for POST handoff submit.');
  }

  const formEl = doc.createElement('form');
  formEl.method = 'POST';
  formEl.action = handoff.action;

  for (const [name, value] of Object.entries(handoff.fields)) {
    const input = doc.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    formEl.appendChild(input);
  }

  const appendChild = deps.appendChild ?? ((node) => doc.body.appendChild(node));
  appendChild(formEl);
  formEl.submit();
}

const api = {
  CAMPAIGN,
  SOURCE,
  DEFAULT_STORE_URL,
  DEFAULT_LANDING_URL,
  DEFAULT_PRODUCT_ID,
  DEFAULT_PRODUCT_SLUG,
  DEFAULT_SAFE_HANDOFF_FALLBACK,
  LEGACY_PERSONALIZATION_FIELD_KEY,
  LEGACY_PERSONALIZATION_POST_KEY,
  PERSONALIZATION_MAX_LENGTH,
  CAMPAIGN_CHECKOUT_POST_PATH,
  STORE_OPTION_MAPPING,
  FORBIDDEN_QUERY_KEYS,
  FORBIDDEN_POST_FIELD_NAMES,
  ALLOWED_POST_FIELD_NAMES,
  resolvePublicConfig,
  isValidHttpUrl,
  isUuid,
  sanitizePersonalizationName,
  mapProductOptions,
  validateHandoffConfig,
  validateFormStateForHandoff,
  validateSafeFallbackConfig,
  buildSafeStoreProductUrl,
  buildCampaignCheckoutPostHandoff,
  resolveStoreHandoff,
  assertPostFieldsSafe,
  assertHandoffUrlSafe,
  submitCampaignCheckoutPostHandoff,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  /** @type {any} */ (window).VeMidiCheckoutHandoff = api;
}
