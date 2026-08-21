"""
Роутер личного кабинета грузчика:
  * профиль и баланс;
  * заявка на пополнение (с прикреплением чека);
  * история пополнений и списаний;
  * статистика за день/неделю/месяц;
  * список взятых заказов.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import AdminLog, Order, Payment, Referral, TakenExternalOrder, TakenOrder, User
from ..schemas import MessageOut, PaymentOut, ReferralOut, StatsOut, TakenOrderOut, UserOut
from ..routers.reviews import get_loader_rating
from ..serializers import serialize_order
from ..services import order_sources, settings_store, telegram
from ..services.uploads import save_avatar, save_receipt

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=UserOut, summary="Профиль грузчика")
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Вернуть данные профиля: ID, имя, телефон, баланс, статус, рейтинг."""
    rating_avg, rating_count = get_loader_rating(db, current_user.id)
    return UserOut.model_validate(current_user).model_copy(
        update={"rating_avg": rating_avg, "rating_count": rating_count}
    )


@router.post("/topup", response_model=MessageOut, summary="Заявка на пополнение баланса")
async def topup(
    amount: int = Form(..., ge=1, description="Сумма пополнения, руб."),
    receipt: UploadFile | None = File(None, description="Чек (скриншот/фото)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Создать заявку на пополнение баланса.

    Грузчик переводит деньги по реквизитам (Совкомбанк) и прикладывает чек.
    Админ подтверждает заявку вручную — только после этого баланс
    увеличится и откроются телефоны заказчиков.
    """
    if amount < settings.MIN_TOPUP_AMOUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Минимальная сумма пополнения — {settings.MIN_TOPUP_AMOUNT} ₽",
        )

    # Сохраняем файл чека (если приложен)
    receipt_path = await save_receipt(receipt)

    payment = Payment(user_id=current_user.id, amount=amount, receipt_file=receipt_path)
    db.add(payment)
    db.flush()

    db.add(AdminLog(user_id=current_user.id, action="topup_request",
                    details=f"Заявка #{payment.id}: пополнение на {amount}₽"))
    db.commit()

    # Уведомляем админа в Telegram (если бот настроен)
    telegram.notify_topup(payment.id, current_user.name, amount, receipt_path)

    return MessageOut(
        message="Заявка на пополнение отправлена. Администратор проверит чек "
                f"и подтвердит оплату в течение некоторого времени.",
        detail={"payment_id": payment.id, "status": "pending"},
    )


@router.post("/avatar", response_model=UserOut, summary="Загрузить фото профиля")
async def upload_avatar(
    file: UploadFile = File(..., description="Фото профиля (JPG/PNG/WEBP)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Сменить аватар. Файл сохраняется в uploads/avatars, путь — в профиль."""
    current_user.avatar = await save_avatar(file)
    db.add(AdminLog(user_id=current_user.id, action="update_avatar",
                    details=f"Грузчик {current_user.public_id} сменил фото профиля"))
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post("/unlock-phone", response_model=MessageOut, summary="Открыть доступ к телефонам заказчиков")
async def unlock_phone(
    receipt: UploadFile | None = File(None, description="Чек об оплате (или оплата с баланса)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Разблокировать телефоны заказчиков (200 ₽, сумма из настроек).

    Вариант 1 — чек: создаётся заявка на оплату, админ подтверждает
    в Telegram-боте или админ-панели.
    Вариант 2 — без чека: деньги списываются с баланса сразу.
    """
    if current_user.phone_unlocked:
        return MessageOut(message="Доступ к телефонам заказчиков уже открыт",
                          detail={"phone_unlocked": True})

    price = settings_store.get_int_setting(
        db, "phone_unlock_amount", settings.PHONE_UNLOCK_AMOUNT
    )

    if receipt is not None and receipt.filename:
        receipt_path = await save_receipt(receipt)
        payment = Payment(user_id=current_user.id, amount=price,
                          receipt_file=receipt_path, purpose="phone_unlock")
        db.add(payment)
        db.flush()
        db.add(AdminLog(user_id=current_user.id, action="phone_unlock_request",
                        details=f"Заявка #{payment.id}: доступ к телефонам ({price}₽)"))
        db.commit()
        telegram.notify_payment(payment.id, current_user.name, price, receipt_path,
                                purpose="phone_unlock")
        return MessageOut(
            message="Заявка на открытие телефонов отправлена. Администратор "
                    "проверит чек и подтвердит оплату.",
            detail={"payment_id": payment.id, "status": "pending"},
        )

    # Оплата с баланса: списываем сразу и открываем доступ
    if current_user.balance < price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Недостаточно средств. Нужно {price} ₽ — пополните баланс "
                   f"или отправьте чек об оплате.",
        )
    current_user.balance -= price
    current_user.phone_unlocked = True
    db.add(AdminLog(user_id=current_user.id, action="phone_unlock",
                    details=f"Грузчик {current_user.public_id} оплатил доступ "
                            f"к телефонам с баланса ({price}₽)"))
    db.commit()
    return MessageOut(
        message="Доступ к телефонам заказчиков открыт",
        detail={"phone_unlocked": True, "balance": current_user.balance},
    )


@router.post("/top20", response_model=MessageOut, summary="Оплатить режим ТОП-20 (сутки)")
async def top20_pay(
    receipt: UploadFile | None = File(None, description="Чек об оплате (или оплата с баланса)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Активировать режим ТОП-20 на сутки (цена из настроек).

    Вариант 1 — чек: заявка на оплату, подтверждает админ.
    Вариант 2 — без чека: списание с баланса и мгновенная активация.
    Срок продлевается от текущего (если режим ещё активен).
    """
    price = settings_store.get_int_setting(db, "top20_price", settings.TOP20_DAILY_PRICE)

    if receipt is not None and receipt.filename:
        receipt_path = await save_receipt(receipt)
        payment = Payment(user_id=current_user.id, amount=price,
                          receipt_file=receipt_path, purpose="top20")
        db.add(payment)
        db.flush()
        db.add(AdminLog(user_id=current_user.id, action="top20_request",
                        details=f"Заявка #{payment.id}: ТОП-20 на сутки ({price}₽)"))
        db.commit()
        telegram.notify_payment(payment.id, current_user.name, price, receipt_path,
                                purpose="top20")
        return MessageOut(
            message="Заявка на ТОП-20 отправлена. Администратор проверит чек "
                    "и подтвердит оплату.",
            detail={"payment_id": payment.id, "status": "pending"},
        )

    if current_user.balance < price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Недостаточно средств. Нужно {price} ₽ — пополните баланс "
                   f"или отправьте чек об оплате.",
        )
    current_user.balance -= price
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    base = current_user.top20_until
    if base is not None and base.tzinfo is not None:
        base = base.replace(tzinfo=None)
    current_user.top20_until = max(now, base or now) + timedelta(days=1)
    db.add(AdminLog(user_id=current_user.id, action="top20_pay",
                    details=f"Грузчик {current_user.public_id} оплатил ТОП-20 "
                            f"с баланса ({price}₽)"))
    db.commit()
    return MessageOut(
        message="Режим ТОП-20 активирован на сутки",
        detail={"top20_until": current_user.top20_until, "balance": current_user.balance},
    )


@router.get("/referral", response_model=ReferralOut, summary="Моя реферальная ссылка")
def my_referral(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Реферальная программа: «приведи грузчика — получи бонус на баланс».

    Реферальный код грузчика — его публичный ID (например GRUZ-123456).
    Его можно вставить в поле «Промокод» при регистрации нового грузчика.
    """
    count = db.scalar(
        select(func.count(Referral.id)).where(Referral.referrer_id == current_user.id)
    ) or 0
    total = db.scalar(
        select(func.coalesce(func.sum(Referral.bonus_amount), 0))
        .where(Referral.referrer_id == current_user.id)
    ) or 0
    return ReferralOut(
        code=current_user.public_id,
        link=f"{settings.SITE_URL}/register?ref={current_user.public_id}",
        bonus=settings.REFERRAL_BONUS,
        referrals_count=count,
        total_bonus=int(total),
    )


@router.get("/notify-link", summary="Ссылка на push-уведомления в Telegram")
def notify_link(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Push-уведомления о новых заказах через Telegram-бота.

    Возвращает deep-link `https://t.me/<bot>?start=bind_<user_id>`: грузчик
    открывает его, нажимает Start у бота — и его chat_id привязывается к
    аккаунту. С этого момента на телефон приходят уведомления о новых
    заказах, даже если сайт закрыт.
    """
    bot = telegram.get_bot_username()
    if not bot:
        return {"enabled": False, "link": "", "bot": "", "chat_id": None}
    return {
        "enabled": True,
        "link": f"https://t.me/{bot}?start=bind_{current_user.id}",
        "bot": bot,
        "chat_id": current_user.telegram_chat_id,
    }


@router.get("/services", summary="Цены услуг и реквизиты для личного кабинета")
def service_prices(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Цены доступа к телефонам и ТОП-20 (из настроек) + реквизиты банка."""
    return {
        "min_topup": settings.MIN_TOPUP_AMOUNT,
        "phone_unlock_amount": settings_store.get_int_setting(
            db, "phone_unlock_amount", settings.PHONE_UNLOCK_AMOUNT
        ),
        "top20_price": settings_store.get_int_setting(
            db, "top20_price", settings.TOP20_DAILY_PRICE
        ),
        "bank": {
            "name": settings.BANK_NAME,
            "phone": settings.BANK_PHONE,
            "card": settings.BANK_CARD,
            "holder": settings.BANK_HOLDER,
        },
    }


@router.get("/payments", response_model=list[PaymentOut], summary="История пополнений")
def my_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список заявок на пополнение текущего грузчика (от новых к старым)."""
    payments = db.scalars(
        select(Payment)
        .where(Payment.user_id == current_user.id)
        .order_by(Payment.created_at.desc())
    ).all()
    return [
        PaymentOut(
            id=p.id, user_id=p.user_id, user_name=current_user.name,
            user_public_id=current_user.public_id, amount=p.amount,
            receipt_file=p.receipt_file, purpose=p.purpose, status=p.status,
            created_at=p.created_at, confirmed_at=p.confirmed_at,
        )
        for p in payments
    ]


@router.get("/orders", response_model=list[TakenOrderOut], summary="История взятых заказов")
def my_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список заказов, взятых текущим грузчиком, с адресами и суммами.

    Включает и локальные заказы сайта (TakenOrder), и внешние заказы с
    площадок (TakenExternalOrder — ГрузАгг, в ленте отрицательные id).
    Для внешних заказов телефон заказчика отдаётся взявшему грузчику.
    """
    rows = db.scalars(
        select(TakenOrder)
        .options(joinedload(TakenOrder.order).joinedload(Order.region))
        .where(TakenOrder.user_id == current_user.id)
        .order_by(TakenOrder.taken_at.desc())
    ).all()
    # Заказ сериализуем через общий хелпер: телефон открыт, т.к. заказ
    # уже взят грузчиком (комиссия оплачена)
    items = [
        TakenOrderOut(
            id=t.id, order_id=t.order_id, commission=t.commission,
            taken_at=t.taken_at, completed_at=t.completed_at,
            # Когда грузчик отметился «Я на месте» (прибыл и начал работу)
            arrived_at=t.arrived_at,
            # Заказ взят грузчиком — телефон заказчика виден всегда
            order=serialize_order(
                t.order,
                phone_available=True,
                taken=t,
                current_user_id=current_user.id,
            ),
        )
        for t in rows
    ]

    # --- Внешние заказы с площадок (ГрузАгг) ---
    ext_rows = db.scalars(
        select(TakenExternalOrder)
        .where(TakenExternalOrder.user_id == current_user.id)
        .order_by(TakenExternalOrder.taken_at.desc())
    ).all()
    for t in ext_rows:
        ext_id = t.ext_order_id
        # Заказ мог исчезнуть из базы площадки — тогда показываем запись
        # без деталей, но не теряем историю взятия.
        item = order_sources.external_order_detail(ext_id) or {
            "id": -(1_000_000 + ext_id),
            "region": "",
            "street": "",
            "house": "",
            "apartment": None,
            "entrance": None,
            "floor": None,
            "landmarks": None,
            "phone": None,
            "phone_available": False,
            "price": 0,
            "hourly_rate": None,
            "weight": None,
            "category": "",
            "urgency": False,
            "description": None,
            "published_at": datetime.now(timezone.utc),
            "status": "taken",
            "source": "ГрузАгг",
            "is_external": True,
        }
        # Взявший заказ грузчик видит телефон заказчика
        customer_phone = item.pop("_customer_phone", None)
        item["phone"] = customer_phone or ""
        item["phone_available"] = bool(customer_phone)
        item["status"] = "taken"
        item["taken_by"] = current_user.name
        item["taken_by_me"] = True
        item["arrived_at"] = t.arrived_at
        items.append(
            TakenOrderOut(
                id=t.id, order_id=item["id"], commission=t.commission,
                taken_at=t.taken_at, completed_at=None,
                arrived_at=t.arrived_at,
                order=item,
            )
        )

    # Общий список от новых к старым
    items.sort(key=lambda it: it.taken_at or datetime.min, reverse=True)
    return items


@router.get("/stats", response_model=StatsOut, summary="Статистика грузчика")
def my_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Статистика: сколько заказов взято (день/неделя/месяц),
    сколько заработано и сколько уплачено комиссий.
    """
    # SQLite хранит datetime без зоны (naive), PostgreSQL — с зоной (aware).
    # Чтобы сравнения работали на обеих СУБД, приводим всё к naive UTC.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    day_start = now - timedelta(days=1)
    week_start = now - timedelta(weeks=1)
    month_start = now - timedelta(days=30)

    taken = db.scalars(
        select(TakenOrder).where(TakenOrder.user_id == current_user.id)
    ).all()
    # Внешние заказы с площадок учитываем наравне с локальными
    ext_taken = db.scalars(
        select(TakenExternalOrder).where(TakenExternalOrder.user_id == current_user.id)
    ).all()
    all_taken = [*taken, *ext_taken]

    def naive_utc(dt: datetime) -> datetime:
        """Убрать часовой пояс из значения БД (если он есть)."""
        return dt.replace(tzinfo=None) if dt and dt.tzinfo else dt

    total_taken = len(all_taken)
    today = sum(1 for t in all_taken if naive_utc(t.taken_at) >= day_start)
    week = sum(1 for t in all_taken if naive_utc(t.taken_at) >= week_start)
    month = sum(1 for t in all_taken if naive_utc(t.taken_at) >= month_start)
    completed = sum(1 for t in taken if t.completed_at is not None)

    commission_paid = sum(t.commission for t in all_taken)

    # Заработок = суммарная стоимость взятых заказов (локальных и внешних)
    order_ids = [t.order_id for t in taken]
    earnings = 0
    if order_ids:
        earnings = db.scalar(
            select(func.coalesce(func.sum(Order.price), 0)).where(Order.id.in_(order_ids))
        ) or 0
    for t in ext_taken:
        try:
            item = order_sources.external_order_detail(t.ext_order_id)
            if item:
                earnings += int(item.get("price") or 0)
        except Exception:
            # Площадка недоступна — не роняем статистику
            continue

    return StatsOut(
        total_taken=total_taken, total_completed=completed,
        today_taken=today, week_taken=week, month_taken=month,
        earnings=int(earnings), commission_paid=commission_paid,
    )
