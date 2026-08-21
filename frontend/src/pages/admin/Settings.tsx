// ============================================================
// Настройки платформы: комиссия, банковские реквизиты, пороги.
// Реквизиты живут в .env бэкенда и отображаются только для чтения.
// ============================================================

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { Button, Field, Spinner, rub } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { Settings as SettingsType } from '../../types';

// Валидация неотрицательного числа
function validNumber(s: string): boolean {
  const v = Number(s);
  return Number.isFinite(v) && v >= 0;
}

export function Settings() {
  const { notify } = useToast();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [commission, setCommission] = useState('');
  const [phoneUnlock, setPhoneUnlock] = useState('');
  const [top20Price, setTop20Price] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .adminSettings()
      .then((s) => {
        setSettings(s);
        setCommission(String(s.commission));
        setPhoneUnlock(String(s.phone_unlock_amount));
        setTop20Price(String(s.top20_price));
      })
      .catch((e) => notify(e instanceof Error ? e.message : 'Ошибка загрузки настроек', 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(commission);
    if (!Number.isFinite(value) || value < 0) {
      notify('Введите корректную комиссию', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.adminUpdateSettings({ commission: value });
      notify(`Комиссия сохранена: ${res.commission ?? value}₽`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Не удалось сохранить', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveServices = async (e: FormEvent) => {
    e.preventDefault();
    if (!validNumber(phoneUnlock) || !validNumber(top20Price)) {
      notify('Введите корректные цены услуг', 'error');
      return;
    }
    const unlock = Number(phoneUnlock);
    const top20 = Number(top20Price);
    setSaving(true);
    try {
      const res = await api.adminUpdateSettings({
        phone_unlock_amount: unlock,
        top20_price: top20,
      });
      notify(
        `Цены сохранены: телефоны ${res.phone_unlock_amount ?? unlock}₽, ТОП-20 ${res.top20_price ?? top20}₽`,
        'success',
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Не удалось сохранить цены', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (settings === null) return <Spinner />;

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: 'Название банка', value: settings.bank.name },
    { label: 'Телефон банка', value: settings.bank.phone, mono: true },
    { label: 'Номер карты', value: settings.bank.card, mono: true },
    { label: 'Держатель', value: settings.bank.holder },
  ];

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Настройки</h1>
        <p className="text-sm text-slate-400">Параметры платформы</p>
      </div>

      {/* Комиссия */}
      <form onSubmit={(e) => void save(e)} className="bg-slate-900/70 rounded-xl border border-white/10 p-5 mb-6">
        <h2 className="font-semibold text-slate-100 mb-1">Комиссия с заказа</h2>
        <p className="text-xs text-slate-400 mb-4">
          Удерживается с грузчика при взятии заказа. Сейчас: {rub(settings.commission)}
        </p>
        <div className="flex gap-2 max-w-xs">
          <Field label="Комиссия, ₽" type="number" min={0} value={commission} onChange={(e) => setCommission(e.target.value)} />
          <div className="self-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </form>

      {/* Цены услуг */}
      <form onSubmit={(e) => void saveServices(e)} className="bg-slate-900/70 rounded-xl border border-white/10 p-5 mb-6">
        <h2 className="font-semibold text-slate-100 mb-1">Цены услуг</h2>
        <p className="text-xs text-slate-400 mb-4">
          Стоимость разового доступа к телефонам заказчиков и суточной подписки ТОП-20.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Field
            label="Доступ к телефонам, ₽"
            type="number"
            min={0}
            value={phoneUnlock}
            onChange={(e) => setPhoneUnlock(e.target.value)}
            className="max-w-[160px]"
          />
          <Field
            label="ТОП-20 за сутки, ₽"
            type="number"
            min={0}
            value={top20Price}
            onChange={(e) => setTop20Price(e.target.value)}
            className="max-w-[160px]"
          />
          <div className="self-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохраняем…' : 'Сохранить цены'}
            </Button>
          </div>
        </div>
      </form>

      {/* Порог показа телефона */}
      <div className="bg-slate-900/70 rounded-xl border border-white/10 p-5 mb-6">
        <h2 className="font-semibold text-slate-100 mb-1">Порог показа телефона</h2>
        <p className="text-sm text-slate-300">
          Телефон заказчика виден грузчику при балансе от{' '}
          <span className="font-semibold">{rub(settings.phone_visible_balance)}</span>. Меняется в{' '}
          <code className="text-xs bg-white/10 px-1 py-0.5 rounded">.env</code> бэкенда.
        </p>
      </div>

      {/* Банковские реквизиты */}
      <div className="bg-slate-900/70 rounded-xl border border-white/10 p-5">
        <h2 className="font-semibold text-slate-100 mb-1">Банковские реквизиты</h2>
        <p className="text-xs text-slate-400 mb-4">
          Показываются грузчикам на странице пополнения. Редактируются в <code className="bg-white/10 px-1 py-0.5 rounded">.env</code> бэкенда.
        </p>
        <dl className="divide-y divide-white/10">
          {rows.map((r) => (
            <div key={r.label} className="py-2.5 flex items-center justify-between gap-4">
              <dt className="text-sm text-slate-400">{r.label}</dt>
              <dd className={`text-sm font-medium text-slate-100 ${r.mono ? 'font-mono' : ''}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-slate-400 mt-3">
          Минимальная сумма пополнения — {rub(settings.min_topup)}
        </p>
      </div>
    </div>
  );
}
