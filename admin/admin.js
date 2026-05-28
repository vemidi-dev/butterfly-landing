(function () {
  const STATUS_CLASS = {
    new: 'status-badge--new',
    confirmed: 'status-badge--confirmed',
    making: 'status-badge--making',
    shipped: 'status-badge--shipped',
    completed: 'status-badge--completed',
    cancelled: 'status-badge--cancelled',
  };

  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const loginForm = document.getElementById('login-form');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const loginSubmit = document.getElementById('login-submit');
  const logoutBtn = document.getElementById('logout-btn');
  const filterStatus = document.getElementById('filter-status');
  const searchInput = document.getElementById('search-input');
  const refreshBtn = document.getElementById('refresh-btn');
  const listError = document.getElementById('list-error');
  const listLoading = document.getElementById('list-loading');
  const listEmpty = document.getElementById('list-empty');
  const tableWrap = document.getElementById('orders-table-wrap');
  const tableBody = document.getElementById('orders-table-body');
  const ordersCards = document.getElementById('orders-cards');
  const orderDialog = document.getElementById('order-dialog');
  const dialogTitle = document.getElementById('dialog-title');
  const dialogBody = document.getElementById('dialog-body');
  const dialogStatus = document.getElementById('dialog-status');
  const dialogSaveStatus = document.getElementById('dialog-save-status');
  const dialogClose = document.getElementById('dialog-close');

  let statuses = [];
  let orders = [];
  let activeOrderId = null;
  let searchTimer = null;

  const TOKEN_KEY = 'admin_token';

  function getStoredToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  function setStoredToken(token) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode */
    }
  }

  function api(path, options = {}) {
    const token = getStoredToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    return fetch(path, {
      credentials: 'same-origin',
      headers,
      ...options,
    });
  }

  function show(el) {
    el.hidden = false;
  }

  function hide(el) {
    el.hidden = true;
  }

  function setError(el, message) {
    if (!message) {
      hide(el);
      el.textContent = '';
      return;
    }
    el.textContent = message;
    show(el);
  }

  function showLogin() {
    show(loginView);
    hide(appView);
  }

  function showApp() {
    hide(loginView);
    show(appView);
  }

  hide(appView);

  function statusBadge(status, label) {
    const cls = STATUS_CLASS[status] || 'status-badge--new';
    return `<span class="status-badge ${cls}">${escapeHtml(label)}</span>`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function yesNo(value) {
    return value ? 'Да' : 'Не';
  }

  function fillStatusSelect(select, current) {
    select.innerHTML = statuses
      .map(
        (s) =>
          `<option value="${escapeHtml(s.value)}"${s.value === current ? ' selected' : ''}>${escapeHtml(s.label)}</option>`
      )
      .join('');
  }

  function populateFilterOptions() {
    const current = filterStatus.value;
    filterStatus.innerHTML =
      '<option value="all">Всички</option>' +
      statuses
        .map(
          (s) =>
            `<option value="${escapeHtml(s.value)}">${escapeHtml(s.label)}</option>`
        )
        .join('');
    filterStatus.value = statuses.some((s) => s.value === current) ? current : 'all';
  }

  function renderOrders() {
    if (!orders.length) {
      hide(tableWrap);
      hide(ordersCards);
      show(listEmpty);
      tableBody.innerHTML = '';
      ordersCards.innerHTML = '';
      return;
    }

    hide(listEmpty);
    show(tableWrap);
    show(ordersCards);

    tableBody.innerHTML = orders
      .map(
        (o) => `
      <tr data-id="${escapeHtml(o.id)}">
        <td>${escapeHtml(o.createdAtFormatted)}</td>
        <td>${statusBadge(o.status, o.statusLabel)}</td>
        <td>${escapeHtml(o.customerName)}</td>
        <td>${escapeHtml(o.customerPhone)}</td>
        <td>${escapeHtml(o.kitName)}</td>
        <td>${escapeHtml(o.totalPriceFormatted)}</td>
        <td><button type="button" class="btn btn--secondary orders-table__btn" data-open="${escapeHtml(o.id)}">Детайли</button></td>
      </tr>`
      )
      .join('');

    ordersCards.innerHTML = orders
      .map(
        (o) => `
      <article class="order-card" data-id="${escapeHtml(o.id)}">
        <div class="order-card__head">
          <div>
            <div class="order-card__name">${escapeHtml(o.customerName)}</div>
            <div class="order-card__date">${escapeHtml(o.createdAtFormatted)}</div>
          </div>
          ${statusBadge(o.status, o.statusLabel)}
        </div>
        <div class="order-card__meta">
          <span>${escapeHtml(o.customerPhone)}</span>
          <span>${escapeHtml(o.kitName)} · ${escapeHtml(o.kitFigures)}</span>
        </div>
        <div class="order-card__footer">
          <span class="order-card__price">${escapeHtml(o.totalPriceFormatted)}</span>
          <button type="button" class="btn btn--secondary" data-open="${escapeHtml(o.id)}">Детайли</button>
        </div>
      </article>`
      )
      .join('');
  }

  function buildDetailRows(o) {
    const rows = [
      ['Дата и час', o.createdAtFormatted],
      ['Статус', o.statusLabel],
      ['Клиент', o.customerName],
      ['Телефон', o.customerPhone],
      ['Имейл', o.customerEmail || '—'],
      ['Комплект', o.kitName],
      ['Брой фигурки', o.kitFigures],
      ['Оцветяване', o.coloring],
      ['Персонализация', yesNo(o.personalization)],
      ['Име за персонализация', o.personalization && o.childName ? o.childName : '—'],
      ['Куриер', o.courier],
      ['Доставка', o.deliveryType],
      ['Град', o.city],
      ['Офис / адрес', o.deliveryDetails],
      ['Бележка', o.note || '—'],
      ['Обща сума', o.totalPriceFormatted],
      ['Плащане', o.paymentMethod],
    ];
    return rows
      .map(
        ([label, value]) =>
          `<dl class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></dl>`
      )
      .join('');
  }

  function openOrderDialog(id) {
    const o = orders.find((row) => row.id === id);
    if (!o) return;
    activeOrderId = id;
    dialogTitle.textContent = `Поръчка · ${o.customerName}`;
    dialogBody.innerHTML = buildDetailRows(o);
    fillStatusSelect(dialogStatus, o.status);
    orderDialog.showModal();
  }

  async function checkSession() {
    const res = await api('/api/admin?action=session');
    const data = await res.json().catch(() => ({}));
    return Boolean(data.authenticated);
  }

  async function loadOrders() {
    setError(listError, '');
    show(listLoading);
    hide(listEmpty);
    hide(tableWrap);
    hide(ordersCards);

    const params = new URLSearchParams();
    if (filterStatus.value && filterStatus.value !== 'all') {
      params.set('status', filterStatus.value);
    }
    const q = searchInput.value.trim();
    if (q) params.set('q', q);

    try {
      const query = params.toString();
      const res = await api(`/api/admin?action=orders${query ? `&${query}` : ''}`);
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setStoredToken('');
        showLogin();
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Неуспешно зареждане.');
      }

      statuses = data.statuses || statuses;
      orders = data.orders || [];
      populateFilterOptions();
      renderOrders();
    } catch (err) {
      setError(listError, err.message || 'Грешка при зареждане.');
    } finally {
      hide(listLoading);
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError(loginError, '');
    loginSubmit.disabled = true;

    try {
      const res = await api('/api/admin?action=login', {
        method: 'POST',
        body: JSON.stringify({ password: loginPassword.value }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Грешна парола.');
      }

      if (data.token) setStoredToken(data.token);
      loginPassword.value = '';
      showApp();
      await loadOrders();
    } catch (err) {
      setError(loginError, err.message || 'Грешка при вход.');
    } finally {
      loginSubmit.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    setStoredToken('');
    await api('/api/admin?action=login', { method: 'DELETE' });
    showLogin();
  });

  refreshBtn.addEventListener('click', () => loadOrders());
  filterStatus.addEventListener('change', () => loadOrders());

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadOrders(), 350);
  });

  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open]');
    if (!btn) return;
    openOrderDialog(btn.getAttribute('data-open'));
  });

  dialogClose.addEventListener('click', () => orderDialog.close());

  dialogSaveStatus.addEventListener('click', async () => {
    if (!activeOrderId) return;
    dialogSaveStatus.disabled = true;
    setError(listError, '');

    try {
      const res = await api(`/api/admin?action=orders&id=${encodeURIComponent(activeOrderId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: dialogStatus.value }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        showLogin();
        orderDialog.close();
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Неуспешна смяна на статус.');
      }

      const idx = orders.findIndex((o) => o.id === activeOrderId);
      if (idx >= 0) orders[idx] = data.order;
      renderOrders();
      dialogBody.innerHTML = buildDetailRows(data.order);
      orderDialog.close();
    } catch (err) {
      setError(listError, err.message || 'Грешка.');
    } finally {
      dialogSaveStatus.disabled = false;
    }
  });

  (async function init() {
    try {
      const authed = await checkSession();
      if (authed) {
        showApp();
        await loadOrders();
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  })();
})();
