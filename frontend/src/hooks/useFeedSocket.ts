// ============================================================
// Хук подписки на WebSocket-ленту /ws/feed.
// Сервер рассылает событие orders_update, когда заказ взят
// или изменён. Фронтенд перезапрашивает ленту — так список
// всегда актуален без ручного обновления страницы.
// ============================================================

import { useEffect, useRef } from 'react';

export function useFeedSocket(onEvent: () => void): void {
  // Реф с колбэком, чтобы не пересоздавать сокет при каждом рендере
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retryMs = 3000; // повторное подключение с нарастающей паузой

    const connect = () => {
      if (closed) return;
      // В dev Vite проксирует ws://.../ws/feed на бэкенд
      const proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
      ws = new WebSocket(`${proto}${window.location.host}/ws/feed`);

      ws.onopen = () => {
        retryMs = 3000; // сброс после успешного подключения
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data));
          if (data && data.type === 'orders_update') {
            cbRef.current();
          }
        } catch {
          /* невалидное сообщение игнорируем */
        }
      };

      ws.onclose = () => {
        if (!closed) {
          // Автопереподключение
          setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 1.5, 15000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      ws?.close();
    };
  }, []);
}
