// ============================================================
// Заявки на пополнение баланса: просмотр чека, подтверждение/отказ.
// ============================================================

import { useState } from 'react';
import { api } from '../../api/client';
import { Badge, Button, EmptyState, fmtDate, rub, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { Payment } from '../../types';

const STATUS_BADGE: Record<Payment['status'], { label: string; color: string }> = {
  pending: { label: 'Ожидает', color: 'orange' },
  confirmed: { label: 'Подтверждена', color: 'green' },
  rejected: { label: 'Отклонена', color: 'red' },
};

// Назначение платежа: пополнение баланса, доступ к телефонам или ТОП-20
const PURPOSE_BADGE: Record<Payment['purpose'], { label: string; color: string }> = {
  topup: { label: 'Пополнение', color: 'slate' },
  phone_unlock: { label: 'Доступ к телефонам', color: 'blue' },
  top20: { label: 'ТОП-20 (сутки)', color: 'purple' },
};

type Filter = 'all' | 'pending' | 'confirmed' | 'rejected';

export function Payments() {
  const { notify } = useToast();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = (f: Filter) => {
    setPayments(null);
    api
      .adminPayments(f === 'all' ? undefined : f)
      .then(setPayments)
      .catch((e) => notify(e instanceof Error ? e.message : 'Ошибка загрузки заявок', 'error'));
  };

  const setF = (f: Filter) => {
    setFilter(f);
    load(f);
  };

  const decide = async (p: Payment, approve: boolean) => {
    const purposeLabel = PURPOSE_BADGE[p.purpose]?.label ?? 'оплату';
    if (approve && !window.confirm(`Подтвердить ${purposeLabel.toLowerCase()} ${p.user_name} на ${rub(p.amount)}?`)) return;
    try {
      if (approve) {
        await api.adminConfirmPayment(p.id);
        notify(`Пополнение #${p.id} подтверждено`, 'success');
      } else {
        await api.adminRejectPayment(p.id);
        notify(`Пополнение #${p.id} отклонено`, 'success');
      }
      load(filter);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error');
    }
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'pending', label: 'Ожидают' },
    { key: 'confirmed', label: 'Подтверждены' },
    { key: 'rejected', label: 'Отклонены' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Пополнения</h1>
          <p className="text-sm text-slate-400">Заявки на пополнение баланса от грузчиков</p>
        </div>
        <div className="flex gap-1 bg-slate-900/70 border border-white/10 rounded-lg p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setF(f.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === f.key ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {payments === null && <Spinner />}
      {payments && payments.length === 0 && <EmptyState text="Заявок нет" />}

      <div className="flex flex-col gap-3">
        {payments?.map((p) => {
          const st = STATUS_BADGE[p.status];
          const purpose = PURPOSE_BADGE[p.purpose] ?? { label: p.purpose, color: 'gray' };
          return (
            <div key={p.id} className="bg-slate-900/70 rounded-xl border border-white/10 p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-100 flex items-center gap-2 flex-wrap">
                  #{p.id} · {p.user_name ?? 'Грузчик'} · {rub(p.amount)}
                  <Badge color={purpose.color}>{purpose.label}</Badge>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {p.user_public_id ?? `id ${p.user_id}`} · {fmtDate(p.created_at)}
                  {p.confirmed_at ? ` · обработана ${fmtDate(p.confirmed_at)}` : ''}
                </div>
              </div>
              {p.receipt_file && (
                <a
                  href={`/uploads/${p.receipt_file}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-brand-300 hover:underline font-medium"
                >
                  Квитанция ↗
                </a>
              )}
              <Badge color={st.color}>{st.label}</Badge>
              {p.status === 'pending' && (
                <div className="flex gap-1">
                  <Button variant="success" className="px-3 py-1.5 text-xs" onClick={() => void decide(p, true)}>
                    Подтвердить
                  </Button>
                  <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => void decide(p, false)}>
                    Отклонить
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
