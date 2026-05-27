# Вълшебни пеперуди — VeMiDi crafts

Landing page за творческия комплект „Вълшебни пеперуди“ на български език.

## Стартиране

### Статичен преглед

```bash
npx serve .
```

### С checkout API (Vercel)

Деплой на [Vercel](https://vercel.com) — папката `api/` се обслужва като serverless functions.

Локално с Vercel CLI:

```bash
npx vercel dev
```

## Конфигуратор

- Избор на размер (Мини / Стандарт / Макси)
- Бои или флумастери
- Персонализация с име (+2,50 €)
- Динамично обобщение и обща цена в евро
- Бутон **Поръчай** отваря checkout форма (не само modal)

## Checkout

Клиентът попълва:

- Име, телефон, имейл (по желание), бележка
- Куриер: Еконт / Спиди
- Доставка: до офис / до адрес
- Град и офис/адрес (ръчно въвеждане, без API за момента)
- Плащане: **само наложен платеж**
- GDPR съгласие (задължително)

Поръчката се изпраща с `POST /api/orders`.

## Environment variables (Vercel)

Задай в Project Settings → Environment Variables:

| Variable | Описание |
|----------|----------|
| `SUPABASE_URL` | URL на Supabase проекта |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (само на сървъра) |
| `RESEND_API_KEY` | API ключ от [Resend](https://resend.com) |
| `ORDER_NOTIFY_EMAIL` | Имейл за известия при нова поръчка |
| `FROM_EMAIL` | Подател, напр. `VeMiDi crafts <noreply@yourdomain.com>` |

Виж `.env.example` за шаблон. **Не комитвай** реални ключове.

## Supabase

Изпълни `supabase/schema.sql` в SQL Editor:

```sql
create table orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  status text default 'new',
  product_name text,
  kit_name text,
  kit_size text,
  coloring text,
  personalization boolean default false,
  child_name text,
  total_price numeric(10,2),
  currency text default 'EUR',
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  courier text,
  delivery_type text,
  city text,
  delivery_details text,
  payment_method text default 'cash_on_delivery',
  note text,
  raw_payload jsonb
);
```

## API

### `POST /api/orders`

Записва поръчка в Supabase и изпраща имейл чрез Resend.

Примерен payload:

```json
{
  "gdpr": true,
  "note": "Моля, обадете се преди доставка",
  "customer": {
    "name": "Мария Иванова",
    "phone": "0888123456",
    "email": "maria@example.com"
  },
  "delivery": {
    "courier": "econt",
    "type": "office",
    "city": "София",
    "details": "Офис Еконт Младост 1"
  },
  "order": {
    "kitSize": "5",
    "kitName": "Комплект Стандарт",
    "kitFigures": "5 фигурки",
    "coloring": "paints",
    "coloringLabel": "Бои с четка",
    "personalize": true,
    "childName": "Мая",
    "totalPrice": 20.5,
    "paymentMethod": "cash_on_delivery"
  },
  "created_at": "2026-05-27T12:00:00.000Z"
}
```

## Файлове

- `index.html` — структура, конфигуратор, checkout modal
- `styles.css` — визуална идентичност и responsive layout
- `script.js` — конфигуратор, checkout и изпращане на поръчка
- `api/orders.js` — Vercel serverless: Supabase + Resend
- `supabase/schema.sql` — таблица `orders`
- `assets/` — изображения
