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

  const CHECKOUT_ERROR_MESSAGE =
    'Възникна проблем при изпращането. Моля, опитай отново или се свържи с нас.';

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
  const checkoutModal = document.getElementById('checkoutModal');
  const checkoutForm = document.getElementById('checkoutForm');
  const checkoutFormView = document.getElementById('checkoutFormView');
  const checkoutSuccessView = document.getElementById('checkoutSuccessView');
  const checkoutSummaryList = document.getElementById('checkoutSummaryList');
  const checkoutSummaryTotal = document.getElementById('checkoutSummaryTotal');
  const checkoutErrors = document.getElementById('checkoutErrors');
  const checkoutSubmitBtn = document.getElementById('checkoutSubmitBtn');
  const deliveryDetailsLabel = document.getElementById('deliveryDetailsLabel');
  const deliveryDetailsInput = document.getElementById('deliveryDetails');
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

  function validateConfigurator(state) {
    const errors = [];
    if (state.personalize && !state.childName) {
      errors.push('Моля, въведи име на детето за персонализираната закачалка.');
      nameField?.classList.add('config-field--error');
      setFieldExpanded(nameField, true);
    }
    return errors;
  }

  function getCheckoutFormData() {
    const fd = new FormData(checkoutForm);
    return {
      customerName: (fd.get('customerName') || '').trim(),
      customerPhone: (fd.get('customerPhone') || '').trim(),
      customerEmail: (fd.get('customerEmail') || '').trim(),
      orderNote: (fd.get('orderNote') || '').trim(),
      courier: fd.get('courier') || 'econt',
      deliveryType: fd.get('deliveryType') || 'office',
      city: (fd.get('city') || '').trim(),
      deliveryDetails: (fd.get('deliveryDetails') || '').trim(),
      gdpr: fd.get('gdpr') === 'on',
    };
  }

  function clearCheckoutErrors() {
    if (!checkoutErrors) return;
    checkoutErrors.hidden = true;
    checkoutErrors.innerHTML = '';
    checkoutForm?.querySelectorAll('.checkout-field--error').forEach((el) => {
      el.classList.remove('checkout-field--error');
    });
  }

  function showCheckoutErrors(messages) {
    if (!checkoutErrors) return;
    checkoutErrors.innerHTML = messages.map((m) => `<p>${escapeHtml(m)}</p>`).join('');
    checkoutErrors.hidden = false;
    checkoutErrors.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function validateCheckout(checkoutData, configState) {
    const errors = [];
    const fields = [];

    if (!checkoutData.customerName) {
      errors.push('Име и фамилия са задължителни.');
      fields.push('customerName');
    }
    if (!checkoutData.customerPhone) {
      errors.push('Телефонът е задължителен.');
      fields.push('customerPhone');
    }
    if (checkoutData.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutData.customerEmail)) {
      errors.push('Имейлът не е валиден.');
      fields.push('customerEmail');
    }
    if (!checkoutData.city) {
      errors.push('Градът е задължителен.');
      fields.push('city');
    }
    if (!checkoutData.deliveryDetails) {
      errors.push(
        checkoutData.deliveryType === 'address'
          ? 'Адресът за доставка е задължителен.'
          : 'Офисът е задължителен.'
      );
      fields.push('deliveryDetails');
    }
    if (!checkoutData.gdpr) {
      errors.push('Необходимо е съгласие за обработка на данните.');
      fields.push('gdpr');
    }
    if (configState.personalize && !configState.childName) {
      errors.push('Моля, въведи име на детето за персонализираната закачалка.');
    }

    fields.forEach((id) => {
      const input = checkoutForm?.querySelector(`#${id}`);
      input?.closest('.checkout-field')?.classList.add('checkout-field--error');
    });

    return errors;
  }

  function updateDeliveryDetailsLabel() {
    if (!deliveryDetailsLabel || !deliveryDetailsInput) return;
    const type = checkoutForm?.querySelector('input[name="deliveryType"]:checked')?.value || 'office';
    if (type === 'address') {
      deliveryDetailsLabel.innerHTML = 'Адрес <span class="checkout-required">*</span>';
      deliveryDetailsInput.placeholder = 'Улица, номер, вход, етаж…';
    } else {
      deliveryDetailsLabel.innerHTML = 'Офис <span class="checkout-required">*</span>';
      deliveryDetailsInput.placeholder = 'Име или адрес на офис';
    }
  }

  function populateCheckoutSummary(state, total) {
    const kit = KITS[state.size];
    const coloring = COLORING[state.coloring] || COLORING.paints;
    const rows = [
      { label: 'Комплект', value: `${kit.name} (${kit.figures})` },
      { label: 'Оцветяване', value: coloring.label },
      {
        label: 'Персонализация',
        value: state.personalize
          ? state.childName
            ? `Да — ${state.childName}`
            : 'Да'
          : 'Не',
      },
    ];

    if (checkoutSummaryList) {
      checkoutSummaryList.innerHTML = rows
        .map(
          (row) =>
            `<li><strong>${escapeHtml(row.label)}</strong> ${escapeHtml(row.value)}</li>`
        )
        .join('');
    }
    if (checkoutSummaryTotal) checkoutSummaryTotal.textContent = formatPrice(total);
  }

  function buildOrderPayload(configState, checkoutData, total) {
    const kit = KITS[configState.size];
    return {
      gdpr: checkoutData.gdpr,
      note: checkoutData.orderNote || null,
      customer: {
        name: checkoutData.customerName,
        phone: checkoutData.customerPhone,
        email: checkoutData.customerEmail || null,
      },
      delivery: {
        courier: checkoutData.courier,
        type: checkoutData.deliveryType,
        city: checkoutData.city,
        details: checkoutData.deliveryDetails,
      },
      order: {
        kitSize: configState.size,
        kitName: kit.name,
        kitFigures: kit.figures,
        coloring: configState.coloring,
        coloringLabel: COLORING_LABELS[configState.coloring],
        personalize: configState.personalize,
        childName: configState.childName || null,
        totalPrice: total,
        paymentMethod: 'cash_on_delivery',
      },
      created_at: new Date().toISOString(),
    };
  }

  function openCheckoutModal() {
    const state = getFormState();
    const { total } = calculatePrice(state);
    populateCheckoutSummary(state, total);
    updateDeliveryDetailsLabel();
    clearCheckoutErrors();

    checkoutFormView.hidden = false;
    checkoutSuccessView.hidden = true;
    checkoutModal.classList.add('is-open');
    checkoutModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    const firstField = checkoutForm?.querySelector('#customerName');
    if (firstField) setTimeout(() => firstField.focus(), 100);
  }

  function closeCheckoutModal() {
    checkoutModal.classList.remove('is-open');
    checkoutModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    clearCheckoutErrors();
    checkoutSubmitBtn.disabled = false;
    checkoutSubmitBtn.textContent = 'Потвърди поръчката';
    checkoutFormView.hidden = false;
    checkoutSuccessView.hidden = true;
  }

  function showCheckoutSuccess() {
    checkoutFormView.hidden = true;
    checkoutSuccessView.hidden = false;
    checkoutSuccessView.querySelector('[data-close-checkout]')?.focus();
  }

  async function submitOrder(event) {
    event.preventDefault();
    clearCheckoutErrors();

    const configState = getFormState();
    const configErrorsList = validateConfigurator(configState);
    const checkoutData = getCheckoutFormData();
    const checkoutErrorsList = validateCheckout(checkoutData, configState);
    const allErrors = [...configErrorsList, ...checkoutErrorsList];

    if (allErrors.length) {
      showCheckoutErrors(allErrors);
      if (configState.personalize && !configState.childName) {
        closeCheckoutModal();
        showErrors(configErrorsList);
        childNameInput?.focus();
      }
      return;
    }

    const { total } = calculatePrice(configState);
    const payload = buildOrderPayload(configState, checkoutData, total);

    checkoutSubmitBtn.disabled = true;
    checkoutSubmitBtn.textContent = 'Изпращане…';

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        const serverErrors = Array.isArray(data.errors)
          ? data.errors
          : data.error
            ? [data.error]
            : [CHECKOUT_ERROR_MESSAGE];
        showCheckoutErrors(serverErrors);
        return;
      }

      showCheckoutSuccess();
      checkoutForm.reset();
      checkoutForm.querySelector('input[name="courier"][value="econt"]').checked = true;
      checkoutForm.querySelector('input[name="deliveryType"][value="office"]').checked = true;
      updateDeliveryDetailsLabel();
    } catch {
      showCheckoutErrors([CHECKOUT_ERROR_MESSAGE]);
    } finally {
      checkoutSubmitBtn.disabled = false;
      checkoutSubmitBtn.textContent = 'Потвърди поръчката';
    }
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
    const errors = validateConfigurator(state);
    if (errors.length) {
      showErrors(errors);
      if (state.personalize && !state.childName) childNameInput?.focus();
      return;
    }
    clearErrors();
    openCheckoutModal();
  });

  checkoutForm?.addEventListener('submit', submitOrder);

  checkoutForm?.querySelectorAll('input[name="deliveryType"]').forEach((input) => {
    input.addEventListener('change', updateDeliveryDetailsLabel);
  });

  checkoutForm?.addEventListener('input', clearCheckoutErrors);

  document.querySelectorAll('[data-close-checkout]').forEach((el) => {
    el.addEventListener('click', closeCheckoutModal);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && checkoutModal?.classList.contains('is-open')) {
      closeCheckoutModal();
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
  updateDeliveryDetailsLabel();

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
