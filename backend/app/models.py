"""
Модели данных (ORM-классы SQLAlchemy).

Структура базы:
  * Region     — регионы/города, в которых работают грузчики;
  * User       — грузчик (или администратор);
  * Order      — заказ на перевозку (активный, пока не взят/не завершён);
  * Payment    — заявка на пополнение баланса с чеком;
  * TakenOrder — связка «грузчик взял заказ» + комиссия;
  * Setting    — настройки (размер комиссии и т.п.);
  * AdminLog   — лог действий (кто что сделал).
"""
from __future__ import annotations

import random
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """Текущее время в UTC — единый формат времени для всей БД."""
    return datetime.now(timezone.utc)


def generate_user_id() -> str:
    """
    Генерация уникального публичного ID грузчика вида GRUZ-123456.
    Этот ID показывается в профиле и используется админом
    для блокировки пользователя.
    """
    return f"GRUZ-{random.randint(100000, 999999)}"


class Region(Base):
    """Город/регион, в котором публикуются заказы."""

    __tablename__ = "regions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Название региона (города), например «Сургут»
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    # Регион можно скрыть (удалить из выпадающего списка)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    orders: Mapped[list["Order"]] = relationship(back_populates="region")

    def __repr__(self) -> str:  # удобно для логов
        return f"<Region {self.name}>"


class User(Base):
    """Пользователь системы: грузчик или администратор."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Публичный ID, видимый всем, например GRUZ-483920
    public_id: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    # Телефон — основной способ входа
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    # Хеш пароля (PBKDF2), открытый пароль не хранится
    password_hash: Mapped[str] = mapped_column(String(512))
    # Баланс в рублях — с него списывается комиссия за заказ
    balance: Mapped[int] = mapped_column(Integer, default=0)
    # Аватар (фото профиля): относительный путь, напр. avatars/xxx.jpg
    avatar: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # Разблокирован ли доступ к телефонам заказчиков (оплата 200₽, подтверждает админ)
    phone_unlocked: Mapped[bool] = mapped_column(Boolean, default=False)
    # До какого момента действует режим ТОП-20 (ежедневная оплата)
    top20_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Заблокирован ли грузчик админом
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    # Признак администратора
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Telegram chat_id для push-уведомлений о новых заказах (заполняется,
    # когда грузчик нажимает кнопку подписки и пишет боту).
    telegram_chat_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, index=True
    )
    # ID пользователя, по чьей реферальной ссылке зарегистрирован этот грузчик
    referred_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # confirmed_by тоже ссылается на users.id, поэтому явно указываем
    # внешний ключ, по которому строится связь
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="user", foreign_keys="Payment.user_id"
    )
    taken_orders: Mapped[list["TakenOrder"]] = relationship(back_populates="user")
    taken_external_orders: Mapped[list["TakenExternalOrder"]] = relationship(back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.public_id} {self.phone}>"


class Order(Base):
    """Заказ на перевозку. Активен, пока его не возьмут или не завершат."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Привязка к региону (городу)
    region_id: Mapped[int] = mapped_column(ForeignKey("regions.id"), index=True)

    # --- Точный адрес (обязательные поля) ---
    street: Mapped[str] = mapped_column(String(200))       # улица
    house: Mapped[str] = mapped_column(String(30))         # дом
    apartment: Mapped[str | None] = mapped_column(String(30), nullable=True)  # квартира
    entrance: Mapped[str | None] = mapped_column(String(30), nullable=True)   # подъезд
    floor: Mapped[str | None] = mapped_column(String(30), nullable=True)      # этаж
    landmarks: Mapped[str | None] = mapped_column(String(300), nullable=True) # ориентиры
    # Телефон заказчика — скрыт от грузчика, пока баланс < порога
    phone: Mapped[str] = mapped_column(String(20))
    # Имя заказчика — заполняется в форме «Разместить заказ» (для админа)
    customer_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # --- Финансовые условия ---
    price: Mapped[int] = mapped_column(Integer)            # стоимость, руб.
    hourly_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)  # ₽/час
    weight: Mapped[int | None] = mapped_column(Integer, nullable=True)       # вес, кг

    # --- Время выполнения ---
    # Дедлайн: до скольки нужно завершить заказ (время суток «HH:MM»)
    deadline: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Длительность работ: минимум и максимум в минутах (для показа грузчикам)
    duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_max: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # --- Классификация ---
    category: Mapped[str] = mapped_column(String(50), default="прочее")  # тип груза
    urgency: Mapped[bool] = mapped_column(Boolean, default=False)        # срочный?
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Фото груза (путь вида cargo/<uuid>.jpg) — лучше видно объём работ
    photo: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # Координаты точки выполнения (для карты и сортировки по расстоянию).
    # Заполняются через кнопку «Указать моё местоположение» в форме заказа.
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    # Статус: active (активен) / taken (взят грузчиком) / completed (выполнен)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    # Откуда заказ: admin (создан админом) / form (создан заказчиком на сайте)
    source: Mapped[str] = mapped_column(String(20), default="admin", server_default="admin")

    region: Mapped["Region"] = relationship(back_populates="orders")
    taken: Mapped["TakenOrder | None"] = relationship(
        back_populates="order", uselist=False, cascade="all, delete-orphan"
    )
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Order #{self.id} {self.street} {self.house}>"


class Payment(Base):
    """Заявка на пополнение баланса с прикреплённым чеком."""

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)  # сумма пополнения, руб.
    # Путь к файлу чека (скриншот/фото), загруженному грузчиком
    receipt_file: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # Назначение платежа: topup (пополнение баланса) / phone_unlock (доступ к телефонам) / top20 (ТОП-20)
    purpose: Mapped[str] = mapped_column(String(20), default="topup", index=True)
    # Статус: pending (ожидает) / confirmed (подтверждён) / rejected (отклонён)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Кто подтвердил (ID администратора)
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    # Явно указываем, что связь идёт через user_id (не confirmed_by)
    user: Mapped["User"] = relationship(
        back_populates="payments", foreign_keys=[user_id]
    )

    def __repr__(self) -> str:
        return f"<Payment #{self.id} {self.amount}₽ {self.status}>"


class TakenOrder(Base):
    """Запись о том, что грузчик взял заказ (и заплатил комиссию)."""

    __tablename__ = "taken_orders"
    __table_args__ = (UniqueConstraint("order_id", name="uq_taken_order"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Когда грузчик нажал «Я на месте» — прибыл на адрес и начал работу
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Комиссия, списанная с баланса за взятие заказа
    commission: Mapped[int] = mapped_column(Integer, default=100)

    user: Mapped["User"] = relationship(back_populates="taken_orders")
    order: Mapped["Order"] = relationship(back_populates="taken")

    def __repr__(self) -> str:
        return f"<TakenOrder #{self.id} order={self.order_id} user={self.user_id}>"


class TakenExternalOrder(Base):
    """Запись о взятом заказе с площадки (ГрузАгг).

    ext_order_id — id заказа в базе ГрузАгг (в ленте сайта он показывается
    как отрицательный: -(1_000_000 + ext_order_id)). Отрицательные id не
    существуют в таблице orders, поэтому отдельная таблица без внешнего ключа.
    """

    __tablename__ = "taken_external_orders"
    __table_args__ = (UniqueConstraint("ext_order_id", name="uq_taken_external_order"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    ext_order_id: Mapped[int] = mapped_column(Integer, unique=True)
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Когда грузчик нажал «Я на месте» — прибыл на адрес и начал работу
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Комиссия, списанная с баланса за взятие заказа
    commission: Mapped[int] = mapped_column(Integer, default=100)

    user: Mapped["User"] = relationship(back_populates="taken_external_orders")

    def __repr__(self) -> str:
        return f"<TakenExternalOrder #{self.id} ext_order={self.ext_order_id} user={self.user_id}>"


class Review(Base):
    """Отзыв и оценка (рейтинг) по заказу.

    Один заказ может иметь максимум два отзыва:
      * от заказчика на грузчика (from_role="customer") — публичный рейтинг;
      * от грузчика на заказчика (from_role="loader") — виден администратору.

    Заказчик не является пользователем сайта, поэтому для него хранится
    телефон (from_phone) и оценка id заказчика не нужен.
    """

    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("order_id", "from_role", name="uq_review_order_role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    # Кто оставил отзыв: customer (заказчик) / loader (грузчик)
    from_role: Mapped[str] = mapped_column(String(20), default="customer")
    # ID пользователя, оставившего отзыв (None для заказчика)
    from_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # Телефон заказчика (для from_role="customer") — проверяется при отправке
    from_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Кому отзыв: ID грузчика (для customer) или None (грузчик оценивает заказчика)
    to_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    # Оценка от 1 до 5
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    order: Mapped["Order"] = relationship(back_populates="reviews")
    from_user: Mapped["User | None"] = relationship(foreign_keys=[from_user_id])
    to_user: Mapped["User | None"] = relationship(foreign_keys=[to_user_id])

    def __repr__(self) -> str:
        return f"<Review #{self.id} order={self.order_id} {self.from_role} {self.rating}>"


class PromoCode(Base):
    """Промокод: при регистрации начисляет бонус на баланс."""

    __tablename__ = "promo_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Код, который вводит новый грузчик при регистрации (верхний регистр)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    # Бонус, начисляемый на баланс при активации, руб.
    bonus: Mapped[int] = mapped_column(Integer, default=100)
    # 0 — без ограничений; иначе максимум активаций
    max_uses: Mapped[int] = mapped_column(Integer, default=0)
    uses_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def __repr__(self) -> str:
        return f"<PromoCode {self.code} +{self.bonus}₽>"


class Referral(Base):
    """Реферальная программа: кто кого привёл (аудит начислений бонусов).

    Когда новый грузчик регистрируется с реферальным кодом (публичным ID
    пригласившего, например GRUZ-123456), создаётся запись. Бонус
    REFERRAL_BONUS начисляется пригласившему ОДИН раз — когда приглашённый
    пополнит баланс на сумму >= REFERRAL_TOPUP_MIN (флаг bonus_paid).
    """

    __tablename__ = "referrals"
    __table_args__ = (UniqueConstraint("referred_id", name="uq_referral_referred"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    referrer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    referred_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    # Бонус, начисленный пригласившему, руб. (0, пока не выплачен)
    bonus_amount: Mapped[int] = mapped_column(Integer, default=0)
    # Выплачен ли бонус пригласившему (разово при пополнении приглашённого)
    bonus_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    referrer: Mapped["User"] = relationship(foreign_keys=[referrer_id])
    referred: Mapped["User"] = relationship(foreign_keys=[referred_id])

    def __repr__(self) -> str:
        return f"<Referral {self.referrer_id} -> {self.referred_id} +{self.bonus_amount}₽>"


class Setting(Base):
    """Ключ-значение настроек, изменяемых через админ-панель."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(String(300))

    def __repr__(self) -> str:
        return f"<Setting {self.key}={self.value}>"


class AdminLog(Base):
    """Журнал действий: взятия заказов, подтверждения оплат, блокировки."""

    __tablename__ = "admin_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Кто совершил действие (ID пользователя; 0 — система)
    user_id: Mapped[int] = mapped_column(Integer, index=True, default=0)
    # Краткое описание действия
    action: Mapped[str] = mapped_column(String(120))
    # Дополнительные данные (JSON-строка)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def __repr__(self) -> str:
        return f"<AdminLog #{self.id} {self.action}>"
