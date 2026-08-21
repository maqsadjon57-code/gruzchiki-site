// ============================================================
// Регионы (города): список, добавление, удаление.
// ============================================================

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { Badge, Button, EmptyState, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { AdminRegion } from '../../types';

export function Regions() {
  const { notify } = useToast();
  const [regions, setRegions] = useState<AdminRegion[] | null>(null);
  const [name, setName] = useState('');

  const load = () => {
    api
      .adminRegions()
      .then(setRegions)
      .catch((e) => notify(e instanceof Error ? e.message : 'Ошибка загрузки регионов', 'error'));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await api.adminCreateRegion(trimmed);
      notify(`Регион «${trimmed}» добавлен`, 'success');
      setName('');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Не удалось добавить регион', 'error');
    }
  };

  const remove = async (r: AdminRegion) => {
    if (!window.confirm(`Удалить регион «${r.name}»? Заказы в нём сохранятся.`)) return;
    try {
      await api.adminDeleteRegion(r.id);
      notify(`Регион «${r.name}» удалён`, 'success');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ошибка', 'error');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Регионы</h1>
        <p className="text-sm text-slate-400">Города, в которых работает платформа</p>
      </div>

      <form onSubmit={(e) => void add(e)} className="flex gap-2 mb-6 max-w-md">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название города, например Сургут"
          className="flex-1 rounded-lg border border-white/15 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
        <Button type="submit">Добавить</Button>
      </form>

      {regions === null && <Spinner />}
      {regions && regions.length === 0 && <EmptyState text="Регионы не добавлены" />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {regions?.map((r) => (
          <div key={r.id} className="bg-slate-900/70 rounded-xl border border-white/10 p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-100 truncate">{r.name}</div>
              <div className="text-xs text-slate-400">Заказов: {r.orders_count}</div>
            </div>
            <Badge color={r.is_active ? 'green' : 'slate'}>{r.is_active ? 'Активен' : 'Выключен'}</Badge>
            <Button variant="danger" className="px-2.5 py-1.5 text-xs" onClick={() => void remove(r)}>
              Удалить
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
