"""
Pydantic-схемы: валидация входящих данных и формат ответов API.

Схемы делятся на три группы:
  * входные (RegisterRequest, LoginRequest, OrderCreate, ...);
  * выходные (OrderOut, UserOut, ...);
  * вспомогательные (фильтры, ответы с сообщениями).
"""
from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, computed_field

# ========================== ВХОДНЫЕ ДАННЫЕ ===============================


class RegisterRequest(BaseModel):
    """Регистрация грузчика."""

    phone: str = Field(..., min_length=6, max_length=20, description="Номер телефона")
    name: str = Field(..., min_length=2, max_length=120, description="Имя")
    password: str = Field(..., min_length=6, max_length=128, description="Пароль")
    email: str | None = Field(None, max_length=120, description="Email (необязательно)")
    # Промокод или реферальный код (публичный ID пригласившего, напр. GRUZ-123456)
    promo_code: str | None = Field(
        None, max_length=40, description="Промокод или реферальный код пригласившего"
    )


class LoginRequest(BaseModel):
    """Вход по телефону и паролю."""

    phone: str
    password: str


class OrderCreate(BaseModel):
    """Создание/редактирование заказа (вручную админом или через API)."""

    region_name: str = Field(..., description="Название региона (города)")
    street: str = Field(..., min_length=1, max_length=200)
    house: str = Field(..., min_length=1, max_length=30)
    apartment: str | None = Field(None, max_length=30)
    entrance: str | None = Field(None, max_length=30)
    floor: str | None = Field(None, max_length=30)
    landmarks: str | None = Field(None, max_length=300)
    phone: str = Field(..., min_length=6, max_length=20, description="Телефон заказчика")
    price: int = Field(..., ge=0, description="Стоимость заказа, руб.")
    hourly_rate: int | None = Field(None, ge=0, description="Почасовая ставка, руб./час")
    weight: int | None = Field(None, ge=0, description="Вес груза, кг")
    # До скольки нужно завершить заказ (время суток «HH:MM»)
    deadline: str | None = Field(None, max_length=10, pattern=r"^\d{1,2}:\d{2}$",
                                 description="Дедлайн: до скольки завершить заказ, формат HH:MM")
    # Длительность работ: минимум и максимум в минутах
    duration_min: int | None = Field(None, ge=0, description="Мин. длительность работ, мин.")
    duration_max: int | None = Field(None, ge=0, description="Макс. длительность работ, мин.")
    category: str = "прочее"
    urgency: bool = False
    description: str | None = Field(None, max_length=2000)
    # Координаты точки выполнения (заполняются через кнопку геолокации)
    latitude: float | None = Field(None, ge=-90, le=90, description="Широта")
    longitude: float | None = Field(None, ge=-180, le=180, description="Долгота")


class CustomerOrderCreate(BaseModel):
    """Заказ, размещаемый заказчиком через публичную форму на сайте.

    Поля те же, что у OrderCreate (адрес, вес, категория, цена), плюс
    имя и телефон заказчика. Авторизация не требуется.
    """

    region_name: str = Field(..., min_length=1, max_length=120,
                             description="Название региона (города)")
    name: str = Field(..., min_length=1, max_length=120, description="Имя заказчика")
    phone: str = Field(..., min_length=6, max_length=20, description="Телефон заказчика")
    street: str = Field(..., min_length=1, max_length=200)
    house: str = Field(..., min_length=1, max_length=30)
    apartment: str | None = Field(None, max_length=30)
    entrance: str | None = Field(None, max_length=30)
    floor: str | None = Field(None, max_length=30)
    landmarks: str | None = Field(None, max_length=300)
    price: int = Field(..., ge=0, description="Стоимость заказа, руб.")
    hourly_rate: int | None = Field(None, ge=0, description="Почасовая ставка, руб./час")
    weight: int | None = Field(None, ge=0, description="Вес груза, кг")
    deadline: str | None = Field(None, max_length=10, pattern=r"^\d{1,2}:\d{2}$",
                                 description="Дедлайн: до скольки завершить заказ, формат HH:MM")
    duration_min: int | None = Field(None, ge=0, description="Мин. длительность работ, мин.")
    duration_max: int | None = Field(None, ge=0, description="Макс. длительность работ, мин.")
    category: str = "прочее"
    urgency: bool = False
    description: str | None = Field(None, max_length=2000)
    # Координаты точки выполнения (заполняются через кнопку геолокации)
    latitude: float | None = Field(None, ge=-90, le=90, description="Широта")
    longitude: float | None = Field(None, ge=-180, le=180, description="Долгота")


class TopUpRequest(BaseModel):
    """Заявка на пополнение баланса (сумма + чек в виде файла)."""

    amount: int = Field(..., ge=1, description="Сумма пополнения, руб.")


class RegionCreate(BaseModel):
    """Добавление нового региона."""

    name: str = Field(..., min_length=2, max_length=120)


class SettingsUpdate(BaseModel):
    """Обновление настроек (комиссия, цены услуг и т.п.)."""

    commission: int | None = Field(None, ge=0, description="Комиссия за заказ, руб.")
    phone_unlock_amount: int | None = Field(None, ge=1, description="Цена доступа к телефонам, руб.")
    top20_price: int | None = Field(None, ge=1, description="Цена ТОП-20 за сутки, руб.")


# ========================== ВЫХОДНЫЕ ДАННЫЕ ==============================


class OrderOut(BaseModel):
    """Карточка заказа в ленте и в деталях."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    region: str
    street: str
    house: str
    apartment: str | None
    entrance: str | None
    floor: str | None
    landmarks: str | None
    # Телефон заказчика: скрыт (null), если грузчик не оплатил доступ
    phone: str | None = None
    phone_available: bool = False
    # Имя заказчика (заполняется в форме «Разместить заказ», для админа)
    customer_name: str | None = None
    price: int
    hourly_rate: int | None
    weight: int | None
    # До скольки завершить заказ («HH:MM») и длительность (мин./макс., минуты)
    deadline: str | None = None
    duration_min: int | None = None
    duration_max: int | None = None
    category: str
    urgency: bool
    description: str | None
    # Координаты точки выполнения (для карты и сортировки по расстоянию)
    latitude: float | None = None
    longitude: float | None = None
    published_at: datetime
    status: str
    status_label: str = ""
    time_label: str = ""
    # Откуда заказ: локальный заказ сайта или площадка-агрегатор (ГрузАгг и т.п.)
    source: str | None = None
    is_external: bool = False
    # Поля вакансий площадок (hh.ru / Работа России / SuperJob): заголовок,
    # работодатель, зарплата и прямая ссылка на отклик на площадке
    title: str | None = None
    company: str | None = None
    salary_text: str | None = None
    external_url: str | None = None
    # Кто взял заказ (только в деталях/личном кабинете, не в публичной ленте)
    taken_by: str | None = None
    # Взял ли этот заказ текущий грузчик
    taken_by_me: bool = False
    # Когда грузчик нажал «Я на месте» (прибыл и начал работу)
    arrived_at: datetime | None = None


class OrderListOut(BaseModel):
    """Ответ списка заказов: сами заказы + счётчики по регионам."""

    orders: list[OrderOut]
    total: int
    current_region: str | None = None
    region_counts: list[dict]  # [{"region": "Сургут", "count": 8}, ...]


class UserOut(BaseModel):
    """Профиль грузчика (без пароля и секретных полей)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    public_id: str
    phone: str
    email: str | None
    name: str
    balance: int
    # Фото профиля (относительный путь /uploads/avatars/...)
    avatar: str | None = None
    # Доступ к телефонам заказчиков (оплачен и подтверждён админом)
    phone_unlocked: bool = False
    # Режим ТОП-20 активен до этой даты (ежедневная оплата)
    top20_until: datetime | None = None
    is_active: bool
    is_blocked: bool
    is_admin: bool
    created_at: datetime
    # Средняя оценка и количество отзывов (рейтинг грузчика)
    rating_avg: float | None = None
    rating_count: int = 0

    @computed_field
    @property
    def in_top20(self) -> bool:
        """Режим ТОП-20 оплачен и ещё не истёк."""
        if self.top20_until is None:
            return False
        until = self.top20_until
        if until.tzinfo is not None:
            until = until.replace(tzinfo=None)
        return until > datetime.now(timezone.utc).replace(tzinfo=None)


class TokenOut(BaseModel):
    """Ответ на вход/регистрацию: токен + профиль."""

    token: str
    user: UserOut


class PaymentOut(BaseModel):
    """Заявка на пополнение баланса."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: str | None = None
    user_public_id: str | None = None
    amount: int
    receipt_file: str | None
    # Назначение платежа: topup / phone_unlock / top20
    purpose: str = "topup"
    status: str
    created_at: datetime
    confirmed_at: datetime | None = None


class TopUserOut(BaseModel):
    """Позиция в ТОП-20 грузчиков."""

    rank: int
    public_id: str
    name: str
    avatar: str | None = None
    completed: int  # выполнено заказов
    taken: int  # всего взято заказов
    in_top20: bool  # оплачен ли режим ТОП-20 сейчас
    top20_until: datetime | None = None
    # Средняя оценка и количество отзывов (рейтинг грузчика)
    rating_avg: float | None = None
    rating_count: int = 0


class TakenOrderOut(BaseModel):
    """Запись «грузчик взял заказ»."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    commission: int
    taken_at: datetime
    completed_at: datetime | None
    # Когда грузчик отметился «Я на месте» (прибыл и начал работу)
    arrived_at: datetime | None = None
    order: OrderOut | None = None


class StatsOut(BaseModel):
    """Статистика грузчика."""

    total_taken: int
    total_completed: int
    today_taken: int
    week_taken: int
    month_taken: int
    earnings: int  # суммарная стоимость взятых заказов, руб.
    commission_paid: int  # сколько уплачено комиссий, руб.


class MessageOut(BaseModel):
    """Универсальный ответ с сообщением."""

    message: str
    detail: dict | None = None

# ========================== ОТЗЫВЫ И РЕЙТИНГИ ============================


class ReviewCreate(BaseModel):
    """Отзыв заказчика на грузчика (по выполненному заказу)."""

    # Телефон заказчика — сверяется с телефоном в заказе
    phone: str = Field(..., min_length=6, max_length=20, description="Телефон заказчика")
    rating: int = Field(..., ge=1, le=5, description="Оценка от 1 до 5")
    comment: str | None = Field(None, max_length=1000, description="Комментарий")


class ReviewLoaderCreate(BaseModel):
    """Отзыв грузчика на заказчика (по выполненному заказу)."""

    rating: int = Field(..., ge=1, le=5, description="Оценка от 1 до 5")
    comment: str | None = Field(None, max_length=1000, description="Комментарий")


class ReviewOut(BaseModel):
    """Отзыв в ответе API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    from_role: str  # customer / loader
    # Кто оставил отзыв (для customer — имя заказчика из заказа)
    from_name: str | None = None
    rating: int
    comment: str | None
    created_at: datetime


# ========================== ПРОМОКОДЫ ====================================


class PromoCodeCreate(BaseModel):
    """Создание промокода администратором."""

    code: str = Field(..., min_length=2, max_length=40,
                      description="Код (без пробелов, регистр не важен)")
    bonus: int = Field(..., ge=1, description="Бонус на баланс при активации, руб.")
    max_uses: int = Field(0, ge=0, description="Лимит активаций (0 — без ограничений)")


class PromoCodeUpdate(BaseModel):
    """Частичное обновление промокода администратором."""

    bonus: int | None = Field(None, ge=1, description="Бонус на баланс при активации, руб.")
    max_uses: int | None = Field(None, ge=0, description="Лимит активаций (0 — без ограничений)")
    is_active: bool | None = Field(None, description="Включить/выключить промокод")


class PromoCodeOut(BaseModel):
    """Промокод в ответе API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    bonus: int
    max_uses: int
    uses_count: int
    is_active: bool
    created_at: datetime


# ========================== РЕФЕРАЛЬНАЯ ПРОГРАММА ========================


class ReferralOut(BaseModel):
    """Информация о реферальной программе для личного кабинета."""

    # Публичный ID грузчика — это и есть его реферальный код
    code: str
    # Ссылка на регистрацию с этим кодом
    link: str
    # Бонус за каждого приведённого грузчика, руб.
    bonus: int
    # Сколько грузчиков зарегистрировалось по этой ссылке
    referrals_count: int
    # Сколько бонуса всего начислено
    total_bonus: int
