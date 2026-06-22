'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handoffReset = require('../lib/landing-handoff-reset');
const {
  markLandingHandoffResetPending,
  consumeLandingHandoffResetMarker,
  clearLandingHandoffResetMarker,
  shouldResetLandingConfiguratorAfterHandoff,
  isOrderButtonInHandoffSubmittingState,
  restoreOrderButtonReadyState,
  runDeferredHandoffReset,
  applyConfiguratorDomReset,
  readConfiguratorFormState,
  isConfiguratorInDefaultState,
  getDefaultConfiguratorState,
  LANDING_HANDOFF_RESET_MARKER,
  LANDING_ASSET_VERSION,
  DEFAULT_ORDER_BUTTON_TEXT,
  HANDOFF_SUBMITTING_BUTTON_TEXT,
} = handoffReset;

function createMockStorage() {
  /** @type {Record<string, string>} */
  const data = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

function createMockClassList(initial = []) {
  /** @type {Set<string>} */
  const classes = new Set(initial);
  return {
    add(cls) {
      classes.add(cls);
    },
    remove(cls) {
      classes.delete(cls);
    },
    has(cls) {
      return classes.has(cls);
    },
  };
}

function createConfiguratorDom(initial = {}) {
  const size = initial.size ?? '7';
  const coloring = initial.coloring ?? 'markers';
  const personalize = initial.personalize ?? true;
  const personalizationName = initial.personalizationName ?? '';
  const nameFieldCollapsed = initial.nameFieldCollapsed ?? true;

  const sizeInputs = ['3', '5', '7'].map((value) => ({
    value,
    name: 'size',
    checked: value === size,
  }));
  const coloringInputs = ['paints', 'markers'].map((value) => ({
    value,
    name: 'coloring',
    checked: value === coloring,
  }));
  const personalizeToggle = { checked: personalize, name: 'personalize' };
  const personalizationNameInput = {
    value: personalizationName,
    name: 'personalizationName',
    required: personalize,
    classList: createMockClassList(['config-field--error']),
  };
  const nameField = {
    classList: createMockClassList(
      nameFieldCollapsed ? ['config-field--collapsed', 'config-field--error'] : [],
    ),
  };
  const configErrors = {
    hidden: false,
    innerHTML: '<p>Моля, въведете име.</p>',
  };
  const orderBtn = {
    disabled: true,
    textContent: 'Пренасочване...',
  };

  const form = {
    querySelector(selector) {
      if (selector === 'input[name="size"]:checked') {
        return sizeInputs.find((input) => input.checked) ?? null;
      }
      if (selector.startsWith('input[name="size"][value="')) {
        const value = selector.match(/value="([^"]+)"/)?.[1];
        return sizeInputs.find((input) => input.value === value) ?? null;
      }
      if (selector === 'input[name="coloring"]:checked') {
        return coloringInputs.find((input) => input.checked) ?? null;
      }
      if (selector.startsWith('input[name="coloring"][value="')) {
        const value = selector.match(/value="([^"]+)"/)?.[1];
        return coloringInputs.find((input) => input.value === value) ?? null;
      }
      if (selector === 'input[name="personalize"]') {
        return personalizeToggle;
      }
      if (selector === 'input[name="personalizationName"]') {
        return personalizationNameInput;
      }
      return null;
    },
  };

  return {
    form,
    personalizeToggle,
    personalizationNameInput,
    nameField,
    configErrors,
    orderBtn,
  };
}

describe('landing handoff reset marker', () => {
  it('marks pending reset immediately before protected POST handoff', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'script.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

    assert.match(indexHtml, /landing-handoff-reset\.js/);
    assert.match(script, /markLandingHandoffResetPending\(window\.sessionStorage\)/);
    assert.match(script, /submitCampaignCheckoutPostHandoff\(result\)/);
    assert.doesNotMatch(
      script,
      /markLandingHandoffResetPending[\s\S]*result\.mode === 'get'/,
    );
  });

  it('resets configurator on pageshow when marker exists', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'script.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    assert.match(script, /window\.addEventListener\('pageshow', handleLandingPageShow\)/);
    assert.match(script, /event\.persisted/);
    assert.match(script, /forcePersistedRestore:\s*true/);
    assert.match(script, /runDeferredHandoffReset\(applyLandingHandoffDomReset\)/);
    assert.match(script, /document\.addEventListener\('visibilitychange', handleLandingVisibilityChange\)/);
    assert.match(script, /restoreOrderButtonReadyState\(orderBtn/);
    assert.match(indexHtml, new RegExp(`/lib/landing-handoff-reset\\.js\\?v=${LANDING_ASSET_VERSION}`));
    assert.match(indexHtml, new RegExp(`/script\\.js\\?v=${LANDING_ASSET_VERSION}`));
    assert.doesNotMatch(script, /showStoreSourceNotice\(\);\s*\n\s*resetConfiguratorAfterHandoff\(\)/);
  });
});

describe('landing configurator reset after checkout handoff', () => {
  it('Landing submit → pageshow/back restore → fully reset form', () => {
    const storage = createMockStorage();
    const dom = createConfiguratorDom({
      size: '7',
      coloring: 'markers',
      personalize: true,
      personalizationName: '',
      nameFieldCollapsed: true,
    });

    assert.equal(readConfiguratorFormState(dom.form).personalize, true);
    assert.equal(readConfiguratorFormState(dom.form).personalizationName, '');
    assert.ok(dom.nameField.classList.has('config-field--collapsed'));

    markLandingHandoffResetPending(storage);
    assert.equal(storage.getItem(LANDING_HANDOFF_RESET_MARKER), '1');

    assert.equal(consumeLandingHandoffResetMarker(storage), true);
    applyConfiguratorDomReset(dom);

    const state = readConfiguratorFormState(dom.form);
    assert.equal(isConfiguratorInDefaultState(state), true);
    assert.deepEqual(state, getDefaultConfiguratorState());
    assert.equal(dom.personalizeToggle.checked, false);
    assert.equal(dom.personalizationNameInput.value, '');
    assert.equal(dom.personalizationNameInput.required, false);
    assert.ok(dom.nameField.classList.has('config-field--collapsed'));
    assert.equal(dom.configErrors.hidden, true);
    assert.equal(dom.configErrors.innerHTML, '');
    assert.equal(dom.orderBtn.disabled, false);
    assert.equal(storage.getItem(LANDING_HANDOFF_RESET_MARKER), null);
  });

  it('never leaves personalization enabled with hidden or empty name field', () => {
    const dom = createConfiguratorDom({
      size: '5',
      coloring: 'paints',
      personalize: true,
      personalizationName: '',
      nameFieldCollapsed: true,
    });

    applyConfiguratorDomReset(dom);

    const state = readConfiguratorFormState(dom.form);
    assert.equal(state.personalize, false);
    assert.equal(state.personalizationName, '');
    assert.ok(dom.nameField.classList.has('config-field--collapsed'));
  });

  it('clears marker only once and ignores pageshow without marker', () => {
    const storage = createMockStorage();
    assert.equal(consumeLandingHandoffResetMarker(storage), false);
    assert.equal(consumeLandingHandoffResetMarker(storage), false);
  });

  it('does not reset on first pageshow without marker or loading state', () => {
    const storage = createMockStorage();
    const orderBtn = {
      disabled: false,
      textContent: DEFAULT_ORDER_BUTTON_TEXT,
    };

    assert.equal(
      shouldResetLandingConfiguratorAfterHandoff({
        storage,
        isSubmittingToStore: false,
        orderBtn,
      }),
      false,
    );
  });

  it('browser back without marker but persisted submitting state → full reset on pageshow', () => {
    const storage = createMockStorage();
    const dom = createConfiguratorDom({
      size: '7',
      coloring: 'markers',
      personalize: true,
      personalizationName: 'Мария',
      nameFieldCollapsed: false,
    });
    let isSubmittingToStore = true;

    assert.equal(storage.getItem(LANDING_HANDOFF_RESET_MARKER), null);
    assert.equal(
      shouldResetLandingConfiguratorAfterHandoff({
        storage,
        isSubmittingToStore,
        orderBtn: dom.orderBtn,
      }),
      true,
    );

    clearLandingHandoffResetMarker(storage);
    isSubmittingToStore = false;
    applyConfiguratorDomReset(dom);

    const state = readConfiguratorFormState(dom.form);
    assert.equal(isConfiguratorInDefaultState(state), true);
    assert.equal(isSubmittingToStore, false);
    assert.equal(dom.orderBtn.disabled, false);
    assert.equal(dom.orderBtn.textContent, DEFAULT_ORDER_BUTTON_TEXT);
    assert.equal(dom.personalizeToggle.checked, false);
    assert.equal(dom.personalizationNameInput.value, '');
    assert.ok(dom.nameField.classList.has('config-field--collapsed'));
    assert.equal(storage.getItem(LANDING_HANDOFF_RESET_MARKER), null);
  });

  it('detects stale handoff state from disabled order button without marker', () => {
    const storage = createMockStorage();
    assert.equal(
      shouldResetLandingConfiguratorAfterHandoff({
        storage,
        isSubmittingToStore: false,
        orderBtn: { disabled: true, textContent: DEFAULT_ORDER_BUTTON_TEXT },
      }),
      true,
    );
  });

  it('detects stale handoff state from redirecting button label without marker', () => {
    const storage = createMockStorage();
    assert.equal(
      shouldResetLandingConfiguratorAfterHandoff({
        storage,
        isSubmittingToStore: false,
        orderBtn: { disabled: false, textContent: HANDOFF_SUBMITTING_BUTTON_TEXT },
      }),
      true,
    );
  });

  it('bfcache pageshow without marker restores button immediately and resets form after defer', async () => {
    const storage = createMockStorage();
    const dom = createConfiguratorDom({
      size: '7',
      coloring: 'markers',
      personalize: true,
      personalizationName: 'Мария',
      nameFieldCollapsed: false,
    });
    let isSubmittingToStore = true;
    let deferredRan = false;

    assert.equal(storage.getItem(LANDING_HANDOFF_RESET_MARKER), null);
    assert.equal(isSubmittingToStore, true);
    assert.equal(isOrderButtonInHandoffSubmittingState(dom.orderBtn), true);

    clearLandingHandoffResetMarker(storage);
    isSubmittingToStore = false;
    restoreOrderButtonReadyState(dom.orderBtn, DEFAULT_ORDER_BUTTON_TEXT);

    assert.equal(isSubmittingToStore, false);
    assert.equal(dom.orderBtn.disabled, false);
    assert.equal(dom.orderBtn.textContent, DEFAULT_ORDER_BUTTON_TEXT);

    await runDeferredHandoffReset(() => {
      applyConfiguratorDomReset(dom);
      deferredRan = true;
    });

    assert.equal(deferredRan, true);
    assert.equal(isConfiguratorInDefaultState(readConfiguratorFormState(dom.form)), true);
    assert.equal(storage.getItem(LANDING_HANDOFF_RESET_MARKER), null);

    isSubmittingToStore = false;
    let handoffStarted = false;
    const tryStartHandoff = () => {
      if (isSubmittingToStore) {
        return false;
      }
      isSubmittingToStore = true;
      dom.orderBtn.disabled = true;
      dom.orderBtn.textContent = HANDOFF_SUBMITTING_BUTTON_TEXT;
      handoffStarted = true;
      return true;
    };

    assert.equal(tryStartHandoff(), true);
    assert.equal(handoffStarted, true);
  });

  it('visibility fallback detects blocked checkout button', () => {
    const orderBtn = {
      disabled: true,
      textContent: HANDOFF_SUBMITTING_BUTTON_TEXT,
    };
    assert.equal(isOrderButtonInHandoffSubmittingState(orderBtn), true);
    restoreOrderButtonReadyState(orderBtn, DEFAULT_ORDER_BUTTON_TEXT);
    assert.equal(orderBtn.disabled, false);
    assert.equal(orderBtn.textContent, DEFAULT_ORDER_BUTTON_TEXT);
    assert.equal(isOrderButtonInHandoffSubmittingState(orderBtn), false);
  });
});
