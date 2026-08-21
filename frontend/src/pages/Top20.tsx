// ============================================================
// Страница «ТОП-20»: рейтинг грузчиков с активным (оплаченным)
// режимом ТОП-20. Позиция зависит от числа выполненных заказов.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Badge, EmptyState, fmtDate, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import type { TopUser } from '../types';

const MEDALS = ['🥇', '🥈', '🥉'];

// Инициалы для аватара-заглушки
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

export function Top20() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TopUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .top20List()
      .then(setMembers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки рейтинга'));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="glass gradient-border animate-fade-up rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-slate-100">ТОП-20 грузчиков</h1>
        <p className="text-sm text-slate-400 mt-1">
          Рейтинг лучших грузчиков с активным режимом «ТОП-20». Выше позиция — больше заказов
          видят заказчики. Режим оплачивается в личном кабинете.
        </p>
      </div>

      {error && <div className="bg-red-500/15 text-red-200 rounded-lg p-3 text-sm mt-3">{error}</div>}

      {members === null && <Spinner />}
      {members && members.length === 0 && (
        <div className="mt-4">
          <EmptyState text="Пока никто не активировал ТОП-20. Станьте первым!" />
        </div>
      )}

      <div className="flex flex-col gap-2 mt-4">
        {members?.map((m) => {
          const isMe = user?.public_id === m.public_id;
          return (
            <div
              key={m.public_id}
              className={`glass rounded-xl p-4 flex items-center gap-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-glow ${
                isMe ? 'ring-2 ring-violet-400/60 shadow-glow-violet' : ''
              }`}
            >
              <div className="w-8 shrink-0 text-center text-xl font-extrabold text-slate-200">
                {m.rank <= 3 ? MEDALS[m.rank - 1] : m.rank}
              </div>
              {m.avatar ? (
                <img
                  src={`/uploads/${m.avatar}`}
                  alt={m.name}
                  className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-violet-400/40"
                />
              ) : (
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-sm font-bold text-white">
                  {initials(m.name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-100">
                  {m.name} {isMe && <span className="text-xs font-medium text-brand-300">· это вы</span>}
                </div>
                <div className="text-xs text-slate-400">
                  {m.public_id} · выполнено {m.completed} · взято {m.taken}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] text-slate-400">до {fmtDate(m.top20_until)}</div>
                <Badge color="purple">ТОП-20</Badge>
              </div>
            </div>
          );
        })}
      </div>

      {user && !user.in_top20 && (
        <div className="mt-6 text-center">
          <Link
            to="/profile"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-white shadow-glow transition-all duration-150 hover:scale-[1.02] hover:shadow-glow-lg active:scale-[0.98]"
          >
            Активировать ТОП-20 в профиле
          </Link>
        </div>
      )}
    </div>
  );
}
