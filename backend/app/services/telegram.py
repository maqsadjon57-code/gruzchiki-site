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

# Назначения платежей: ключ -> (подпись, эмодзи)
PAYMENT_PURPOSES = {
    "topup": ("пополнение баланса", "💳"),
    "phone_unlock": ("доступ к телефонам заказчиков", "📞"),
    "top20": ("ТОП-20 (1 сутки)", "⭐"),
}


def enabled() -> bool:
    """Бот активен, если заданы токен и chat_id администратора."""
    return bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_ADMIN_CHAT_ID)


def _call(method: str, payload: dict) -> dict | None:
    """Выполнить запрос к Bot API и вернуть JSON (или None при ошибке)."""
    if not enabled():
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
