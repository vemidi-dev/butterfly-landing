'use strict';

const LANDING_HANDOFF_RESET_MARKER = 'vemidi:landing-handoff-reset-v1';

const DEFAULT_CONFIGURATOR_STATE = Object.freeze({
  size: '3',
  coloring: 'paints',
  personalize: false,
  personalizationName: '',
});

const DEFAULT_ORDER_BUTTON_TEXT = 'Поръчай Вълшебни пеперуди ✨';

/**
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} storage
 */
function markLandingHandoffResetPending(storage) {
  storage.setItem(LANDING_HANDOFF_RESET_MARKER, '1');
}

/**
 * @param {Pick<Storage, 'getItem' | 'removeItem'>} storage
 */
function consumeLandingHandoffResetMarker(storage) {
  if (storage.getItem(LANDING_HANDOFF_RESET_MARKER) !== '1') {
    return false;
  }
  storage.removeItem(LANDING_HANDOFF_RESET_MARKER);
  return true;
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
  DEFAULT_CONFIGURATOR_STATE,
  DEFAULT_ORDER_BUTTON_TEXT,
  markLandingHandoffResetPending,
  consumeLandingHandoffResetMarker,
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
