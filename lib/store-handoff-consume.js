'use strict';

const {
  openCrossHandoffPayload,
  getCrossHandoffSecret,
} = require('./campaign-cross-handoff-crypto');

const CROSS_HANDOFF_COOKIE_NAME = 'vemidi_cross_handoff';
const CROSS_HANDOFF_COOKIE_DOMAIN = '.vemidi-crafts.com';
const CROSS_HANDOFF_COOKIE_PATH = '/';

const SIZE_VALUE_TO_LANDING = {
  komplekt_mini_1_peperuda_2_vodni_koncheta: '3',
  komplekt_standart_2_peperuda_3_vodni_koncheta: '5',
  komplekt_maksi_3_peperuda_4_vodni_koncheta: '7',
};

const LANDING_SIZE_VALUES = new Set(['3', '5', '7']);
const LANDING_COLORING_VALUES = new Set(['paints', 'markers']);

const CROSS_HANDOFF_COOKIE_PATTERN = /(?:^|;\s*)vemidi_cross_handoff=([^;]*)/;

function sanitizePersonalizationName(value) {
  return String(value || '')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim()
    .slice(0, 50);
}

function parseCrossHandoffCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = String(cookieHeader).match(CROSS_HANDOFF_COOKIE_PATTERN);
  const value = match?.[1]?.trim();
  return value ? decodeURIComponent(value) : null;
}

function mapCrossHandoffFieldsToFormState(fields) {
  const sizeKey = fields.option_razmer_na_komplekta;
  const coloring = fields.option_coloring;
  if (!sizeKey || !coloring) return null;

  const size = SIZE_VALUE_TO_LANDING[sizeKey];
  if (!size || !LANDING_COLORING_VALUES.has(coloring)) return null;

  const rawName = fields.pf_field_e0bd392877ce4fa2841f3c81ac0b21db;
  const personalizationName = rawName ? sanitizePersonalizationName(rawName) : '';

  return {
    size,
    coloring,
    personalize: Boolean(personalizationName),
    personalizationName,
  };
}

function validateFormState(formState) {
  if (!formState || !LANDING_SIZE_VALUES.has(formState.size)) return false;
  if (!LANDING_COLORING_VALUES.has(formState.coloring)) return false;
  if (formState.personalize && !formState.personalizationName) return false;
  if (!formState.personalize && formState.personalizationName) return false;
  return true;
}

function buildCrossHandoffClearCookieHeader(secure = true) {
  const parts = [
    `${CROSS_HANDOFF_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Lax',
    `Path=${CROSS_HANDOFF_COOKIE_PATH}`,
    `Domain=${CROSS_HANDOFF_COOKIE_DOMAIN}`,
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * @param {string} cookieHeader
 * @param {Record<string, string | undefined>} [env]
 * @param {number} [now]
 */
function consumeStoreHandoffCookie(cookieHeader, env = process.env, now = Date.now()) {
  const sealed = parseCrossHandoffCookie(cookieHeader);
  if (!sealed) {
    return { ok: false, status: 404, error: 'Handoff not found.' };
  }

  const secret = getCrossHandoffSecret(env);
  if (!secret) {
    return { ok: false, status: 503, error: 'Handoff service unavailable.' };
  }

  const opened = openCrossHandoffPayload(sealed, secret, now);
  if (!opened.ok) {
    const status = opened.reason === 'expired' ? 410 : 400;
    return { ok: false, status, error: 'Handoff invalid or expired.' };
  }

  const expectedProductId = String(env.NEXT_PUBLIC_STORE_PRODUCT_ID || '').trim();
  if (expectedProductId && opened.payload.productId !== expectedProductId) {
    return { ok: false, status: 400, error: 'Handoff product mismatch.' };
  }

  const formState = mapCrossHandoffFieldsToFormState(opened.payload.fields);
  if (!validateFormState(formState)) {
    return { ok: false, status: 400, error: 'Handoff configuration invalid.' };
  }

  return {
    ok: true,
    formState,
    clearCookieHeader: buildCrossHandoffClearCookieHeader(true),
  };
}

module.exports = {
  CROSS_HANDOFF_COOKIE_NAME,
  SIZE_VALUE_TO_LANDING,
  sanitizePersonalizationName,
  parseCrossHandoffCookie,
  mapCrossHandoffFieldsToFormState,
  validateFormState,
  buildCrossHandoffClearCookieHeader,
  consumeStoreHandoffCookie,
};
