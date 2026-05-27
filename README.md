# Вълшебни пеперуди — VeMiDi crafts

Landing page за творческия комплект „Вълшебни пеперуди“ на български език.

## Стартиране

### Само визуален преглед (без поръчки)

```bash
npx serve .
```

Това **не** стартира `/api/*`. Бутонът „Потвърди поръчката“ и админ панелът няма да работят коректно — използвай `vercel dev` или production.

### Локално с пълен flow (поръчки, имейл, админ)

1. Копирай `.env.example` → `.env.local` и попълни реалните стойности (не го commit-вай).
2. Стартирай:

```bash
npx vercel dev
```

3. Отвори URL-а от терминала (обикновено `http://localhost:3000`).

### Production (Vercel)

Деплой на [Vercel](https://vercel.com) — папката `api/` се обслужва като serverless functions. Env променливите се задават в Project Settings → Environment Variables, после **Redeploy**.

## Админ панел

URL: **`/admin`** (напр. `https://your-site.vercel.app/admin`)

1. Отвори `/admin` в браузъра.
2. Въведи паролата от environment variable **`ADMIN_PASSWORD`** (паролата не е във frontend кода).
3. След успешен вход се пази HttpOnly cookie със session token (валиден 7 дни).
4. Виждаш списък с поръчки (най-новите първи), филтър по статус и търсене по име, телефон или име на дете.
5. От „Детайли“ можеш да смениш статуса — промяната се записва в Supabase.

### Статуси

| Код | Етикет |
|-----|--------|
| `new` | Нова |
| `confirmed` | Потвърдена |
| `making` | Изработва се |
| `shipped` | Изпратена |
| `completed` | Завършена |
| `cancelled` | Отказана |

### Admin API (изисква валидна session)

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/admin/login` | POST | Вход с `{ "password": "..." }` |
| `/api/admin/login` | DELETE | Изход |
| `/api/admin/session` | GET | Проверка на сесията |
| `/api/admin/orders` | GET | Списък (`?status=`, `?q=`) |
| `/api/admin/orders?id=UUID` | PATCH | Смяна на статус `{ "status": "confirmed" }` |

Supabase service role key се използва **само** в serverless functions, не в браузъра.

## Конфигуратор

- Избор на размер (Мини / Стандарт / Макси)
- Бои или флумастери
- Персонализация с име (+2,50 €)
- Динамично обобщение и обща цена в евро
- Бутон **Поръчай** отваря checkout форма

## Checkout

Клиентът попълва:

- Име, телефон, имейл (по желание), бележка
- Куриер: Еконт / Спиди
- Доставка: до офис / до адрес
- Град и офис/адрес (ръчно въвеждане)
- Плащане: **само наложен платеж**
- GDPR съгласие (задължително)

Поръчката се изпраща с `POST /api/orders`.

## Environment variables (Vercel)

Задай в Project Settings → Environment Variables (за **Production** и при нужда **Preview**):

| Variable | Описание |
|----------|----------|
| `SUPABASE_URL` | URL на Supabase проекта (без `/rest/v1`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret / service role key (само на сървъра) |
| `RESEND_API_KEY` | API ключ от [Resend](https://resend.com) |
| `ORDER_NOTIFY_EMAIL` | Имейл за известия при нова поръчка |
| `FROM_EMAIL` | Подател, напр. `VeMiDi crafts <noreply@yourdomain.com>` |
| `ADMIN_PASSWORD` | Парола за вход в `/admin` |

Виж `.env.example` за шаблон. **Не комитвай** реални ключове.

След добавяне или промяна на env: **Redeploy** на проекта.

## Supabase

Изпълни `supabase/schema.sql` в SQL Editor (таблица `orders` с колона `status`).

## API

### `POST /api/orders`

Записва поръчка в Supabase и опитва да изпрати имейл чрез Resend.

**Отговор при успех (201):**

```json
{
  "ok": true,
  "orderId": "uuid",
  "message": "Поръчката е записана успешно.",
  "emailSent": true
}
```

- `emailSent: true` — имейлът е изпратен до `ORDER_NOTIFY_EMAIL`.
- `emailSent: false` — поръчката е записана, но имейлът не е изпратен (липсващ env или грешка при Resend). Детайлите за грешката се логват само в backend console (Vercel Functions logs).

**Subject на имейла:**  
`Нова поръчка: Вълшебни пеперуди – [име на клиента] – [сума] €`

Имейлът съдържа: клиент, телефон, имейл, комплект, оцветяване, персонализация, име, доставка, куриер, обща цена, бележка.

## Тестване

### Нова поръчка

1. `npx vercel dev` с попълнен `.env.local`, или production URL след deploy.
2. Конфигуратор → **Поръчай** → попълни checkout → **Потвърди поръчката**.
3. Провери в Supabase → Table Editor → `orders`.
4. Провери в `/admin`, че поръчката се вижда.

### Имейл notification

1. Задай в Vercel (**Production** + Redeploy):
   - `RESEND_API_KEY` — от [Resend](https://resend.com) → API Keys
   - `ORDER_NOTIFY_EMAIL` — твоят имейл за известия (само валиден адрес)
   - `FROM_EMAIL` — **от верифициран домейн**, напр. `VeMiDi crafts <orders@yourdomain.com>`
2. В Resend → **Domains** добави и верифицирай домейна (DNS записи).  
   **Не** ползвай `@gmail.com` / `@yahoo.com` като `FROM_EMAIL`.
3. Направи тестова поръчка.
4. В Network → `POST /api/orders` → виж `emailSent` и при проблем `emailHint`.
5. При `emailSent: false`: Vercel → **Logs** → `api/orders` (търси `Resend API rejected`).

**Чести причини без имейл:**

| Проблем | Решение |
|--------|---------|
| Env само за Preview, не Production | Задай за Production и **Redeploy** |
| `FROM_EMAIL` не е от верифициран домейн | Верифицирай домейн в Resend |
| `onboarding@resend.dev` + друг получател | Работи само до имейла на Resend акаунта; иначе верифицирай домейн |
| Грешен `ORDER_NOTIFY_EMAIL` | Провери правописа, без интервали |

### Смяна на статус

1. Влез в `/admin`.
2. Отвори **Детайли** на поръчка.
3. Избери нов статус → **Запази статус**.
4. Потвърди в Supabase или с refresh в админ списъка.

## Файлове

- `index.html` — landing, конфигуратор, checkout modal
- `styles.css` — визуална идентичност
- `script.js` — конфигуратор и checkout
- `admin/` — админ UI (`index.html`, `admin.css`, `admin.js`)
- `api/orders.js` — създаване на поръчка + имейл
- `api/admin/` — login, session, orders
- `api/lib/` — споделена логика (Supabase, auth, email)
- `supabase/schema.sql` — таблица `orders`
- `assets/` — изображения
