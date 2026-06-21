'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const crypto = require('../lib/campaign-cross-handoff-crypto');
const consume = require('../lib/store-handoff-consume');
const handoff = require('../lib/checkout-handoff');

const TEST_SECRET = 'test-cross-handoff-secret';
const PRODUCT_ID = 'd594ddce-2fb5-49e0-859d-9ff91e752b9d';

function sealFields(fields, now = Date.now()) {
  return crypto.sealCrossHandoffPayload(
    {
      productId: PRODUCT_ID,
      landingSlug: 'valshebni-peperudi',
      campaign: 'butterflies',
      fields,
    },
    TEST_SECRET,
    now
  );
}

describe('store-handoff-consume', () => {
  beforeEach(() => {
    process.env.CAMPAIGN_HANDOFF_SECRET = TEST_SECRET;
    process.env.NEXT_PUBLIC_STORE_PRODUCT_ID = PRODUCT_ID;
  });

  afterEach(() => {
    delete process.env.CAMPAIGN_HANDOFF_SECRET;
    delete process.env.NEXT_PUBLIC_STORE_PRODUCT_ID;
  });

  it('maps all kit sizes to landing form state', () => {
    const cases = [
      ['komplekt_mini_1_peperuda_2_vodni_koncheta', '3'],
      ['komplekt_standart_2_peperuda_3_vodni_koncheta', '5'],
      ['komplekt_maksi_3_peperuda_4_vodni_koncheta', '7'],
    ];

    for (const [storeKey, landingSize] of cases) {
      const formState = consume.mapCrossHandoffFieldsToFormState({
        option_razmer_na_komplekta: storeKey,
        option_coloring: 'paints',
      });
      assert.equal(formState.size, landingSize);
      assert.equal(formState.coloring, 'paints');
      assert.equal(formState.personalize, false);
    }
  });

  it('maps paints/markers coloring and optional personalization', () => {
    const withName = consume.mapCrossHandoffFieldsToFormState({
      option_razmer_na_komplekta: 'komplekt_standart_2_peperuda_3_vodni_koncheta',
      option_coloring: 'markers',
      pf_field_e0bd392877ce4fa2841f3c81ac0b21db: 'Анна',
    });
    assert.equal(withName.coloring, 'markers');
    assert.equal(withName.personalize, true);
    assert.equal(withName.personalizationName, 'Анна');
  });

  it('consumes cookie once and clears with exact attributes', () => {
    const sealed = sealFields({
      option_razmer_na_komplekta: 'komplekt_mini_1_peperuda_2_vodni_koncheta',
      option_coloring: 'paints',
    });
    const cookieHeader = `vemidi_cross_handoff=${encodeURIComponent(sealed)}`;

    const first = consume.consumeStoreHandoffCookie(cookieHeader);
    assert.equal(first.ok, true);
    assert.equal(first.formState.size, '3');
    assert.match(first.clearCookieHeader, /vemidi_cross_handoff=/);
    assert.match(first.clearCookieHeader, /Domain=\.vemidi-crafts\.com/);
    assert.match(first.clearCookieHeader, /Path=\//);
    assert.match(first.clearCookieHeader, /Max-Age=0/);
    assert.match(first.clearCookieHeader, /HttpOnly/);
    assert.match(first.clearCookieHeader, /Secure/);

    const second = consume.consumeStoreHandoffCookie('');
    assert.equal(second.ok, false);
    assert.equal(second.status, 404);
  });

  it('rejects expired and tampered payloads', () => {
    const expired = sealFields(
      {
        option_razmer_na_komplekta: 'komplekt_mini_1_peperuda_2_vodni_koncheta',
        option_coloring: 'paints',
      },
      Date.now() - 400_000
    );
    const expiredResult = consume.consumeStoreHandoffCookie(
      `vemidi_cross_handoff=${encodeURIComponent(expired)}`
    );
    assert.equal(expiredResult.ok, false);
    assert.equal(expiredResult.status, 410);

    const tampered = `${sealFields({
      option_razmer_na_komplekta: 'komplekt_mini_1_peperuda_2_vodni_koncheta',
      option_coloring: 'paints',
    })}broken`;
    const tamperedResult = consume.consumeStoreHandoffCookie(
      `vemidi_cross_handoff=${encodeURIComponent(tampered)}`
    );
    assert.equal(tamperedResult.ok, false);
    assert.equal(tamperedResult.status, 400);
  });

  it('returns defaults path when cookie missing (404)', () => {
    const result = consume.consumeStoreHandoffCookie('');
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
  });
});

describe('checkout-handoff reverse mapping', () => {
  it('matches store-handoff-consume mapping in browser-safe module', () => {
    const fields = {
      option_razmer_na_komplekta: 'komplekt_maksi_3_peperuda_4_vodni_koncheta',
      option_coloring: 'markers',
      pf_field_e0bd392877ce4fa2841f3c81ac0b21db: 'Петър',
    };

    const fromCheckout = handoff.mapStoreHandoffFieldsToFormState(fields);
    const fromConsume = consume.mapCrossHandoffFieldsToFormState(fields);

    assert.deepEqual(fromCheckout, fromConsume);
    assert.equal(handoff.isValidStoreHandoffFormState(fromCheckout), true);
  });

  it('does not mutate existing landing → store POST allowlist', () => {
    assert.equal(handoff.CAMPAIGN_CHECKOUT_POST_PATH, '/api/campaign-checkout');
    assert.equal(handoff.ALLOWED_POST_FIELD_NAMES.has('option_razmer_na_komplekta'), true);
    assert.equal(handoff.ALLOWED_POST_FIELD_NAMES.has('option_coloring'), true);
  });
});

describe('store-to-landing prefill model', () => {
  it('personalization absent keeps personalize false', () => {
    const formState = handoff.mapStoreHandoffFieldsToFormState({
      option_razmer_na_komplekta: 'komplekt_mini_1_peperuda_2_vodni_koncheta',
      option_coloring: 'paints',
    });
    assert.equal(formState.personalize, false);
    assert.equal(formState.personalizationName, '');
  });

  it('invalid form state is rejected before prefill', () => {
    assert.equal(
      handoff.isValidStoreHandoffFormState({
        size: '99',
        coloring: 'paints',
        personalize: false,
        personalizationName: '',
      }),
      false
    );
  });
});
