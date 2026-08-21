"""
Подключение к базе данных через SQLAlchemy.

Поддерживаются две СУБД:
  * SQLite  — по умолчанию, для локальной разработки и тестов;
  * PostgreSQL — для продакшена (задайте DATABASE_URL в .env).

Все модели используют переносимые типы колонок, поэтому код работает
с обеими СУБД без изменений.
"""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

# Для SQLite нужен параметр check_same_thread=False, иначе запросы из
# разных потоков (FastAPI работает в многопоточном режиме) упадут.
connect_args: dict = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    # echo=False — не выводить SQL в консоль (шумно);
    # поставьте True, если нужно отлаживать запросы.
    echo=False,
)

# Фабрика сессий. Каждый запрос получает свою сессию (см. deps.py)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Базовый класс всех ORM-моделей."""


def get_db():
    """
    Зависимость FastAPI: выдаёт сессию БД на время запроса
    и гарантированно закрывает её после обработки.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
