'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('store source notice', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(process.cwd(), 'script.js'), 'utf8');

  it('shows configurator notice when source=store is present', () => {
    assert.match(indexHtml, /id="storeSourceNotice"/);
    assert.match(
      indexHtml,
      /Изборът ви остава запазен в магазина\. Ако направите нова конфигурация тук, тя ще бъде използвана при продължаване към поръчка\./,
    );
    assert.match(script, /function showStoreSourceNotice/);
    assert.match(script, /params\.get\('source'\) !== 'store'/);
  });

  it('does not call store-to-landing consume endpoints', () => {
    assert.doesNotMatch(script, /store-handoff-consume/);
    assert.doesNotMatch(script, /campaign-landing-handoff\/consume/);
    assert.doesNotMatch(script, /consumeStoreHandoffPrefill/);
  });
});
