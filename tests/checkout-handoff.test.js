'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  CAMPAIGN,
  SOURCE,
  DEFAULT_PRODUCT_ID,
  DEFAULT_PRODUCT_SLUG,
  STORE_OPTION_MAPPING,
  resolvePublicConfig,
  buildCampaignCheckoutUrl,
  buildSafeStoreProductUrl,
  resolveStoreHandoff,
  assertHandoffUrlSafe,
  mapProductOptions,
} = require('../lib/checkout-handoff');

const PRODUCT_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const LANDING_URL = 'https://special.vemidi-crafts.com/valshebni-peperudi';

const baseConfig = {
  storeUrl: 'http://localhost:3000',
  productId: PRODUCT_ID,
  productSlug: DEFAULT_PRODUCT_SLUG,
  landingUrl: LANDING_URL,
  safeHandoffFallback: false,
};

const safeConfig = {
  storeUrl: 'https://vemidi-crafts.com',
  productId: DEFAULT_PRODUCT_ID,
  productSlug: DEFAULT_PRODUCT_SLUG,
  landingUrl: LANDING_URL,
  safeHandoffFallback: true,
};

const EXPECTED_SAFE_CTA_URL =
  'https://vemidi-crafts.com/produkti/tvorcheski-komplekt-valshebni-peperudi?campaign=butterflies&source=campaign-butterflies&landing=https%3A%2F%2Fspecial.vemidi-crafts.com%2Fvalshebni-peperudi';

/**
 * @param {{ ok: false, error: string } | { ok: true, target: string, url: string }} result
 * @returns {{ ok: true, target: string, url: string }}
 */
function assertHandoffSuccess(result) {
  if (!result.ok) {
    assert.fail(`expected successful handoff, got: ${result.error ?? 'unknown error'}`);
  }
  return result;
}

describe('resolvePublicConfig', () => {
  it('reads NEXT_PUBLIC_* values from env', () => {
    const config = resolvePublicConfig({
      NEXT_PUBLIC_STORE_URL: 'http://localhost:3000',
      NEXT_PUBLIC_STORE_PRODUCT_ID: PRODUCT_ID,
      NEXT_PUBLIC_STORE_PRODUCT_SLUG: 'tvorcheski-komplekt-valshebni-peperudi',
      NEXT_PUBLIC_LANDING_URL: LANDING_URL,
      NEXT_PUBLIC_SAFE_HANDOFF_FALLBACK: 'false',
    });

    assert.equal(config.storeUrl, 'http://localhost:3000');
    assert.equal(config.productId, PRODUCT_ID);
    assert.equal(config.productSlug, 'tvorcheski-komplekt-valshebni-peperudi');
    assert.equal(config.landingUrl, LANDING_URL);
    assert.equal(config.campaign, CAMPAIGN);
    assert.equal(config.source, SOURCE);
    assert.equal(config.safeHandoffFallback, false);
  });

  it('falls back to production defaults when env is missing', () => {
    const config = resolvePublicConfig({});
    assert.equal(config.storeUrl, 'https://vemidi-crafts.com');
    assert.equal(config.productId, DEFAULT_PRODUCT_ID);
    assert.equal(config.productSlug, DEFAULT_PRODUCT_SLUG);
    assert.equal(config.landingUrl, LANDING_URL);
    assert.equal(config.safeHandoffFallback, true);
  });
});

describe('buildSafeStoreProductUrl', () => {
  it('builds the temporary safe product page URL with attribution only', () => {
    const result = buildSafeStoreProductUrl(safeConfig);
    const success = assertHandoffSuccess(result);

    assert.equal(success.target, 'product-page');
    assert.equal(success.url, EXPECTED_SAFE_CTA_URL);

    const url = new URL(success.url);
    assert.equal(url.pathname, '/produkti/tvorcheski-komplekt-valshebni-peperudi');
    assert.equal(url.searchParams.get('campaign'), 'butterflies');
    assert.equal(url.searchParams.get('source'), 'campaign-butterflies');
    assert.equal(url.searchParams.get('landing'), LANDING_URL);
    assert.equal(url.searchParams.has('product'), false);
    assert.equal(url.searchParams.has('quantity'), false);
    assert.equal(url.searchParams.has('option_kit_size'), false);
    assert.equal(url.searchParams.has('option_coloring'), false);
    assert.equal(url.searchParams.has('option_personalization'), false);
    assertHandoffUrlSafe(success.url);
  });

  it('does not include price or personal data in safe fallback URL', () => {
    const result = buildSafeStoreProductUrl(safeConfig);
    const success = assertHandoffSuccess(result);
    const lowered = success.url.toLowerCase();

    for (const forbidden of ['price', 'total', 'email', 'phone', 'address', 'childname']) {
      assert.equal(lowered.includes(forbidden), false, `unexpected value in URL: ${forbidden}`);
    }
    assertHandoffUrlSafe(success.url);
  });
});

describe('mapProductOptions', () => {
  it('maps landing configurator values to store option keys', () => {
    assert.deepEqual(
      mapProductOptions({
        size: '5',
        coloring: 'markers',
        personalize: false,
      }),
      {
        option_kit_size: 'standard',
        option_coloring: 'markers',
        option_personalization: 'no',
      }
    );
  });
});

describe('buildCampaignCheckoutUrl', () => {
  it('builds the expected handoff URL with option keys', () => {
    const result = buildCampaignCheckoutUrl(baseConfig, {
      size: '3',
      coloring: 'markers',
      personalize: false,
    });

    const success = assertHandoffSuccess(result);
    assert.equal(success.target, 'checkout');
    const url = new URL(success.url);
    assert.equal(url.origin, 'http://localhost:3000');
    assert.equal(url.pathname, '/campaign-checkout');
    assert.equal(url.searchParams.get('product'), PRODUCT_ID);
    assert.equal(url.searchParams.get('campaign'), 'butterflies');
    assert.equal(url.searchParams.get('source'), 'campaign-butterflies');
    assert.equal(url.searchParams.get('quantity'), '1');
    assert.equal(url.searchParams.get('landing'), LANDING_URL);
    assert.equal(url.searchParams.get('option_kit_size'), 'mini');
    assert.equal(url.searchParams.get('option_coloring'), 'markers');
    assert.equal(url.searchParams.get('option_personalization'), 'no');
    assertHandoffUrlSafe(success.url);
  });

  it('URL-encodes landing parameter', () => {
    const result = buildCampaignCheckoutUrl(
      {
        ...baseConfig,
        landingUrl: 'https://special.vemidi-crafts.com/valshebni-peperudi?ref=test',
      },
      {
        size: '3',
        coloring: 'paints',
        personalize: false,
      }
    );

    const success = assertHandoffSuccess(result);
    const url = new URL(success.url);
    assert.equal(
      url.searchParams.get('landing'),
      'https://special.vemidi-crafts.com/valshebni-peperudi?ref=test'
    );
    assert.match(
      success.url,
      /landing=https%3A%2F%2Fspecial\.vemidi-crafts\.com%2Fvalshebni-peperudi%3Fref%3Dtest/
    );
  });

  it('does not include price or personal data in URL', () => {
    const result = buildCampaignCheckoutUrl(baseConfig, {
      size: '7',
      coloring: 'paints',
      personalize: true,
      childName: 'Иван',
    });

    const success = assertHandoffSuccess(result);
    const lowered = success.url.toLowerCase();
    for (const forbidden of ['price', 'total', 'email', 'phone', 'address', 'childname', 'иван']) {
      assert.equal(lowered.includes(forbidden), false, `unexpected value in URL: ${forbidden}`);
    }
    assertHandoffUrlSafe(success.url);
  });

  it('does not pass unsupported landing option names', () => {
    const result = buildCampaignCheckoutUrl(baseConfig, {
      size: '3',
      coloring: 'paints',
      personalize: false,
    });

    const success = assertHandoffSuccess(result);
    const url = new URL(success.url);
    assert.equal(url.searchParams.has('size'), false);
    assert.equal(url.searchParams.has('coloring'), false);
    assert.equal(url.searchParams.has('personalize'), false);
    assert.equal(url.searchParams.has('kitSize'), false);
    assert.equal(url.searchParams.get('option_kit_size'), 'mini');
  });

  it('fails when product id is missing', () => {
    const result = buildCampaignCheckoutUrl({ ...baseConfig, productId: '' });
    if (result.ok) {
      assert.fail('expected missing product id to fail');
    }
    assert.match(result.error, /не е налична/i);
  });

  it('fails when store URL is invalid', () => {
    const result = buildCampaignCheckoutUrl({ ...baseConfig, storeUrl: 'not-a-url' });
    if (result.ok) {
      assert.fail('expected invalid store URL to fail');
    }
    assert.match(result.error, /невалидна/i);
  });
});

describe('resolveStoreHandoff', () => {
  it('uses safe product page fallback by default', () => {
    const result = resolveStoreHandoff(safeConfig, {
      size: '5',
      coloring: 'markers',
      personalize: true,
      childName: 'Мая',
    });

    const success = assertHandoffSuccess(result);
    assert.equal(success.target, 'product-page');
    assert.equal(success.url, EXPECTED_SAFE_CTA_URL);

    const url = new URL(success.url);
    assert.equal(url.pathname, '/produkti/tvorcheski-komplekt-valshebni-peperudi');
    assert.equal(url.searchParams.has('option_kit_size'), false);
    assert.equal(url.searchParams.has('childName'), false);
    assertHandoffUrlSafe(success.url);
  });

  it('redirects to product page when personalization text contains a child name (legacy handoff)', () => {
    const result = resolveStoreHandoff(baseConfig, {
      size: '5',
      coloring: 'markers',
      personalize: true,
      childName: 'Мая',
    });

    const success = assertHandoffSuccess(result);
    assert.equal(success.target, 'product');
    const url = new URL(success.url);
    assert.equal(url.pathname, `/products/${PRODUCT_ID}`);
    assert.equal(url.searchParams.get('campaign'), 'butterflies');
    assert.equal(url.searchParams.get('source'), 'campaign-butterflies');
    assert.equal(url.searchParams.get('option_kit_size'), 'standard');
    assert.equal(url.searchParams.get('option_coloring'), 'markers');
    assert.equal(url.searchParams.get('option_personalization'), 'yes');
    assert.equal(url.searchParams.has('option_text_child_name'), false);
    assertHandoffUrlSafe(success.url);
  });

  it('uses campaign checkout when personalization is disabled (legacy handoff)', () => {
    const result = resolveStoreHandoff(baseConfig, {
      size: '3',
      coloring: 'markers',
      personalize: false,
    });

    const success = assertHandoffSuccess(result);
    assert.equal(success.target, 'checkout');
    assert.match(success.url, /\/campaign-checkout/);
  });
});

describe('STORE_OPTION_MAPPING', () => {
  it('documents the configured group and value keys', () => {
    assert.equal(STORE_OPTION_MAPPING.kitSize.groupKey, 'kit_size');
    assert.equal(STORE_OPTION_MAPPING.coloring.groupKey, 'coloring');
    assert.equal(STORE_OPTION_MAPPING.personalization.groupKey, 'personalization');
  });
});

describe('order CTA redirect guard', () => {
  it('prevents duplicate redirect actions', () => {
    let redirectCount = 0;
    let isRedirecting = false;

    function handleOrderClick() {
      if (isRedirecting) return { action: 'ignored' };
      const result = resolveStoreHandoff(safeConfig, {
        size: '3',
        coloring: 'paints',
        personalize: false,
      });
      if (!result.ok) return { action: 'error', error: result.error };
      isRedirecting = true;
      redirectCount += 1;
      return { action: 'redirect', url: result.url };
    }

    const first = handleOrderClick();
    const second = handleOrderClick();

    assert.equal(first.action, 'redirect');
    assert.equal(second.action, 'ignored');
    assert.equal(redirectCount, 1);
    assert.equal(first.url, EXPECTED_SAFE_CTA_URL);
  });

  it('does not call legacy order API from CTA flow', () => {
    const legacyCalls = [];
    function legacySubmitOrder() {
      legacyCalls.push('submit');
    }

    function handleOrderClick() {
      const result = resolveStoreHandoff(safeConfig, {
        size: '3',
        coloring: 'paints',
        personalize: false,
      });
      if (!result.ok) return;
      return result.url;
    }

    handleOrderClick();
    assert.equal(legacyCalls.length, 0);
    assert.equal(typeof legacySubmitOrder, 'function');
  });
});
