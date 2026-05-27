const {
  COURIER_LABELS,
  DELIVERY_LABELS,
  COLORING_LABELS,
  KIT_FIGURES,
  STATUS_LABELS,
  PAYMENT_LABELS,
  CURRENCY,
} = require('./constants');

function formatOrderDate(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return String(iso || '');
  return new Intl.DateTimeFormat('bg-BG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Sofia',
  }).format(date);
}

function formatOrderPrice(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  const cur = currency || CURRENCY;
  if (Number.isInteger(value)) return `${value} ${cur}`;
  return `${value.toFixed(2).replace('.', ',')} ${cur}`;
}

function formatOrderPriceEuro(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return `${value} €`;
  return `${value.toFixed(2).replace('.', ',')} €`;
}

function mapOrderRow(row) {
  const raw = row.raw_payload || {};
  const orderData = raw.order || {};
  const delivery = raw.delivery || {};

  const kitSize = String(row.kit_size || orderData.kitSize || '');
  const coloringKey = row.coloring || orderData.coloring || '';
  const coloringLabel =
    orderData.coloringLabel || COLORING_LABELS[coloringKey] || coloringKey || '—';

  return {
    id: row.id,
    createdAt: row.created_at,
    createdAtFormatted: formatOrderDate(row.created_at),
    status: row.status || 'new',
    statusLabel: STATUS_LABELS[row.status] || row.status,
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    customerEmail: row.customer_email || '',
    kitName: row.kit_name || orderData.kitName || '—',
    kitFigures: orderData.kitFigures || KIT_FIGURES[kitSize] || kitSize || '—',
    coloring: coloringLabel,
    personalization: Boolean(row.personalization),
    childName: row.child_name || orderData.childName || '',
    courier: COURIER_LABELS[row.courier] || row.courier || '—',
    deliveryType: DELIVERY_LABELS[row.delivery_type] || row.delivery_type || '—',
    city: row.city || '',
    deliveryDetails: row.delivery_details || '',
    note: row.note || raw.note || '',
    totalPrice: row.total_price,
    totalPriceFormatted: formatOrderPrice(row.total_price, row.currency),
    paymentMethod: PAYMENT_LABELS[row.payment_method] || 'Наложен платеж',
  };
}

module.exports = {
  formatOrderDate,
  formatOrderPrice,
  formatOrderPriceEuro,
  mapOrderRow,
};
