// ============================================================
// Общий каркас сайта: боковая панель слева (профиль + навигация),
// контент справа. На мобильных панель прячется за бургер-меню.
// ============================================================

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { rub } from './ui';

// Имя Telegram-бота для ссылки «Написать админу» (кэш между переходами)
let tgUsernameCache: string | null = null;

// Инициалы для аватара
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

// Градиент аватара — стабильный по имени
function avatarGradient(name: string): string {
  const hues = [
    'from-blue-500 to-violet-600',
    'from-fuchsia-500 to-pink-600',
    'from-amber-400 to-orange-600',
    'from-emerald-400 to-teal-600',
    'from-rose-400 to-red-600',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return hues[h % hues.length];
}

const NAV_ITEMS = [
  { to: '/', label: 'Лента заказов', icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10' },
  { to: '/profile', label: 'Мой профиль', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { to: '/top20', label: 'ТОП-20', icon: 'M12 3l2.2 4.7 5.3.6-4 3.8 1 5.2-4.5-2.4L7.5 17.3l1-5.2-4-3.8 5.3-.6L12 3z' },
  { to: '/topup', label: 'Пополнить баланс', icon: 'M12 8v8m-4-4h8M12 3a9 9 0 100 18 9 9 0 000-18z' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [tgUsername, setTgUsername] = useState<string>('');
  const location = useLocation();

  // Имя бота берём из корневого эндпоинта API (один раз, с кэшем)
  useEffect(() => {
    if (tgUsernameCache !== null) {
      setTgUsername(tgUsernameCache);
      return;
    }
    fetch('/api', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { telegram?: { username?: string } } | null) => {
        const name = ((data?.telegram?.username) || '').trim();
        tgUsernameCache = name;
        setTgUsername(name);
      })
      .catch(() => {
        tgUsernameCache = '';
        setTgUsername('');
      });
  }, []);

  // Закрываем мобильное меню при переходе по ссылке
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
      isActive
        ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-glow-lg'
        : 'text-slate-300 hover:bg-slate-800/60 hover:text-violet-200 hover:shadow-glass-sm hover:translate-x-0.5'
    }`;

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Логотип */}
      <Link to="/" className="group flex items-center gap-2.5 px-2 py-1">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-glow transition-transform duration-150 group-hover:scale-110 group-hover:rotate-3">
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </span>
        <div>
          <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
            Грузчики
          </div>
          <div className="text-[11px] font-semibold leading-none text-slate-400">сервис заказов</div>
        </div>
      </Link>

      {/* Кнопка «Разместить заказ» — для заказчиков, без авторизации */}
      <Link
        to="/place-order"
        className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-bold text-white shadow-glow-emerald transition-all duration-150 hover:-translate-y-px hover:shadow-[0_0_26px_rgba(52,211,153,0.6)] active:scale-[0.98]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
        </svg>
        Разместить заказ
      </Link>

      {/* Карточка профиля */}
      <div className="glass gradient-border mt-5 rounded-2xl p-4">
        {user ? (
          <>
            <div className="flex items-center gap-3">
              {user.avatar ? (
                <img
                  src={`/uploads/${user.avatar}`}
                  alt={user.name}
                  className="h-11 w-11 shrink-0 rounded-full object-cover shadow-md ring-2 ring-violet-400/50 transition-transform duration-150 hover:scale-110"
                />
              ) : (
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br ${avatarGradient(user.name)} text-sm font-bold text-white shadow-md transition-transform duration-150 hover:scale-110`}
                >
                  {initials(user.name)}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-100">{user.name}</div>
                <div className="truncate text-[11px] text-slate-400">{user.public_id}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-2 text-white shadow-glow-lg">
              <span className="text-[11px] font-semibold text-white/85">Баланс</span>
              <span className="text-sm font-extrabold">{rub(user.balance)}</span>
            </div>
            <Link
              to="/topup"
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-violet-200 shadow-glass-sm ring-1 ring-white/25 transition-all duration-150 hover:-translate-y-px hover:bg-violet-500/20 hover:shadow-glow-violet"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Пополнить
            </Link>
          </>
        ) : (
          <div className="text-center">
            <div className="text-sm font-bold text-slate-100">Работаете грузчиком?</div>
            <p className="mt-1 text-xs text-slate-400">Войдите, чтобы брать заказы и видеть телефоны заказчиков.</p>
            <Link
              to="/login"
              className="mt-3 block w-full rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-2 text-sm font-bold text-white shadow-glow transition-all duration-150 hover:scale-[1.02] hover:shadow-glow-lg active:scale-[0.98]"
            >
              Войти
            </Link>
            <Link
              to="/register"
              className="mt-2 block w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-violet-200 shadow-glass-sm ring-1 ring-white/25 transition-all duration-150 hover:-translate-y-px hover:bg-violet-500/20 hover:shadow-glow-violet"
            >
              Регистрация
            </Link>
          </div>
        )}
      </div>

      {/* Навигация */}
      <nav className="mt-5 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={navClass} end={item.to === '/'}>
            <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            {item.label}
          </NavLink>
        ))}
        {user?.is_admin && (
          <NavLink to="/admin" className={navClass}>
            <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Админка
          </NavLink>
        )}
      </nav>

      {user && (
        <button
          onClick={logout}
          className="mt-auto flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-400 transition-all duration-150 hover:bg-rose-500/15 hover:text-rose-300 hover:shadow-[0_2px_10px_rgba(244,63,94,0.15)]"
        >
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Выйти
        </button>
      )}

      {/* Ссылка «Написать админу» — прямая связь с администратором в Telegram */}
      {tgUsername && (
        <a
          href={`https://t.me/${tgUsername}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-3 rounded-xl bg-sky-500/10 px-3.5 py-2.5 text-sm font-semibold text-sky-300 ring-1 ring-sky-400/25 transition-all duration-150 hover:-translate-y-px hover:bg-sky-500/20 hover:shadow-[0_2px_12px_rgba(56,189,248,0.25)]"
        >
          <svg className="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21.94 4.14a1.5 1.5 0 00-2.05-1.33L2.87 9.72a1.5 1.5 0 00.24 2.87l4.2.93 1.6 5.13a1.5 1.5 0 002.4.65l2.47-2.16 4.13 3.02a1.5 1.5 0 002.3-.94l3.73-15.08zM5.5 11.65l12.9-5.02-7.45 6.92-1.07 3.43-1.02-3.3-3.36-.03z" />
          </svg>
          Написать админу
        </a>
      )}

      <div className="mt-4 px-2 text-[10px] leading-relaxed text-slate-400">
        Все активные заказы в ленте · Оплата по реквизитам банка
      </div>
    </div>
  );

  return (
    <div className="min-h-screen md:flex md:flex-row">
      {/* Мобильная шапка */}
      <header className="glass-strong sticky top-0 z-40 flex items-center justify-between px-4 py-2.5 md:hidden">
        <Link to="/" className="flex items-center gap-2 font-extrabold text-slate-100">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-glow">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </span>
          <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            Грузчики
          </span>
        </Link>
        <Link
          to="/place-order"
          className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2 text-xs font-bold text-white shadow-glow-emerald transition-all duration-150 hover:scale-105 active:scale-95"
        >
          Заказать
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Меню"
          className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-slate-200 shadow-glass-sm ring-1 ring-white/25 transition-all duration-150 hover:scale-105 hover:text-violet-200 hover:shadow-glow-violet active:scale-95"
        >
          {open ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </header>

      {/* Подложка мобильного меню */}
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Боковая панель */}
      <aside
        className={`glass-strong fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform p-4 shadow-2xl transition-transform duration-200 md:sticky md:top-0 md:h-screen md:w-72 md:shrink-0 md:translate-x-0 md:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebar}
      </aside>

      {/* Контент */}
      <main className="relative w-full flex-1 px-4 py-6 md:px-8">
        <div className="animate-fade-up">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
