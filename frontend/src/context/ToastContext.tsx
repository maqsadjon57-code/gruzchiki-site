// ============================================================
// Контекст всплывающих уведомлений (тостов).
// Простая реализация: стек сообщений, автоскрытие через 4 секунды.
// ============================================================

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

interface ToastContextValue {
  notify: (text: string, kind?: Toast['kind']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++counter;
    setItems((prev) => [...prev.slice(-4), { id, kind, text }]);
    // Автоскрытие тоста
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const colors: Record<Toast['kind'], string> = {
    success: 'bg-emerald-600',
    error: 'bg-red-600',
    info: 'bg-slate-800',
  };

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      {/* Стек тостов — фиксируется в правом верхнем углу */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
        {items.map((t) => (
          <button
            key={t.id}
            onClick={() => remove(t.id)}
            className={`${colors[t.kind]} text-white text-sm rounded-lg shadow-lg px-4 py-3 text-left`}
          >
            {t.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast должен использоваться внутри <ToastProvider>');
  }
  return ctx;
}
