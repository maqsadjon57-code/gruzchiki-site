// ============================================================
// Каркас админ-панели: боковое меню + защита по роли admin.
// ============================================================

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

const NAV = [
  { to: '/admin', label: 'Дашборд', end: true },
  { to: '/admin/orders', label: 'Заказы' },
  { to: '/admin/users', label: 'Пользователи' },
  { to: '/admin/payments', label: 'Пополнения' },
  { to: '/admin/promocodes', label: 'Промокоды' },
  { to: '/admin/regions', label: 'Регионы' },
  { to: '/admin/settings', label: 'Настройки' },
  { to: '/admin/logs', label: 'Журнал' },
];

export function AdminLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return <Spinner label="Проверяем права доступа…" />;

  // Не авторизован или не админ — на главную
  if (!user || !user.is_admin) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950/40 backdrop-blur-xl flex">
      {/* Сайдбар */}
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-300 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="font-bold text-white text-lg">Грузчики</div>
          <div className="text-xs text-slate-400">панель администратора</div>
        </div>
        <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-600 text-white' : 'hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Контент */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
