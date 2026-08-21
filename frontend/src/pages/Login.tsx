// ============================================================
// Страница входа: телефон + пароль.
// После успешного входа направляем в ленту (или в админку).
// ============================================================

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function Login() {
  const { login } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await login(phone.trim(), password);
      notify(`Добро пожаловать, ${data.user.name}!`, 'success');
      navigate(data.user.is_admin ? '/admin' : '/');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Неверный телефон или пароль', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      <div className="glass gradient-border animate-fade-up rounded-2xl p-6">
        <h1 className="text-xl font-bold text-slate-100 mb-1">Вход</h1>
        <p className="text-sm text-slate-400 mb-5">
          Войдите, чтобы видеть телефоны заказчиков и брать заказы.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <Field
            label="Телефон"
            type="tel"
            placeholder="+7 912 000-00-00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <Field
            label="Пароль"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>
            {busy ? 'Входим…' : 'Войти'}
          </Button>
        </form>

        <p className="text-sm text-slate-400 text-center mt-4">
          Нет аккаунта?{' '}
          <Link to="/register" className="text-brand-300 font-medium hover:underline">
            Зарегистрируйтесь
          </Link>
        </p>
      </div>
    </div>
  );
}
