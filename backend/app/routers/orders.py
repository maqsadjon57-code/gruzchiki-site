"""
Роутер заказов: лента, детали, взятие заказа.

Правила:
  * В ленте показываются ВСЕ активные заказы (независимо от даты
    публикации). Старые активные заказы остаются видимыми, пока их
    не возьмут или не завершат.
  * Телефон заказчика скрыт, пока у грузчика баланс < 100 ₽.
  * Взять заказ можно, только если баланс >= комиссии (по умолчанию 100 ₽);
    комиссия списывается с баланса, заказ помечается как «взят».
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, get_optional_current_user
from ..models import (
    AdminLog,
    Order,
    Region,
    Setting,
    TakenExternalOrder,
    TakenOrder,
    User,
)
from ..schemas import CustomerOrderCreate, MessageOut, OrderListOut, OrderOut
from ..serializers import _to_utc_iso, serialize_order
from ..services import order_sources, telegram
from .ws import broadcast_orders_update

router = APIRouter(prefix="/orders", tags=["orders"])


def _resolve_region(db: Session, region_name: str) -> Region:
    """Найти регион по имени; если нет — создать (то же правило, что у админа)."""
    region = db.scalar(select(Region).where(Region.name == region_name.strip()))
    if region is None:
        region = Region(name=region_name.strip())
        db.add(region)
        db.flush()
    return region


def get_commission(db: Session) -> int:
    """Прочитать текущий размер комиссии из настроек (кэш в конфиге нет — читаем из БД)."""
    setting = db.get(Setting, "commission")
    if setting is None:
        return settings.DEFAULT_COMMISSION
    try:
        return int(setting.value)
    except ValueError:
        return settings.DEFAULT_COMMISSION


def _get_region_counts(db: Session) -> list[dict]:
    """Посчитать количество активных заказов по каждому региону (для фильтра)."""
    rows = db.execute(
        select(Region.name, func.count(Order.id))
        .join(Order, Order.region_id == Region.id)
        .where(Order.status == "active")
        .group_by(Region.name)
        .order_by(func.count(Order.id).desc())
    ).all()
    return [{"region": name, "count": count} for name, count in rows]


def _dt_key(item: dict) -> float:
    """Ключ сортировки по времени публикации (datetime или ISO-строка)."""
    pub = item.get("published_at")
    if isinstance(pub, datetime):
        return pub.replace(tzinfo=None).timestamp()
    try:
        return datetime.fromisoformat(str(pub)).replace(tzinfo=None).timestamp()
    except (TypeError, ValueError):
        return 0.0


def _merged_region_counts(db: Session) -> list[dict]:
    """Счётчики по регионам: локальные заказы + заказы площадки ГрузАгг.

    Сургут — всегда первый (главный город), остальные — по убыванию.
    """
    counts: dict[str, int] = {
        row["region"]: row["count"] for row in _get_region_counts(db)
    }
    for row in order_sources.external_region_counts(limit=50):
        counts[row["region"]] = counts.get(row["region"], 0) + row["count"]
    for row in order_sources.vacancy_region_counts(limit=50):
        counts[row["region"]] = counts.get(row["region"], 0) + row["count"]
    surgut = counts.pop("Сургут", None)
    ordered: list[tuple[str, int]] = []
    if surgut is not None:
        ordered.append(("Сургут", surgut))
    ordered += sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    return [{"region": name, "count": count} for name, count in ordered]


@router.get("", response_model=OrderListOut, summary="Лента заказов (все активные)")
def list_orders(
    region: str | None = Query(None, description="Фильтр по региону (город)"),
    price_from: int | None = Query(None, ge=0),
    price_to: int | None = Query(None, ge=0),
    category: str | None = Query(None),
    urgency: bool | None = Query(None),
    search: str | None = Query(None, description="Поиск по адресу/ключевым словам"),
    sort: str = Query("new", description="new|price_asc|price_desc"),
    db: Session = Depends(get_db),
):
    """
    Список всех активных заказов с фильтрами.

    Если регион не указан — показываются заказы по всем регионам,
    включая реальные заказы площадки ГрузАгг (телефоны скрыты).
    """
    # Базовый запрос: все активные заказы (без фильтра по дате)
    q = (
        select(Order)
        .options(joinedload(Order.region))
        .where(Order.status == "active")
    )

    # --- Применяем фильтры ---
    if region:
        q = q.join(Region, Order.region_id == Region.id).where(Region.name == region)

    if price_from is not None:
        q = q.where(Order.price >= price_from)
    if price_to is not None:
        q = q.where(Order.price <= price_to)
    if category:
        q = q.where(Order.category == category)
    if urgency is not None:
        q = q.where(Order.urgency == urgency)
    if search:
        # Поиск по улице, дому, описанию и ориентирам
        like = f"%{search.strip()}%"
        q = q.where(or_(
            Order.street.ilike(like),
            Order.house.ilike(like),
            Order.description.ilike(like),
            Order.landmarks.ilike(like),
        ))

    # --- Сортировка ---
    if sort == "price_asc":
        q = q.order_by(Order.price.asc())
    elif sort == "price_desc":
        q = q.order_by(Order.price.desc())
    else:  # new — сначала новые
        q = q.order_by(Order.published_at.desc())

    orders = db.scalars(q).all()

    # Локальные заказы + реальные заказы площадки ГрузАгг (без телефонов)
    items: list[dict] = [serialize_order(o, balance=None) for o in orders]
    # Внешняя выборка ограничена: для sort=new хватает 5000 самых свежих,
    # для сортировки по цене берём больше, чтобы топ был представительнее.
    items += order_sources.external_orders_for_feed(
        region=region,
        price_from=price_from,
        price_to=price_to,
        urgency=urgency,
        category=category,
        search=search,
        limit=5000 if sort == "new" else 10000,
        sql_order=sort,
    )
    # Вакансии площадок (hh.ru / Работа России / SuperJob) — те же id-слоты
    items += order_sources.vacancies_for_feed(
        region=region,
        search=search,
        category=category,
        urgency=urgency,
        price_from=price_from,
        price_to=price_to,
        limit=5000 if sort == "new" else 10000,
    )

    # Взятые заказы с площадок из ленты убираем (как и локальные со статусом taken)
    taken_ext_ids = set(db.scalars(select(TakenExternalOrder.ext_order_id)))
    if taken_ext_ids:
        items = [
            it for it in items
            if not it.get("is_external") or (-it["id"] - 1_000_000) not in taken_ext_ids
        ]

    # --- Сортировка объединённой ленты ---
    if sort == "price_asc":
        items.sort(key=lambda it: (it.get("price") is None, it.get("price") or 0))
    elif sort == "price_desc":
        items.sort(key=lambda it: (it.get("price") is None, -(it.get("price") or 0)))
    else:  # new — сначала новые
        items.sort(key=_dt_key, reverse=True)

    items = items[: settings.FEED_LIMIT]

    # Счётчики по регионам для фильтра (по всем активным заказам, без поиска)
    region_counts = _merged_region_counts(db)

    return OrderListOut(
        orders=items,
        total=len(items),
        current_region=region or "",
        region_counts=region_counts,
    )


@router.get("/categories", summary="Список категорий груза")
def list_categories():
    """Фиксированный список категорий для фильтров и формы заказа."""
    return ["мебель", "стройматериалы", "бытовая техника", "хрупкие", "продукты", "переезд", "прочее"]


@router.post("/public", response_model=OrderOut, summary="Разместить заказ (публичная форма)")
async def create_public_order(
    data: CustomerOrderCreate,
    db: Session = Depends(get_db),
):
    """Создать заказ заказчиком через форму на сайте. Авторизация не нужна.

    Заказ сразу публикуется в ленте, администратор получает уведомление
    в Telegram. Поле source заполняется "form", чтобы отличать такие
    заказы от созданных админом вручную.
    """
    region = _resolve_region(db, data.region_name)
    order = Order(
        region_id=region.id,
        street=data.street.strip(),
        house=data.house.strip(),
        apartment=data.apartment,
        entrance=data.entrance,
        floor=data.floor,
        landmarks=data.landmarks,
        phone=data.phone,
        customer_name=data.name,
        price=data.price,
        hourly_rate=data.hourly_rate,
        weight=data.weight,
        deadline=data.deadline,
        duration_min=data.duration_min,
        duration_max=data.duration_max,
        category=data.category,
        urgency=data.urgency,
        description=data.description,
        # Координаты точки выполнения (кнопка «Указать моё местоположение»)
        latitude=data.latitude,
        longitude=data.longitude,
        status="active",
        source="form",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    # Обновляем ленту в реальном времени и уведомляем админа в Telegram
    await broadcast_orders_update(region=region.name)
    # Push-уведомление всем подписанным грузчикам (Telegram)
    telegram.notify_loaders_new_order(
        order_id=order.id,
        region=region.name,
        address=", ".join(filter(None, [order.street, order.house,
                                        order.apartment and f"кв. {order.apartment}"])),
        price=order.price,
        category=order.category,
        deadline=order.deadline,
    )
    telegram.notify_new_order(
        order_id=order.id,
        region=region.name,
        address=", ".join(filter(None, [order.street, order.house,
                                        order.apartment and f"кв. {order.apartment}"])),
        price=order.price,
        category=order.category,
        customer_name=order.customer_name,
        customer_phone=order.phone,
        deadline=order.deadline,
    )

    return OrderOut(**serialize_order(order, balance=None))


@router.get("/{order_id}", response_model=OrderOut, summary="Детали заказа")
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    """
    Детали заказа. Телефон заказчика возвращается только если
    у авторизованного грузчика баланс >= порога.

    Отрицательные id — заказы с площадок (ГрузАгг и т.п.). Детали открываются
    на сайте; телефон заказчика виден только грузчику, который взял заказ.
    """
    if order_id < 0:
        ext_id = -order_id - 1_000_000
        item = order_sources.external_order_detail(ext_id)
        if item is None:
            item = order_sources.vacancy_order_detail(ext_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")
        taken = db.scalar(
            select(TakenExternalOrder).where(TakenExternalOrder.ext_order_id == ext_id)
        )
        if taken is not None:
            item["status"] = "taken"
            item["status_label"] = "взят"
            item["taken_by"] = taken.user.name if taken.user else None
            item["taken_by_me"] = bool(
                current_user is not None and taken.user_id == current_user.id
            )
            item["arrived_at"] = _to_utc_iso(taken.arrived_at) if taken.arrived_at else None
        else:
            item["taken_by"] = None
            item["taken_by_me"] = False
            item["arrived_at"] = None
        customer_phone = item.pop("_customer_phone", None)
        if taken is not None and current_user is not None and taken.user_id == current_user.id:
            # Взявший заказ грузчик видит телефон заказчика
            item["phone"] = customer_phone
            item["phone_available"] = bool(customer_phone)
        else:
            item["phone"] = None
            item["phone_available"] = False
        return OrderOut(**item)
    order = db.scalar(
        select(Order).options(
            joinedload(Order.region),
            joinedload(Order.taken).joinedload(TakenOrder.user),
        ).where(Order.id == order_id)
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")

    # Телефон виден, если: оплачен доступ (phone_unlocked), баланс >= порога
    # или заказ уже взят этим грузчиком.
    balance = current_user.balance if current_user else None
    taken = order.taken
    taken_by_me = taken is not None and current_user is not None and taken.user_id == current_user.id
    phone_available = bool(
        current_user
        and (
            current_user.phone_unlocked
            or (balance is not None and balance >= settings.PHONE_VISIBLE_BALANCE)
            or taken_by_me
        )
    )
    return OrderOut(**serialize_order(
        order,
        balance=balance,
        phone_available=phone_available,
        taken=taken,
        current_user_id=current_user.id if current_user else None,
    ))


@router.post("/{order_id}/take", response_model=MessageOut, summary="Взять заказ (списание комиссии)")
async def take_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Взять заказ:
      1) проверяем, что заказ существует и активен;
      2) проверяем, что баланс >= комиссии;
      3) списываем комиссию, создаём запись TakenOrder;
      4) помечаем заказ как «взят» и оповещаем ленту через WebSocket.
    """
    # --- Внешний заказ с площадки (отрицательный id) ---
    if order_id < 0:
        ext_id = -order_id - 1_000_000
        item = order_sources.external_order_detail(ext_id)
        if item is None:
            item = order_sources.vacancy_order_detail(ext_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")
        taken = db.scalar(
            select(TakenExternalOrder).where(TakenExternalOrder.ext_order_id == ext_id)
        )
        if taken is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail="Заказ уже взят")

        # Вакансия площадки: телефона нет, отклик — по ссылке на самой площадке
        if item.get("external_url"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Это вакансия с площадки: откликнитесь по ссылке на сайте площадки",
            )

        customer_phone = item.get("_customer_phone") or ""
        if not customer_phone.strip():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="У заказа нет контактного телефона заказчика — взять его нельзя",
            )

        commission = get_commission(db)
        if current_user.balance < commission:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Недостаточно средств. Нужно минимум {commission} ₽ на балансе. "
                       f"Пополните баланс и дождитесь подтверждения администратора",
            )

        current_user.balance -= commission
        taken = TakenExternalOrder(
            user_id=current_user.id, ext_order_id=ext_id, commission=commission
        )
        db.add(taken)
        db.add(AdminLog(user_id=current_user.id, action="take_order",
                        details=f"Грузчик {current_user.public_id} взял внешний заказ "
                                f"#{ext_id} ({item.get('source') or 'площадка'}), "
                                f"комиссия {commission}₽"))
        db.commit()

        await broadcast_orders_update(region=item.get("region") or None)
        telegram.notify_order_taken(order_id, current_user.name)

        return MessageOut(
            message="Заказ взят",
            detail={
                "order_id": order_id,
                "commission": commission,
                "balance": current_user.balance,
                # после взятия телефон заказчика открыт
                "customer_phone": customer_phone,
            },
        )

    order = db.scalar(select(Order).where(Order.id == order_id))
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")

    if order.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Заказ уже взят или завершён")

    commission = get_commission(db)
    if current_user.balance < commission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Недостаточно средств. Нужно минимум {commission} ₽ на балансе. "
                   f"Пополните баланс и дождитесь подтверждения администратора",
        )

    # --- Списание комиссии и создание записи ---
    current_user.balance -= commission
    order.status = "taken"

    taken = TakenOrder(user_id=current_user.id, order_id=order.id, commission=commission)
    db.add(taken)
    db.add(AdminLog(user_id=current_user.id, action="take_order",
                    details=f"Грузчик {current_user.public_id} взял заказ #{order.id}, "
                            f"комиссия {commission}₽"))
    db.commit()

    # Оповещаем ленту в реальном времени и админа в Telegram
    await broadcast_orders_update(region=order.region.name if order.region else None)
    telegram.notify_order_taken(order.id, current_user.name)

    return MessageOut(
        message="Заказ взят",
        detail={
            "order_id": order.id,
            "commission": commission,
            "balance": current_user.balance,
            "customer_phone": order.phone,  # после взятия телефон открыт
        },
    )


@router.post("/{order_id}/arrived", response_model=MessageOut,
             summary="Я на месте (грузчик прибыл и начал работу)")
def mark_arrived(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Отметить, что грузчик прибыл на адрес и начал работу.

    Работает и для локальных заказов (положительный id), и для внешних
    (отрицательный id). Отметиться может только грузчик, взявший заказ;
    повторный вызов безопасен и не шлёт дубль-уведомления.
    """
    now = datetime.now(timezone.utc)
    address: str
    deadline: str | None

    if order_id < 0:
        ext_id = -order_id - 1_000_000
        item = order_sources.external_order_detail(ext_id)
        if item is None:
            item = order_sources.vacancy_order_detail(ext_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")
        if item.get("external_url"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Это вакансия с площадки — отметить прибытие нельзя",
            )
        taken = db.scalar(
            select(TakenExternalOrder)
            .options(joinedload(TakenExternalOrder.user))
            .where(TakenExternalOrder.ext_order_id == ext_id)
        )
        if taken is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail="Заказ не взят — отметить прибытие нельзя")
        if taken.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Этот заказ взял другой грузчик")
        address = ", ".join(
            filter(None, [
                item.get("region"), item.get("street"), item.get("house"),
                item.get("apartment") and f"кв. {item.get('apartment')}",
            ])
        ) or item.get("street") or ""
        deadline = item.get("deadline")
        if taken.arrived_at is None:
            taken.arrived_at = now
            db.add(AdminLog(user_id=current_user.id, action="arrived",
                            details=f"Грузчик {current_user.public_id} на месте, "
                                    f"внешний заказ #{ext_id}"))
            db.commit()
            telegram.notify_loader_arrived(
                order_id=order_id,
                loader_name=current_user.name,
                loader_phone=current_user.phone,
                address=address,
                deadline=deadline,
            )
            return MessageOut(message="Вы на месте — уведомление отправлено администратору")
        return MessageOut(message="Вы уже отметились на месте")

    order = db.scalar(
        select(Order)
        .options(joinedload(Order.region))
        .where(Order.id == order_id)
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")
    taken = db.scalar(
        select(TakenOrder)
        .options(joinedload(TakenOrder.user))
        .where(TakenOrder.order_id == order.id)
    )
    if taken is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Заказ не взят — отметить прибытие нельзя")
    if taken.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Этот заказ взял другой грузчик")
    if taken.arrived_at is None:
        taken.arrived_at = now
        db.add(AdminLog(user_id=current_user.id, action="arrived",
                        details=f"Грузчик {current_user.public_id} на месте, заказ #{order.id}"))
        db.commit()
        region = order.region.name if order.region else None
        address = ", ".join(
            filter(None, [region, order.street, order.house,
                          order.apartment and f"кв. {order.apartment}"])
        ) or order.street
        telegram.notify_loader_arrived(
            order_id=order.id,
            loader_name=current_user.name,
            loader_phone=current_user.phone,
            address=address,
            deadline=order.deadline,
        )
        return MessageOut(message="Вы на месте — уведомление отправлено администратору")
    return MessageOut(message="Вы уже отметились на месте")
