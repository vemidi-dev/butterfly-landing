'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handoff = require('../lib/checkout-handoff');

const root = path.join(__dirname, '..');

describe('store-to-landing prefill integration (static)', () => {
  it('script.js consumes handoff on load before relying on defaults', () => {
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    assert.match(script, /consumeStoreHandoffPrefill/);
    assert.match(script, /applyHandoffFormState/);
    assert.match(script, /fetchLandingHandoffConsume/);
    assert.match(script, /fetchStorePreviewHandoffConsume/);
    assert.match(script, /credentials:\s*'include'/);
  });

  it('index.html loads checkout-handoff before script.js', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const handoffIndex = html.indexOf('/lib/checkout-handoff.js');
    const scriptIndex = html.indexOf('/script.js');
    assert.ok(handoffIndex >= 0);
    assert.ok(scriptIndex > handoffIndex);
  });

  it('applyHandoffFormState contract aligns with getFormState fields', () => {
    const valid = {
      size: '5',
      coloring: 'markers',
      personalize: true,
      personalizationName: 'Тест',
    };
    assert.equal(handoff.isValidStoreHandoffFormState(valid), true);

    const mapped = handoff.mapStoreHandoffFieldsToFormState({
      option_razmer_na_komplekta: 'komplekt_standart_2_peperuda_3_vodni_koncheta',
      option_coloring: 'markers',
      pf_field_e0bd392877ce4fa2841f3c81ac0b21db: 'Тест',
    });
    assert.deepEqual(mapped, valid);
  });
});
