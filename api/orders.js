const { PRODUCT_NAME, CURRENCY } = require('./lib/constants');
const { json, parseBody, setCors, handleOptions } = require('./lib/http');
const { insertOrder, mapSupabaseError } = require('./lib/supabase');
const { sendOrderEmail } = require('./lib/email');

function normalizePhone(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validatePayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['Невалидни данни.'];

  const customer = body.customer || {};
  const delivery = body.delivery || {};
  const order = body.order || {};

  if (!String(customer.name || '').trim()) errors.push('Име и фамилия са задължителни.');
  const phone = normalizePhone(customer.phone);
  if (!phone || phone.length < 6) errors.push('Телефонът е задължителен.');
  if (!isValidEmail(String(customer.email || '').trim())) errors.push('Имейлът не е валиден.');
  if (!['econt', 'speedy'].includes(delivery.courier)) errors.push('Избери куриер.');
  if (!['office', 'locker', 'address'].includes(delivery.type)) errors.push('Избери тип доставка.');
  if (!String(delivery.city || '').trim()) errors.push('Градът е задължителен.');

  const office = delivery.office || {};
  const hasSelectedOffice = Boolean(String(office.id || delivery.officeId || '').trim());
  const manualOfficeNote = String(delivery.manualOfficeNote || '').trim();

  if (delivery.type === 'office') {
    if (!hasSelectedOffice && !manualOfficeNote) {
      errors.push('Избери офис от списъка или напиши желания офис.');
    }
  } else if (delivery.type === 'locker') {
    if (!manualOfficeNote) errors.push('Напиши желания автомат за доставка.');
  } else if (delivery.type === 'address') {
    if (!String(delivery.details || '').trim()) errors.push('Адресът за доставка е задължителен.');
  }
  if (!body.gdpr) errors.push('Необходимо е съгласие за обработка на данните.');
  if (body.safetyConsent !== true) errors.push('Необходимо е потвърждение за безопасност.');

  const kitSize = String(order.kitSize || '');
  if (!['3', '5', '7'].includes(kitSize)) errors.push('Невалиден комплект.');
  if (!['paints', 'markers'].includes(order.coloring)) errors.push('Невалидно оцветяване.');

  if (order.personalize && !String(order.childName || '').trim()) {
    errors.push('Името на детето е задължително при персонализация.');
  }

  const totalPrice = Number(order.totalPrice);
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) errors.push('Невалидна обща цена.');
  if (order.paymentMethod !== 'cash_on_delivery') errors.push('Невалиден метод на плащане.');

  return errors;
}

function buildOrderRecord(body) {
  const customer = body.customer || {};
  const delivery = body.delivery || {};
  const office = delivery.office || {};
  const order = body.order || {};

  const manualOfficeNote = String(delivery.manualOfficeNote || '').trim();
  const hasSelectedOffice =
    delivery.type === 'office' && Boolean(String(office.id || delivery.officeId || '').trim());
  let deliveryDetails = String(delivery.details || '').trim();
  if (!deliveryDetails && manualOfficeNote) deliveryDetails = manualOfficeNote;

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
    delivery_details: deliveryDetails,
    office_id: hasSelectedOffice ? String(office.id || delivery.officeId || '').trim() || null : null,
    office_name: hasSelectedOffice
      ? String(office.name || delivery.officeName || '').trim() || null
      : null,
    office_address: hasSelectedOffice
      ? String(office.address || delivery.officeAddress || '').trim() || null
      : null,
    payment_method: 'cash_on_delivery',
    note: String(body.note || '').trim() || null,
    status: 'new',
    raw_payload: body,
  };
}

module.exports = async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (handleOptions(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const parsed = parseBody(req);
  if (parsed.error) return json(res, 400, { ok: false, error: parsed.error });
  const body = parsed.body;

  const errors = validatePayload(body);
  if (errors.length) return json(res, 400, { ok: false, errors });

  try {
    const saved = await insertOrder(buildOrderRecord(body));

    let emailResult = { sent: false, skipped: true, reason: 'not_attempted' };
    try {
      emailResult = await sendOrderEmail(saved, body);
    } catch (emailErr) {
      console.error('[orders] Resend notification failed — order saved in Supabase', {
        orderId: saved.id,
        message: emailErr.message,
        status: emailErr.status || null,
        resendMessage: emailErr.resendMessage || null,
      });
      emailResult = {
        sent: false,
        skipped: false,
        reason: 'send_failed',
        status: emailErr.status || null,
      };
    }

    const payload = {
      ok: true,
      orderId: saved.id,
      message: 'Поръчката е записана успешно.',
      emailSent: Boolean(emailResult.sent),
    };
    if (!emailResult.sent) {
      payload.emailReason = emailResult.reason || 'unknown';
      if (emailResult.reason === 'missing_env') {
        payload.emailHint =
          'Имейл env липсва на сървъра (RESEND_API_KEY, FROM_EMAIL, ORDER_NOTIFY_EMAIL).';
      } else if (emailResult.reason === 'send_failed') {
        payload.emailHint =
          'Resend отхвърли имейла. Провери верифициран домейн и FROM_EMAIL в Vercel.';
      }
    }

    return json(res, 201, payload);
  } catch (err) {
    console.error('[orders] Order API error:', err.message);
    const mapped = mapSupabaseError(res, err);
    if (mapped) return mapped;

    if (err.code === 'MISSING_SUPABASE_ENV') {
      const missing = Array.isArray(err.missing) ? err.missing : [];
      return json(res, 500, {
        ok: false,
        error: `Сървърът не е конфигуриран. Липсват: ${missing.join(', ')}.`,
        missing,
      });
    }

    return json(res, 500, {
      ok: false,
      error: 'Възникна проблем при изпращането. Моля, опитай отново или се свържи с нас.',
    });
  }
};
