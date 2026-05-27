const PRODUCT_NAME = 'Вълшебни пеперуди';
const CURRENCY = 'EUR';

const COURIER_LABELS = { econt: 'Еконт', speedy: 'Спиди' };
const DELIVERY_LABELS = { office: 'До офис', address: 'До адрес' };

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function getEnv(name) {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : '';
}

function getSupabaseConfig() {
  const url = getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const missing = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return { url, serviceKey, missing };
}

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function validatePayload(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return ['Невалидни данни.'];
  }

  const customer = body.customer || {};
  const delivery = body.delivery || {};
  const order = body.order || {};

  const customerName = String(customer.name || '').trim();
  const customerPhone = normalizePhone(customer.phone);
  const customerEmail = String(customer.email || '').trim();
  const city = String(delivery.city || '').trim();
  const deliveryDetails = String(delivery.details || '').trim();
  const courier = delivery.courier;
  const deliveryType = delivery.type;
  const gdpr = Boolean(body.gdpr);

  if (!customerName) errors.push('Име и фамилия са задължителни.');
  if (!customerPhone || customerPhone.length < 6) errors.push('Телефонът е задължителен.');
  if (!isValidEmail(customerEmail)) errors.push('Имейлът не е валиден.');
  if (!['econt', 'speedy'].includes(courier)) errors.push('Избери куриер.');
  if (!['office', 'address'].includes(deliveryType)) errors.push('Избери тип доставка.');
  if (!city) errors.push('Градът е задължителен.');
  if (!deliveryDetails) errors.push('Офисът или адресът е задължителен.');
  if (!gdpr) errors.push('Необходимо е съгласие за обработка на данните.');

  const kitSize = String(order.kitSize || '');
  if (!['3', '5', '7'].includes(kitSize)) errors.push('Невалиден комплект.');
  if (!['paints', 'markers'].includes(order.coloring)) errors.push('Невалидно оцветяване.');

  const personalize = Boolean(order.personalize);
  const childName = String(order.childName || '').trim();
  if (personalize && !childName) {
    errors.push('Името на детето е задължително при персонализация.');
  }

  const totalPrice = Number(order.totalPrice);
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
    errors.push('Невалидна обща цена.');
  }

  if (order.paymentMethod !== 'cash_on_delivery') {
    errors.push('Невалиден метод на плащане.');
  }

  return errors;
}

function buildOrderRecord(body) {
  const customer = body.customer || {};
  const delivery = body.delivery || {};
  const order = body.order || {};

  return {
    product_name: PRODUCT_NAME,
    kit_name: order.kitName || null,
    kit_size: String(order.kitSize || ''),
    coloring: order.coloring || null,
    personalization: Boolean(order.personalize),
    child_name: order.childName || null,
    total_price: Number(order.totalPrice),
    currency: CURRENCY,
    customer_name: String(customer.name || '').trim(),
    customer_phone: normalizePhone(customer.phone),
    customer_email: String(customer.email || '').trim() || null,
    courier: delivery.courier || null,
    delivery_type: delivery.type || null,
    city: String(delivery.city || '').trim(),
    delivery_details: String(delivery.details || '').trim(),
    payment_method: 'cash_on_delivery',
    note: String(body.note || '').trim() || null,
    status: 'new',
    raw_payload: body,
  };
}

async function insertOrder(record) {
  const { url: supabaseUrl, serviceKey, missing } = getSupabaseConfig();

  if (missing.length) {
    const err = new Error(`Missing: ${missing.join(', ')}`);
    err.code = 'MISSING_SUPABASE_ENV';
    err.missing = missing;
    throw err;
  }
  if (!/^https?:\/\//.test(supabaseUrl)) {
    const err = new Error('Supabase URL must start with http/https.');
    err.code = 'INVALID_SUPABASE_URL';
    throw err;
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/orders`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`Supabase insert failed: ${response.status} ${text}`);
    err.code = 'SUPABASE_INSERT_FAILED';
    err.status = response.status;
    throw err;
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendOrderEmail(order, body) {
  const resendKey = getEnv('RESEND_API_KEY');
  const notifyEmail = getEnv('ORDER_NOTIFY_EMAIL');
  const fromEmail = getEnv('FROM_EMAIL');

  if (!resendKey || !notifyEmail || !fromEmail) {
    console.warn('Resend email skipped: missing env configuration.');
    return;
  }

  const delivery = body.delivery || {};
  const orderData = body.order || {};
  const customer = body.customer || {};

  const courierLabel = COURIER_LABELS[delivery.courier] || delivery.courier;
  const deliveryLabel = DELIVERY_LABELS[delivery.type] || delivery.type;
  const personalizeText = orderData.personalize
    ? `Да${orderData.childName ? ` — ${orderData.childName}` : ''}`
    : 'Не';

  const html = `
    <h2>Нова поръчка — ${escapeHtml(PRODUCT_NAME)}</h2>
    <p><strong>№ поръчка:</strong> ${escapeHtml(order.id)}</p>
    <p><strong>Дата:</strong> ${escapeHtml(order.created_at || new Date().toISOString())}</p>
    <hr>
    <h3>Клиент</h3>
    <ul>
      <li><strong>Име:</strong> ${escapeHtml(customer.name)}</li>
      <li><strong>Телефон:</strong> ${escapeHtml(customer.phone)}</li>
      <li><strong>Имейл:</strong> ${escapeHtml(customer.email || '—')}</li>
    </ul>
    <h3>Комплект</h3>
    <ul>
      <li><strong>Комплект:</strong> ${escapeHtml(orderData.kitName)}</li>
      <li><strong>Фигурки:</strong> ${escapeHtml(orderData.kitFigures)}</li>
      <li><strong>Оцветяване:</strong> ${escapeHtml(orderData.coloringLabel)}</li>
      <li><strong>Персонализация:</strong> ${escapeHtml(personalizeText)}</li>
    </ul>
    <h3>Доставка</h3>
    <ul>
      <li><strong>Куриер:</strong> ${escapeHtml(courierLabel)}</li>
      <li><strong>Тип:</strong> ${escapeHtml(deliveryLabel)}</li>
      <li><strong>Град:</strong> ${escapeHtml(delivery.city)}</li>
      <li><strong>Офис/адрес:</strong> ${escapeHtml(delivery.details)}</li>
    </ul>
    <p><strong>Обща цена:</strong> ${escapeHtml(order.total_price)} ${escapeHtml(order.currency || CURRENCY)}</p>
    <p><strong>Плащане:</strong> Наложен платеж</p>
    ${body.note ? `<p><strong>Бележка:</strong> ${escapeHtml(body.note)}</p>` : ''}
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [notifyEmail],
      subject: `Нова поръчка #${order.id.slice(0, 8)} — ${PRODUCT_NAME}`,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend failed: ${response.status} ${text}`);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'Invalid JSON body.' });
    }
  }

  const errors = validatePayload(body);
  if (errors.length) {
    return json(res, 400, { ok: false, errors });
  }

  try {
    const record = buildOrderRecord(body);
    const saved = await insertOrder(record);

    try {
      await sendOrderEmail(saved, body);
    } catch (emailErr) {
      console.error('Order email failed:', emailErr);
    }

    return json(res, 201, {
      ok: true,
      orderId: saved.id,
      message: 'Поръчката е записана успешно.',
    });
  } catch (err) {
    console.error('Order API error:', err);
    if (err && err.code === 'MISSING_SUPABASE_ENV') {
      const missing = Array.isArray(err.missing) ? err.missing : [];
      const detail =
        missing.length > 0
          ? `Липсват в Vercel Environment Variables: ${missing.join(', ')}.`
          : 'Липсват SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY.';
      return json(res, 500, {
        ok: false,
        error: `Сървърът не е конфигуриран напълно. ${detail} След промяна направи Redeploy на Production.`,
        missing,
      });
    }
    if (err && err.code === 'INVALID_SUPABASE_URL') {
      return json(res, 500, {
        ok: false,
        error: 'SUPABASE_URL не е валиден. Трябва да започва с https://',
      });
    }
    if (err && err.code === 'SUPABASE_INSERT_FAILED') {
      if (err.status === 401 || err.status === 403) {
        return json(res, 500, {
          ok: false,
          error:
            'Грешен SUPABASE_SERVICE_ROLE_KEY или няма достъп до таблицата orders.',
        });
      }
      if (err.status === 404) {
        return json(res, 500, {
          ok: false,
          error:
            'Таблицата orders не е намерена. Пусни SQL файла supabase/schema.sql в Supabase.',
        });
      }
      return json(res, 500, {
        ok: false,
        error: 'Supabase върна грешка при запис. Провери URL/ключа и структурата на таблицата orders.',
      });
    }
    return json(res, 500, {
      ok: false,
      error: 'Възникна проблем при изпращането. Моля, опитай отново или се свържи с нас.',
    });
  }
};
