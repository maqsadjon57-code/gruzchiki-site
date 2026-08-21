// ============================================================
// Грузчики: список, баланс, блокировка/разблокировка.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Badge, Button, EmptyState, fmtDate, rub, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { User } from '../../types';

export function Users() {
  const { notify } = useToast();
  const [users, setUsers] = useState<User[] | null>(null);

  const load = () => {
    api
      .adminUsers()
      .then(setUsers)
      .catch((e) => notify(e instanceof Error ? e.message : 'Ошибка загрузки грузчиков', 'error'));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBlock = async (u: User) => {
    try {
      if (u.is_blocked) {
        await api.adminUnblock(u.id);
        notify(`${u.name} разблокирован`, 'success');
      } else {
        if (!window.confirm(`Заблокировать ${u.name} (${u.public_id})?`)) return;
        await api.adminBlock(u.id);
        notify(`${u.name} заблокирован`, 'success');
      }
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error');
    }
  };

  if (users === null) return <Spinner />;
  if (users.length === 0) return <EmptyState text="Грузчиков пока нет" />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Грузчики</h1>
        <p className="text-sm text-slate-400">Всего: {users.length}</p>
      </div>
      <div className="bg-slate-900/70 rounded-xl border border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-400 border-b border-white/10">
              <th className="px-4 py-3">Грузчик</th>
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">Баланс</th>
              <th className="px-4 py-3">Регистрация</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-white/10 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-100">{u.name}</div>
                  <div className="text-xs text-slate-400">{u.public_id}</div>
                </td>
                <td className="px-4 py-3 text-slate-300">{u.phone}</td>
                <td className="px-4 py-3 font-semibold text-slate-100">{rub(u.balance)}</td>
                <td className="px-4 py-3 text-slate-400">{fmtDate(u.created_at)}</td>
                <td className="px-4 py-3">
                  {u.is_blocked ? (
                    <Badge color="red">Заблокирован</Badge>
                  ) : (
                    <Badge color="green">Активен</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.is_admin ? (
                    <span className="text-xs text-slate-400">Админ</span>
                  ) : (
                    <Button
                      variant={u.is_blocked ? 'success' : 'danger'}
                      className="px-3 py-1.5 text-xs"
                      onClick={() => void toggleBlock(u)}
                    >
                      {u.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
