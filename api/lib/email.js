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
    ['Офис/адрес', delivery.details || order.delivery_details],
    ['Обща цена', totalFormatted],
    ['Бележка', note || '—'],
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

async function sendOrderEmail(order, body) {
  const resendKey = getEnv('RESEND_API_KEY');
  const notifyEmail = getEnv('ORDER_NOTIFY_EMAIL');
  const fromEmail = getEnv('FROM_EMAIL');

  if (!resendKey || !notifyEmail || !fromEmail) {
    const missing = [];
    if (!resendKey) missing.push('RESEND_API_KEY');
    if (!notifyEmail) missing.push('ORDER_NOTIFY_EMAIL');
    if (!fromEmail) missing.push('FROM_EMAIL');
    console.warn('[orders] Resend notification skipped — missing env:', missing.join(', '), {
      orderId: order.id,
    });
    return { sent: false, skipped: true, reason: 'missing_env' };
  }

  const { subject, html, text } = buildOrderEmailContent(order, body);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [notifyEmail],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    const err = new Error(`Resend failed: ${response.status}`);
    err.status = response.status;
    err.details = responseText;
    throw err;
  }

  const result = await response.json().catch(() => ({}));
  console.info('[orders] Resend notification sent', {
    orderId: order.id,
    resendId: result.id || null,
    to: notifyEmail,
  });
  return { sent: true, resendId: result.id || null };
}

module.exports = {
  buildEmailSubject,
  buildOrderEmailContent,
  sendOrderEmail,
};
