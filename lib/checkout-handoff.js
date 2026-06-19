'use strict';

const CAMPAIGN = 'butterflies';
const SOURCE = 'campaign-butterflies';
const DEFAULT_STORE_URL = 'https://vemidi-crafts.com';
const DEFAULT_LANDING_URL = 'https://special.vemidi-crafts.com/valshebni-peperudi';
const DEFAULT_PRODUCT_ID = 'd594ddce-2fb5-49e0-859d-9ff91e752b9d';
const DEFAULT_PRODUCT_SLUG = 'tvorcheski-komplekt-valshebni-peperudi';
/** Temporary: product page attribution only — no option mapping until store config is verified */
const DEFAULT_SAFE_HANDOFF_FALLBACK = true;

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
]);

const STORE_OPTION_MAPPING = {
  kitSize: {
    groupKey: 'kit_size',
    landingField: 'size',
    values: {
      '3': 'mini',
      '5': 'standard',
      '7': 'maxi',
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
  personalization: {
    groupKey: 'personalization',
    landingField: 'personalize',
    values: {
      true: 'yes',
      false: 'no',
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

/**
 * @typedef {{ size?: string, coloring?: string, personalize?: boolean, childName?: string }} FormState
 * @typedef {{ storeUrl: string, productId: string, productSlug?: string, landingUrl: string, campaign?: string, source?: string, safeHandoffFallback?: boolean }} PublicConfig
 * @typedef {{ ok: false, error: string }} HandoffError
 * @typedef {{ ok: true, target: 'checkout' | 'product' | 'product-page', url: string }} HandoffSuccess
 * @typedef {HandoffError | HandoffSuccess} HandoffResult
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
          : mapping.landingField === 'personalize'
            ? formState.personalize
            : undefined;
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      continue;
    }

    const lookupKey =
      mapping.landingField === 'personalize' ? String(Boolean(rawValue)) : String(rawValue);
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
 * @returns {HandoffResult}
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

  return { ok: true, target: 'product-page', url: productBase.toString() };
}

/**
 * @param {PublicConfig} config
 * @param {FormState} [formState]
 */
function buildAttributionParams(config, formState = {}) {
  const params = new URLSearchParams();
  params.set('campaign', CAMPAIGN);
  params.set('source', SOURCE);
  params.set('quantity', '1');
  params.set('landing', String(config.landingUrl || '').trim());

  const optionParams = mapProductOptions(formState);
  for (const [key, value] of Object.entries(optionParams)) {
    if (value) params.set(key, value);
  }

  return params;
}

/**
 * @param {PublicConfig} config
 * @param {FormState} [formState]
 * @returns {HandoffResult}
 */
function buildCampaignCheckoutUrl(config, formState = {}) {
  const validation = validateHandoffConfig(config);
  if (!validation.ok) {
    return validation;
  }

  const { storeUrl, productId, landingUrl } = validation;
  const checkoutBase = new URL('/campaign-checkout', storeUrl);
  const params = new URLSearchParams();
  params.set('product', productId);
  params.set('campaign', CAMPAIGN);
  params.set('source', SOURCE);
  params.set('quantity', '1');
  params.set('landing', landingUrl);

  const optionParams = mapProductOptions(formState);
  for (const [key, value] of Object.entries(optionParams)) {
    if (value) params.set(key, value);
  }

  checkoutBase.search = params.toString();

  return { ok: true, target: 'checkout', url: checkoutBase.toString() };
}

/**
 * @param {PublicConfig} config
 * @param {FormState} [formState]
 * @returns {HandoffResult}
 */
function buildProductPageHandoffUrl(config, formState = {}) {
  const validation = validateHandoffConfig(config);
  if (!validation.ok) {
    return validation;
  }

  const { storeUrl, productId } = validation;
  const productBase = new URL(`/products/${encodeURIComponent(productId)}`, storeUrl);
  productBase.search = buildAttributionParams(config, formState).toString();

  return { ok: true, target: 'product', url: productBase.toString() };
}

/**
 * @param {FormState | undefined} formState
 */
function shouldRedirectToProductPage(formState = {}) {
  return Boolean(formState.personalize && String(formState.childName || '').trim());
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

  if (shouldRedirectToProductPage(formState)) {
    return buildProductPageHandoffUrl(config, formState);
  }

  return buildCampaignCheckoutUrl(config, formState);
}

/** @param {string} url */
function assertHandoffUrlSafe(url) {
  const parsed = new URL(url);
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (FORBIDDEN_QUERY_KEYS.has(key)) {
      throw new Error(`Forbidden query parameter in handoff URL: ${key}`);
    }
  }
  return true;
}

const api = {
  CAMPAIGN,
  SOURCE,
  DEFAULT_STORE_URL,
  DEFAULT_LANDING_URL,
  DEFAULT_PRODUCT_ID,
  DEFAULT_PRODUCT_SLUG,
  DEFAULT_SAFE_HANDOFF_FALLBACK,
  STORE_OPTION_MAPPING,
  FORBIDDEN_QUERY_KEYS,
  resolvePublicConfig,
  isValidHttpUrl,
  isUuid,
  mapProductOptions,
  validateHandoffConfig,
  validateSafeFallbackConfig,
  buildSafeStoreProductUrl,
  buildAttributionParams,
  buildCampaignCheckoutUrl,
  buildProductPageHandoffUrl,
  shouldRedirectToProductPage,
  resolveStoreHandoff,
  assertHandoffUrlSafe,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  /** @type {any} */ (window).VeMidiCheckoutHandoff = api;
}
