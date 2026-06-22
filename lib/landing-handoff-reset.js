'use strict';

const LANDING_HANDOFF_RESET_MARKER = 'vemidi:landing-handoff-reset-v1';

const DEFAULT_CONFIGURATOR_STATE = Object.freeze({
  size: '3',
  coloring: 'paints',
  personalize: false,
  personalizationName: '',
});

const DEFAULT_ORDER_BUTTON_TEXT = 'Поръчай Вълшебни пеперуди ✨';
const HANDOFF_SUBMITTING_BUTTON_TEXT = 'Пренасочване...';
const LANDING_ASSET_VERSION = '20260622-handoff-6';

/**
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} storage
 */
function markLandingHandoffResetPending(storage) {
  storage.setItem(LANDING_HANDOFF_RESET_MARKER, '1');
}

/**
 * @param {Pick<Storage, 'getItem' | 'removeItem'>} storage
 */
function hasLandingHandoffResetMarker(storage) {
  return storage.getItem(LANDING_HANDOFF_RESET_MARKER) === '1';
}

function consumeLandingHandoffResetMarker(storage) {
  if (!hasLandingHandoffResetMarker(storage)) {
    return false;
  }
  storage.removeItem(LANDING_HANDOFF_RESET_MARKER);
  return true;
}

function clearLandingHandoffResetMarker(storage) {
  if (hasLandingHandoffResetMarker(storage)) {
    storage.removeItem(LANDING_HANDOFF_RESET_MARKER);
  }
}

/**
 * @param {{
 *   storage: Pick<Storage, 'getItem'>;
 *   isSubmittingToStore?: boolean;
 *   orderBtn?: { disabled?: boolean; textContent?: string | null } | null;
 * }} input
 */
function shouldResetLandingConfiguratorAfterHandoff(input) {
  if (hasLandingHandoffResetMarker(input.storage)) {
    return true;
  }
  if (input.isSubmittingToStore === true) {
    return true;
  }
  if (input.orderBtn?.disabled === true) {
    return true;
  }
  if (input.orderBtn?.textContent === HANDOFF_SUBMITTING_BUTTON_TEXT) {
    return true;
  }
  return false;
}

function isOrderButtonInHandoffSubmittingState(orderBtn) {
  if (!orderBtn) {
    return false;
  }
  return (
    orderBtn.disabled === true
    || orderBtn.textContent === HANDOFF_SUBMITTING_BUTTON_TEXT
  );
}

function restoreOrderButtonReadyState(
  orderBtn,
  orderBtnDefaultText = DEFAULT_ORDER_BUTTON_TEXT,
) {
  if (!orderBtn) {
    return;
  }
  orderBtn.disabled = false;
  orderBtn.textContent = orderBtnDefaultText;
}

/**
 * @param {() => void} callback
 * @returns {Promise<void>}
 */
function runDeferredHandoffReset(callback) {
  return new Promise((resolve) => {
    const run = () => {
      if (typeof callback === 'function') {
        callback();
      }
      resolve();
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        setTimeout(run, 0);
      });
      return;
    }

    setTimeout(run, 0);
  });
}

function getDefaultConfiguratorState() {
  return { ...DEFAULT_CONFIGURATOR_STATE };
}

/**
 * @param {HTMLFormElement | { querySelector: (selector: string) => { checked?: boolean; value?: string } | null }} form
 */
function readConfiguratorFormState(form) {
  const sizeInput = form.querySelector('input[name="size"]:checked');
  const coloringInput = form.querySelector('input[name="coloring"]:checked');
  const personalizeInput = form.querySelector('input[name="personalize"]');
  const nameInput = form.querySelector('input[name="personalizationName"]');

  return {
    size: sizeInput?.value || DEFAULT_CONFIGURATOR_STATE.size,
    coloring: coloringInput?.value || DEFAULT_CONFIGURATOR_STATE.coloring,
    personalize: personalizeInput?.checked === true,
    personalizationName: String(nameInput?.value || '').trim(),
  };
}

/**
 * @param {{
 *   form: { querySelector: (selector: string) => any };
 *   personalizeToggle?: { checked?: boolean } | null;
 *   nameField?: { classList: { add: (cls: string) => void; remove: (cls: string) => void } } | null;
 *   personalizationNameInput?: { value?: string; required?: boolean; classList?: { remove: (cls: string) => void } } | null;
 *   configErrors?: { hidden?: boolean; innerHTML?: string } | null;
 *   orderBtn?: { disabled?: boolean; textContent?: string } | null;
 *   orderBtnDefaultText?: string;
 * }} refs
 */
function applyConfiguratorDomReset(refs) {
  const {
    form,
    personalizeToggle = null,
    nameField = null,
    personalizationNameInput = null,
    configErrors = null,
    orderBtn = null,
    orderBtnDefaultText = DEFAULT_ORDER_BUTTON_TEXT,
  } = refs;

  const sizeDefault = form.querySelector('input[name="size"][value="3"]');
  const coloringDefault = form.querySelector('input[name="coloring"][value="paints"]');
  if (sizeDefault) {
    sizeDefault.checked = true;
  }
  if (coloringDefault) {
    coloringDefault.checked = true;
  }

  if (personalizeToggle) {
    personalizeToggle.checked = false;
  }
  if (personalizationNameInput) {
    personalizationNameInput.value = '';
    personalizationNameInput.required = false;
    personalizationNameInput.classList?.remove('config-field--error');
  }
  if (nameField) {
    nameField.classList.add('config-field--collapsed');
    nameField.classList.remove('config-field--error');
  }
  if (configErrors) {
    configErrors.hidden = true;
    configErrors.innerHTML = '';
  }
  if (orderBtn) {
    orderBtn.disabled = false;
    orderBtn.textContent = orderBtnDefaultText;
  }

  return getDefaultConfiguratorState();
}

/**
 * @param {{
 *   size?: string;
 *   coloring?: string;
 *   personalize?: boolean;
 *   personalizationName?: string;
 * }} state
 */
function isConfiguratorInDefaultState(state) {
  return (
    state.size === DEFAULT_CONFIGURATOR_STATE.size
    && state.coloring === DEFAULT_CONFIGURATOR_STATE.coloring
    && state.personalize === DEFAULT_CONFIGURATOR_STATE.personalize
    && state.personalizationName === DEFAULT_CONFIGURATOR_STATE.personalizationName
  );
}

const api = {
  LANDING_HANDOFF_RESET_MARKER,
  LANDING_ASSET_VERSION,
  DEFAULT_CONFIGURATOR_STATE,
  DEFAULT_ORDER_BUTTON_TEXT,
  HANDOFF_SUBMITTING_BUTTON_TEXT,
  markLandingHandoffResetPending,
  hasLandingHandoffResetMarker,
  consumeLandingHandoffResetMarker,
  clearLandingHandoffResetMarker,
  shouldResetLandingConfiguratorAfterHandoff,
  isOrderButtonInHandoffSubmittingState,
  restoreOrderButtonReadyState,
  runDeferredHandoffReset,
  getDefaultConfiguratorState,
  readConfiguratorFormState,
  applyConfiguratorDomReset,
  isConfiguratorInDefaultState,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  /** @type {any} */ (window).VeMidiLandingHandoffReset = api;
}
