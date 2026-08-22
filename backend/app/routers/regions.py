"""
Публичный роутер регионов.

Отдаёт список городов для фильтра на главной странице
и количество активных заказов по каждому городу.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Order, Region
from ..services import order_sources

router = APIRouter(prefix="/regions", tags=["regions"])


@router.get("", summary="Список регионов (публичный)")
def list_regions(db: Session = Depends(get_db)):
    """
    Активные регионы с количеством активных заказов.
    Используется для выпадающего фильтра на главной странице.
    """
    rows = db.execute(
        select(Region.name, func.count(Order.id))
        .join(Order, Order.region_id == Region.id)
        .where(Region.is_active.is_(True),
               Order.status == "active")
        .group_by(Region.name)
        .order_by(Region.name)
    ).all()

    counts = {name: count for name, count in rows}

    # Добавляем города из базы площадки ГрузАгг (их может не быть в справочнике)
    for ext in order_sources.external_region_counts(limit=50):
        counts[ext["region"]] = counts.get(ext["region"], 0) + ext["count"]

    # Сначала идут регионы с заказами, потом остальные (по алфавиту)
    all_regions = db.scalars(select(Region).where(Region.is_active.is_(True))
                             .order_by(Region.name)).all()

    result = []
    seen = set()
    for r in all_regions:
        result.append({"name": r.name, "orders_count": counts.get(r.name, 0)})
        seen.add(r.name)

    # Новые города, которых нет в справочнике регионов сайта
    for name, count in sorted(counts.items(), key=lambda kv: -kv[1]):
        if name not in seen:
            result.append({"name": name, "orders_count": count})
            seen.add(name)

    # Сортируем: сначала регионы с заказами (Сургут — главный, всегда первый)
    result.sort(key=lambda x: (-1 if x["name"] == "Сургут" else 0, -x["orders_count"], x["name"]))
    return result
