// ============================================================
// Журнал действий: кто и что делал на платформе.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { EmptyState, fmtDate, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { AdminLog } from '../../types';

const ACTION_LABELS: Record<string, string> = {
  order_taken: 'Взял заказ',
  order_completed: 'Завершил заказ',
  topup_request: 'Заявка на пополнение',
  confirm_payment: 'Оплата подтверждена',
  reject_payment: 'Оплата отклонена',
  block_user: 'Блокировка грузчика',
  unblock_user: 'Разблокировка грузчика',
  update_settings: 'Изменение настроек',
  order_created: 'Создание заказа',
  order_deleted: 'Удаление заказа',
};

export function Logs() {
  const { notify } = useToast();
  const [logs, setLogs] = useState<AdminLog[] | null>(null);

  useEffect(() => {
    api
      .adminLogs()
      .then(setLogs)
      .catch((e) => notify(e instanceof Error ? e.message : 'Ошибка загрузки журнала', 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (logs === null) return <Spinner />;
  if (logs.length === 0) return <EmptyState text="Журнал пуст" />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Журнал действий</h1>
        <p className="text-sm text-slate-400">Последние события (макс. 100)</p>
      </div>
      <div className="bg-slate-900/70 rounded-xl border border-white/10 divide-y divide-white/10">
        {logs.map((l) => (
          <div key={l.id} className="px-4 py-3 flex items-start gap-3">
            <div className="w-3 h-3 rounded-full bg-brand-500 mt-1.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-100">
                {ACTION_LABELS[l.action] ?? l.action}
                {l.user_id ? <span className="text-slate-400 font-normal"> · id {l.user_id}</span> : null}
              </div>
              {l.details && <div className="text-xs text-slate-400 mt-0.5">{l.details}</div>}
            </div>
            <div className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(l.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
