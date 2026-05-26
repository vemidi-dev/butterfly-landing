(function () {
  'use strict';

  const PRICES = {
    base: { 3: 15, 5: 20, 7: 25 },
    personalize: 3,
  };

  const KITS = {
    3: {
      name: 'Комплект Мини',
      figures: '3 фигурки',
      items: [
        '1 дървена пеперуда',
        '2 дървени водни кончета',
        'конци за закачане',
        'дървени мъниста',
        'дървена закачалка',
      ],
    },
    5: {
      name: 'Комплект Стандарт',
      figures: '5 фигурки',
      items: [
        '3 дървени пеперуди',
        '2 дървени водни кончета',
        'конци за закачане',
        'дървени мъниста',
        'дървена закачалка',
      ],
    },
    7: {
      name: 'Комплект Макси',
      figures: '7 фигурки',
      items: [
        '3 дървени пеперуди',
        '4 дървени водни кончета',
        'конци за закачане',
        'дървени мъниста',
        'дървена закачалка',
      ],
    },
  };

  const COLORING_LABELS = { paints: 'Бои с четка', markers: 'Флумастери' };

  const PRESETS = { mini: '3', standard: '5', maxi: '7', small: '3', large: '5' };

  const form = document.getElementById('configForm');
  const summaryKit = document.getElementById('summaryKit');
  const summaryList = document.getElementById('summaryList');
  const summaryExtras = document.getElementById('summaryExtras');
  const summaryName = document.getElementById('summaryName');
  const priceBreakdown = document.getElementById('priceBreakdown');
  const totalPriceEl = document.getElementById('totalPrice');
  const configErrors = document.getElementById('configErrors');
  const nameField = document.getElementById('nameField');
  const personalizeToggle = document.getElementById('personalizeToggle');
  const childNameInput = document.getElementById('childName');
  const orderBtn = document.getElementById('orderBtn');
  const orderModal = document.getElementById('orderModal');
  const modalSummary = document.getElementById('modalSummary');
  const modalTotal = document.getElementById('modalTotal');
  const yearEl = document.getElementById('year');
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatPrice(amount) {
    if (Number.isInteger(amount)) return `${amount} €`;
    return `${amount.toFixed(2).replace('.', ',')} €`;
  }

  function getFormState() {
    const fd = new FormData(form);
    return {
      size: fd.get('size') || '3',
      coloring: fd.get('coloring') || 'paints',
      personalize: fd.get('personalize') === 'on',
      childName: (fd.get('childName') || '').trim(),
    };
  }

  function calculatePrice(state) {
    let total = PRICES.base[state.size];
    const lines = [{ label: KITS[state.size].name, amount: PRICES.base[state.size] }];
    if (state.personalize) {
      total += PRICES.personalize;
      lines.push({ label: 'Персонализация с име', amount: PRICES.personalize });
    }
    return { total, lines };
  }

  function setFieldExpanded(el, expanded) {
    if (!el) return;
    el.classList.toggle('config-field--collapsed', !expanded);
    if (!expanded) {
      const input = el.querySelector('input, textarea');
      if (input) input.value = '';
    }
  }

  function clearErrors() {
    configErrors.hidden = true;
    configErrors.innerHTML = '';
    nameField?.classList.remove('config-field--error');
  }

  function showErrors(messages) {
    configErrors.innerHTML = messages.map((m) => `<p>${escapeHtml(m)}</p>`).join('');
    configErrors.hidden = false;
    configErrors.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function updateSummary() {
    clearErrors();
    const state = getFormState();
    const kit = KITS[state.size];
    const { total, lines } = calculatePrice(state);

    summaryKit.innerHTML = `
      <p class="config-summary__kit-name">${escapeHtml(kit.name)}</p>
      <p class="config-summary__kit-figures">${escapeHtml(kit.figures)}</p>
    `;

    summaryList.innerHTML = [...kit.items, COLORING_LABELS[state.coloring]]
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join('');

    const extras = [];
    if (state.personalize) extras.push('Персонализирана закачалка с име');

    summaryExtras.innerHTML = extras.length
      ? `<p class="config-summary__extras-title">Допълнения</p><ul>${extras.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
      : '';

    if (state.personalize && state.childName) {
      summaryName.textContent = `Име на закачалката: ${state.childName}`;
      summaryName.hidden = false;
    } else if (state.personalize) {
      summaryName.textContent = 'Име на закачалката: (въведи по-долу)';
      summaryName.hidden = false;
    } else {
      summaryName.hidden = true;
    }

    const summaryCardMsg = document.getElementById('summaryCardMsg');
    if (summaryCardMsg) summaryCardMsg.hidden = true;

    priceBreakdown.innerHTML = lines
      .map((row) => `<div class="price-line"><span>${escapeHtml(row.label)}</span><span>${formatPrice(row.amount)}</span></div>`)
      .join('');

    totalPriceEl.textContent = formatPrice(total);
  }

  function validate(state) {
    const errors = [];
    if (state.personalize && !state.childName) {
      errors.push('Моля, въведи име на детето за персонализираната закачалка.');
      nameField?.classList.add('config-field--error');
      setFieldExpanded(nameField, true);
    }
    return errors;
  }

  function buildModalSummary(state) {
    const kit = KITS[state.size];
    const items = [kit.name, kit.figures, ...kit.items, COLORING_LABELS[state.coloring]];
    if (state.personalize && state.childName) items.push(`Закачалка с име: ${state.childName}`);
    return items;
  }

  function applyPreset(preset) {
    const sizeVal = PRESETS[preset] || '3';
    const sizeInput = form.querySelector(`input[name="size"][value="${sizeVal}"]`);
    if (sizeInput) sizeInput.checked = true;
    if (preset === 'standard' || preset === 'large') {
      personalizeToggle.checked = true;
      setFieldExpanded(nameField, true);
    }
    updateSummary();
    document.getElementById('configurator')?.scrollIntoView({ behavior: 'smooth' });
  }

  form.addEventListener('change', updateSummary);
  form.addEventListener('input', () => {
    updateSummary();
    clearErrors();
  });

  personalizeToggle?.addEventListener('change', () => {
    setFieldExpanded(nameField, personalizeToggle.checked);
    updateSummary();
  });

  document.querySelectorAll('[data-preset]').forEach((link) => {
    link.addEventListener('click', () => {
      const preset = link.getAttribute('data-preset');
      if (preset) setTimeout(() => applyPreset(preset), 120);
    });
  });

  orderBtn.addEventListener('click', () => {
    const state = getFormState();
    const errors = validate(state);
    if (errors.length) {
      showErrors(errors);
      if (state.personalize && !state.childName) childNameInput?.focus();
      return;
    }
    clearErrors();
    const { total } = calculatePrice(state);
    modalTotal.textContent = `Общо: ${formatPrice(total)}`;
    modalSummary.innerHTML = buildModalSummary(state).map((l) => `<li>${escapeHtml(l)}</li>`).join('');
    orderModal.classList.add('is-open');
    orderModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  });

  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => {
      orderModal.classList.remove('is-open');
      orderModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && orderModal.classList.contains('is-open')) {
      orderModal.classList.remove('is-open');
      document.body.style.overflow = '';
    }
  });

  navToggle.addEventListener('click', () => {
    const open = mainNav.classList.toggle('is-open');
    navToggle.classList.toggle('is-active', open);
    navToggle.setAttribute('aria-expanded', open);
    document.body.classList.toggle('nav-open', open);
  });

  mainNav.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      mainNav.classList.remove('is-open');
      navToggle.classList.remove('is-active');
      document.body.classList.remove('nav-open');
    });
  });

  setFieldExpanded(nameField, false);
  updateSummary();
})();
