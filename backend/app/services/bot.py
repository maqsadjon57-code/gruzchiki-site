"""
Telegram-бот для администратора: обработка нажатий на кнопки.

Бот в фоне опрашивает Bot API (long polling) и обрабатывает
callback-кнопки из уведомлений:
  * confirm:<payment_id> — подтвердить оплату (баланс растёт);
  * reject:<payment_id>  — отклонить заявку.

Безопасность: принимать решения может только чат, указанный в
настройке TELEGRAM_ADMIN_CHAT_ID. Остальные запросы игнорируются.

Запуск: python -m app.services.bot  (или автоматически вместе с API,
если токен задан — см. lifespan в main.py).
"""
from __future__ import annotations

import logging
import threading
import time

import requests

from ..config import settings
from ..database import SessionLocal
from ..models import User
from ..routers.admin import _confirm_payment
from .telegram import API_BASE, enabled

logger = logging.getLogger("gruzchiki.telegram-bot")

# Останавливающий флаг для потока бота
_stop = threading.Event()
_thread: threading.Thread | None = None

POLL_TIMEOUT = 30  # long polling, секунды


def _api(method: str, payload: dict) -> dict | None:
    """Вызов Bot API. Возвращает JSON или None при ошибке сети/API."""
    try:
        resp = requests.post(
            f"{API_BASE.format(token=settings.TELEGRAM_BOT_TOKEN)}/{method}",
            json=payload,
            timeout=POLL_TIMEOUT + 10,
        )
        data = resp.json()
        if not data.get("ok"):
            logger.warning("Telegram API error %s: %s", method, data)
        return data
    except Exception as exc:
        logger.warning("Telegram request %s failed: %s", method, exc)
        return None


def _admin_user(db) -> User | None:
    """Первый пользователь с правами администратора (по нему пишем в журнал)."""
    from sqlalchemy import select

    return db.scalar(select(User).where(User.is_admin.is_(True)).order_by(User.id))


def _handle_callback(chat_id: int, callback_id: str, data: str) -> None:
    """Обработать нажатие кнопки confirm:/reject: (только для админа)."""
    # Лишние нажатия (дубль) — тихо игнорируем
    if chat_id != int(settings.TELEGRAM_ADMIN_CHAT_ID):
        logger.warning("Запрос от неавторизованного чата: %s", chat_id)
        _api("answerCallbackQuery", {
            "callback_query_id": callback_id,
            "text": "У вас нет прав администратора",
            "show_alert": True,
        })
        return

    prefix, _, raw_id = data.partition(":")
    if prefix not in ("confirm", "reject") or not raw_id.isdigit():
        return
    payment_id = int(raw_id)

    # Сообщаем, что решение принято (убираем «часики» с кнопки)
    _api("answerCallbackQuery", {"callback_query_id": callback_id})

    try:
        with SessionLocal() as db:
            admin = _admin_user(db)
            if admin is None:
                raise RuntimeError("Администратор не найден в базе")
            payment = _confirm_payment(db, admin, payment_id, approve=(prefix == "confirm"))
            status_text = "подтверждена ✅" if payment.status == "confirmed" else "отклонена ❌"
            purpose_labels = {
                "topup": "Пополнение баланса",
                "phone_unlock": "Доступ к телефонам",
                "top20": "ТОП-20 (сутки)",
            }
            purpose = payment.purpose or "topup"
            text = (
                f"💳 Заявка #{payment.id}: {status_text}\n"
                f"📌 {purpose_labels.get(purpose, purpose)}\n"
                f"👤 {payment.user.name if payment.user else 'грузчик'}\n"
                f"💰 {payment.amount} ₽"
            )
    except Exception as exc:
        text = f"⚠️ Не удалось обработать заявку #{payment_id}: {exc}"
        logger.exception("Ошибка обработки callback %s", data)

    _api("sendMessage", {
        "chat_id": settings.TELEGRAM_ADMIN_CHAT_ID,
        "text": text,
    })


def _handle_message(chat_id: int, text: str) -> None:
    """Ответ на /start: подсказка, как включить уведомления."""
    if text != "/start":
        return
    if chat_id != int(settings.TELEGRAM_ADMIN_CHAT_ID):
        _api("sendMessage", {
            "chat_id": chat_id,
            "text": "Привет! Этот бот — для администратора сервиса. "
                    "Нажмите кнопки в уведомлениях, чтобы подтверждать оплаты.",
        })
        return
    _api("sendMessage", {
        "chat_id": chat_id,
        "text": (
            "✅ Бот администратора работает.\n\n"
            "Сюда приходят уведомления о новых заявках: пополнение баланса, "
            "доступ к телефонам, ТОП-20 — и о взятии заказов. Кнопки в "
            "уведомлении сразу подтверждают или отклоняют оплату."
        ),
    })


def polling_loop() -> None:
    """Основной цикл бота. Блокирующий, завершается по stop()."""
    if not enabled():
        logger.info("Telegram-бот не запущен: не задан TELEGRAM_BOT_TOKEN или TELEGRAM_ADMIN_CHAT_ID")
        return

    offset = 0
    while not _stop.is_set():
        updates = _api("getUpdates", {
            "timeout": POLL_TIMEOUT,
            "offset": offset,
            "allowed_updates": ["message", "callback_query"],
        })
        if updates is None:
            time.sleep(5)
            continue

        for upd in updates.get("result", []):
            update_id = upd.get("update_id", 0)
            offset = max(offset, update_id + 1)

            if "callback_query" in upd:
                cb = upd["callback_query"]
                chat_id = cb.get("message", {}).get("chat", {}).get("id")
                if chat_id is not None:
                    _handle_callback(chat_id, cb.get("id", ""), cb.get("data", ""))
            elif "message" in upd:
                msg = upd["message"]
                chat_id = msg.get("chat", {}).get("id")
                text = (msg.get("text") or "").strip()
                if chat_id is not None and text:
                    _handle_message(chat_id, text)

    logger.info("Telegram-бот остановлен")


def start_bot_thread() -> threading.Thread | None:
    """Запустить бота в фоновом потоке (вызывается при старте API)."""
    global _thread
    if not enabled() or _thread is not None:
        return _thread
    _stop.clear()
    _thread = threading.Thread(target=polling_loop, name="tg-bot", daemon=True)
    _thread.start()
    logger.info("Telegram-бот запущен в фоновом потоке")
    return _thread


def stop_bot_thread() -> None:
    """Попросить поток бота завершиться (при остановке API)."""
    _stop.set()


def main() -> None:
    """Standalone-запуск: python -m app.services.bot"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    if not enabled():
        logger.warning("Бот выключен. Задайте TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID в .env")
        return
    logger.info("Запуск Telegram-бота (Ctrl+C для остановки)...")
    try:
        polling_loop()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
