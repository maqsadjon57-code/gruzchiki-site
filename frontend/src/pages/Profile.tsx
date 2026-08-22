// ============================================================
// Личный кабинет грузчика: баланс, аватар, услуги
// («Доступ к телефонам», «ТОП-20»), реквизиты банка, статистика
// и история платежей (с назначением платежа).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Badge, Button, EmptyState, fmtDate, rub, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { NotifyLink, Payment, Referral, Services, Stats, TakenOrder } from '../types';

type Tab = 'stats' | 'payments' | 'orders';

// Подписи статусов заявки на оплату
const PAY_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ожидает проверки', color: 'orange' },
  confirmed: { label: 'Подтверждена', color: 'green' },
  rejected: { label: 'Отклонена', color: 'red' },
};

// Назначение платежа — бейдж в истории
const PURPOSE_BADGE: Record<string, { label: string; color: string }> = {
  topup: { label: 'Пополнение баланса', color: 'slate' },
  phone_unlock: { label: 'Доступ к телефонам', color: 'blue' },
  top20: { label: 'ТОП-20 (сутки)', color: 'purple' },
};

// Инициалы для аватара-заглушки
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

// Карточка платной услуги: оплата с баланса или чеком
function ServiceCard({
  title,
  description,
  price,
  active,
  activeLabel,
  onPaid,
}: {
  title: string;
  description: string;
  price: number;
  active: boolean;
  activeLabel?: string;
  onPaid: (receipt: File | null) => Promise<string>;
}) {
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const run = async (receipt: File | null) => {
    setBusy(true);
    try {
      const msg = await onPaid(receipt);
      notify(msg, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Ошибка оплаты', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    return (
      <div className="glass rounded-xl p-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-100">{title}</div>
          {activeLabel && <div className="text-xs text-slate-400 mt-0.5">{activeLabel}</div>}
        </div>
        <Badge color="green">Активен</Badge>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-100">{title}</div>
          <div className="text-xs text-slate-400 mt-0.5">{description}</div>
        </div>
        <div className="shrink-0 text-lg font-extrabold text-brand-300">{rub(price)}</div>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Button
          variant="success"
          className="px-3 py-1.5 text-xs"
          disabled={busy}
          onClick={() => void run(null)}
        >
          Оплатить с баланса
        </Button>
        <Button
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Оплатить чеком
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void run(f);
            e.target.value = '';
          }}
        />
        {busy && <span className="text-xs text-slate-400">Отправляем…</span>}
      </div>
    </div>
  );
}

export function Profile() {
  const { user, refresh } = useAuth();
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [orders, setOrders] = useState<TakenOrder[] | null>(null);
  const [services, setServices] = useState<Services | null>(null);
  const [referral, setReferral] = useState<Referral | null>(null);
  const [pushLink, setPushLink] = useState<NotifyLink | null>(null);
  const [arrivingId, setArrivingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [s, p, o, sv, r, n] = await Promise.all([
        api.myStats(),
        api.myPayments(),
        api.myOrders(),
        api.services(),
        api.myReferral(),
        api.notifyLink(),
      ]);
      setStats(s);
      setPayments(p);
      setOrders(o);
      setServices(sv);
      setReferral(r);
      setPushLink(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки профиля');
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Грузчик прибыл на адрес и начал работу — админ получит Telegram-уведомление
  const handleArrive = async (t: TakenOrder) => {
    setArrivingId(t.id);
    try {
      await api.arriveOrder(t.order_id);
      notify('Отмечено! Администратор получил уведомление.', 'success');
      await loadAll();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Не удалось отправить отметку', 'error');
    } finally {
      setArrivingId(null);
    }
  };

  if (!user) return <Spinner />;

  // Обновляем профиль (баланс) при каждом заходе на страницу
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadAvatar = async (file: File) => {
    setAvatarBusy(true);
    try {
      await api.uploadAvatar(file);
      await refresh();
      notify('Фото профиля обновлено', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Не удалось загрузить фото', 'error');
    } finally {
      setAvatarBusy(false);
    }
  };

  const statCards = [
    { label: 'Взято заказов', value: String(stats?.total_taken ?? '—') },
    { label: 'Сегодня', value: String(stats?.today_taken ?? '—') },
    { label: 'За неделю', value: String(stats?.week_taken ?? '—') },
    { label: 'За месяц', value: String(stats?.month_taken ?? '—') },
    { label: 'Заработано', value: rub(stats?.earnings ?? null) },
    { label: 'Уплачено комиссий', value: rub(stats?.commission_paid ?? null) },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'stats', label: 'Статистика' },
    { key: 'payments', label: `Платежи (${payments?.length ?? 0})` },
    { key: 'orders', label: `Мои заказы (${orders?.length ?? 0})` },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Карточка пользователя */}
      <div className="glass gradient-border animate-fade-up rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => avatarRef.current?.click()}
            disabled={avatarBusy}
            title="Сменить фото"
            className="group relative shrink-0 rounded-full disabled:opacity-60"
          >
            {user.avatar ? (
              <img
                src={`/uploads/${user.avatar}`}
                alt={user.name}
                className="h-16 w-16 rounded-full object-cover shadow-md ring-2 ring-violet-400/50 transition-transform duration-150 group-hover:scale-105"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-lg font-bold text-white shadow-md transition-transform duration-150 group-hover:scale-105">
                {initials(user.name)}
              </span>
            )}
            <span className="absolute inset-0 grid place-items-center rounded-full bg-slate-900/60 text-[10px] font-bold text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {avatarBusy ? '…' : 'Сменить'}
            </span>
          </button>
          <input
            ref={avatarRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAvatar(f);
              e.target.value = '';
            }}
          />
          <div>
            <h1 className="text-xl font-bold text-slate-100">{user.name}</h1>
            <p className="text-sm text-slate-400">
              ID: <span className="font-mono">{user.public_id}</span> · {user.phone}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-3xl font-extrabold text-transparent">{rub(user.balance)}</div>
          <p className="text-xs text-slate-400">баланс</p>
          <Link to="/topup" className="mt-2 inline-block">
            <Button variant="success" className="px-3 py-1.5 text-xs">
              Пополнить
            </Button>
          </Link>
        </div>
      </div>

      {/* Ошибка */}
      {error && <div className="bg-red-500/15 text-red-200 rounded-lg p-3 text-sm mt-3">{error}</div>}

      {/* Услуги */}
      <div className="mt-5 flex flex-col gap-3">
        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide text-slate-400">Услуги</h2>
        {services === null && <Spinner />}
        <ServiceCard
          title="Доступ к телефонам заказчиков"
          description="Телефоны клиентов станут видны во всех заказах без ограничений по балансу."
          price={services?.phone_unlock_amount ?? 0}
          active={!!user.phone_unlocked}
          activeLabel="Доступ открыт навсегда"
          onPaid={async (receipt) => {
            const res = await api.unlockPhone(receipt);
            await refresh();
            return res.message;
          }}
        />
        <ServiceCard
          title="ТОП-20 (сутки)"
          description="Ваш профиль попадёт в рейтинг лучших грузчиков на 24 часа."
          price={services?.top20_price ?? 0}
          active={!!user.in_top20}
          activeLabel={user.top20_until ? `Активен до ${fmtDate(user.top20_until)}` : 'Активен'}
          onPaid={async (receipt) => {
            const res = await api.top20Pay(receipt);
            await refresh();
            return res.message;
          }}
        />
      </div>

      {/* Push-уведомления в Telegram */}
      <div className="glass rounded-xl p-4 mt-5">
        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide text-slate-400">
          Push-уведомления о новых заказах
        </h2>
        {pushLink === null ? (
          <Spinner />
        ) : !pushLink.enabled ? (
          <p className="text-sm text-slate-400 mt-2">
            Telegram-бот не настроен. Обратитесь к администратору.
          </p>
        ) : pushLink.chat_id ? (
          <p className="text-sm text-slate-300 mt-2">
            <Badge color="green">Подключено</Badge>
            <span className="ml-2">
              Уведомления о новых заказах приходят в Telegram, даже когда сайт закрыт.
            </span>
          </p>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-slate-400">
              Подключите бота, чтобы получать «Новый заказ в Сургуте, 1500 ₽» на телефон,
              даже если сайт закрыт.
            </p>
            <a href={pushLink.link} target="_blank" rel="noopener noreferrer" className="inline-block mt-3">
              <Button variant="secondary" className="px-3 py-1.5 text-xs">
                🔔 Подключить уведомления
              </Button>
            </a>
          </div>
        )}
      </div>

      {/* Реферальная программа */}
      {referral && (
        <div className="glass rounded-xl p-4 mt-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide text-slate-400">
                Реферальная программа
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Пригласите грузчика — когда он пополнит баланс от 300 ₽, вы получите {rub(referral.bonus)}.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xl font-extrabold text-brand-300">
                {rub(referral.total_bonus)}
              </div>
              <div className="text-xs text-slate-400">начислено · {referral.referrals_count} приглашено</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <code className="rounded-lg bg-slate-800/80 px-3 py-2 text-sm font-mono text-slate-200">
              {referral.code}
            </code>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={() => {
                void navigator.clipboard
                  .writeText(referral.link)
                  .then(() => notify('Ссылка скопирована', 'success'))
                  .catch(() => notify('Не удалось скопировать', 'error'));
              }}
            >
              Копировать ссылку
            </Button>
            <p className="text-xs text-slate-400">
              Друг вставит код при регистрации и пополнит баланс от 300 ₽ — вы получите {rub(referral.bonus)}.
            </p>
          </div>
        </div>
      )}

      {/* Реквизиты банка */}
      {services && (
        <div className="glass rounded-xl p-4 mt-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide text-slate-400">
              Реквизиты для оплаты
            </h2>
            <Link to="/topup" className="text-xs text-brand-300 hover:underline">
              Пополнить баланс
            </Link>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
            <div>
              <dt className="text-xs text-slate-400">Банк</dt>
              <dd className="font-medium text-slate-100">{services.bank.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Телефон</dt>
              <dd className="font-mono text-slate-100">{services.bank.phone}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Карта</dt>
              <dd className="font-mono text-slate-100">{services.bank.card}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Получатель</dt>
              <dd className="text-slate-100">{services.bank.holder}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Вкладки */}
      <div className="flex gap-1 mt-5 border-b border-white/10">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-brand-400 text-brand-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="py-5">
        {tab === 'stats' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {statCards.map((c) => (
              <div key={c.label} className="glass rounded-xl p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-glow">
                <div className="text-xs text-slate-400">{c.label}</div>
                <div className="text-xl font-bold text-slate-100 mt-1">{c.value}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'payments' && (
          <div className="flex flex-col gap-2">
            {payments === null && <Spinner />}
            {payments && payments.length === 0 && (
              <EmptyState text="Платежей пока нет. Оплатите услугу или пополните баланс по реквизитам выше." />
            )}
            {payments?.map((p) => {
              const st = PAY_STATUS[p.status] ?? { label: p.status, color: 'gray' };
              const purpose = PURPOSE_BADGE[p.purpose] ?? { label: p.purpose, color: 'gray' };
              return (
                <div key={p.id} className="glass rounded-xl p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{rub(p.amount)}</span>
                      <Badge color={purpose.color}>{purpose.label}</Badge>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{fmtDate(p.created_at)} · заявка #{p.id}</div>
                  </div>
                  <Badge color={st.color}>{st.label}</Badge>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'orders' && (
          <div className="flex flex-col gap-2">
            {orders === null && <Spinner />}
            {orders && orders.length === 0 && <EmptyState text="Вы ещё не брали заказы. Загляните в ленту!" />}
            {orders?.map((t) => {
              const order = t.order;
              // Длительность одной строкой: 60–180 мин / от 60 мин / до 180 мин
              const durLabel =
                order && (order.duration_min != null || order.duration_max != null)
                  ? order.duration_min != null && order.duration_max != null
                    ? `${order.duration_min}–${order.duration_max} мин`
                    : order.duration_min != null
                      ? `от ${order.duration_min} мин`
                      : `до ${order.duration_max} мин`
                  : null;
              const done = Boolean(t.completed_at);
              return (
                <div key={t.id} className="glass rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {order?.is_external ? (
                          // Внешний заказ с площадки (ГрузАгг): показываем источник
                          <>
                            {(order.source ?? 'Площадка')}
                            {order.region ? ` · ${order.region}` : ''}
                            {order.street ? ` · ${order.street}` : ''}
                          </>
                        ) : (
                          <>#{t.order_id} · {order?.region} · {order?.street} {order?.house}</>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Взят {fmtDate(t.taken_at)} · комиссия {rub(t.commission)} · оплата {rub(order?.price)}
                      </div>
                      {(order?.deadline || durLabel) && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {order?.deadline && <>⏰ до {order.deadline}</>}
                          {order?.deadline && durLabel && ' · '}
                          {durLabel && <>⏱ {durLabel}</>}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {order?.phone ? (
                        <a href={`tel:${order.phone.replace(/\s/g, '')}`} className="text-brand-300 font-bold">
                          {order.phone}
                        </a>
                      ) : (
                        <Badge color="gray">—</Badge>
                      )}
                      {t.arrived_at ? (
                        <Badge color="green">📍 На месте {fmtDate(t.arrived_at)}</Badge>
                      ) : done ? null : (
                        <Button
                          variant="success"
                          className="px-3 py-1.5 text-xs"
                          disabled={arrivingId === t.id}
                          onClick={() => void handleArrive(t)}
                        >
                          {arrivingId === t.id ? 'Отправляем…' : '📍 Я на месте'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
