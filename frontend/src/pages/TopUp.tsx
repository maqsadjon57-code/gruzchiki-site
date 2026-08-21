// ============================================================
// Пополнение баланса.
// Грузчик переводит деньги по реквизитам банка (Совкомбанк),
// прикладывает чек/скриншот — администратор подтверждает вручную.
// ============================================================

import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Button, Field, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// Реквизиты по умолчанию (перекрываются данными админки при загрузке)
const REQUISITES_DEFAULT = {
  name: 'Совкомбанк',
  phone: '+7 923 236-36-62',
  card: '—',
  holder: '—',
};

export function TopUp() {
  const { notify } = useToast();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [amount, setAmount] = useState('100');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState<{ name: string; phone: string; card: string; holder: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Загружаем реквизиты и минимальную сумму при монтировании
  useState(() => {
    api
      .adminSettings()
      .then((s) => {
        setBank({ ...REQUISITES_DEFAULT, ...s.bank });
        setAmount(String(s.min_topup));
      })
      .catch(() => setBank({ ...REQUISITES_DEFAULT }));
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const sum = Number(amount);
    if (!sum || sum <= 0) {
      notify('Укажите корректную сумму', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.topup(sum, file);
      notify('Заявка отправлена. После подтверждения админом баланс пополнится.', 'success');
      await refresh();
      navigate('/profile');
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, 'error');
      } else {
        notify('Не удалось отправить заявку', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!bank) return <Spinner />;

  return (
    <div className="max-w-md mx-auto">
      <div className="glass gradient-border animate-fade-up rounded-2xl p-6">
        <h1 className="text-xl font-bold text-slate-100 mb-1">Пополнение баланса</h1>
        <p className="text-sm text-slate-400 mb-5">
          Переведите сумму по реквизитам и прикрепите чек. Администратор подтвердит оплату вручную.
        </p>

        {/* Реквизиты банка */}
        <div className="glass rounded-xl p-4 mb-5">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Реквизиты для оплаты</div>
          <div className="text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-slate-400">Банк</span>
              <span className="font-medium">{bank.name}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-400">Телефон</span>
              <a href={`tel:${bank.phone.replace(/\s/g, '')}`} className="font-medium text-brand-300">
                {bank.phone}
              </a>
            </div>
            {bank.card !== '—' && (
              <div className="flex justify-between py-0.5">
                <span className="text-slate-400">Карта</span>
                <span className="font-mono">{bank.card}</span>
              </div>
            )}
            {bank.holder !== '—' && (
              <div className="flex justify-between py-0.5">
                <span className="text-slate-400">Получатель</span>
                <span className="font-medium">{bank.holder}</span>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <Field
            label="Сумма, ₽"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint="Минимальная сумма пополнения — для открытия телефонов заказчиков"
            required
          />

          {/* Загрузка чека */}
          <div>
            <span className="block text-sm font-medium text-slate-200 mb-1">Чек (фото/скриншот)</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-violet-300/70 bg-slate-900/40 py-5 text-sm text-slate-400 backdrop-blur transition-all duration-150 hover:border-violet-400 hover:bg-slate-800/60 hover:text-violet-600 hover:shadow-glow-violet"
            >
              {file ? (
                <span className="text-emerald-600 font-medium">✓ Выбран файл: {file.name}</span>
              ) : (
                'Нажмите, чтобы прикрепить чек'
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <Button type="submit" disabled={busy} className="py-3">
            {busy ? 'Отправляем…' : 'Отправить на проверку'}
          </Button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-4">
          После подтверждения баланс пополнится и телефоны заказчиков откроются.{' '}
          <Link to="/profile" className="text-brand-300 hover:underline">
            Вернуться в профиль
          </Link>
        </p>
      </div>
    </div>
  );
}
