const PRODUCT_NAME = 'Вълшебни пеперуди';
const CURRENCY = 'EUR';

const COURIER_LABELS = { econt: 'Еконт', speedy: 'Спиди' };
const DELIVERY_LABELS = { office: 'До офис', address: 'До адрес' };
const COLORING_LABELS = { paints: 'Бои с четка', markers: 'Флумастери' };

const KIT_FIGURES = {
  3: '3 фигурки',
  5: '5 фигурки',
  7: '7 фигурки',
};

const ORDER_STATUSES = ['new', 'confirmed', 'making', 'shipped', 'completed', 'cancelled'];

const STATUS_LABELS = {
  new: 'Нова',
  confirmed: 'Потвърдена',
  making: 'Изработва се',
  shipped: 'Изпратена',
  completed: 'Завършена',
  cancelled: 'Отказана',
};

const PAYMENT_LABELS = {
  cash_on_delivery: 'Наложен платеж',
};

module.exports = {
  PRODUCT_NAME,
  CURRENCY,
  COURIER_LABELS,
  DELIVERY_LABELS,
  COLORING_LABELS,
  KIT_FIGURES,
  ORDER_STATUSES,
  STATUS_LABELS,
  PAYMENT_LABELS,
};
