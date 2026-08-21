// ============================================================
// Дашборд администратора: ключевые метрики сервиса.
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

export function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminStats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки статистики'));
  }, []);

  if (error) return <div className="bg-red-500/15 text-red-200 rounded-lg p-3 text-sm">{error}</div>;
  if (!stats) return <Spinner />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-1">Дашборд</h1>
      <p className="text-sm text-slate-400 mb-6">Общее состояние сервиса на сегодня</p>

      {/* Пользователи */}
      <div className="text-sm font-semibold text-slate-200 mb-2">Пользователи</div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card label="Всего грузчиков" value={String(stats.users.total)} />
        <Card label="Заблокировано" value={String(stats.users.blocked)} />
      </div>

      {/* Заказы */}
      <div className="text-sm font-semibold text-slate-200 mb-2">Заказы</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card label="Сегодня" value={String(stats.orders.today)} />
        <Card label="За неделю" value={String(stats.orders.week)} />
        <Card label="За месяц" value={String(stats.orders.month)} />
        <Card label="Всего" value={String(stats.orders.total)} />
      </div>

      {/* Финансы */}
      <div className="text-sm font-semibold text-slate-200 mb-2">Финансы</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          label="Доход от комиссий"
          value={rub(stats.finance.commission_income)}
          sub={`взято заказов: ${stats.finance.taken_orders}`}
        />
        <Card
          label="Пополнено (подтверждено)"
          value={rub(stats.finance.confirmed_topups_sum)}
        />
        <Card label="Заявок на проверке" value={String(stats.finance.pending_payments)} />
      </div>
    </div>
  );
}
