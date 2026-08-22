// ============================================================
// Общие типы фронтенда, соответствующие ответам бэкенда (FastAPI)
// ============================================================

// Заказ из ленты или детальной страницы
export interface Order {
  id: number;
  region: string;          // город/регион
  street: string;          // улица
  house: string;           // дом
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  landmarks: string | null;
  phone: string | null;    // телефон скрыт, пока баланс < порога
  phone_available: boolean;
  customer_name: string | null; // имя заказчика (из формы «Разместить заказ»)
  price: number;           // стоимость заказа, руб.
  hourly_rate: number | null;
  weight: number | null;
  category: string;
  urgency: boolean;        // срочный заказ
  description: string | null;
  published_at: string;
  status: 'active' | 'taken' | 'completed';
  status_label?: string;
  time_label?: string;     // «Сегодня, 14:30»
  source?: string | null;  // площадка для внешних заказов (ГрузАгг и т.п.)
  is_external?: boolean;   // true — заказ с площадки: без деталей и телефона
  deadline: string | null;        // «до скольки» завершить заказ, формат HH:MM
  duration_min: number | null;   // минимальная длительность работы, минут
  duration_max: number | null;   // максимальная длительность работы, минут
  taken_by: string | null;       // имя грузчика, взявшего заказ
  taken_by_me: boolean;          // true — заказ взял текущий грузчик
  arrived_at: string | null;     // когда грузчик отметился «на месте» (ISO)
  latitude: number | null;       // координаты точки выполнения (для карты)
  longitude: number | null;
}

// Данные формы «Разместить заказ» (публичный эндпоинт POST /orders/public)
export interface CustomerOrderCreate {
  region_name: string;
  name: string;
  phone: string;
  street: string;
  house: string;
  apartment?: string | null;
  entrance?: string | null;
  floor?: string | null;
  landmarks?: string | null;
  price: number;
  hourly_rate?: number | null;
  weight?: number | null;
  deadline?: string | null;    // формат HH:MM
  duration_min?: number | null;
  duration_max?: number | null;
  category?: string;
  urgency?: boolean;
  description?: string | null;
  // Координаты из геолокации браузера (кнопка «Определить местоположение»)
  latitude?: number | null;
  longitude?: number | null;
}

// Ответ ленты: заказы + счётчики по регионам
export interface OrderList {
  orders: Order[];
  total: number;
  current_region: string | null;
  region_counts: { region: string; count: number }[];
}

// Пользователь (грузчик или админ)
export interface User {
  id: number;
  public_id: string;       // публичный ID вида GRUZ-123456
  phone: string;
  email: string | null;
  name: string;
  balance: number;         // баланс в рублях
  is_active: boolean;
  is_blocked: boolean;
  is_admin: boolean;
  created_at: string;
  avatar: string | null;   // имя файла аватара (null — нет аватара)
  phone_unlocked: boolean; // оплачен постоянный доступ к телефонам
  in_top20: boolean;       // активна ли подписка «ТОП-20»
  top20_until: string | null; // дата окончания ТОП-20
}

// Ответ авторизации/регистрации
export interface TokenOut {
  token: string;
  user: User;
}

// Заявка на пополнение баланса
// purpose: 'topup' — пополнение баланса, 'phone_unlock' — доступ к телефонам,
//          'top20' — подписка ТОП-20 на сутки
export type PaymentPurpose = 'topup' | 'phone_unlock' | 'top20';

export interface Payment {
  id: number;
  user_id: number;
  user_name: string | null;
  user_public_id: string | null;
  amount: number;
  purpose: PaymentPurpose;
  receipt_file: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
  confirmed_at: string | null;
}

// Запись «грузчик взял заказ»
export interface TakenOrder {
  id: number;
  order_id: number;
  commission: number;
  taken_at: string;
  completed_at: string | null;
  arrived_at: string | null;  // когда грузчик отметился «на месте» (ISO)
  order: Order | null;
}

// Статистика грузчика
export interface Stats {
  total_taken: number;
  total_completed: number;
  today_taken: number;
  week_taken: number;
  month_taken: number;
  earnings: number;
  commission_paid: number;
}

// Регион/город с числом активных заказов
export interface RegionWithCount {
  name: string;
  orders_count: number;
}

// Админ-статистика (общий дашборд с графиками)
export interface AdminStats {
  users: {
    total: number;
    blocked: number;
    new_today: number;
    new_week: number;
    new_month: number;
    active_30d: number;
  };
  orders: {
    total: number;
    today: number;
    week: number;
    month: number;
    taken: number;
    completed: number;
    by_source: { admin: number; form: number };
    conversion: { taken_pct: number; completed_pct: number };
  };
  finance: {
    commission_income: number;
    taken_orders: number;
    confirmed_topups_sum: number;
    pending_payments: number;
    avg_order_price: number;
  };
  charts: {
    income_14d: { date: string; commission: number; topups: number }[];
    orders_14d: { date: string; published: number; taken: number; completed: number }[];
    new_users_14d: { date: string; count: number }[];
    orders_by_category: { category: string; count: number }[];
  };
  reviews: {
    total: number;
    avg_rating: number | null;
    loader_reviews: number;
  };
}

// Регион в админ-панели (с доп. полями)
export interface AdminRegion {
  id: number;
  name: string;
  is_active: boolean;
  orders_count: number;
}

// Запись журнала действий
export interface AdminLog {
  id: number;
  user_id: number;
  action: string;
  details: string | null;
  created_at: string;
}

// Настройки системы (ответ /admin/settings)
export interface Settings {
  commission: number;
  min_topup: number;
  phone_visible_balance: number;
  phone_unlock_amount: number;  // цена доступа к телефонам
  top20_price: number;          // цена подписки ТОП-20 на сутки
  bank: {
    name: string;
    phone: string;
    card: string;
    holder: string;
  };
}

// Цены и реквизиты для личного кабинета (ответ /profile/services)
export interface Services {
  min_topup: number;
  phone_unlock_amount: number;
  top20_price: number;
  bank: {
    name: string;
    phone: string;
    card: string;
    holder: string;
  };
}

// Участник ТОП-20 (ответ /top20)
export interface TopUser {
  rank: number;
  public_id: string;
  name: string;
  avatar: string | null;
  completed: number;   // выполненных заказов
  taken: number;       // всего взято заказов
  in_top20: boolean;   // подписка активна
  top20_until: string | null;
}

// Универсальный ответ с сообщением
export interface MessageOut {
  message: string;
  detail?: Record<string, unknown> | null;
}

// Заказ с внешней площадки (агрегатор)
export interface ExternalOrder {
  id: string;
  source: string;
  title: string;
  company: string | null;
  area: string | null;
  salary_text: string | null;
  description: string | null;
  url: string;
  published_at: string | null;
  contact_phone?: string | null; // телефон клиента (из базы ГрузАгг)
}

// Площадка из справочника «где искать заказы»
export interface OrderSource {
  id: string;
  name: string;
  url: string;
  description: string;
  kind: 'orders' | 'vacancy' | 'profile' | 'telegram';
  has_feed?: boolean;
}

// Ответ /aggregator/sources
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface AggregatorSources {
  total: number;
  live_sources: string[];
  items: OrderSource[];
}

// Ответ /aggregator/feed
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface AggregatorFeed {
  query: string;
  updated_at: string;
  sources: Record<string, string>;
  items: ExternalOrder[];
}

// Отзыв (заказчик на грузчика или грузчик на заказчика)
export interface Review {
  id: number;
  order_id: number;
  from_role: 'customer' | 'loader';
  from_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

// Тело запроса отзыва заказчика на грузчика (POST /reviews/orders/{id}/review)
export interface ReviewCreate {
  phone: string;
  rating: number;
  comment?: string | null;
}

// Тело запроса отзыва грузчика на заказчика (POST /reviews/orders/{id}/review-loader)
export interface ReviewLoaderCreate {
  rating: number;
  comment?: string | null;
}

// Промокод (админка: список/создание/изменение)
export interface PromoCode {
  id: number;
  code: string;
  bonus: number;
  max_uses: number;
  uses_count: number;
  is_active: boolean;
  created_at: string;
}

export interface PromoCodeCreate {
  code: string;
  bonus: number;
  max_uses: number;
}

export interface PromoCodeUpdate {
  bonus?: number;
  max_uses?: number;
  is_active?: boolean;
}

// Реферальная программа (ответ /profile/referral)
export interface Referral {
  code: string;
  link: string;
  bonus: number;
  referrals_count: number;
  total_bonus: number;
}

// Push-уведомления в Telegram (ответ /profile/notify-link)
export interface NotifyLink {
  enabled: boolean;
  link: string;
  bot: string;
  chat_id: number | null;
}

// Событие WebSocket-ленты
export interface FeedEvent {
  type: 'orders_update' | 'ping';
  region?: string | null;
  [key: string]: unknown;
}
