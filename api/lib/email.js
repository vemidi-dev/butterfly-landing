const { PRODUCT_NAME, COURIER_LABELS, DELIVERY_LABELS, COLORING_LABELS } = require('./constants');
const { getEnv } = require('./supabase');
const { formatOrderDate, formatOrderPriceEuro } = require('./orders-format');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmailSubject(order, body) {
  const customer = body.customer || {};
  const name = String(customer.name || order.customer_name || 'Клиент').trim();
  const price = formatOrderPriceEuro(order.total_price);
  return `Нова поръчка: Вълшебни пеперуди – ${name} – ${price}`;
}

function buildOrderEmailContent(order, body) {
  const delivery = body.delivery || {};
  const office = delivery.office || {};
  const orderData = body.order || {};
  const customer = body.customer || {};

  const courierLabel = COURIER_LABELS[delivery.courier] || delivery.courier || '—';
  const deliveryLabel = DELIVERY_LABELS[delivery.type] || delivery.type || '—';
  const coloringLabel =
    orderData.coloringLabel ||
    COLORING_LABELS[orderData.coloring] ||
    orderData.coloring ||
    '—';
  const personalize = Boolean(orderData.personalize ?? order.personalization);
  const childName = String(orderData.childName || order.child_name || '').trim();
  const orderDate = formatOrderDate(order.created_at || body.created_at);
  const totalFormatted = formatOrderPriceEuro(order.total_price);
  const note = String(body.note || order.note || '').trim();
  const subject = buildEmailSubject(order, body);
  const officeId = office.id || delivery.officeId || order.office_id || '—';
  const officeName = office.name || delivery.officeName || order.office_name || '—';
  const officeAddress = office.address || delivery.officeAddress || order.office_address || '—';
  const manualOfficeNote = String(delivery.manualOfficeNote || '').trim();

  const rows = [
    ['ID на поръчката', order.id],
    ['Дата', orderDate],
    ['Име на клиента', customer.name || order.customer_name],
    ['Телефон', customer.phone || order.customer_phone],
    ['Имейл', customer.email || order.customer_email || '—'],
    ['Избран комплект', orderData.kitName || order.kit_name],
    ['Брой фигурки', orderData.kitFigures || '—'],
    ['Оцветяване', coloringLabel],
    ['Персонализация', personalize ? 'Да' : 'Не'],
    ['Име на детето', personalize && childName ? childName : '—'],
    ['Куриер', courierLabel],
    ['Тип доставка', deliveryLabel],
    ['Град', delivery.city || order.city],
    ['Офис ID / код', officeId],
    ['Име на офис', officeName],
    ['Адрес на офис', officeAddress],
    ['Желан офис/автомат (ръчно)', manualOfficeNote || '—'],
    ['Офис/адрес', delivery.details || order.delivery_details],
    ['Обща цена', totalFormatted],
    ['Бележка', note || '—'],
    ['Потвърждение за безопасност', body.safetyConsent === true ? 'Да' : 'Не'],
  ];

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#5a4636;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#3d3028;">${escapeHtml(value)}</td></tr>`
    )
    .join('');

  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join('\n');

  const html = `
    <div style="font-family:Segoe UI,sans-serif;max-width:560px;color:#3d3028;">
      <h2 style="font-family:Georgia,serif;color:#5a4636;margin:0 0 16px;">${escapeHtml(subject)}</h2>
      <table style="border-collapse:collapse;width:100%;">${htmlRows}</table>
      <p style="margin:20px 0 0;font-size:13px;color:#7a6654;">Плащане: наложен платеж</p>
    </div>
  `;

  const text = `${subject}\n\n${textRows}\n\nПлащане: наложен платеж`;

  return { subject, html, text };
}

function parseNotifyRecipients(value) {
  return String(value || '')
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function parseResendError(responseText) {
  if (!responseText) return '';
  try {
    const data = JSON.parse(responseText);
    if (typeof data.message === 'string') return data.message;
    if (data.error && typeof data.error.message === 'string') return data.error.message;
    if (typeof data.error === 'string') return data.error;
  } catch {
    /* plain text */
  }
  return String(responseText).slice(0, 500);
}

async function sendOrderEmail(order, body) {
  const resendKey = getEnv('RESEND_API_KEY');
  const notifyRaw = getEnv('ORDER_NOTIFY_EMAIL');
  const fromEmail = getEnv('FROM_EMAIL');
  const toList = parseNotifyRecipients(notifyRaw);

  if (!resendKey || !fromEmail || toList.length === 0) {
    const missing = [];
    if (!resendKey) missing.push('RESEND_API_KEY');
    if (!fromEmail) missing.push('FROM_EMAIL');
    if (!notifyRaw || toList.length === 0) missing.push('ORDER_NOTIFY_EMAIL');
    console.warn('[orders] Resend notification skipped — missing or invalid env:', missing.join(', '), {
      orderId: order.id,
    });
    return { sent: false, skipped: true, reason: 'missing_env', missing };
  }

  const { subject, html, text } = buildOrderEmailContent(order, body);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'butterfly-landing/1.0 (VeMiDi crafts)',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toList,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    const resendMessage = parseResendError(responseText);
    console.error('[orders] Resend API rejected email', {
      orderId: order.id,
      status: response.status,
      from: fromEmail.replace(/(.{2}).+(@.+)/, '$1***$2'),
      to: toList.map((e) => e.replace(/(.{2}).+(@.+)/, '$1***$2')),
      message: resendMessage,
    });
    const err = new Error(`Resend failed: ${response.status}`);
    err.status = response.status;
    err.details = responseText;
    err.resendMessage = resendMessage;
    throw err;
  }

  const result = await response.json().catch(() => ({}));
  console.info('[orders] Resend notification sent', {
    orderId: order.id,
    resendId: result.id || null,
    to: toList,
  });
  return { sent: true, resendId: result.id || null };
}

module.exports = {
  buildEmailSubject,
  buildOrderEmailContent,
  sendOrderEmail,
};
