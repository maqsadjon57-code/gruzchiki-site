"""
Главный модуль приложения «Грузчики» (FastAPI).

Собирает всё вместе:
  * подключает роутеры (auth, orders, profile, admin, regions, WebSocket);
  * настраивает CORS для фронтенда;
  * раздаёт загруженные чеки из папки uploads;
  * при старте создаёт таблицы и наполняет БД стартовыми данными;
  * запускает фоновую задачу пинга WebSocket-клиентов.

Продакшен (один домен, без отдельного прокси):
  * ApiPrefixMiddleware срезает префикс /api у запросов —
    фронтенд ходит на /api/..., а роутеры зарегистрированы без префикса;
  * FrontendMiddleware раздаёт собранный фронтенд (frontend/dist) с того же
    домена: /api, /ws, /uploads и служебные пути идут в API, а все остальные
    GET-запросы отдают файлы сайта или index.html (SPA-fallback). Это точно
    повторяет поведение Vite-прокси из режима разработки.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import BASE_DIR, settings
from .database import SessionLocal, engine
from .routers import admin, aggregator, auth, orders, profile, regions, reviews, top20, ws
from .seed import init_db, seed
from .services import bot, telegram

# Настройка логирования (в консоль)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("gruzchiki.main")

# Папка с собранным фронтендом (frontend/dist). Если её нет —
# бэкенд работает как чистое API (режим разработки).
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

# Пути, которые идут в API/служебные роуты, а не в SPA
_API_PASS_FIRST_SEGMENTS = {"api", "ws", "uploads", "docs", "redoc", "health"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Действия при запуске и остановке приложения.

    При старте:
      * создаём таблицы и наполняем БД;
      * запускаем фоновую задачу пинга WebSocket.
    """
    logger.info("Инициализация базы данных...")
    init_db()
    with SessionLocal() as db:
        seed(db)

    # Фоновая задача: каждые 30 секунд пинговать WebSocket-клиентов
    task = asyncio.create_task(ws.ping_loop())

    # Telegram-бот для админа (если токен задан в .env)
    bot_thread = bot.start_bot_thread()

    # Имя бота для кнопки «Написать админу» в шапке сайта (best-effort)
    try:
        username = telegram.get_bot_username()
        if username:
            logger.info("Telegram-бот: @%s (кнопка «Написать админу» активна)", username)
    except Exception as exc:
        logger.warning("Не удалось определить имя бота: %s", exc)

    logger.info("Приложение «Грузчики» запущено")
    yield
    # Остановка: отменяем фоновые задачи и останавливаем бота
    task.cancel()
    if bot_thread is not None:
        bot.stop_bot_thread()
    logger.info("Приложение остановлено")


# Создаём экземпляр FastAPI
app = FastAPI(
    title="Грузчики — сервис заказов на перевозку",
    description=(
        "API платформы для грузчиков: лента всех активных заказов, "
        "пополнение баланса, подтверждение оплаты администратором, "
        "взятие заказов."
    ),
    version="1.0.0",
    lifespan=lifespan,
    # Документация API выключена в продакшене (settings.ENABLE_DOCS):
    # /docs, /redoc и /openapi.json отдают 404, если ENABLE_DOCS != true.
    docs_url="/docs" if settings.ENABLE_DOCS else None,
    redoc_url="/redoc" if settings.ENABLE_DOCS else None,
    openapi_url="/openapi.json" if settings.ENABLE_DOCS else None,
)

# Разрешаем запросы с фронтенда (localhost:5173 в режиме разработки)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ApiPrefixMiddleware:
    """
    Срезает префикс /api у HTTP-запросов.

    В разработке это делает Vite-прокси (frontend/vite.config.ts),
    в продакшене фронтенд и бэкенд живут на одном домене без прокси,
    поэтому префикс срезается здесь.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path == "/api":
                scope["path"] = "/"
                scope["raw_path"] = b"/"
            elif path.startswith("/api/"):
                scope["path"] = path[4:]
                raw = scope.get("raw_path", b"")
                if raw.startswith(b"/api/"):
                    scope["raw_path"] = raw[4:]
        await self.app(scope, receive, send)


class FrontendMiddleware:
    """
    Раздаёт собранный фронтенд с того же домена, что и API.

    Повторяет поведение Vite-прокси из разработки:
      * /api, /ws, /uploads и служебные пути (docs, health) → API;
      * остальные GET-запросы → файл из frontend/dist или index.html (SPA).
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        is_get = scope["type"] == "http" and scope["method"] in ("GET", "HEAD")
        if is_get and FRONTEND_DIST.is_dir():
            path = scope.get("path", "")
            raw = path.strip("/")
            first = raw.split("/", 1)[0] if raw else ""
            is_api = path == "/api" or path.startswith("/api/") or path == "/openapi.json"
            is_service = first in _API_PASS_FIRST_SEGMENTS
            if not (is_api or is_service):
                # Сначала ищем реальный файл (css/js/картинки), иначе index.html
                if raw:
                    candidate = (FRONTEND_DIST / raw).resolve()
                    try:
                        candidate.relative_to(FRONTEND_DIST.resolve())
                    except ValueError:
                        candidate = None
                    if candidate is not None and candidate.is_file():
                        await FileResponse(candidate)(scope, receive, send)
                        return
                await FileResponse(FRONTEND_DIST / "index.html")(scope, receive, send)
                return
        await self.app(scope, receive, send)


app.add_middleware(ApiPrefixMiddleware)
app.add_middleware(FrontendMiddleware)

# Раздаём загруженные чеки: /uploads/receipts/имя_файла
app.mount("/uploads", StaticFiles(directory=settings.upload_dir.parent), name="uploads")

# Подключаем роутеры
app.include_router(auth.router)
app.include_router(orders.router)
app.include_router(reviews.router)
app.include_router(profile.router)
app.include_router(admin.router)
app.include_router(regions.router)
app.include_router(top20.router)
app.include_router(aggregator.router)
app.include_router(ws.router)


@app.get("/", tags=["info"])
def root():
    """
    Корневой эндпоинт (без собранного фронтенда): краткая информация об API.

    Если фронтенд собран — корень сайта отдаёт FrontendMiddleware
    (файл index.html), этот эндпоинт остаётся доступен как /api.
    """
    return {
        "name": "Грузчики API",
        "version": "1.0.0",
        **({"docs": "/docs"} if settings.ENABLE_DOCS else {}),
        "endpoints": [
            "/auth/register", "/auth/login",
            "/orders", "/orders/public", "/orders/{id}", "/orders/{id}/take",
            "/profile", "/profile/topup", "/profile/payments",
            "/profile/orders", "/profile/stats",
            "/profile/avatar", "/profile/unlock-phone", "/profile/top20",
            "/reviews", "/reviews/{order_id}", "/admin/reviews",
            "/top20",
            "/admin/users", "/admin/payments", "/admin/orders",
            "/admin/regions", "/admin/settings", "/admin/stats", "/admin/logs",
            "/aggregator/sources", "/aggregator/feed",
            "/ws/feed",
        ],
        "bank": {
            "name": settings.BANK_NAME,
            "phone": settings.BANK_PHONE,
        },
        "telegram": {
            "username": telegram.get_bot_username(),
        },
    }


@app.get("/health", tags=["info"])
def health():
    """Проверка живости сервиса (для мониторинга)."""
    return {"status": "ok"}
