'use strict';

const {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} = require('node:crypto');

const CROSS_HANDOFF_VERSION = 2;
const CROSS_HANDOFF_DIRECTION = 'store-to-landing';
const CROSS_HANDOFF_COOKIE_MAX_AGE_SECONDS = 300;
const LEGACY_PERSONALIZATION_FIELD_KEY = 'field_e0bd392877ce4fa2841f3c81ac0b21db';
const CROSS_HANDOFF_PERSONALIZATION_POST_KEY = `pf_${LEGACY_PERSONALIZATION_FIELD_KEY}`;

const ALLOWED_CROSS_HANDOFF_FIELD_KEYS = new Set([
  'option_razmer_na_komplekta',
  'option_coloring',
  CROSS_HANDOFF_PERSONALIZATION_POST_KEY,
]);

function deriveCrossHandoffKey(secret) {
  return createHash('sha256')
    .update(`campaign-handoff:v2:${CROSS_HANDOFF_DIRECTION}:${secret}`)
    .digest();
}

function getCrossHandoffSecret(env = process.env) {
  return String(env.CAMPAIGN_HANDOFF_SECRET || '').trim();
}

function assertCrossHandoffFieldsAllowlisted(fields) {
  for (const key of Object.keys(fields)) {
    if (!ALLOWED_CROSS_HANDOFF_FIELD_KEYS.has(key)) {
      throw new Error(`Forbidden cross-handoff field: ${key}`);
    }
  }
}

function sealCrossHandoffPayload(input, secret, now = Date.now()) {
  assertCrossHandoffFieldsAllowlisted(input.fields);

  const payload = {
    v: CROSS_HANDOFF_VERSION,
    dir: CROSS_HANDOFF_DIRECTION,
    iat: now,
    exp: now + CROSS_HANDOFF_COOKIE_MAX_AGE_SECONDS * 1000,
    jti: randomBytes(16).toString('hex'),
    productId: input.productId,
    landingSlug: input.landingSlug,
    campaign: input.campaign,
    fields: input.fields,
  };

  const iv = randomBytes(12);
  const key = deriveCrossHandoffKey(secret);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function openCrossHandoffPayload(sealed, secret, now = Date.now()) {
  if (!secret) {
    return { ok: false, reason: 'missing_secret' };
  }

  let raw;
  try {
    raw = Buffer.from(sealed, 'base64url');
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (raw.length < 29) {
    return { ok: false, reason: 'invalid' };
  }

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const key = deriveCrossHandoffKey(secret);

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const payload = JSON.parse(decrypted.toString('utf8'));

    if (payload.v !== CROSS_HANDOFF_VERSION) {
      return { ok: false, reason: 'wrong_version' };
    }

    if (payload.dir !== CROSS_HANDOFF_DIRECTION) {
      return { ok: false, reason: 'wrong_direction' };
    }

    if (
      !payload.jti ||
      !payload.productId ||
      !payload.landingSlug ||
      !payload.fields ||
      typeof payload.fields !== 'object'
    ) {
      return { ok: false, reason: 'tampered' };
    }

    if (payload.exp <= now) {
      return { ok: false, reason: 'expired' };
    }

    assertCrossHandoffFieldsAllowlisted(payload.fields);

    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'tampered' };
  }
}

module.exports = {
  CROSS_HANDOFF_VERSION,
  CROSS_HANDOFF_DIRECTION,
  CROSS_HANDOFF_COOKIE_MAX_AGE_SECONDS,
  CROSS_HANDOFF_PERSONALIZATION_POST_KEY,
  ALLOWED_CROSS_HANDOFF_FIELD_KEYS,
  getCrossHandoffSecret,
  sealCrossHandoffPayload,
  openCrossHandoffPayload,
};
