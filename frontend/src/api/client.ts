// ============================================================
// Клиент API: тонкая обёртка над fetch.
// В dev-режиме Vite проксирует /api -> http://127.0.0.1:8000,
// поэтому здесь используется относительный базовый путь.
// JWT-токен хранится в localStorage и подставляется в заголовок.
// ============================================================

import type {
  AdminLog,
  AdminRegion,
  AdminStats,
  AggregatorFeed,
  AggregatorSources,
  CustomerOrderCreate,
  MessageOut,
  NotifyLink,
  Order,
  OrderList,
  Payment,
  PromoCode,
  PromoCodeCreate,
  PromoCodeUpdate,
  Referral,
  RegionWithCount,
  Review,
  ReviewCreate,
  ReviewLoaderCreate,
  Services,
  Settings,
  Stats,
  TakenOrder,
  TokenOut,
  TopUser,
  User,
} from '../types';

// Ключ в localStorage
const TOKEN_KEY = 'gruzchiki_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

// Класс ошибки API с текстом от бэкенда (для показа пользователю)
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Скачать бинарный файл (Excel и т.п.) с авторизацией и сохранить через blob
async function download(url: string, fallbackName = 'file.xlsx'): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api${url}`, { method: 'GET', headers });
  if (!res.ok) {
    let detail = `Ошибка запроса (${res.status})`;
    try {
      const data = await res.json();
      if (data && typeof data === 'object' && 'detail' in data) {
        detail = String((data as { detail: unknown }).detail);
      }
    } catch {
      /* тело не JSON — оставляем стандартное сообщение */
    }
    throw new ApiError(res.status, detail);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  const filename = match ? match[1].replace(/^"|"$/g, '') : fallbackName;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

async function request<T>(method: string, url: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (isForm) {
      payload = body as FormData; // не выставляем Content-Type — браузер сам добавит boundary
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }

  let res: Response;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'Сервер недоступен. Проверьте, что бэкенд запущен.');
  }

  // 401 — обычно истёк/невалиден токен
  if (res.status === 401) {
    setToken(null);
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : `Ошибка запроса (${res.status})`;
    throw new ApiError(res.status, detail);
  }

  return data as T;
}

// ------------------------- Публичное API -------------------------

export const api = {
  // --- Авторизация ---
  register: (data: {
    phone: string;
    name: string;
    password: string;
    email?: string;
    promo_code?: string | null;
  }) => request<TokenOut>('POST', '/auth/register', data),

  login: (data: { phone: string; password: string }) =>
    request<TokenOut>('POST', '/auth/login', data),

  // --- Лента и заказы ---
  feed: (params: Record<string, string | number | boolean | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return request<OrderList>('GET', `/orders${q ? `?${q}` : ''}`);
  },

  orderDetail: (id: number) => request<Order>('GET', `/orders/${id}`),

  takeOrder: (id: number) => request<MessageOut>('POST', `/orders/${id}/take`),

  // Грузчик отметился «на месте» — админ получает Telegram-уведомление
  arriveOrder: (id: number) => request<MessageOut>('POST', `/orders/${id}/arrived`),

  categories: () => request<string[]>('GET', '/orders/categories'),

  // Публичная форма заказчика — без авторизации
  createCustomerOrder: (data: CustomerOrderCreate) =>
    request<Order>('POST', '/orders/public', data),

  regions: () => request<RegionWithCount[]>('GET', '/regions'),

  // --- Личный кабинет ---
  profile: () => request<User>('GET', '/profile'),

  services: () => request<Services>('GET', '/profile/services'),

  topup: (amount: number, receipt: File | null) => {
    const form = new FormData();
    form.append('amount', String(amount));
    if (receipt) form.append('receipt', receipt);
    return request<MessageOut>('POST', '/profile/topup', form, true);
  },

  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<User>('POST', '/profile/avatar', form, true);
  },

  // Оплата услуги: receipt=null — списание с баланса, иначе заявка с чеком
  unlockPhone: (receipt: File | null) => {
    const form = new FormData();
    if (receipt) form.append('receipt', receipt);
    return request<MessageOut>('POST', '/profile/unlock-phone', form, true);
  },

  top20Pay: (receipt: File | null) => {
    const form = new FormData();
    if (receipt) form.append('receipt', receipt);
    return request<MessageOut>('POST', '/profile/top20', form, true);
  },

  top20List: () => request<TopUser[]>('GET', '/top20'),

  myPayments: () => request<Payment[]>('GET', '/profile/payments'),

  myOrders: () => request<TakenOrder[]>('GET', '/profile/orders'),

  myStats: () => request<Stats>('GET', '/profile/stats'),

  // Реферальная программа и push-уведомления в Telegram
  myReferral: () => request<Referral>('GET', '/profile/referral'),

  notifyLink: () => request<NotifyLink>('GET', '/profile/notify-link'),

  // --- Отзывы и рейтинги ---
  // Отзыв заказчика на грузчика (по выполненному заказу)
  submitReview: (orderId: number, data: ReviewCreate) =>
    request<Review>('POST', `/reviews/orders/${orderId}/review`, data),

  // Отзыв грузчика на заказчика
  submitLoaderReview: (orderId: number, data: ReviewLoaderCreate) =>
    request<Review>('POST', `/reviews/orders/${orderId}/review-loader`, data),

  // Отзывы по заказу (заказчик видит отзывы заказчиков, админ — все)
  orderReviews: (orderId: number) =>
    request<Review[]>('GET', `/reviews/orders/${orderId}/reviews`),

  // Публичные отзывы заказчиков о грузчике
  userReviews: (userId: number) => request<Review[]>('GET', `/reviews/users/${userId}/reviews`),

  // Все отзывы (только для админа)
  adminReviews: () => request<Review[]>('GET', '/reviews/admin/reviews'),

  // ------------------------- Админка -------------------------

  adminUsers: () => request<User[]>('GET', '/admin/users'),

  adminBlock: (userId: number) => request<MessageOut>('POST', `/admin/users/${userId}/block`),

  adminUnblock: (userId: number) => request<MessageOut>('POST', `/admin/users/${userId}/unblock`),

  adminPayments: (statusFilter?: string) =>
    request<Payment[]>(
      'GET',
      `/admin/payments${statusFilter ? `?status_filter=${statusFilter}` : ''}`,
    ),

  adminConfirmPayment: (paymentId: number) =>
    request<MessageOut>('POST', `/admin/payments/${paymentId}/confirm`),

  adminRejectPayment: (paymentId: number) =>
    request<MessageOut>('POST', `/admin/payments/${paymentId}/reject`),

  adminOrders: () => request<Order[]>('GET', '/admin/orders'),

  adminCreateOrder: (data: Record<string, unknown>) =>
    request<Order>('POST', '/admin/orders', data),

  adminDeleteOrder: (orderId: number) =>
    request<MessageOut>('DELETE', `/admin/orders/${orderId}`),

  adminCompleteOrder: (orderId: number) =>
    request<MessageOut>('POST', `/admin/orders/${orderId}/complete`),

  adminRegions: () => request<AdminRegion[]>('GET', '/admin/regions'),

  adminCreateRegion: (name: string) => request<{ id: number; name: string }>('POST', '/admin/regions', { name }),

  adminDeleteRegion: (regionId: number) =>
    request<MessageOut>('DELETE', `/admin/regions/${regionId}`),

  adminSettings: () => request<Settings>('GET', '/admin/settings'),

  adminUpdateSettings: (data: Partial<Settings>) =>
    request<Settings>('PUT', '/admin/settings', data),

  adminStats: () => request<AdminStats>('GET', '/admin/stats'),

  // Выгрузка статистики в Excel (скачивание файла)
  adminStatsExport: () => download('/admin/stats/export', 'stats.xlsx'),

  // --- Промокоды (админка) ---
  adminPromos: () => request<PromoCode[]>('GET', '/admin/promocodes'),

  adminCreatePromo: (data: PromoCodeCreate) =>
    request<PromoCode>('POST', '/admin/promocodes', data),

  adminUpdatePromo: (promoId: number, data: PromoCodeUpdate) =>
    request<PromoCode>('PATCH', `/admin/promocodes/${promoId}`, data),

  adminDeletePromo: (promoId: number) =>
    request<MessageOut>('DELETE', `/admin/promocodes/${promoId}`),

  adminLogs: () => request<AdminLog[]>('GET', '/admin/logs'),

  // ------------------------- Агрегатор заказов -------------------------

  aggregatorSources: () => request<AggregatorSources>('GET', '/aggregator/sources'),

  aggregatorFeed: (query = 'грузчик') =>
    request<AggregatorFeed>('GET', `/aggregator/feed?query=${encodeURIComponent(query)}`),
};
