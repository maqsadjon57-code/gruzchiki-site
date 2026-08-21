// ============================================================
// Управление заказами: список, создание, завершение, удаление.
// ============================================================

import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { Badge, Button, EmptyState, Field, fmtDate, rub, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { Order } from '../../types';

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  active: { label: 'Активен', color: 'green' },
  taken: { label: 'Взят', color: 'blue' },
  completed: { label: 'Завершён', color: 'slate' },
};

export function Orders() {
  const { notify } = useToast();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Поля нового заказа
  const [form, setForm] = useState({
    region: '',
    street: '',
    house: '',
    apartment: '',
    entrance: '',
    floor: '',
    landmarks: '',
    phone: '',
    price: '1000',
    hourly_rate: '',
    weight: '',
    category: 'переезд',
    urgency: false,
    description: '',
    // «До скольки» завершить заказ и длительность работ (мин)
    deadline: '',
    duration_min: '',
    duration_max: '',
  });
  const [creating, setCreating] = useState(false);

  const load = () => {
    api
      .adminOrders()
      .then(setOrders)
      .catch((e) => notify(e instanceof Error ? e.message : 'Ошибка загрузки заказов', 'error'));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        region_name: form.region,
        street: form.street,
        house: form.house,
        apartment: form.apartment || null,
        entrance: form.entrance || null,
        floor: form.floor || null,
        landmarks: form.landmarks || null,
        phone: form.phone.replace(/\D/g, ''),
        price: Number(form.price),
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        weight: form.weight ? Number(form.weight) : null,
        category: form.category,
        urgency: form.urgency,
        description: form.description || null,
        deadline: form.deadline || null,
        duration_min: form.duration_min ? Number(form.duration_min) : null,
        duration_max: form.duration_max ? Number(form.duration_max) : null,
      };
      await api.adminCreateOrder(payload);
      notify('Заказ создан', 'success');
      setShowForm(false);
      setForm((f) => ({ ...f, street: '', house: '', phone: '' }));
      load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Не удалось создать заказ', 'error');
    } finally {
      setCreating(false);
    }
  };

  const complete = async (id: number) => {
    try {
      await api.adminCompleteOrder(id);
      notify('Заказ завершён', 'success');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error');
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('Удалить заказ безвозвратно?')) return;
    try {
      await api.adminDeleteOrder(id);
      notify('Заказ удалён', 'success');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Заказы</h1>
          <p className="text-sm text-slate-400">Все заказы платформы</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Скрыть форму' : '+ Новый заказ'}
        </Button>
      </div>

      {/* Форма создания */}
      {showForm && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="bg-slate-900/70 border border-white/10 rounded-xl p-5 mb-6 grid grid-cols-2 md:grid-cols-3 gap-4"
        >
          <Field label="Регион *" value={form.region} onChange={set('region')} placeholder="Сургут" required />
          <Field label="Улица *" value={form.street} onChange={set('street')} required />
          <Field label="Дом *" value={form.house} onChange={set('house')} required />
          <Field label="Квартира" value={form.apartment} onChange={set('apartment')} />
          <Field label="Подъезд" value={form.entrance} onChange={set('entrance')} />
          <Field label="Этаж" value={form.floor} onChange={set('floor')} />
          <Field label="Телефон заказчика *" value={form.phone} onChange={set('phone')} placeholder="+7 900 000-00-00" required />
          <Field label="Цена, ₽ *" type="number" min={1} value={form.price} onChange={set('price')} required />
          <Field label="Ставка за час, ₽" type="number" value={form.hourly_rate} onChange={set('hourly_rate')} />
          <Field label="Вес, кг" type="number" value={form.weight} onChange={set('weight')} />
          <Field label="Завершить до" type="time" value={form.deadline} onChange={set('deadline')} hint="Во сколько должен быть выполнен заказ" />
          <Field label="Длительность мин. (мин)" type="number" min={1} value={form.duration_min} onChange={set('duration_min')} placeholder="60" />
          <Field label="Длительность макс. (мин)" type="number" min={1} value={form.duration_max} onChange={set('duration_max')} placeholder="180" />
          <Field label="Категория" value={form.category} onChange={set('category')} list="cat-list" />
          <datalist id="cat-list">
            <option value="переезд" />
            <option value="квартирный" />
            <option value="офисный" />
            <option value="доставка" />
            <option value="разгрузка" />
          </datalist>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.urgency}
              onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.checked }))}
            />
            Срочный заказ
          </label>
          <label className="block col-span-2 md:col-span-3">
            <span className="block text-sm font-medium text-slate-200 mb-1">Описание</span>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={2}
              className="w-full rounded-lg border border-white/15 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <div className="col-span-2 md:col-span-3 flex gap-2">
            <Button type="submit" disabled={creating}>
              {creating ? 'Создаём…' : 'Создать заказ'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Отмена
            </Button>
          </div>
        </form>
      )}

      {/* Список заказов */}
      {orders === null && <Spinner />}
      {orders && orders.length === 0 && <EmptyState text="Заказов пока нет" />}
      <div className="flex flex-col gap-3">
        {orders?.map((o) => {
          const st = STATUS_BADGE[o.status] ?? { label: o.status, color: 'slate' };
          return (
            <div key={o.id} className="bg-slate-900/70 rounded-xl border border-white/10 p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-100">
                  #{o.id} · {o.region}, {o.street} {o.house}
                  {o.apartment ? `, кв. ${o.apartment}` : ''}
                  {o.urgency && <Badge color="orange">Срочно</Badge>}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {o.category} · {rub(o.price)}
                  {o.hourly_rate ? ` · ${rub(o.hourly_rate)}/час` : ''} · {fmtDate(o.published_at)}
                  {o.deadline && ` · ⏰ до ${o.deadline}`}
                  {(o.duration_min != null || o.duration_max != null) &&
                    ` · ⏱ ${
                      o.duration_min != null && o.duration_max != null
                        ? `${o.duration_min}–${o.duration_max} мин`
                        : o.duration_min != null
                          ? `от ${o.duration_min} мин`
                          : `до ${o.duration_max} мин`
                    }`}
                </div>
              </div>
              <Badge color={st.color}>{st.label}</Badge>
              <div className="flex gap-1 shrink-0">
                {o.status === 'taken' && (
                  <Button variant="success" className="px-3 py-1.5 text-xs" onClick={() => void complete(o.id)}>
                    Завершить
                  </Button>
                )}
                <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => void remove(o.id)}>
                  Удалить
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 mt-4">
        Открыть карточку заказа:{' '}
        {orders?.slice(0, 3).map((o) => (
          <Link key={o.id} to={`/orders/${o.id}`} className="text-brand-300 hover:underline mr-2">
            #{o.id}
          </Link>
        ))}
      </p>
    </div>
  );
}
