"""
Первичное наполнение базы данных.

При первом запуске создаются:
  * администратор (логин/пароль из .env, по умолчанию +70000000000/admin123);
  * список регионов (все основные города России из ТЗ);
  * демонстрационные заказы на сегодня (чтобы лента не была пустой);
  * настройка комиссии по умолчанию.

Функции безопасно вызывать при каждом старте: они не дублируют данные.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, engine
from .models import AdminLog, Order, PromoCode, Region, Setting, User
from .security import hash_password

logger = logging.getLogger("gruzchiki.seed")

# Основные города России (полный список из ТЗ, остальные админ добавляет сам)
CITIES = [
    "Сургут", "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург",
    "Казань", "Нижний Новгород", "Челябинск", "Самара", "Омск",
    "Ростов-на-Дону", "Уфа", "Красноярск", "Пермь", "Воронеж",
    "Волгоград", "Краснодар", "Саратов", "Тюмень", "Тольятти",
    "Ижевск", "Барнаул", "Ульяновск", "Иркутск", "Хабаровск",
    "Ярославль", "Владивосток", "Махачкала", "Томск", "Оренбург",
    "Кемерово", "Новокузнецк", "Рязань", "Астрахань", "Набережные Челны",
    "Пенза", "Липецк", "Киров", "Чебоксары", "Калининград",
    "Брянск", "Курск", "Иваново", "Магнитогорск", "Тверь",
    "Ставрополь", "Белгород", "Сочи", "Нижний Тагил", "Владимир",
    "Архангельск", "Чита", "Смоленск", "Саранск", "Волжский",
    "Грозный", "Стерлитамак", "Кострома", "Петрозаводск", "Дзержинск",
    "Йошкар-Ола", "Братск", "Орёл", "Химки", "Мытищи",
    "Балашиха", "Подольск", "Люберцы", "Красногорск", "Домодедово",
    "Электросталь", "Коломна", "Одинцово", "Серпухов", "Щёлково",
    "Раменское", "Королёв", "Жуковский", "Пушкино", "Ногинск",
    "Воскресенск", "Клин", "Солнечногорск", "Чехов", "Ступино",
    "Кашира", "Орехово-Зуево", "Павловский Посад", "Дмитров", "Егорьевск",
    "Сергиев Посад", "Долгопрудный", "Реутов", "Лобня", "Дубна",
    "Троицк", "Щербинка", "Московский", "Апрелевка", "Голицыно",
    "Кубинка", "Наро-Фоминск", "Можайск", "Волоколамск", "Руза",
    "Истра", "Звенигород", "Краснознаменск", "Власиха", "Котельники",
    "Дзержинский", "Лыткарино", "Видное",
]

# Демонстрационные заказы: улица, дом, кв., подъезд, этаж, телефон,
# цена, ставка, вес, категория, срочность, описание, ориентиры
DEMO_ORDERS = [
    dict(street="Улица Ленина", house="15", apartment="7", entrance="2", floor="5",
         phone="+7 900 123-45-67", price=1500, hourly_rate=600, weight=50,
         category="мебель", urgency=False, landmarks="домофон не работает",
         description="Поднять диван на 5 этаж, без лифта"),
    dict(street="Проспект Мира", house="42", apartment="118", entrance="1", floor="9",
         phone="+7 912 555-44-33", price=1200, hourly_rate=500, weight=30,
         category="бытовая техника", urgency=False, landmarks="магазин «Магнит» рядом",
         description="Стиральная машина из квартиры вниз, 9 этаж, лифт есть"),
    dict(street="Улица Гагарина", house="8", apartment="3", entrance="3", floor="1",
         phone="+7 922 111-22-33", price=2000, hourly_rate=700, weight=120,
         category="стройматериалы", urgency=True, landmarks="частный дом, калитка слева",
         description="Разгрузить ГАЗель со стройматериалами, срочно, 2 человека"),
    dict(street="Улица Пушкина", house="25", apartment="14", entrance="2", floor="4",
         phone="+7 913 777-88-99", price=1800, hourly_rate=650, weight=70,
         category="хрупкие", urgency=False, landmarks="домофон работает, код 15",
         description="Перевезти стеклянный шкаф, аккуратно, хрупкий груз"),
    dict(street="Нефтеюганское шоссе", house="10", apartment="54", entrance="4", floor="3",
         phone="+7 923 444-55-66", price=1000, hourly_rate=450, weight=25,
         category="продукты", urgency=True, landmarks="подъезд со стороны двора",
         description="Занести 10 коробок продуктов, быстро"),
    dict(street="Улица 30 лет Победы", house="77", apartment="201", entrance="1", floor="10",
         phone="+7 950 666-77-88", price=2500, hourly_rate=800, weight=200,
         category="переезд", urgency=False, landmarks="грузовой лифт",
         description="Полный переезд однокомнатной квартиры, нужна машина"),
]


# Колонки, добавляемые при миграции существующей БД: (таблица, колонка, тип)
# SQLAlchemy create_all не изменяет уже созданные таблицы, поэтому недостающие
# колонки добавляем вручную (идемпотентно, через ALTER TABLE ADD COLUMN).
_MIGRATIONS = [
    ("users", "avatar", "VARCHAR(300)"),
    ("users", "phone_unlocked", "BOOLEAN DEFAULT 0"),
    ("users", "top20_until", "DATETIME"),
    ("payments", "purpose", "VARCHAR(20) DEFAULT 'topup'"),
    # Дедлайн «до скольки» и длительность работ (мин./макс., в минутах)
    ("orders", "deadline", "VARCHAR(10)"),
    ("orders", "duration_min", "INTEGER"),
    ("orders", "duration_max", "INTEGER"),
    # Когда грузчик нажал «Я на месте»
    ("taken_orders", "arrived_at", "DATETIME"),
    ("taken_external_orders", "arrived_at", "DATETIME"),
    # Имя заказчика (форма «Разместить заказ») и источник заказа: admin/form
    ("orders", "customer_name", "VARCHAR(120)"),
    ("orders", "source", "VARCHAR(20) DEFAULT 'admin'"),
    # Push-уведомления грузчикам через Telegram-бота (chat_id подписки)
    ("users", "telegram_chat_id", "BIGINT"),
    # Реферальная программа: кто пригласил этого грузчика
    ("users", "referred_by", "INTEGER"),
    # Координаты точки выполнения (для карты и сортировки по расстоянию)
    ("orders", "latitude", "FLOAT"),
    ("orders", "longitude", "FLOAT"),
    # Фото груза в заказе
    ("orders", "photo", "VARCHAR(300)"),
    # Рефералка: разовая выплата бонуса после пополнения приглашённого
    ("referrals", "bonus_paid", "BOOLEAN"),
]


def _migrate_schema() -> None:
    """Добавить новые колонки в существующие таблицы (если их нет)."""
    inspector = inspect(engine)
    existing = {
        table: {col["name"] for col in inspector.get_columns(table)}
        for table in inspector.get_table_names()
    }
    added = 0
    with engine.begin() as conn:
        for table, column, ddl_type in _MIGRATIONS:
            if table in existing and column not in existing[table]:
                conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")
                )
                added += 1
    if added:
        logger.info("Миграция схемы: добавлено колонок: %d", added)


def init_db() -> None:
    """Создать все таблицы (если их ещё нет) и обновить схему существующей БД."""
    Base.metadata.create_all(bind=engine)
    _migrate_schema()
    logger.info("Таблицы базы данных готовы")


def _seed(db: Session) -> None:
    """Заполнить БД стартовыми данными (идемпотентно)."""
    # --- Настройки по умолчанию (идемпотентно) ---
    if db.get(Setting, "commission") is None:
        db.add(Setting(key="commission", value=str(settings.DEFAULT_COMMISSION)))
    if db.get(Setting, "phone_unlock_amount") is None:
        db.add(Setting(key="phone_unlock_amount", value=str(settings.PHONE_UNLOCK_AMOUNT)))
    if db.get(Setting, "top20_price") is None:
        db.add(Setting(key="top20_price", value=str(settings.TOP20_DAILY_PRICE)))
    if db.get(Setting, "urgent_surcharge") is None:
        db.add(Setting(key="urgent_surcharge", value=str(settings.DEFAULT_URGENT_SURCHARGE)))

    # --- Стартовый промокод (идемпотентно) ---
    if db.scalar(select(PromoCode).where(PromoCode.code == "START100")) is None:
        db.add(PromoCode(code="START100", bonus=100, max_uses=0, is_active=True))
        logger.info("Создан стартовый промокод START100 (+100₽)")

    # --- Администратор ---
    # Ищем и по public_id, и по телефону: public_id уникален, а телефон
    # на момент первого запуска мог отличаться от текущего ADMIN_PHONE.
    admin = db.scalar(
        select(User).where(
            (User.public_id == "ADMIN-000001") | (User.phone == settings.ADMIN_PHONE)
        )
    )
    if admin is None:
        admin = User(
            public_id="ADMIN-000001",
            phone=settings.ADMIN_PHONE,
            name=settings.ADMIN_NAME,
            password_hash=hash_password(settings.ADMIN_PASSWORD),
            balance=0,
            is_admin=True,
        )
        db.add(admin)
        db.add(AdminLog(user_id=0, action="seed",
                        details="Создан администратор по умолчанию"))
        logger.info("Создан администратор: %s / %s",
                    settings.ADMIN_PHONE, settings.ADMIN_PASSWORD)
    elif admin.phone != settings.ADMIN_PHONE:
        logger.warning(
            "Администратор найден по public_id, но телефон в БД (%s) "
            "отличается от ADMIN_PHONE (%s)",
            admin.phone, settings.ADMIN_PHONE,
        )

    # --- Регионы ---
    existing = {r.name for r in db.scalars(select(Region)).all()}
    for city in CITIES:
        if city not in existing:
            db.add(Region(name=city))

    db.flush()

    # --- Демонстрационные заказы (только если в БД вообще нет заказов) ---
    order_count = db.scalar(select(Order.id).limit(1))
    if order_count is None:
        surgut = db.scalar(select(Region).where(Region.name == "Сургут"))
        moscow = db.scalar(select(Region).where(Region.name == "Москва"))
        tyumen = db.scalar(select(Region).where(Region.name == "Тюмень"))
        ekb = db.scalar(select(Region).where(Region.name == "Екатеринбург"))
        now = datetime.now(timezone.utc)

        # Распределяем демо-заказы по регионам (в основном Сургут)
        region_plan = [surgut, surgut, surgut, surgut, moscow, tyumen or ekb]
        for i, demo in enumerate(DEMO_ORDERS):
            region = region_plan[i % len(region_plan)]
            if region is None:
                continue
            order = Order(
                region_id=region.id,
                # публикуем в течение дня: от 8:00 до 14:30
                published_at=now.replace(hour=8 + (i * 75) // 60,
                                         minute=(i * 75) % 60, second=0, microsecond=0),
                status="active",
                **{k: v for k, v in demo.items()},
            )
            db.add(order)
        db.add(AdminLog(user_id=0, action="seed",
                        details=f"Созданы демонстрационные заказы ({len(DEMO_ORDERS)} шт.)"))
        logger.info("Созданы демонстрационные заказы")

    db.commit()
    logger.info("База данных наполнена")


def seed(db: Session) -> None:
    """Наполнить БД стартовыми данными (идемпотентно, устойчиво к гонкам).

    При параллельном старте нескольких инстансов (Render поднимает новый
    до остановки старого) оба могут попытаться создать одни и те же строки.
    Ловим IntegrityError, откатываем транзакцию и повторяем — повторный
    проход увидит уже созданные строки и ничего не продублирует.
    """
    try:
        _seed(db)
    except IntegrityError:
        db.rollback()
        logger.warning("Конкурентный старт: повторяем наполнение БД")
        try:
            _seed(db)
        except IntegrityError:
            db.rollback()
            logger.warning(
                "Повторное наполнение тоже столкнулось с гонкой — "
                "недостающие данные будут созданы при следующем старте"
            )
