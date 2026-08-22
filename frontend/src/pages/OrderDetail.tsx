// ============================================================
// Детальная страница заказа.
// Показывает полный адрес, условия, телефон заказчика (если открыт).
// Кнопка «Взять заказ» списывает комиссию и открывает телефон.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Badge, Button, orderTimeLabel, rub, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { Order, Review } from '../types';

// Выбор оценки 1–5 звёздами
function RatingPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`Оценка ${n}`}
          className={`text-2xl leading-none transition-transform duration-100 hover:scale-125 ${
            n <= value ? 'text-amber-400' : 'text-slate-600'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// Звёзды для показа существующего отзыва
function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400 text-sm">
      {'★'.repeat(rating)}
      <span className="text-slate-600">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);
  const { user, refresh } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [reviews, setReviews] = useState<Review[] | null>(null);

  // Форма отзыва заказчика (по телефону, без регистрации)
  const [custRating, setCustRating] = useState(5);
  const [custPhone, setCustPhone] = useState('');
  const [custComment, setCustComment] = useState('');
  const [custBusy, setCustBusy] = useState(false);

  // Форма отзыва грузчика (только взявший заказ)
  const [loaderRating, setLoaderRating] = useState(5);
  const [loaderComment, setLoaderComment] = useState('');
  const [loaderBusy, setLoaderBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([api.orderDetail(orderId), api.orderReviews(orderId)]);
      setOrder(o);
      setReviews(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Заказ не найден');
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Отзыв заказчика на грузчика: телефон сверяется с телефоном в заказе
  const handleCustomerReview = async () => {
    if (!custPhone.trim()) {
      notify('Укажите телефон, с которого размещали заказ', 'error');
      return;
    }
    setCustBusy(true);
    try {
      await api.submitReview(orderId, {
        phone: custPhone.trim(),
        rating: custRating,
        comment: custComment.trim() || null,
      });
      notify('Спасибо! Ваш отзыв опубликован.', 'success');
      setCustComment('');
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Не удалось оставить отзыв', 'error');
    } finally {
      setCustBusy(false);
    }
  };

  // Отзыв грузчика на заказчика (оценить может только взявший заказ)
  const handleLoaderReview = async () => {
    setLoaderBusy(true);
    try {
      await api.submitLoaderReview(orderId, {
        rating: loaderRating,
        comment: loaderComment.trim() || null,
      });
      notify('Отзыв отправлен. Спасибо!', 'success');
      setLoaderComment('');
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Не удалось оставить отзыв', 'error');
    } finally {
      setLoaderBusy(false);
    }
  };

  // Грузчик на месте: уведомление администратору в Telegram
  const handleArrive = async () => {
    setArriving(true);
    try {
      await api.arriveOrder(orderId);
      notify('Отмечено! Администратор получил уведомление.', 'success');
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Не удалось отправить отметку', 'error');
    } finally {
      setArriving(false);
    }
  };

  // Взятие заказа: списание комиссии + открытие телефона
  const handleTake = async () => {
    setTaking(true);
    try {
      const res = await api.takeOrder(orderId);
      notify('Заказ взят! Телефон заказчика открыт.', 'success');
      await refresh(); // баланс изменился — обновляем профиль
      await load();
      const detail = res.detail as { customer_phone?: string } | null;
      if (detail?.customer_phone) {
        navigate(`/orders/${orderId}?phone=${encodeURIComponent(detail.customer_phone)}`);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        notify(e.message, 'error');
      } else {
        notify('Не удалось взять заказ', 'error');
      }
    } finally {
      setTaking(false);
    }
  };

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-400 mb-4">{error}</p>
        <Link to="/" className="text-brand-300 font-medium">← Вернуться в ленту</Link>
      </div>
    );
  }

  if (!order) return <Spinner />;

  // Полный адрес
  const fullAddress = [
    order.street,
    order.house,
    order.apartment && `кв. ${order.apartment}`,
    order.entrance && `подъезд ${order.entrance}`,
    order.floor && `этаж ${order.floor}`,
  ]
    .filter(Boolean)
    .join(', ');

  const isTaken = order.status !== 'active';
  const timeLabel = orderTimeLabel(order.published_at);
  // Вакансия площадки (Работа России / hh.ru / SuperJob): отклик по внешней ссылке
  const isVacancy = Boolean(order.external_url) || (order.is_external && Boolean(order.title));

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/" className="text-sm text-brand-300 font-medium hover:underline">
        ← Назад к ленте
      </Link>

      <div className="glass gradient-border animate-fade-up rounded-2xl mt-3 p-5">
        {/* Шапка карточки */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 2a6 6 0 00-6 6c0 4 6 10 6 10s6-6 6-10a6 6 0 00-6-6z"
                  clipRule="evenodd"
                />
                <circle cx="10" cy="8" r="2" fill="white" />
              </svg>
              <span className="font-medium">{order.region}</span>
              {timeLabel && <span>· {timeLabel}</span>}
            </div>
            <h1 className="text-xl font-bold text-slate-100 mt-1">
              {isVacancy ? (order.title ?? 'Вакансия') : 'Перевозка груза'}
            </h1>
            {isVacancy && order.company && (
              <div className="text-sm text-slate-400 mt-0.5">{order.company}</div>
            )}
          </div>
          <div className="text-right shrink-0">
            {isVacancy ? (
              <div className="text-xl font-bold text-slate-200">{order.salary_text ?? 'З/п по запросу'}</div>
            ) : (
              <>
                <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-2xl font-extrabold text-transparent">{rub(order.price)}</div>
                {order.hourly_rate != null && (
                  <div className="text-sm text-slate-400">{rub(order.hourly_rate)}/час</div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Бейджи */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Badge color="blue">{order.category}</Badge>
          {order.weight != null && <Badge>Вес: {order.weight} кг</Badge>}
          {order.urgency ? <Badge color="red">Срочный</Badge> : <Badge color="gray">Обычный</Badge>}
          {order.deadline && <Badge color="orange">⏰ до {order.deadline}</Badge>}
          {order.duration_min != null || order.duration_max != null ? (
            <Badge color="cyan">
              ⏱{' '}
              {order.duration_min != null && order.duration_max != null
                ? `${order.duration_min}–${order.duration_max} мин`
                : order.duration_min != null
                  ? `от ${order.duration_min} мин`
                  : `до ${order.duration_max} мин`}
            </Badge>
          ) : null}
          {order.is_external && (
            <Badge color="purple">
              {isVacancy ? `Вакансия · ${order.source ?? 'Площадка'}` : (order.source ?? 'Площадка')}
            </Badge>
          )}
          {isVacancy ? (
            <Badge color="green">Актуальна</Badge>
          ) : isTaken ? (
            <Badge color="green">Заказ взят</Badge>
          ) : (
            <Badge color="orange">Открыт к взятию</Badge>
          )}
          {order.arrived_at && <Badge color="green">📍 Вы на месте</Badge>}
        </div>
        {isTaken && order.taken_by && !order.taken_by_me && (
          <p className="text-xs text-slate-400 mt-2">Взял: {order.taken_by}</p>
        )}

        <hr className="my-4 border-white/10" />

        {/* Адрес (у вакансий адреса нет — street занят заголовком вакансии) */}
        {!isVacancy && (
          <>
            <h2 className="font-semibold text-slate-100 mb-2">Адрес</h2>
            <p className="text-slate-200">{fullAddress}</p>
            {order.landmarks && (
              <p className="text-sm text-slate-400 mt-1">Ориентир: {order.landmarks}</p>
            )}
          </>
        )}

        {order.description && (
          <>
            <h2 className="font-semibold text-slate-100 mt-4 mb-1">Описание</h2>
            <p className="text-slate-200 text-sm whitespace-pre-line">{order.description}</p>
          </>
        )}

        {(order.deadline || order.duration_min != null || order.duration_max != null) && (
          <>
            <h2 className="font-semibold text-slate-100 mt-4 mb-2">⏱ Время и длительность</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="glass rounded-lg p-3">
                <div className="text-xs text-slate-400">Завершить заказ до</div>
                <div className="font-bold text-slate-100 mt-0.5">
                  {order.deadline ? `${order.deadline}` : '—'}
                </div>
              </div>
              <div className="glass rounded-lg p-3">
                <div className="text-xs text-slate-400">Длительность работ</div>
                <div className="font-bold text-slate-100 mt-0.5">
                  {order.duration_min != null && order.duration_max != null
                    ? `${order.duration_min}–${order.duration_max} мин`
                    : order.duration_min != null
                      ? `от ${order.duration_min} мин`
                      : order.duration_max != null
                        ? `до ${order.duration_max} мин`
                        : '—'}
                </div>
              </div>
            </div>
          </>
        )}

        <hr className="my-4 border-white/10" />

        {/* Телефон заказчика (у вакансий его нет — отклик по ссылке на площадке) */}
        {!isVacancy && (
          <>
            <h2 className="font-semibold text-slate-100 mb-2">Телефон заказчика</h2>
            {order.phone && order.phone_available ? (
              <div className="flex items-center gap-3">
                <a
                  href={`tel:${order.phone.replace(/\s/g, '')}`}
                  className="text-lg font-bold text-emerald-300 hover:underline"
                >
                  {order.phone}
                </a>
                <Badge color="green">Открыт</Badge>
              </div>
            ) : (
              <div className="glass rounded-lg p-3 text-sm text-slate-300">
                🔒 Телефон скрыт.{' '}
                {order.is_external
                  ? 'Он откроется сразу после взятия заказа: комиссия спишется с баланса, и телефон заказчика с площадки станет доступен.'
                  : 'Он откроется автоматически после пополнения баланса и подтверждения оплаты администратором.'}
                {!user && (
                  <div className="mt-2">
                    <Link to="/login" className="text-brand-300 font-medium hover:underline">
                      Войдите в аккаунт
                    </Link>{' '}
                    или{' '}
                    <Link to="/register" className="text-brand-300 font-medium hover:underline">
                      зарегистрируйтесь
                    </Link>
                    .
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Действия */}
        {isVacancy ? (
          <div className="mt-5">
            <a
              href={order.external_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 py-3 text-base font-semibold text-white transition hover:opacity-90"
            >
              Откликнуться на площадке ↗
            </a>
            <p className="text-xs text-slate-400 text-center mt-2">
              Вакансия размещена на площадке {order.source ?? 'Работа России'}.
              Отклик и контакты работодателя — по ссылке.
            </p>
          </div>
        ) : !isTaken && (
          <div className="mt-5">
            <Button onClick={() => void handleTake()} disabled={taking} className="w-full py-3 text-base">
              {taking ? 'Оформляем…' : 'Взять заказ'}
            </Button>
            <p className="text-xs text-slate-400 text-center mt-2">
              С баланса спишется комиссия за доступ к заказу. Телефон заказчика
              {order.is_external ? ' с площадки' : ''} откроется сразу.
            </p>
          </div>
        )}

        {/* Грузчик на месте: кнопка только у того, кто взял заказ, и только до отметки */}
        {isTaken && order.taken_by_me && !order.arrived_at && (
          <div className="mt-5">
            <Button
              variant="success"
              onClick={() => void handleArrive()}
              disabled={arriving}
              className="w-full py-3 text-base"
            >
              {arriving ? 'Отправляем…' : '📍 Я на месте'}
            </Button>
            <p className="text-xs text-slate-400 text-center mt-2">
              Нажмите, когда приехали и начали работу. Администратор получит уведомление в Telegram.
            </p>
          </div>
        )}
      </div>

      {/* ======================== Отзывы и оценки ======================== */}
      <div className="glass rounded-2xl mt-4 p-5">
        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide text-slate-400">
          Отзывы и оценки
        </h2>

        {/* Список отзывов */}
        {reviews === null ? (
          <Spinner />
        ) : reviews.length === 0 ? (
          <p className="text-sm text-slate-400 mt-3">Пока нет отзывов.</p>
        ) : (
          <div className="flex flex-col gap-2 mt-3">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-lg bg-slate-800/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="text-xs text-slate-400">
                      {r.from_role === 'customer' ? 'Заказчик' : 'Грузчик'}
                      {r.from_name ? ` · ${r.from_name}` : ''}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString('ru-RU')}</span>
                </div>
                {r.comment && <p className="text-sm text-slate-200 mt-1">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Отзыв заказчика на грузчика — после выполнения заказа */}
        {order.status === 'completed' && (
          <div className="mt-4 rounded-lg bg-slate-800/40 p-4">
            <h3 className="font-semibold text-slate-100 text-sm">Оцените грузчика</h3>
            <p className="text-xs text-slate-400 mt-0.5 mb-2">
              Укажите телефон, с которого размещали заказ, и поставьте оценку.
            </p>
            <div className="flex flex-col gap-3">
              <input
                type="tel"
                placeholder="+7 912 000-00-00"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                className="rounded-lg bg-slate-900/80 border border-white/10 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-400 focus:outline-none"
              />
              <RatingPicker value={custRating} onChange={setCustRating} />
              <textarea
                placeholder="Комментарий (необязательно)"
                value={custComment}
                onChange={(e) => setCustComment(e.target.value)}
                rows={2}
                className="rounded-lg bg-slate-900/80 border border-white/10 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-400 focus:outline-none resize-none"
              />
              <Button
                variant="secondary"
                className="px-4 py-1.5 text-sm self-start"
                disabled={custBusy}
                onClick={() => void handleCustomerReview()}
              >
                {custBusy ? 'Отправляем…' : 'Отправить отзыв'}
              </Button>
            </div>
          </div>
        )}

        {/* Отзыв грузчика на заказчика — только у взявшего заказ */}
        {order.status === 'completed' && order.taken_by_me && (
          <div className="mt-3 rounded-lg bg-slate-800/40 p-4">
            <h3 className="font-semibold text-slate-100 text-sm">Оцените заказчика</h3>
            <p className="text-xs text-slate-400 mt-0.5 mb-2">
              Как прошла работа? Ваша оценка видна администратору и влияет на рейтинг клиента.
            </p>
            <div className="flex flex-col gap-3">
              <RatingPicker value={loaderRating} onChange={setLoaderRating} />
              <textarea
                placeholder="Комментарий (необязательно)"
                value={loaderComment}
                onChange={(e) => setLoaderComment(e.target.value)}
                rows={2}
                className="rounded-lg bg-slate-900/80 border border-white/10 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-400 focus:outline-none resize-none"
              />
              <Button
                variant="secondary"
                className="px-4 py-1.5 text-sm self-start"
                disabled={loaderBusy}
                onClick={() => void handleLoaderReview()}
              >
                {loaderBusy ? 'Отправляем…' : 'Отправить отзыв'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
