"""
Сериализация заказов для API.

Ключевое бизнес-правило: телефон заказчика скрыт, пока у грузчика
баланс меньше порога (PHONE_VISIBLE_BALANCE, по умолчанию 100 ₽).
Эта логика живёт здесь, чтобы её не дублировать в роутерах.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .config import settings
from .models import Order, TakenOrder

# Фиксированный пояс Москвы (UTC+3) — fallback для лейблов на бэкенде,
# фронтенд пересчитывает время в часовом поясе браузера.
MOSCOW_TZ = timezone(timedelta(hours=3))

# Словарь статусов на русском для отображения
STATUS_LABELS = {
    "active": "активен",
    "taken": "взят",
    "completed": "выполнен",
}


def _to_utc_iso(dt: datetime) -> str:
    """datetime -> ISO-строка с явной зоной UTC (naive считаем UTC)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def time_label(dt: datetime) -> str:
    """
    Красивый формат времени публикации (fallback для бэкенда):
      «Сегодня, 14:30» для заказов текущего дня,
      иначе «Вчера, 14:30» или «21 августа, 14:30».

    Значения без зоны (SQLite) считаем UTC, лейбл строим по Москве (UTC+3).
    Фронтенд всё равно пересчитывает время в поясе браузера.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(MOSCOW_TZ)
    now = datetime.now(timezone.utc).astimezone(MOSCOW_TZ)
    if local.date() == now.date():
        return f"Сегодня, {local.strftime('%H:%M')}"
    yesterday = now.date() - timedelta(days=1)
    if local.date() == yesterday:
        return f"Вчера, {local.strftime('%H:%M')}"
    return local.strftime("%d %B, %H:%M")


def serialize_order(
    order: Order,
    balance: int | None = None,
    phone_available: bool | None = None,
    taken: TakenOrder | None = None,
    current_user_id: int | None = None,
) -> dict:
    """
    Преобразовать ORM-объект Order в JSON-словарь.

    balance — баланс текущего грузчика (None — не авторизован).
    phone_available — явное решение «показывать ли телефон»:
      * True/False — использовать как есть;
      * None — старое правило: телефон виден при балансе >= порога.
    taken — запись о взятии заказа (заполняется в деталях и личном кабинете,
      в публичной ленте не передаётся, чтобы не плодить N+1 запросы).
    current_user_id — id текущего грузчика для вычисления taken_by_me.
    """
    # Проверяем, может ли грузчик видеть телефон
    if phone_available is None:
        phone_available = (
            balance is not None and balance >= settings.PHONE_VISIBLE_BALANCE
        )

    result = {
        "id": order.id,
        "region": order.region.name if order.region else "",
        "street": order.street,
        "house": order.house,
        "apartment": order.apartment,
        "entrance": order.entrance,
        "floor": order.floor,
        "landmarks": order.landmarks,
        "phone": order.phone if phone_available else None,
        "phone_available": phone_available,
        # Имя заказчика — заполняется в форме «Разместить заказ»
        "customer_name": order.customer_name,
        # Откуда пришёл заказ: «form» (публичная форма) или None (создан админом)
        "source": order.source,
        "price": order.price,
        "hourly_rate": order.hourly_rate,
        "weight": order.weight,
        "category": order.category,
        "urgency": order.urgency,
        "description": order.description,
        # Координаты точки выполнения (для карты и сортировки по расстоянию)
        "latitude": order.latitude,
        "longitude": order.longitude,
        # SQLite хранит naive UTC — помечаем как UTC, чтобы фронтенд
        # не трактовал время как локальное
        "published_at": _to_utc_iso(order.published_at),
        "status": order.status,
        "status_label": STATUS_LABELS.get(order.status, order.status),
        "time_label": time_label(order.published_at),
        # До скольки завершить заказ («HH:MM») и длительность работ
        "deadline": order.deadline,
        "duration_min": order.duration_min,
        "duration_max": order.duration_max,
        # Информация о взятии: заполняется только когда передан taken
        "taken_by": None,
        "taken_by_me": False,
        "arrived_at": None,
    }
    if taken is not None:
        result["taken_by"] = taken.user.name if taken.user else None
        result["taken_by_me"] = bool(current_user_id and taken.user_id == current_user_id)
        result["arrived_at"] = _to_utc_iso(taken.arrived_at) if taken.arrived_at else None
    return result
