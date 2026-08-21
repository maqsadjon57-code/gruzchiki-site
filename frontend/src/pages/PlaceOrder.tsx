// ============================================================
// Публичная форма «Разместить заказ» — для заказчиков.
// Без авторизации: адрес, вес, категория, цена + контакты.
// Заказ сразу публикуется в ленте, админ получает Telegram-уведомление.
// ============================================================

import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Button, Field, rub } from '../components/ui';
import { useToast } from '../context/ToastContext';
import type { Order } from '../types';

const CATEGORIES = [
  'мебель',
  'стройматериалы',
  'бытовая техника',
  'хрупкие',
  'продукты',
  'переезд',
  'прочее',
];

const inputClass =
  'w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 shadow-glass-sm outline-none backdrop-blur transition-all duration-150 placeholder:text-slate-400 hover:border-brand-300 focus:border-transparent focus:bg-slate-800/70 focus:ring-2 focus:ring-violet-400/70 focus:shadow-glow-violet';

const labelClass = 'mb-1 block text-sm font-semibold text-slate-200';

export function PlaceOrder() {
  const { notify } = useToast();

  const [regions, setRegions] = useState<string[]>([]);
  const [region, setRegion] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [house, setHouse] = useState('');
  const [apartment, setApartment] = useState('');
  const [entrance, setEntrance] = useState('');
  const [floor, setFloor] = useState('');
  const [weight, setWeight] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [price, setPrice] = useState('');
  const [deadline, setDeadline] = useState('');
  const [urgency, setUrgency] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Order | null>(null);

  // Геолокация: координаты точки, куда должны приехать грузчики
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);

  const detectLocation = () => {
    if (!('geolocation' in navigator)) {
      notify('Геолокация не поддерживается браузером', 'error');
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        notify('Местоположение определено — грузчики смогут найти адрес на карте', 'success');
        setGeoBusy(false);
      },
      (err) => {
        setGeoBusy(false);
        notify(
          err.code === err.PERMISSION_DENIED
            ? 'Доступ к геолокации запрещён. Можно указать адрес вручную.'
            : 'Не удалось определить местоположение. Укажите адрес вручную.',
          'error',
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Список городов для подсказок (автодополнение через datalist)
  useEffect(() => {
    api
      .regions()
      .then((items) => setRegions(items.map((r) => r.name)))
      .catch(() => {
        /* справочник недоступен — оставляем поле свободного ввода */
      });
  }, []);

  const resetForm = () => {
    setRegion('');
    setName('');
    setPhone('');
    setStreet('');
    setHouse('');
    setApartment('');
    setEntrance('');
    setFloor('');
    setWeight('');
    setCategory(CATEGORIES[0]);
    setPrice('');
    setDeadline('');
    setUrgency(false);
    setDescription('');
    setCreated(null);
    setCoords(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      notify('Укажите корректную цену заказа', 'error');
      return;
    }
    const weightNum = weight ? Number(weight) : null;
    if (weight && (!Number.isFinite(weightNum) || (weightNum as number) < 0)) {
      notify('Вес должен быть числом (кг)', 'error');
      return;
    }

    setBusy(true);
    try {
      const order = await api.createCustomerOrder({
        region_name: region.trim(),
        name: name.trim(),
        phone: phone.trim(),
        street: street.trim(),
        house: house.trim(),
        apartment: apartment.trim() || null,
        entrance: entrance.trim() || null,
        floor: floor.trim() || null,
        price: priceNum,
        weight: weightNum,
        category,
        urgency,
        deadline: deadline.trim() || null,
        description: description.trim() || null,
        // Координаты из геолокации — на карте заказ появится точкой
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      });
      setCreated(order);
      notify('Заказ размещён — грузчики уже видят его в ленте', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Не удалось разместить заказ', 'error');
    } finally {
      setBusy(false);
    }
  };

  // --- Экран успеха ---
  if (created) {
    const address = [created.street, created.house, created.apartment && `кв. ${created.apartment}`]
      .filter(Boolean)
      .join(', ');
    return (
      <div className="mx-auto max-w-lg">
        <div className="glass gradient-border animate-fade-up rounded-2xl p-6 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-glow-emerald">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-100">Заказ размещён!</h1>
          <p className="mt-1 text-sm text-slate-400">
            Заказ уже опубликован в ленте — грузчики вашего города могут его взять.
          </p>

          <div className="mt-5 space-y-2 rounded-xl bg-slate-900/50 p-4 text-left text-sm ring-1 ring-white/10">
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Город</span>
              <span className="font-semibold text-slate-100">{created.region}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Адрес</span>
              <span className="text-right font-semibold text-slate-100">{address}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Цена</span>
              <span className="font-extrabold text-emerald-300">{rub(created.price)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Категория</span>
              <span className="font-semibold text-slate-100">{created.category}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Номер заказа</span>
              <span className="font-semibold text-slate-100">#{created.id}</span>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <Link
              to="/"
              className="block w-full rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-bold text-white shadow-glow transition-all duration-150 hover:scale-[1.02] hover:shadow-glow-lg active:scale-[0.98]"
            >
              Смотреть ленту заказов
            </Link>
            <Button variant="secondary" onClick={resetForm}>
              Разместить ещё один заказ
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="glass gradient-border animate-fade-up rounded-2xl p-6">
        <h1 className="text-xl font-bold text-slate-100">Разместить заказ</h1>
        <p className="mt-1 text-sm text-slate-400">
          Укажите адрес, вес и категорию груза — грузчики вашего города увидят заказ
          и предложат выполнить работу. Это бесплатно и без регистрации.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Город *</span>
              <input
                list="regions-list"
                className={inputClass}
                placeholder="Сургут"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                required
              />
              <datalist id="regions-list">
                {regions.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <Field
              label="Ваше имя *"
              placeholder="Иван"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <Field
            label="Ваш телефон *"
            type="tel"
            placeholder="+7 912 000-00-00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            hint="Телефон увидят только грузчики, взявшие заказ"
            required
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className={labelClass}>Улица *</span>
              <input
                className={inputClass}
                placeholder="Улица Ленина"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                required
              />
            </label>
            <Field
              label="Дом *"
              placeholder="15"
              value={house}
              onChange={(e) => setHouse(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Квартира"
              placeholder="7"
              value={apartment}
              onChange={(e) => setApartment(e.target.value)}
            />
            <Field
              label="Подъезд"
              placeholder="2"
              value={entrance}
              onChange={(e) => setEntrance(e.target.value)}
            />
            <Field
              label="Этаж"
              placeholder="5"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
            />
          </div>

          {/* Геолокация: координаты точки для карты */}
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 shadow-glass-sm">
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1.5 text-xs shrink-0"
              disabled={geoBusy}
              onClick={detectLocation}
            >
              {geoBusy ? 'Определяем…' : '📍 Определить местоположение'}
            </Button>
            {coords ? (
              <span className="text-xs text-emerald-300">
                Точка на карте: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} — грузчики увидят заказ на Яндекс.Картах
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                Необязательно: поможет показать адрес на карте и отсортировать заказы по расстоянию
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className={labelClass}>Категория груза</span>
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Вес, кг"
              type="number"
              min={0}
              placeholder="50"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <Field
              label="Цена, ₽ *"
              type="number"
              min={0}
              placeholder="1500"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Дедлайн (до скольки)"
              placeholder="18:00"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              hint="Формат HH:MM, необязательно"
            />
            <label className="flex cursor-pointer items-end gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 shadow-glass-sm">
              <input
                type="checkbox"
                checked={urgency}
                onChange={(e) => setUrgency(e.target.checked)}
                className="h-5 w-5 accent-violet-500"
              />
              <span className="text-sm font-semibold text-slate-200">Срочный заказ</span>
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Описание (необязательно)</span>
            <textarea
              className={`${inputClass} min-h-24 resize-y`}
              placeholder="Что нужно перевезти, этаж, лифт, особые условия…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <Button type="submit" disabled={busy}>
            {busy ? 'Размещаем заказ…' : 'Разместить заказ'}
          </Button>

          <p className="text-center text-xs text-slate-400">
            Размещая заказ, вы соглашаетесь на обработку контактных данных.
          </p>
        </form>
      </div>
    </div>
  );
}
