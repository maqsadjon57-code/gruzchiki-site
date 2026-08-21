// ============================================================
// Дашборд администратора: ключевые метрики, графики за 14 дней,
// выгрузка статистики в Excel.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { rub, Spinner } from '../../components/ui';
import type { AdminStats } from '../../types';

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-900/70 rounded-xl border border-white/10 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-2xl font-bold text-slate-100 mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// Простая CSS-гистограмма (без внешних библиотек)
function BarChart({
  data,
  valueKey,
  label,
  color = 'from-indigo-500 to-violet-500',
  showRange = true,
}: {
  data: { date: string; [k: string]: number | string }[];
  valueKey: string;
  label: string;
  color?: string;
  /** Показывать диапазон дат под графиком (для категорий — отключается) */
  showRange?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  return (
    <div className="bg-slate-900/70 rounded-xl border border-white/10 p-4">
      <div className="text-xs font-semibold text-slate-200 mb-3">{label}</div>
      <div className="flex items-end gap-1 h-28">
        {data.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d[valueKey]}`}>
            <div
              className={`w-full rounded-t bg-gradient-to-t ${color} transition-all duration-300`}
              style={{ height: `${Math.max(4, (Number(d[valueKey]) || 0) / max * 100)}%` }}
            />
          </div>
        ))}
      </div>
      {showRange && (
        <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
          <span>{data[0]?.date?.slice(5) ?? ''}</span>
          <span>{data[data.length - 1]?.date?.slice(5) ?? ''}</span>
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminStats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки статистики'));
  }, []);

  // Скачивание отчёта .xlsx (все листы статистики)
  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await api.adminStatsExport();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Не удалось выгрузить Excel');
    } finally {
      setExporting(false);
    }
  };

  if (error) return <div className="bg-red-500/15 text-red-200 rounded-lg p-3 text-sm">{error}</div>;
  if (!stats) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-100">Дашборд</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
        >
          {exporting ? 'Формируем…' : '⬇ Выгрузить Excel'}
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-6">Общее состояние сервиса на сегодня</p>
      {exportError && <div className="bg-red-500/15 text-red-200 rounded-lg p-3 text-sm mb-4">{exportError}</div>}

      {/* Пользователи */}
      <div className="text-sm font-semibold text-slate-200 mb-2">Пользователи</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card label="Всего грузчиков" value={String(stats.users.total)} />
        <Card label="Новых сегодня" value={String(stats.users.new_today)} />
        <Card label="Новых за месяц" value={String(stats.users.new_month)} />
        <Card label="Активны за 30 дней" value={String(stats.users.active_30d)} sub={`заблокировано: ${stats.users.blocked}`} />
      </div>

      {/* Заказы */}
      <div className="text-sm font-semibold text-slate-200 mb-2">Заказы</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card label="Сегодня" value={String(stats.orders.today)} />
        <Card label="За неделю" value={String(stats.orders.week)} />
        <Card label="За месяц" value={String(stats.orders.month)} />
        <Card label="Всего" value={String(stats.orders.total)} sub={`взято: ${stats.orders.taken} · выполнено: ${stats.orders.completed}`} />
      </div>

      {/* Финансы */}
      <div className="text-sm font-semibold text-slate-200 mb-2">Финансы</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card
          label="Доход от комиссий"
          value={rub(stats.finance.commission_income)}
          sub={`взято заказов: ${stats.finance.taken_orders} · средний чек: ${rub(stats.finance.avg_order_price)}`}
        />
        <Card
          label="Пополнено (подтверждено)"
          value={rub(stats.finance.confirmed_topups_sum)}
        />
        <Card label="Заявок на проверке" value={String(stats.finance.pending_payments)} />
        <Card
          label="Отзывы"
          value={String(stats.reviews.total)}
          sub={stats.reviews.avg_rating != null ? `средняя оценка: ${stats.reviews.avg_rating.toFixed(2)} · отзывов на грузчиков: ${stats.reviews.loader_reviews}` : 'оценок пока нет'}
        />
      </div>

      {/* Графики за 14 дней */}
      <div className="text-sm font-semibold text-slate-200 mb-2">Динамика за 14 дней</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <BarChart
          data={stats.charts.orders_14d}
          valueKey="published"
          label="Новые заказы по дням"
          color="from-indigo-500 to-violet-500"
        />
        <BarChart
          data={stats.charts.income_14d}
          valueKey="commission"
          label="Комиссия по дням, ₽"
          color="from-emerald-500 to-teal-500"
        />
        <BarChart
          data={stats.charts.new_users_14d}
          valueKey="count"
          label="Новые пользователи по дням"
          color="from-fuchsia-500 to-pink-500"
        />
        <BarChart
          data={stats.charts.orders_by_category.map((c) => ({ date: c.category, count: c.count }))}
          valueKey="count"
          label="Заказы по категориям"
          color="from-amber-500 to-orange-500"
          showRange={false}
        />
      </div>
    </div>
  );
}
