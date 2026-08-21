// ============================================================
// Регистрация грузчика: имя, телефон, пароль (email опционально).
// После регистрации сразу выдаётся токен — пользователь в системе.
// ============================================================

import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function Register() {
  const { register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [busy, setBusy] = useState(false);

  // Реферальная ссылка вида /register?ref=GRUZ-123456 подставляет код
  const [searchParams] = useSearchParams();
  const [initialPromo] = useState(() => searchParams.get('ref') || '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      notify('Пароль должен быть не короче 6 символов', 'error');
      return;
    }
    setBusy(true);
    try {
      const data = await register({
        name,
        phone: phone.trim(),
        email: email || undefined,
        password,
        promo_code: promoCode.trim() || initialPromo || undefined,
      });
      notify(`Аккаунт создан, ${data.user.name}!`, 'success');
      navigate('/');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Не удалось зарегистрироваться', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      <div className="glass gradient-border animate-fade-up rounded-2xl p-6">
        <h1 className="text-xl font-bold text-slate-100 mb-1">Регистрация</h1>
        <p className="text-sm text-slate-400 mb-5">
          Зарегистрируйтесь, чтобы брать заказы в своём городе.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <Field
            label="Имя"
            placeholder="Иван"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Field
            label="Телефон"
            type="tel"
            placeholder="+7 912 000-00-00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <Field
            label="Email (необязательно)"
            type="email"
            placeholder="user@mail.ru"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Пароль"
            type="password"
            placeholder="Минимум 6 символов"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Field
            label="Промокод или код друга"
            placeholder="START100 или GRUZ-123456"
            value={promoCode || initialPromo}
            onChange={(e) => setPromoCode(e.target.value)}
            hint="Введите промокод или реферальный код грузчика — бонус начислится на баланс сразу после регистрации."
          />
          <Button type="submit" disabled={busy}>
            {busy ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
          </Button>
        </form>

        <p className="text-sm text-slate-400 text-center mt-4">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="text-brand-300 font-medium hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
