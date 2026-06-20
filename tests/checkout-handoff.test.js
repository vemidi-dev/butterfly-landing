'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handoff = require('../lib/checkout-handoff');
const {
  CAMPAIGN,
  SOURCE,
  DEFAULT_PRODUCT_ID,
  DEFAULT_PRODUCT_SLUG,
  LEGACY_PERSONALIZATION_POST_KEY,
  STORE_OPTION_MAPPING,
  ALLOWED_POST_FIELD_NAMES,
  resolvePublicConfig,
  buildCampaignCheckoutPostHandoff,
  buildSafeStoreProductUrl,
  resolveStoreHandoff,
  validateFormStateForHandoff,
  assertPostFieldsSafe,
  assertHandoffUrlSafe,
  mapProductOptions,
  submitCampaignCheckoutPostHandoff,
} = handoff;

const PRODUCT_ID = DEFAULT_PRODUCT_ID;
const LANDING_URL = 'https://special.vemidi-crafts.com/valshebni-peperudi';
const STORE_URL = 'https://vemidi-crafts.com';

const handoffConfig = {
  storeUrl: STORE_URL,
  productId: PRODUCT_ID,
  productSlug: DEFAULT_PRODUCT_SLUG,
  landingUrl: LANDING_URL,
  safeHandoffFallback: false,
};

const safeConfig = {
  storeUrl: STORE_URL,
  productId: PRODUCT_ID,
  productSlug: DEFAULT_PRODUCT_SLUG,
  landingUrl: LANDING_URL,
  safeHandoffFallback: true,
};

const EXPECTED_SAFE_CTA_URL =
  'https://vemidi-crafts.com/produkti/tvorcheski-komplekt-valshebni-peperudi?campaign=butterflies&source=campaign-butterflies&landing=https%3A%2F%2Fspecial.vemidi-crafts.com%2Fvalshebni-peperudi';

const SIZE_VALUES = {
  '3': 'komplekt_mini_1_peperuda_2_vodni_koncheta',
  '5': 'komplekt_standart_2_peperuda_3_vodni_koncheta',
  '7': 'komplekt_maksi_3_peperuda_4_vodni_koncheta',
};

/**
 * @param {import('../lib/checkout-handoff').HandoffResult} result
 * @returns {import('../lib/checkout-handoff').HandoffGetSuccess | import('../lib/checkout-handoff').HandoffPostSuccess}
 */
function assertHandoffSuccess(result) {
  if (!result.ok) {
    assert.fail(`expected successful handoff, got: ${result.error ?? 'unknown error'}`);
  }
  return result;
}

/**
 * @param {import('../lib/checkout-handoff').HandoffResult} result
 * @returns {import('../lib/checkout-handoff').HandoffPostSuccess}
 */
function assertPostHandoffSuccess(result) {
  const success = assertHandoffSuccess(result);
  if (success.mode !== 'post') {
    assert.fail('expected POST handoff');
  }
  return success;
}

/**
 * @param {import('../lib/checkout-handoff').HandoffResult} result
 * @returns {import('../lib/checkout-handoff').HandoffGetSuccess}
 */
function assertGetHandoffSuccess(result) {
  const success = assertHandoffSuccess(result);
  if (success.mode !== 'get') {
    assert.fail('expected GET handoff');
  }
  return success;
}

/** @param {Record<string, string>} fields */
function assertNoForbiddenPostFields(fields) {
  for (const key of Object.keys(fields)) {
    assert.equal(
      ALLOWED_POST_FIELD_NAMES.has(key),
      true,
      `unexpected POST field: ${key}`
    );
    assert.equal(key.toLowerCase().includes('price'), false);
    assert.equal(key.toLowerCase().includes('email'), false);
    assert.equal(key.toLowerCase().includes('phone'), false);
    assert.equal(key.startsWith('option_text_'), false);
    assert.notEqual(key, 'child_name');
    assert.notEqual(key, 'option_personalization');
  }
  assertPostFieldsSafe(fields);
}

describe('resolvePublicConfig', () => {
  it('defaults safeHandoffFallback to true', () => {
    const config = resolvePublicConfig({});
    assert.equal(config.safeHandoffFallback, true);
    assert.equal(config.productId, PRODUCT_ID);
  });

  it('reads safeHandoffFallback=false from env for Preview POST flow', () => {
    const config = resolvePublicConfig({ NEXT_PUBLIC_SAFE_HANDOFF_FALLBACK: 'false' });
    assert.equal(config.safeHandoffFallback, false);
  });
});

describe('buildSafeStoreProductUrl', () => {
  it('builds canonical product URL when safe fallback is enabled', () => {
    const result = buildSafeStoreProductUrl(safeConfig);
    const success = assertHandoffSuccess(result);
    assert.equal(success.mode, 'get');
    assert.equal(success.url, EXPECTED_SAFE_CTA_URL);
    assertHandoffUrlSafe(success.url);
  });
});

describe('mapProductOptions', () => {
  it('maps size 3/5/7 to razmer_na_komplekta store keys', () => {
    for (const [size, storeValue] of Object.entries(SIZE_VALUES)) {
      assert.deepEqual(mapProductOptions({ size, coloring: 'paints', personalize: false }), {
        option_razmer_na_komplekta: storeValue,
        option_coloring: 'paints',
      });
    }
  });

  it('maps paints and markers coloring keys', () => {
    assert.equal(
      mapProductOptions({ size: '3', coloring: 'paints', personalize: false }).option_coloring,
      'paints'
    );
    assert.equal(
      mapProductOptions({ size: '3', coloring: 'markers', personalize: false }).option_coloring,
      'markers'
    );
  });

  it('does not emit personalization yes/no option groups', () => {
    const withPersonalization = mapProductOptions({
      size: '3',
      coloring: 'paints',
      personalize: true,
      personalizationName: 'Мария',
    });
    assert.equal(withPersonalization.option_personalization, undefined);
  });
});

describe('validateFormStateForHandoff', () => {
  it('fails for unknown size configuration', () => {
    const result = validateFormStateForHandoff({
      size: '99',
      coloring: 'paints',
      personalize: false,
    });
    if (result.ok) assert.fail('expected unknown size to fail');
    assert.match(result.error ?? '', /размер на комплекта/i);
  });

  it('fails for unknown coloring configuration', () => {
    const result = validateFormStateForHandoff({
      size: '3',
      coloring: 'unknown',
      personalize: false,
    });
    if (result.ok) assert.fail('expected unknown coloring to fail');
    assert.match(result.error ?? '', /оцветяване/i);
  });

  it('requires personalization name when personalize is enabled', () => {
    const result = validateFormStateForHandoff({
      size: '3',
      coloring: 'paints',
      personalize: true,
      personalizationName: '',
    });
    if (result.ok) assert.fail('expected missing name to fail');
    assert.match(result.error ?? '', /име/i);
  });
});

describe('buildCampaignCheckoutPostHandoff', () => {
  it('builds POST action to store /api/campaign-checkout', () => {
    const result = buildCampaignCheckoutPostHandoff(handoffConfig, {
      size: '3',
      coloring: 'paints',
      personalize: false,
    });
    const success = assertPostHandoffSuccess(result);
    assert.equal(success.action, `${STORE_URL}/api/campaign-checkout`);
    assert.equal(success.target, 'checkout');
  });

  it('includes exact field names and mappings without personalization', () => {
    const result = buildCampaignCheckoutPostHandoff(handoffConfig, {
      size: '5',
      coloring: 'markers',
      personalize: false,
    });
    const success = assertPostHandoffSuccess(result);

    assert.deepEqual(success.fields, {
      product: PRODUCT_ID,
      campaign: CAMPAIGN,
      source: SOURCE,
      landing: LANDING_URL,
      quantity: '1',
      option_razmer_na_komplekta: SIZE_VALUES['5'],
      option_coloring: 'markers',
    });
    assertNoForbiddenPostFields(success.fields);
    assert.equal(
      /** @type {Record<string, string>} */ (success.fields)[LEGACY_PERSONALIZATION_POST_KEY],
      undefined
    );
  });

  it('includes legacy pf field when personalization is enabled', () => {
    const result = buildCampaignCheckoutPostHandoff(handoffConfig, {
      size: '7',
      coloring: 'paints',
      personalize: true,
      personalizationName: 'Мария',
    });
    const success = assertPostHandoffSuccess(result);

    assert.equal(
      success.fields.option_razmer_na_komplekta,
      SIZE_VALUES['7']
    );
    assert.equal(success.fields.option_coloring, 'paints');
    assert.equal(success.fields[LEGACY_PERSONALIZATION_POST_KEY], 'Мария');
    assertNoForbiddenPostFields(success.fields);
  });

  it('does not include price, email, phone, or child_name fields', () => {
    const result = buildCampaignCheckoutPostHandoff(handoffConfig, {
      size: '3',
      coloring: 'paints',
      personalize: true,
      personalizationName: 'Алекс',
    });
    const success = assertPostHandoffSuccess(result);
    const serialized = JSON.stringify(success.fields).toLowerCase();
    assert.doesNotMatch(serialized, /"price"/);
    assert.doesNotMatch(serialized, /"email"/);
    assert.doesNotMatch(serialized, /"phone"/);
    assert.doesNotMatch(serialized, /child_name/);
    assert.doesNotMatch(serialized, /option_text_/);
  });

  it('fails when product id is missing', () => {
    const result = buildCampaignCheckoutPostHandoff({ ...handoffConfig, productId: '' }, {
      size: '3',
      coloring: 'paints',
      personalize: false,
    });
    if (result.ok) assert.fail('expected missing product id to fail');
    assert.match(result.error, /не е налична/i);
  });
});

describe('resolveStoreHandoff', () => {
  it('uses safe product page fallback when safeHandoffFallback is true', () => {
    const result = resolveStoreHandoff(safeConfig, {
      size: '7',
      coloring: 'markers',
      personalize: true,
      personalizationName: 'Test',
    });
    const success = assertHandoffSuccess(result);
    assert.equal(success.mode, 'get');
    assert.equal(success.target, 'product-page');
    assert.equal(success.url, EXPECTED_SAFE_CTA_URL);
  });

  it('uses secure POST handoff when safeHandoffFallback is false', () => {
    const result = resolveStoreHandoff(handoffConfig, {
      size: '7',
      coloring: 'markers',
      personalize: false,
    });
    const success = assertHandoffSuccess(result);
    assert.equal(success.mode, 'post');
    assert.equal(success.action, `${STORE_URL}/api/campaign-checkout`);
    assert.equal(success.fields.option_coloring, 'markers');
  });
});

describe('submitCampaignCheckoutPostHandoff', () => {
  it('creates same-tab POST form with hidden inputs and submits once', () => {
    const result = buildCampaignCheckoutPostHandoff(handoffConfig, {
      size: '3',
      coloring: 'paints',
      personalize: true,
      personalizationName: 'Мария',
    });
    const success = assertPostHandoffSuccess(result);

    /** @type {Array<{ method: string, action: string, target: string, inputs: Record<string, string> }>} */
    const submittedForms = [];
    /** @type {{ lastForm?: { method: string, action: string, target: string, submit: () => void } }} */
    const body = {};
    const doc = {
      body,
      /** @param {string} tag */
      createElement(tag) {
        if (tag === 'form') {
          return {
            method: '',
            action: '',
            target: '',
            /** @type {Array<{ type: string, name: string, value: string }>} */
            children: [],
            /** @param {{ type: string, name: string, value: string }} node */
            appendChild(node) {
              this.children.push(node);
            },
            submit() {
              /** @type {Record<string, string>} */
              const inputs = {};
              for (const child of this.children) {
                inputs[child.name] = child.value;
              }
              submittedForms.push({
                method: this.method,
                action: this.action,
                target: this.target,
                inputs,
              });
            },
          };
        }
        if (tag === 'input') {
          return { type: '', name: '', value: '' };
        }
        throw new Error(`unexpected tag: ${tag}`);
      },
    };

    submitCampaignCheckoutPostHandoff(success, {
      document: /** @type {Document} */ (/** @type {unknown} */ (doc)),
      appendChild(form) {
        body.lastForm = /** @type {{ method: string, action: string, target: string, submit: () => void }} */ (
          /** @type {unknown} */ (form)
        );
      },
    });

    assert.equal(submittedForms.length, 1);
    assert.equal(submittedForms[0].method, 'POST');
    assert.equal(submittedForms[0].action, `${STORE_URL}/api/campaign-checkout`);
    assert.equal(submittedForms[0].target, '');
    assert.deepEqual(submittedForms[0].inputs, success.fields);
  });
});

describe('STORE_OPTION_MAPPING', () => {
  it('documents store-verified group keys without universal personalization group', () => {
    assert.equal(STORE_OPTION_MAPPING.kitSize.groupKey, 'razmer_na_komplekta');
    assert.equal(STORE_OPTION_MAPPING.coloring.groupKey, 'coloring');
    assert.equal('personalization' in STORE_OPTION_MAPPING, false);
  });
});

describe('order CTA submit guard', () => {
  it('prevents duplicate submit actions in same tab flow', () => {
    let submitCount = 0;
    let isSubmitting = false;

    function handleOrderClick() {
      if (isSubmitting) return { action: 'ignored' };
      const result = resolveStoreHandoff(handoffConfig, {
        size: '3',
        coloring: 'paints',
        personalize: false,
      });
      if (!result.ok) return { action: 'error', error: result.error };
      isSubmitting = true;
      submitCount += 1;
      return { action: 'post', sameTab: true, mode: result.mode };
    }

    const first = handleOrderClick();
    const second = handleOrderClick();

    assert.equal(first.action, 'post');
    assert.equal(first.sameTab, true);
    assert.equal(first.mode, 'post');
    assert.equal(second.action, 'ignored');
    assert.equal(submitCount, 1);
  });
});

describe('POST handoff has no PII in URL', () => {
  it('POST action has no query string and no personalization in URL', () => {
    const result = buildCampaignCheckoutPostHandoff(handoffConfig, {
      size: '3',
      coloring: 'paints',
      personalize: true,
      personalizationName: 'Мария',
    });
    const success = assertPostHandoffSuccess(result);

    assert.doesNotMatch(success.action, /\?/);
    assert.doesNotMatch(success.action, /мария|maria|pf_/i);
    assert.equal(success.fields[LEGACY_PERSONALIZATION_POST_KEY], 'Мария');
  });

  it('pf_* and personalizationName never appear in any handoff URL', () => {
    const post = assertPostHandoffSuccess(
      buildCampaignCheckoutPostHandoff(handoffConfig, {
        size: '5',
        coloring: 'markers',
        personalize: true,
        personalizationName: 'Мария',
      })
    );
    const safe = assertGetHandoffSuccess(buildSafeStoreProductUrl(safeConfig));

    for (const url of [post.action, safe.url]) {
      assert.doesNotMatch(url, /pf_/i);
      assert.doesNotMatch(url, /personalizationname/i);
      assert.doesNotMatch(url, /мария|maria/i);
    }
  });
});

describe('deprecated GET checkout builders', () => {
  it('does not export buildCampaignCheckoutUrl', () => {
    assert.equal(Object.hasOwn(handoff, 'buildCampaignCheckoutUrl'), false);
  });

  it('safe fallback URL contains attribution only without product options', () => {
    const success = assertGetHandoffSuccess(buildSafeStoreProductUrl(safeConfig));
    const url = new URL(success.url);

    assert.equal(url.pathname, '/produkti/tvorcheski-komplekt-valshebni-peperudi');
    assert.equal(url.searchParams.get('campaign'), CAMPAIGN);
    assert.equal(url.searchParams.get('source'), SOURCE);
    assert.equal(url.searchParams.get('landing'), LANDING_URL);
    assert.equal(url.searchParams.has('product'), false);
    assert.equal([...url.searchParams.keys()].some((key) => key.startsWith('option_')), false);
    assert.equal([...url.searchParams.keys()].some((key) => key.startsWith('pf_')), false);
    assertHandoffUrlSafe(success.url);
  });

  it('secure flow resolves only to POST handoff payload', () => {
    const result = resolveStoreHandoff(handoffConfig, {
      size: '3',
      coloring: 'paints',
      personalize: true,
      personalizationName: 'Алекс',
    });
    const success = assertPostHandoffSuccess(result);
    assert.equal(success.mode, 'post');
    assert.equal(typeof success.action, 'string');
    assert.equal(typeof success.fields, 'object');
    assert.equal('url' in success, false);
  });
});

describe('FAQ and visible UI copy', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const expectedSnippet = 'конфигуратора на тази страница';
  const forbiddenSnippet = 'магазина на следващата стъпка';

  it('FAQ visible answer matches secure landing personalization copy', () => {
    const faqMatch = indexHtml.match(
      /<summary>Може ли да бъде персонализиран с име\?<\/summary>\s*<p>([^<]+)<\/p>/
    );
    assert.ok(faqMatch, 'expected visible FAQ personalization entry');
    assert.match(faqMatch[1], new RegExp(expectedSnippet, 'i'));
    assert.doesNotMatch(faqMatch[1], new RegExp(forbiddenSnippet, 'i'));
    assert.match(faqMatch[1], /не присъства в URL/i);
  });

  it('FAQ JSON-LD matches visible personalization copy', () => {
    const jsonLdMatch = indexHtml.match(
      /"name": "Може ли да бъде персонализиран с име\?",[\s\S]*?"text": "([^"]+)"/
    );
    assert.ok(jsonLdMatch, 'expected FAQ JSON-LD personalization entry');
    assert.match(jsonLdMatch[1], new RegExp(expectedSnippet, 'i'));
    assert.doesNotMatch(jsonLdMatch[1], new RegExp(forbiddenSnippet, 'i'));
    assert.match(jsonLdMatch[1], /не присъства в URL/i);
  });

  it('configurator hint aligns with FAQ personalization messaging', () => {
    assert.match(indexHtml, /name="personalizationName"/);
    assert.match(indexHtml, /не в URL/i);
    assert.doesNotMatch(indexHtml, /магазина на следващата стъпка/i);
  });
});
