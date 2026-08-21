// ============================================================
// Главная страница — лента сегодняшних заказов.
// Фильтры: регион (город), цена, категория, срочность, поиск.
// Регионы приходят со счётчиком заказов на сегодня.
// Лента обновляется автоматически через WebSocket.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { OrderCard } from '../components/OrderCard';
import { EmptyState, Spinner } from '../components/ui';
import { useFeedSocket } from '../hooks/useFeedSocket';
import type { OrderList } from '../types';

const CATEGORIES = ['мебель', 'стройматериалы', 'бытовая техника', 'хрупкие', 'продукты', 'переезд', 'прочее'];

// Интервал автообновления ленты (30 секунд)
const AUTO_REFRESH_MS = 30000;

// Ключ в localStorage для выбранного региона — чтобы фильтр не сбрасывался
// при обновлении страницы или возврате из карточки заказа.
const REGION_STORAGE_KEY = 'feed_region';

// Регион по умолчанию — главный город (Сургут): без выбора пользователь
// видит «актуальные» заказы своего города, а не случайные адреса со всей
// России. Явный выбор «Все регионы» сохраняется отдельно.
const DEFAULT_REGION = 'Сургут';

export function Feed() {
  const [data, setData] = useState<OrderList | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Состояние фильтров: по умолчанию главный город (Сургут), но если
  // пользователь уже выбирал регион — восстанавливаем его из localStorage ---
  const [region, setRegion] = useState(() => {
    try {
      return localStorage.getItem(REGION_STORAGE_KEY) ?? DEFAULT_REGION;
    } catch {
      return DEFAULT_REGION;
    }
  });

  // Смена региона: переключаем фильтр и запоминаем выбор.
  // Переключить регион можно только явно — нажав на другой город.
  const changeRegion = (next: string) => {
    setRegion(next);
    try {
      // Сохраняем и пустую строку (выбор «Все регионы»), чтобы при
      // перезагрузке страницы дефолт Сургута не перебивал явный выбор
      localStorage.setItem(REGION_STORAGE_KEY, next);
    } catch {
      /* localStorage может быть недоступен — фильтр просто не сохранится */
    }
  };
  const [category, setCategory] = useState('');
  const [urgency, setUrgency] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('new');
  const [priceTo, setPriceTo] = useState('');
  const [hour, setHour] = useState<number | null>(null);

  // --- Загрузка ленты с учётом фильтров ---
  const load = useCallback(async () => {
    try {
      const res = await api.feed({
        region,
        category: category || undefined,
        urgency: urgency || undefined,
        search: search || undefined,
        sort,
        price_to: priceTo ? Number(priceTo) : undefined,
      });
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки ленты');
    }
  }, [region, category, urgency, search, sort, priceTo]);

  useEffect(() => {
    void load();
  }, [load]);

  // Кнопка «Обновить»: перезагружает ленту и показывает время обновления.
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // Автообновление каждые 30 секунд — новые заказы появляются сами,
  // даже если WebSocket-канал недоступен. Метка «обновлено» меняется,
  // чтобы было видно, что лента живая.
  useEffect(() => {
    const timer = setInterval(() => {
      setLastUpdated(new Date());
      void load();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Автообновление при событии от WebSocket (заказ взят/изменён)
  useFeedSocket(() => {
    void load();
  });

  // Первичная загрузка списка регионов — регион с заказами держим в фильтре
  const [regions, setRegions] = useState<{ name: string; orders_today: number }[]>([]);
  useEffect(() => {
    api
      .regions()
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  // Строка со счётчиками регионов (из ответа ленты)
  const regionChips = useMemo(() => {
    if (!data) return [];
    return data.region_counts.slice(0, 12);
  }, [data]);

  // Сколько заказов в каждом часу (локальное время клиента)
  const hourCounts = useMemo(() => {
    const m = new Map<number, number>();
    data?.orders.forEach((o) => {
      const h = new Date(o.published_at).getHours();
      m.set(h, (m.get(h) ?? 0) + 1);
    });
    return m;
  }, [data]);

  // Расстояние по формуле гаверсинуса (км) между двумя точками
  function haversineKm(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
  ): number {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Координаты грузчика (свои) для сортировки «Сначала ближайшие»
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  // Запрос геолокации при выборе сортировки по расстоянию
  const enableDistanceSort = () => {
    if (myPos) return;
    if (!('geolocation' in navigator)) {
      setGeoStatus('Геолокация не поддерживается браузером');
      return;
    }
    setGeoStatus('Определяем ваше местоположение…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus(null);
      },
      () => {
        setGeoStatus('Доступ к геолокации запрещён — сортировка по расстоянию недоступна');
        setSort('new');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Заказы с учётом фильтра по часу и сортировки по расстоянию
  const visibleOrders = useMemo(() => {
    if (!data) return [];
    let list =
      hour === null
        ? data.orders
        : data.orders.filter((o) => new Date(o.published_at).getHours() === hour);
    if (sort === 'distance' && myPos) {
      list = [...list].sort((a, b) => {
        const da =
          a.latitude != null && a.longitude != null
            ? haversineKm(myPos, { lat: a.latitude, lng: a.longitude })
            : Infinity;
        const db =
          b.latitude != null && b.longitude != null
            ? haversineKm(myPos, { lat: b.latitude, lng: b.longitude })
            : Infinity;
        return da - db;
      });
    }
    return list;
  }, [data, hour, sort, myPos]);

  // Дистанция до заказа (км) — для подписи на карточке
  const distOf = (o: { latitude: number | null; longitude: number | null }): number | null => {
    if (!myPos || o.latitude == null || o.longitude == null) return null;
    return haversineKm(myPos, { lat: o.latitude, lng: o.longitude });
  };

  return (
    <div>
      {/* Заголовок + кнопка «Обновить» */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
            {hour !== null ? `Заказы на ${String(hour).padStart(2, '0')}:00` : 'Заказы на сегодня'}
          </h1>
          <p className="text-sm text-slate-200 mt-1 drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
            {data ? `Найдено заказов: ${hour !== null ? visibleOrders.length : data.total}` : 'Загружаем заказы…'}
            {data && data.current_region ? ` · регион: ${data.current_region}` : ''}
            {lastUpdated && !refreshing ? ` · обновлено ${lastUpdated.toLocaleTimeString('ru-RU')}` : ''}
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shadow-glow transition-all duration-150 hover:scale-[1.03] hover:shadow-glow-lg active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <svg
            className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          {refreshing ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>

      {/* Быстрые фильтры по регионам со счётчиками: «Все регионы» + топ городов */}
      {data && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          <button
            onClick={() => changeRegion('')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 ${
              region === ''
                ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-glow scale-105'
                : 'glass text-slate-300 hover:scale-105 hover:text-violet-200 hover:shadow-glow-violet'
            }`}
          >
            Все регионы · {data.total}
          </button>
          {regionChips.map((r) => (
            <button
              key={r.region}
              onClick={() => changeRegion(r.region)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 ${
                region === r.region
                  ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-glow scale-105'
                  : 'glass text-slate-300 hover:scale-105 hover:text-violet-200 hover:shadow-glow-violet'
              }`}
            >
              {r.region} · {r.count}
            </button>
          ))}
        </div>
      )}

      {/* Панель фильтров */}
      <div className="glass rounded-2xl p-3 mb-4 grid grid-cols-2 md:grid-cols-6 gap-2">
        <select
          value={region}
          onChange={(e) => changeRegion(e.target.value)}
          className="col-span-2 rounded-xl border border-white/10 bg-slate-900/60 px-2 py-2 text-sm shadow-glass-sm outline-none backdrop-blur transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-violet-400/70"
        >
          <option value="">Все регионы</option>
          {regions.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name} ({r.orders_today})
            </option>
          ))}
        </select>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-900/60 px-2 py-2 text-sm shadow-glass-sm outline-none backdrop-blur transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-violet-400/70"
        >
          <option value="">Категория</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-900/60 px-2 py-2 text-sm shadow-glass-sm outline-none backdrop-blur transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-violet-400/70"
        >
          <option value="new">Сначала новые</option>
          <option value="price_asc">Цена ↑</option>
          <option value="price_desc">Цена ↓</option>
          <option value="distance">Сначала ближайшие</option>
        </select>

        <input
          type="number"
          min={0}
          placeholder="Цена до, ₽"
          value={priceTo}
          onChange={(e) => setPriceTo(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-900/60 px-2 py-2 text-sm shadow-glass-sm outline-none backdrop-blur transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-violet-400/70"
        />

        <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={urgency}
            onChange={(e) => setUrgency(e.target.checked)}
            className="h-4 w-4 text-brand-300"
          />
          Срочные
        </label>
      </div>

      {/* Статус геолокации при сортировке по расстоянию */}
      {sort === 'distance' && (
        <div className="mb-4">
          {!myPos && !geoStatus && (
            <button
              onClick={enableDistanceSort}
              className="text-xs text-brand-300 font-medium hover:underline"
            >
              📍 Разрешить геолокацию для сортировки по расстоянию
            </button>
          )}
          {geoStatus && <p className="text-xs text-slate-400">{geoStatus}</p>}
          {myPos && (
            <p className="text-xs text-slate-400">
              Сортировка по расстоянию от вас: без координат — в конце списка.{' '}
              {visibleOrders.filter((o) => o.latitude != null && o.longitude != null).length} из{' '}
              {visibleOrders.length} заказов с точкой на карте.
            </p>
          )}
        </div>
      )}

      {/* Фильтр по часу: все 24 часа со счётчиками */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Часы</span>
          <button
            onClick={() => setHour(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150 ${
              hour === null
                ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-glow scale-105'
                : 'glass text-slate-300 hover:scale-105 hover:text-violet-200 hover:shadow-glow-violet'
            }`}
          >
            Все часы
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-2">
          {Array.from({ length: 24 }, (_, h) => h).map((h) => {
            const count = hourCounts.get(h) ?? 0;
            const active = hour === h;
            return (
              <button
                key={h}
                onClick={() => setHour(count > 0 ? h : null)}
                disabled={count === 0}
                className={`shrink-0 min-w-[52px] px-2 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  active
                    ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-glow scale-105'
                    : count > 0
                      ? 'glass text-slate-200 hover:scale-105 hover:text-violet-200 hover:shadow-glow-violet'
                      : 'glass text-slate-300 cursor-not-allowed opacity-60'
                }`}
              >
                {String(h).padStart(2, '0')}:00
                <span className={`ml-1 font-medium ${active ? 'text-brand-100' : count > 0 ? 'text-brand-300' : 'text-slate-300'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Поиск */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по адресу, ориентирам, описанию…"
          className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm shadow-glass-sm outline-none backdrop-blur transition-all duration-150 placeholder:text-slate-400 hover:border-brand-300 focus:border-transparent focus:bg-slate-800/70 focus:ring-2 focus:ring-violet-400/70"
        />
      </div>

      {/* Список заказов */}
      {error && <div className="bg-red-500/15 text-red-200 rounded-lg p-3 text-sm mb-3">{error}</div>}

      {!data && !error && <Spinner />}

      {data && data.orders.length === 0 && !error && (
        <EmptyState text="Сегодня заказов в этом регионе нет. Попробуйте другой город или снимите фильтры." />
      )}

      {data && data.orders.length > 0 && visibleOrders.length === 0 && !error && (
        <EmptyState text="В этот час заказов нет — выберите другой час." />
      )}

      <div className="flex flex-col gap-3">
        {visibleOrders.map((o) => (
          <OrderCard key={o.id} order={o} distanceKm={distOf(o)} />
        ))}
      </div>
    </div>
  );
}
