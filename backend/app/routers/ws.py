"""
WebSocket-лента заказов в реальном времени.

Клиент подключается к /ws/feed и получает события:
  * {"type": "orders_update", "region": "Сургут"} — лента изменилась;
  * {"type": "ping"} — служебный пинг (раз в 30 секунд).

События шлются всем подключённым клиентам; фронтенд сам решает,
обновлять ли список (по фильтру региона).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("gruzchiki.ws")

router = APIRouter()


class ConnectionManager:
    """Менеджер активных WebSocket-подключений."""

    def __init__(self) -> None:
        self.connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        """Принять новое подключение и добавить в список."""
        await ws.accept()
        self.connections.append(ws)
        logger.info("WebSocket подключён, всего: %d", len(self.connections))

    def disconnect(self, ws: WebSocket) -> None:
        """Убрать отключившегося клиента из списка."""
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Отправить сообщение всем подключённым клиентам."""
        # Копируем список, потому что он может меняться во время итерации
        for ws in list(self.connections):
            try:
                await ws.send_json(message)
            except Exception:
                # Если клиент отвалился — убираем его
                self.disconnect(ws)


# Единственный экземпляр менеджера на всё приложение
manager = ConnectionManager()


@router.websocket("/ws/feed")
async def ws_feed(websocket: WebSocket) -> None:
    """
    Эндпоинт ленты: принимает соединение и держит его открытым.
    Входящие сообщения игнорируются (клиент только слушает),
    но если клиент прислал ping — отвечаем pong.
    """
    await manager.connect(websocket)
    try:
        while True:
            # Ждём сообщение от клиента; если пришёл ping — отвечаем
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


async def broadcast_orders_update(region: str | None = None) -> None:
    """Разослать всем клиентам событие об обновлении ленты заказов."""
    await manager.broadcast({"type": "orders_update", "region": region})


# Периодический пинг для поддержания соединения
async def ping_loop() -> None:
    """Каждые 30 секунд шлём пинг, чтобы соединение не рвалось."""
    while True:
        await asyncio.sleep(30)
        await manager.broadcast({"type": "ping"})
