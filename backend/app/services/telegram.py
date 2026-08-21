"""
Telegram-уведомления для администратора.

Сервис шлёт сообщения в личку админу через Bot API:
  * о новой заявке на оплату (пополнение, доступ к телефонам, ТОП-20)
    с прикреплённым фото/скриншотом чека;
  * о взятии заказа грузчиком;
  * кнопки «Подтвердить / Отклонить» для оплаты.

Если токен бота не настроен (TELEGRAM_BOT_TOKEN пустой) — сервис
молча выключается, и сайт работает без интеграции.
"""
from __future__ import annotations

import json
import logging

import requests

from ..config import settings
from .uploads import file_abs_path

logger = logging.getLogger("gruzchiki.telegram")

API_BASE = "https://api.telegram.org/bot{token}"

# Кэш имени бота (username без @), определённого через getMe.
_bot_username_cache: str | None = None

# Назначения платежей: ключ -> (подпись, эмодзи)
PAYMENT_PURPOSES = {
    "topup": ("пополнение баланса", "💳"),
    "phone_unlock": ("доступ к телефонам заказчиков", "📞"),
    "top20": ("ТОП-20 (1 сутки)", "⭐"),
}


def enabled() -> bool:
    """Бот активен, если заданы токен и chat_id администратора."""
    return bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_ADMIN_CHAT_ID)


def bot_configured() -> bool:
    """Бот вообще настроен (токен есть). Пуш грузчикам работает и без chat_id админа."""
    return bool(settings.TELEGRAM_BOT_TOKEN)


def get_bot_username() -> str:
    """Имя бота (без @) для ссылки «Написать админу» в шапке сайта.

    Приоритет: настройка TELEGRAM_BOT_USERNAME > getMe (кэшируется).
    Если определить не удалось — возвращаем пустую строку (кнопка скрыта).
    """
    global _bot_username_cache
    if settings.TELEGRAM_BOT_USERNAME.strip():
        return settings.TELEGRAM_BOT_USERNAME.strip().lstrip("@")
    if _bot_username_cache is not None:
        return _bot_username_cache
    data = _call("getMe", {})
    username = ""
    if data and data.get("ok"):
        username = ((data.get("result") or {}).get("username") or "").strip()
    _bot_username_cache = username
    return username


def _call(method: str, payload: dict) -> dict | None:
    """Выполнить запрос к Bot API и вернуть JSON (или None при ошибке)."""
    if not bot_configured():
        return None
    try:
        resp = requests.post(f"{API_BASE.format(token=settings.TELEGRAM_BOT_TOKEN)}/{method}",
                             json=payload, timeout=10)
        data = resp.json()
        if not data.get("ok"):
            logger.warning("Telegram API error: %s", data)
        return data
    except Exception as exc:  # сеть недоступна — не роняем сайт
        logger.warning("Telegram request failed: %s", exc)
        return None


def _reply_markup(payment_id: int) -> dict:
    """Кнопки «Подтвердить / Отклонить» для заявки на оплату."""
    return {
        "inline_keyboard": [[
            {"text": "✅ Подтвердить", "callback_data": f"confirm:{payment_id}"},
            {"text": "❌ Отклонить", "callback_data": f"reject:{payment_id}"},
        ]]
    }


def notify_payment(
    payment_id: int,
    user_name: str,
    amount: int,
    receipt_path: str | None,
    purpose: str = "topup",
) -> None:
    """
    Уведомить админа о новой заявке на оплату.

    Если прикреплён чек (фото/скриншот) — отправляем само изображение
    через sendPhoto; PDF — через sendDocument. Без чека — обычное сообщение.
    """
    label, icon = PAYMENT_PURPOSES.get(purpose, (purpose, "💳"))
    caption = (
        f"{icon} Новая заявка #{payment_id}\n\n"
        f"👤 Грузчик: {user_name}\n"
        f"💰 Сумма: {amount} ₽\n"
        f"📌 Назначение: {label}\n\n"
        f"Подтвердите оплату кнопкой ниже."
    )
    base = {
        "chat_id": settings.TELEGRAM_ADMIN_CHAT_ID,
        "reply_markup": _reply_markup(payment_id),
    }

    if receipt_path:
        path = file_abs_path(receipt_path)
        if path.exists():
            content_type = "application/octet-stream"
            ext = path.suffix.lower()
            if ext in (".jpg", ".jpeg", ".png", ".webp"):
                method = "sendPhoto"
                file_field = "photo"
                content_type = "image/jpeg" if ext in (".jpg", ".jpeg") else \
                    ("image/png" if ext == ".png" else "image/webp")
            else:
                method = "sendDocument"
                file_field = "document"
            _call_files(method, {**base, "caption": caption},
                        {file_field: (path.name, path.read_bytes(), content_type)})
            return

    _call("sendMessage", {**base, "text": caption})


def notify_topup(payment_id: int, user_name: str, amount: int, receipt_path: str | None) -> None:
    """Уведомить админа о новой заявке на пополнение баланса (обратная совместимость)."""
    notify_payment(payment_id, user_name, amount, receipt_path, purpose="topup")


def _call_files(method: str, payload: dict, files: dict) -> dict | None:
    """Выполнить multipart-запрос к Bot API (для отправки файлов)."""
    if not enabled():
        return None
    try:
        # В multipart-запросе Telegram ожидает вложенные объекты
        # (reply_markup и т.п.) как JSON-строку, а не Python-словарь:
        # иначе requests сериализует их repr'ом и API отвечает
        # «can't parse reply keyboard markup JSON object».
        data = {
            key: json.dumps(value, ensure_ascii=False)
            if isinstance(value, (dict, list))
            else value
            for key, value in payload.items()
        }
        resp = requests.post(
            f"{API_BASE.format(token=settings.TELEGRAM_BOT_TOKEN)}/{method}",
            data=data,
            files=files,
            timeout=15,
        )
        data = resp.json()
        if not data.get("ok"):
            logger.warning("Telegram API error: %s", data)
        return data
    except Exception as exc:
        logger.warning("Telegram request failed: %s", exc)
        return None


def notify_loaders_new_order(
    order_id: int,
    region: str,
    address: str,
    price: int | None,
    category: str,
    deadline: str | None,
) -> None:
    """
    Push-уведомление подписанным грузчикам о новом заказе в ленте.

    Рассылается всем пользователям с заполненным telegram_chat_id
    (кто нажал кнопку подписки в личном кабинете и написал боту).
    Ошибки доставки не роняют создание заказа.
    """
    if not bot_configured():
        return
    try:
        from sqlalchemy import select
        from ..database import SessionLocal
        from ..models import User

        chat_ids = []
        with SessionLocal() as db:
            chat_ids = list(db.scalars(
                select(User.telegram_chat_id).where(
                    User.telegram_chat_id.is_not(None),
                    User.is_blocked.is_(False),
                )
            )) or []
        if not chat_ids:
            return
        dl = f"до {deadline}" if deadline else "не указан"
        text = (
            f"🚚 Новый заказ в ленте!\n"
            f"🆔 Заказ #{order_id}\n"
            f"📍 Регион: {region}\n"
            f"🏠 Адрес: {address}\n"
            f"💰 Цена: {price} ₽\n"
            f"📦 Категория: {category}\n"
            f"⏱️ Дедлайн: {dl}\n\n"
            f"Открыть ленту: {settings.SITE_URL}"
        )
        url = f"{settings.SITE_URL}/orders/{order_id}"
        markup = {
            "inline_keyboard": [[
                {"text": "📋 Посмотреть заказ", "url": url},
                {"text": "🔕 Отписаться", "callback_data": "unsubscribe"},
            ]]
        }
        for chat_id in chat_ids:
            try:
                _call("sendMessage", {
                    "chat_id": chat_id,
                    "text": text,
                    "reply_markup": markup,
                })
            except Exception:
                logger.warning("Не удалось отправить push грузчику chat_id=%s", chat_id)
    except Exception as exc:
        logger.warning("Рассылка грузчикам не удалась: %s", exc)


def notify_new_order(
    order_id: int,
    region: str,
    address: str,
    price: int | None,
    category: str,
    customer_name: str | None,
    customer_phone: str,
    deadline: str | None,
) -> None:
    """
    Уведомить админа о новом заказе с формы «Разместить заказ».

    В сообщении — адрес, цена, категория, имя и телефон заказчика,
    чтобы админ мог при необходимости связаться с клиентом.
    """
    dl = f"до {deadline}" if deadline else "не указан"
    name = (customer_name or "").strip() or "Не указано"
    text = (
        f"🆕 Новый заказ с сайта!\n"
        f"🆔 Заказ #{order_id}\n"
        f"📍 Регион: {region}\n"
        f"🏠 Адрес: {address}\n"
        f"💰 Цена: {price} ₽\n"
        f"📦 Категория: {category}\n"
        f"👤 Заказчик: {name}\n"
        f"📞 Телефон: {customer_phone}\n"
        f"⏱️ Дедлайн: {dl}\n\n"
        f"Заказ уже опубликован в ленте — грузчики могут его взять."
    )
    _call("sendMessage", {
        "chat_id": settings.TELEGRAM_ADMIN_CHAT_ID,
        "text": text,
    })


def notify_order_taken(order_id: int, user_name: str) -> None:
    """Уведомить админа о том, что заказ взят грузчиком."""
    _call("sendMessage", {
        "chat_id": settings.TELEGRAM_ADMIN_CHAT_ID,
        "text": f"📦 Заказ #{order_id} взят грузчиком {user_name} (комиссия списана).",
    })


def notify_loader_arrived(
    order_id: int,
    loader_name: str,
    loader_phone: str,
    address: str,
    deadline: str | None,
) -> None:
    """
    Уведомить админа, что грузчик прибыл на адрес и начал работу.

    Формат сообщения фиксированный:
      🚚 Грузчик на месте!
      👤 Имя: {грузчик}
      📞 Телефон: {телефон грузчика}
      📍 Адрес: {адрес заказа}
      🆔 Заказ #{id}
      ⏱️ Дедлайн: {deadline}
    """
    dl = f"до {deadline}" if deadline else "не указан"
    text = (
        f"🚚 Грузчик на месте!\n"
        f"👤 Имя: {loader_name}\n"
        f"📞 Телефон: {loader_phone}\n"
        f"📍 Адрес: {address}\n"
        f"🆔 Заказ #{order_id}\n"
        f"⏱️ Дедлайн: {dl}"
    )
    _call("sendMessage", {
        "chat_id": settings.TELEGRAM_ADMIN_CHAT_ID,
        "text": text,
    })


def notify_user_blocked(public_id: str, blocked: bool) -> None:
    """Служебное уведомление о блокировке (для лога в Telegram)."""
    action = "заблокирован" if blocked else "разблокирован"
    _call("sendMessage", {
        "chat_id": settings.TELEGRAM_ADMIN_CHAT_ID,
        "text": f"🚫 Грузчик {public_id} {action}.",
    })
