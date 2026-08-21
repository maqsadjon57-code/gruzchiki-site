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
import type { Order } from '../types';

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

  const load = useCallback(async () => {
    try {
      const o = await api.orderDetail(orderId);
      setOrder(o);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Заказ не найден');
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

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
            <h1 className="text-xl font-bold text-slate-100 mt-1">Перевозка груза</h1>
          </div>
          <div className="text-right">
            <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-2xl font-extrabold text-transparent">{rub(order.price)}</div>
            {order.hourly_rate != null && (
              <div className="text-sm text-slate-400">{rub(order.hourly_rate)}/час</div>
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
          {order.is_external && <Badge color="purple">{order.source ?? 'Площадка'}</Badge>}
          {isTaken ? (
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

        {/* Адрес */}
        <h2 className="font-semibold text-slate-100 mb-2">Адрес</h2>
        <p className="text-slate-200">{fullAddress}</p>
        {order.landmarks && (
          <p className="text-sm text-slate-400 mt-1">Ориентир: {order.landmarks}</p>
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

        {/* Телефон заказчика */}
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

        {/* Действия */}
        {!isTaken && (
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
    </div>
  );
}
