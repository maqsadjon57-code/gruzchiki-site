// ============================================================
// Промокоды: список, создание, редактирование, удаление.
// Промокод даёт бонус при регистрации (см. auth.py).
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Spinner } from '../../components/ui';
import type { PromoCode } from '../../types';

export function PromoCodes() {
  const [promos, setPromos] = useState<PromoCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Форма создания
  const [code, setCode] = useState('');
  const [bonus, setBonus] = useState('100');
  const [maxUses, setMaxUses] = useState('0');

  const load = useCallback(() => {
    api
      .adminPromos()
      .then(setPromos)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки промокодов'));
  }, []);

  useEffect(load, [load]);

  const handleCreate = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminCreatePromo({
        code: trimmed,
        bonus: Number(bonus) || 0,
        max_uses: Number(maxUses) || 0,
      });
      setCode('');
      setBonus('100');
      setMaxUses('0');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать промокод');
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (p: PromoCode) => {
    setBusy(true);
    setError(null);
    try {
      await api.adminUpdatePromo(p.id, { is_active: !p.is_active });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить промокод');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (p: PromoCode) => {
    if (!window.confirm(`Удалить промокод ${p.code}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminDeletePromo(p.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить промокод');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-1">Промокоды</h1>
      <p className="text-sm text-slate-400 mb-6">
        Бонус начисляется при регистрации по промокоду. Пустой код — код друга (реферальная программа).
      </p>

      {error && <div className="bg-red-500/15 text-red-200 rounded-lg p-3 text-sm mb-4">{error}</div>}

      {/* Форма создания */}
      <div className="bg-slate-900/70 rounded-xl border border-white/10 p-4 mb-6">
        <div className="text-sm font-semibold text-slate-200 mb-3">Новый промокод</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Код
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="PROMO50"
              maxLength={40}
              className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-300"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Бонус, ₽
            <input
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              type="number"
              min={0}
              className="w-28 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-300"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Лимит использований (0 — без лимита)
            <input
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              type="number"
              min={0}
              className="w-36 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-300"
            />
          </label>
          <button
            onClick={handleCreate}
            disabled={busy || !code.trim()}
            className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            Создать
          </button>
        </div>
      </div>

      {/* Список */}
      {!promos && !error && <Spinner />}

      {promos && promos.length === 0 && (
        <div className="text-sm text-slate-400">Промокодов пока нет — создайте первый.</div>
      )}

      {promos && promos.length > 0 && (
        <div className="flex flex-col gap-2">
          {promos.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-100">{p.code}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/40 text-slate-400'}`}>
                    {p.is_active ? 'активен' : 'выключен'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  бонус {p.bonus} ₽ · использований {p.uses_count}
                  {p.max_uses > 0 ? ` из ${p.max_uses}` : ' (без лимита)'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggle(p)}
                  disabled={busy}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-brand-300 hover:text-white disabled:opacity-50"
                >
                  {p.is_active ? 'Выключить' : 'Включить'}
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  disabled={busy}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
