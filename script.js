(function () {
  'use strict';

  const PRICES = {
    base: { 3: 13.5, 5: 18, 7: 24 },
    personalize: 2.5,
  };

  const KITS = {
    3: {
      name: 'Комплект Мини',
      shortName: 'Мини',
      figures: '3 фигурки',
      composition: '(1 пеперуда + 2 водни кончета)',
      previewImage: 'assets/elements.png',
      previewAlt: 'Комплект Мини — творчески комплект',
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
      shortName: 'Стандарт',
      figures: '5 фигурки',
      composition: '(3 пеперуди + 2 водни кончета)',
      previewImage: 'assets/personal.png',
      previewAlt: 'Комплект Стандарт — готова украса',
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
      shortName: 'Макси',
      figures: '7 фигурки',
      composition: '(3 пеперуди + 4 водни кончета)',
      previewImage: 'assets/hero-1.png',
      previewAlt: 'Комплект Макси — пълна визуализация',
      items: [
        '3 дървени пеперуди',
        '4 дървени водни кончета',
        'конци за закачане',
        'дървени мъниста',
        'дървена закачалка',
      ],
    },
  };

  const COLORING = {
    paints: {
      label: 'Бои с четка',
      description: 'Класическо и лесно за най-малките',
    },
    markers: {
      label: 'Флумастери',
      description: 'Ярки цветове и лесно оцветяване',
    },
  };

  const COLORING_LABELS = { paints: 'Бои с четка', markers: 'Флумастери' };

  const PRESETS = { mini: '3', standard: '5', maxi: '7', small: '3', large: '5' };

  const form = document.getElementById('configForm');
  const summaryPreviewImg = document.getElementById('summaryPreviewImg');
  const summaryBadges = document.getElementById('summaryBadges');
  const summaryInfoTitle = document.getElementById('summaryInfoTitle');
  const summaryRowKitTag = document.getElementById('summaryRowKitTag');
  const summaryRowKitDesc = document.getElementById('summaryRowKitDesc');
  const summaryRowKitSub = document.getElementById('summaryRowKitSub');
  const summaryRowColorTag = document.getElementById('summaryRowColorTag');
  const summaryRowColorDesc = document.getElementById('summaryRowColorDesc');
  const summaryRowPersonalTag = document.getElementById('summaryRowPersonalTag');
  const summaryRowPersonalDesc = document.getElementById('summaryRowPersonalDesc');
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

  function formatPricePlus(amount) {
    const value = Number.isInteger(amount)
      ? `${amount},00`
      : amount.toFixed(2).replace('.', ',');
    return `+${value} €`;
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
    const coloring = COLORING[state.coloring] || COLORING.paints;
    const { total } = calculatePrice(state);

    if (summaryPreviewImg) {
      summaryPreviewImg.src = kit.previewImage;
      summaryPreviewImg.alt = kit.previewAlt;
    }

    if (summaryBadges) {
      const badges = [kit.figures, coloring.label];
      if (state.personalize && state.childName) {
        badges.push(`Име: ${state.childName}`);
      } else if (state.personalize) {
        badges.push('Име на табелката');
      }
      summaryBadges.innerHTML = badges
        .map((text) => `<span class="summary-badge">${escapeHtml(text)}</span>`)
        .join('');
    }

    if (summaryInfoTitle) {
      summaryInfoTitle.textContent = state.personalize
        ? 'Персонализирано специално за детето'
        : 'Готово творческо преживяване';
    }

    if (summaryRowKitTag) summaryRowKitTag.textContent = kit.shortName;
    if (summaryRowKitDesc) summaryRowKitDesc.textContent = kit.figures;
    if (summaryRowKitSub) summaryRowKitSub.textContent = kit.composition;

    if (summaryRowColorTag) summaryRowColorTag.textContent = coloring.label;
    if (summaryRowColorDesc) summaryRowColorDesc.textContent = coloring.description;

    if (summaryRowPersonalTag) {
      summaryRowPersonalTag.textContent = state.personalize
        ? 'Име на табелката'
        : 'Без име';
    }
    if (summaryRowPersonalDesc) {
      if (state.personalize && state.childName) {
        summaryRowPersonalDesc.textContent = `Име: ${state.childName}`;
      } else if (state.personalize) {
        summaryRowPersonalDesc.textContent = 'Въведи име за табелката по-долу';
      } else {
        summaryRowPersonalDesc.textContent = 'Може да добавиш персонализация към закачалката';
      }
    }

    if (priceBreakdown) {
      const pricingRows = [
        `<div class="summary-price-line">
          <span class="summary-price-line__label">Цена на комплекта</span>
          <span class="summary-price-line__value">${formatPrice(PRICES.base[state.size])}</span>
        </div>`,
      ];
      if (state.personalize) {
        pricingRows.push(
          `<div class="summary-price-line">
            <span class="summary-price-line__label">Персонализация</span>
            <span class="summary-price-line__value summary-price-line__value--extra">${formatPricePlus(PRICES.personalize)}</span>
          </div>`
        );
      }
      priceBreakdown.innerHTML = pricingRows.join('');
    }

    if (totalPriceEl) totalPriceEl.textContent = formatPrice(total);
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
    if (sizeInput) {
      sizeInput.checked = true;
      sizeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (preset === 'standard' || preset === 'large') {
      if (personalizeToggle) personalizeToggle.checked = true;
      setFieldExpanded(nameField, true);
    }
    updateSummary();
    document.getElementById('configurator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  const backToTop = document.getElementById('backToTop');
  const SCROLL_SHOW_BACK_TO_TOP = 300;

  function updateBackToTop() {
    if (!backToTop) return;
    backToTop.classList.toggle('is-visible', window.scrollY > SCROLL_SHOW_BACK_TO_TOP);
  }

  if (backToTop) {
    window.addEventListener('scroll', updateBackToTop, { passive: true });
    updateBackToTop();
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
