"""
Настройки приложения.

Все параметры берутся из переменных окружения (файл .env).
Если переменная не задана — используется значение по умолчанию,
что позволяет запустить проект одной командой без настройки.

Для продакшена достаточно задать DATABASE_URL (PostgreSQL),
JWT_SECRET и реквизиты администратора.
"""
from __future__ import annotations

import os
from pathlib import Path

# Корень бэкенда: папка backend/
BASE_DIR = Path(__file__).resolve().parent.parent

# Папка для загруженных чеков (скриншоты оплаты)
UPLOAD_DIR = BASE_DIR / "uploads" / "receipts"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _env(key: str, default: str = "") -> str:
    """Прочитать переменную окружения (обёртка для краткости)."""
    return os.getenv(key, default)


def _load_env_file(path: Path) -> None:
    """Загрузить KEY=VALUE из файла .env в окружение (без внешних зависимостей).

    Существующие переменные окружения не перезаписываются.
    """
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


# Загружаем backend/.env (если есть) до чтения настроек
_load_env_file(BASE_DIR / ".env")


class Settings:
    """Класс-хранилище настроек приложения."""

    # --- База данных -----------------------------------------------------
    # По умолчанию SQLite (удобно для локального запуска и тестов).
    # Для продакшена укажите, например:
    #   postgresql+psycopg://user:password@localhost:5432/gruzchiki
    DATABASE_URL: str = _env("DATABASE_URL", "sqlite:///./gruzchiki.db")

    # --- Безопасность ----------------------------------------------------
    # Секретный ключ для подписи JWT-токенов. В продакшене обязательно
    # замените на длинную случайную строку!
    JWT_SECRET: str = _env(
        "JWT_SECRET",
        "change-me-in-production-please-7f8c9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = int(_env("JWT_EXPIRE_MINUTES", "10080"))  # 7 дней

    # --- Администратор по умолчанию ---------------------------------------
    # Создаётся при первом запуске (см. seed.py)
    ADMIN_PHONE: str = _env("ADMIN_PHONE", "+70000000000")
    ADMIN_PASSWORD: str = _env("ADMIN_PASSWORD", "admin123")
    ADMIN_NAME: str = _env("ADMIN_NAME", "Администратор")

    # --- Бизнес-правила ---------------------------------------------------
    # Минимальная сумма пополнения баланса, руб.
    MIN_TOPUP_AMOUNT: int = int(_env("MIN_TOPUP_AMOUNT", "100"))
    # Комиссия за взятие заказа, руб. (админ может менять через админ-панель)
    DEFAULT_COMMISSION: int = int(_env("DEFAULT_COMMISSION", "100"))
    # Порог баланса для показа телефона заказчика
    PHONE_VISIBLE_BALANCE: int = int(_env("PHONE_VISIBLE_BALANCE", "100"))
    # Стоимость разблокировки телефонов заказчиков (разово, подтверждает админ)
    PHONE_UNLOCK_AMOUNT: int = int(_env("PHONE_UNLOCK_AMOUNT", "200"))
    # Цена режима ТОП-20 за сутки, руб.
    TOP20_DAILY_PRICE: int = int(_env("TOP20_DAILY_PRICE", "200"))

    # --- Реквизиты для оплаты (Совкомбанк) --------------------------------
    BANK_NAME: str = _env("BANK_NAME", "Совкомбанк")
    BANK_PHONE: str = _env("BANK_PHONE", "+7 923 236-36-62")
    BANK_CARD: str = _env("BANK_CARD", "2200 0000 0000 0000")
    BANK_HOLDER: str = _env("BANK_HOLDER", "Получатель (ФИО)")

    # --- Telegram-бот (опционально) ----------------------------------------
    # Если токен не указан, бот отключён, сайт работает без него.
    TELEGRAM_BOT_TOKEN: str = _env("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_ADMIN_CHAT_ID: str = _env("TELEGRAM_ADMIN_CHAT_ID", "")
    # Имя бота без @ (например gruzchiki_bot). Если не задано — определяется
    # автоматически через getMe при старте (кнопка «Написать админу» в шапке).
    TELEGRAM_BOT_USERNAME: str = _env("TELEGRAM_BOT_USERNAME", "")
    # Публичный адрес сайта — используется в кнопке «Посмотреть заказ»
    # в push-уведомлениях грузчикам (например https://gruzchiki.onrender.com).
    SITE_URL: str = _env("SITE_URL", "http://localhost:5173")

    # --- CORS ---------------------------------------------------------------
    # Разрешённые источники для фронтенда
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in _env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if o.strip()
    ]

    # --- Реферальная программа ----------------------------------------------
    # Бонус пригласившему и новому грузчику за регистрацию по реферальной ссылке
    REFERRAL_BONUS: int = int(_env("REFERRAL_BONUS", "100"))

    # --- Внешние интеграции ------------------------------------------------
    # Ключ API SuperJob (https://api.superjob.ru) — включает SuperJob в админ-ленту.
    # Получить: https://api.superjob.ru/register
    SUPERJOB_API_KEY: str = _env("SUPERJOB_API_KEY", "")
    # Максимум заказов в ленте (публичной и админской)
    FEED_LIMIT: int = int(_env("FEED_LIMIT", "150"))

    # Папка загрузок
    upload_dir = UPLOAD_DIR


settings = Settings()
