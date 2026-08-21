// ============================================================
// Переиспользуемые UI-компоненты: кнопки, поля, бейджи, спиннер.
// Яркие градиенты, неоновые свечения, плавные hover-анимации.
// Анимации — transform/opacity (GPU), чтобы держать 120 FPS.
// ============================================================

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

// Кнопка с вариантами оформления. При наведении: подъём + свечение +
// бегущий блик; при нажатии — мягкое "вдавливание" через scale.
export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
}) {
  const styles: Record<string, string> = {
    primary:
      'group relative overflow-hidden bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-glow hover:shadow-glow-lg hover:from-indigo-400 hover:via-violet-400 hover:to-fuchsia-400',
    secondary:
      'bg-slate-800/60 text-slate-200 ring-1 ring-white/15 shadow-glass-sm backdrop-blur hover:bg-slate-700/60 hover:ring-brand-300 hover:text-brand-300 hover:shadow-glow-blue',
    danger:
      'bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.4)] hover:from-rose-400 hover:to-red-400 hover:shadow-[0_0_26px_rgba(244,63,94,0.55)]',
    success:
      'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-glow-emerald hover:from-emerald-400 hover:to-teal-400 hover:shadow-[0_0_26px_rgba(52,211,153,0.6)]',
    ghost: 'bg-transparent text-brand-300 hover:bg-violet-500/20',
  };
  const showShimmer = variant === 'primary' || variant === 'danger' || variant === 'success';
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 hover:scale-[1.03] hover:-translate-y-px active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0 ${styles[variant]} ${className}`}
    >
      {showShimmer && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:animate-shimmer"
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-2">{rest.children}</span>
    </button>
  );
}

// Текстовое поле с подписью: glass-стиль, свечение при фокусе
export function Field({
  label,
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-200">{label}</span>
      <input
        {...rest}
        className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 shadow-glass-sm outline-none backdrop-blur transition-all duration-150 placeholder:text-slate-400 hover:border-brand-300 focus:border-transparent focus:bg-slate-800/70 focus:ring-2 focus:ring-violet-400/70 focus:shadow-glow-violet"
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

// Цветной бейдж-статус: мягкий градиент + свечение
export function Badge({ children, color = 'slate' }: { children: ReactNode; color?: string }) {
  const map: Record<string, string> = {
    slate: 'bg-gradient-to-r from-slate-700/60 to-slate-600/60 text-slate-200',
    green:
      'bg-gradient-to-r from-emerald-500/25 to-teal-500/25 text-emerald-200 shadow-[0_2px_8px_rgba(16,185,129,0.2)]',
    red: 'bg-gradient-to-r from-rose-500/25 to-red-500/25 text-rose-200 shadow-[0_2px_8px_rgba(244,63,94,0.2)]',
    orange:
      'bg-gradient-to-r from-amber-500/25 to-orange-500/25 text-amber-200 shadow-[0_2px_8px_rgba(251,146,60,0.25)]',
    blue: 'bg-gradient-to-r from-sky-500/25 to-blue-500/25 text-sky-200 shadow-[0_2px_8px_rgba(59,130,246,0.2)]',
    cyan: 'bg-gradient-to-r from-cyan-500/25 to-teal-500/25 text-cyan-200 shadow-[0_2px_8px_rgba(34,211,238,0.2)]',
    gray: 'bg-gradient-to-r from-slate-600/50 to-slate-500/50 text-slate-300',
    purple:
      'bg-gradient-to-r from-violet-500/25 to-fuchsia-500/25 text-violet-200 shadow-[0_2px_8px_rgba(139,92,246,0.25)]',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/15 ${map[color]}`}
    >
      {children}
    </span>
  );
}

// Спиннер загрузки: градиентный, с пульсацией подписи
export function Spinner({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-slate-300">
      <span className="relative grid h-6 w-6 place-items-center">
        <span className="absolute h-6 w-6 rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-400 animate-ping-dot" />
        <svg className="relative h-5 w-5 animate-spin text-violet-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </span>
      <span className="text-sm animate-pulse-soft">{label}</span>
    </div>
  );
}

// Пустое состояние списка
export function EmptyState({ text }: { text: string }) {
  return (
    <div className="glass rounded-2xl py-12 text-center text-slate-400">
      <p className="mb-2 text-4xl">📭</p>
      <p className="text-sm">{text}</p>
    </div>
  );
}

// Формат суммы в рублях
export function rub(n: number | null | undefined): string {
  return `${n ?? 0} ₽`;
}

// Русские месяцы для формата «21 августа, 14:30»
const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Время публикации заказа в часовом поясе браузера:
// «Сегодня, 14:30» / «Вчера, 14:30» / «21 августа, 14:30».
// published_at приходит от бэкенда как ISO с зоной UTC.
export function orderTimeLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (isSameDay(d, now)) return `Сегодня, ${hm}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return `Вчера, ${hm}`;
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]}, ${hm}`;
}

// Формат даты для интерфейса
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
