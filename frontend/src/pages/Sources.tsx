// ============================================================
// «Заказы с площадок»: живая лента заказов/вакансий с открытых API
// (ГрузАгг, hh.ru, «Работа России», SuperJob) + справочник 20+ сервисов, где
// грузчики находят заказы (Avito, YouDo, Profi.ru и др.).
// ============================================================

import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Badge, Button, EmptyState, Field, fmtDate, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { AggregatorFeed, AggregatorSources, ExternalOrder } from '../types';

const KIND_BADGE: Record<string, { label: string; color: string }> = {
  orders: { label: 'Биржа заказов', color: 'blue' },
  vacancy: { label: 'Вакансии', color: 'green' },
  profile: { label: 'Профиль исполнителя', color: 'orange' },
  telegram: { label: 'Чаты и каналы', color: 'slate' },
};

const SOURCE_COLOR: Record<string, string> = {
  'ГрузАгг': 'orange',
  'hh.ru': 'blue',
  'Работа России': 'green',
  'SuperJob': 'purple',
};

const QUICK_QUERIES = ['грузчик', 'подработка', 'разнорабочий', 'ежедневная оплата', 'переезд', 'разгрузка', 'склад'];

export function Sources() {
  const { notify } = useToast();
  const { user } = useAuth();
  // Лента заказов с площадок видна только администратору (в ней телефоны клиентов)
  const isAdmin = user?.is_admin === true;
  const [query, setQuery] = useState('грузчик');
  const [feed, setFeed] = useState<AggregatorFeed | null>(null);
  const [sources, setSources] = useState<AggregatorSources | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingSources, setLoadingSources] = useState(true);

  const loadFeed = (q: string) => {
    setLoadingFeed(true);
    api
      .aggregatorFeed(q)
      .then(setFeed)
      .catch((e) => notify(e instanceof ApiError ? e.message : 'Не удалось загрузить ленту', 'error'))
      .finally(() => setLoadingFeed(false));
  };

  useEffect(() => {
    if (isAdmin) {
      loadFeed(query);
    }
    api
      .aggregatorSources()
      .then(setSources)
      .catch((e) => notify(e instanceof Error ? e.message : 'Ошибка загрузки площадок', 'error'))
      .finally(() => setLoadingSources(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">Заказы с площадок</h1>
        <p className="text-sm text-slate-200 mt-1 drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
          {isAdmin
            ? 'Свежие заказы и вакансии с внешних сервисов + все площадки, где грузчики находят работу'
            : 'Все площадки, где грузчики находят заказы. Лента заказов с телефонами клиентов доступна администратору.'}
        </p>
      </div>

      {/* Живая лента — только для администратора */}
      {isAdmin && (
      <section className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-lg font-semibold text-slate-100">Живая лента</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              loadFeed(query.trim() || 'грузчик');
            }}
          >
            <Field
              label=""
              aria-label="Поисковый запрос"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="грузчик, разнорабочий, ежедневная оплата…"
              className="w-72"
            />
            <Button type="submit">Обновить</Button>
          </form>
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs text-slate-400">Быстрые фильтры:</span>
          {QUICK_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setQuery(q);
                loadFeed(q);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors hover:bg-brand-500/20 ${
                query === q ? 'bg-brand-600 text-white' : 'bg-white/10 text-slate-300'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Отклик на заказ происходит на самой площадке — лента лишь показывает свежие находки
        </p>

        {loadingFeed && <Spinner label="Загружаем ленту…" />}
        {!loadingFeed && feed && feed.items.length === 0 && (
          <EmptyState text="Сейчас свежих заказов нет — попробуйте другой запрос или обновите позже" />
        )}
        <div className="flex flex-col gap-3">
          {feed?.items.map((it) => (
            <FeedCard key={it.id} item={it} />
          ))}
        </div>
        {feed && feed.items.length > 0 && (
          <p className="text-xs text-slate-400 mt-3">
            Источники: {Object.entries(feed.sources).map(([name, st]) => `${name} — ${st}`).join(' · ')}
          </p>
        )}
      </section>
      )}

      {/* Справочник площадок */}
      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-1">
          Площадки для заказов ({sources?.total ?? '…'})
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Avito, YouDo, Profi.ru и «Юла» запрещают автоматический сбор заказов — регистрируйтесь и
          откликайтесь сами, это даёт поток заявок
        </p>
        {loadingSources && <Spinner label="Загружаем площадки…" />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sources?.items.map((s) => {
            const kind = KIND_BADGE[s.kind] ?? { label: s.kind, color: 'slate' };
            return (
              <div
                key={s.id}
                className="bg-slate-900/70 rounded-xl border border-white/10 p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-100">{s.name}</span>
                  <div className="flex items-center gap-1">
                    {s.has_feed && isAdmin && <Badge color="green">в ленте</Badge>}
                    <Badge color={kind.color}>{kind.label}</Badge>
                  </div>
                </div>
                <p className="text-sm text-slate-400 flex-1">{s.description}</p>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand-300 hover:underline"
                  >
                    Открыть → {new URL(s.url).hostname}
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// Карточка заказа/вакансии из живой ленты
function FeedCard({ item }: { item: ExternalOrder }) {
  return (
    <div className="bg-slate-900/70 rounded-xl border border-white/10 p-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-100">{item.title}</span>
          <Badge color={SOURCE_COLOR[item.source] ?? 'slate'}>{item.source}</Badge>
        </div>
        <div className="text-sm text-slate-200 mt-1">
          <span className="font-semibold">{item.salary_text}</span>
          {item.company && <span className="text-slate-400"> · {item.company}</span>}
          {item.area && <span className="text-slate-400"> · {item.area}</span>}
        </div>
        {item.description && (
          <p className="text-sm text-slate-400 mt-1 line-clamp-2">{item.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <span className="text-xs text-slate-400">{fmtDate(item.published_at)}</span>
          {item.contact_phone && (
            <a
              href={`tel:${item.contact_phone}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-300 hover:underline"
            >
              <span aria-hidden>📞</span>
              {item.contact_phone}
            </a>
          )}
        </div>
      </div>
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 text-sm font-medium transition-colors"
        >
          Открыть
        </a>
      ) : null}
    </div>
  );
}
