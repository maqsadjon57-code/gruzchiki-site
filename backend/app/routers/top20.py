"""
Роутер ТОП-20: список грузчиков с активным (оплаченным) режимом ТОП-20.

В список попадают только грузчики, у которых top20_until ещё не истёк.
Рейтинг: сначала по числу выполненных заказов, затем по числу взятых,
при равенстве — по имени.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Review, TakenExternalOrder, TakenOrder, User
from ..schemas import TopUserOut

router = APIRouter(prefix="/top20", tags=["top20"])

TOP_LIMIT = 20


def _naive_utc(dt: datetime | None) -> datetime | None:
    """Убрать часовой пояс (SQLite хранит naive-UTC значения)."""
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


@router.get("", response_model=list[TopUserOut], summary="ТОП-20 грузчиков")
def top20_list(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Грузчики с оплаченным режимом ТОП-20, отсортированные по рейтингу."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    taken_counts = dict(db.execute(
        select(TakenOrder.user_id, func.count(TakenOrder.id))
        .group_by(TakenOrder.user_id)
    ).all())
    for user_id, count in db.execute(
        select(TakenExternalOrder.user_id, func.count(TakenExternalOrder.id))
        .group_by(TakenExternalOrder.user_id)
    ).all():
        taken_counts[user_id] = taken_counts.get(user_id, 0) + count

    completed_counts = dict(db.execute(
        select(TakenOrder.user_id, func.count(TakenOrder.id))
        .where(TakenOrder.completed_at.is_not(None))
        .group_by(TakenOrder.user_id)
    ).all())

    # Рейтинг: средняя оценка и число отзывов от заказчиков
    ratings: dict[int, tuple[float | None, int]] = {
        user_id: (round(float(avg), 2), count)
        for user_id, avg, count in db.execute(
            select(Review.to_user_id, func.avg(Review.rating), func.count(Review.id))
            .where(Review.from_role == "customer")
            .group_by(Review.to_user_id)
        ).all()
    }

    users = db.scalars(
        select(User).where(User.is_active.is_(True), User.is_blocked.is_(False))
    ).all()

    members: list[TopUserOut] = []
    for u in users:
        until = _naive_utc(u.top20_until)
        if until is None or until <= now:
            continue
        members.append(TopUserOut(
            rank=0,
            public_id=u.public_id,
            name=u.name,
            avatar=u.avatar,
            completed=completed_counts.get(u.id, 0),
            taken=taken_counts.get(u.id, 0),
            in_top20=True,
            top20_until=u.top20_until,
            rating_avg=ratings.get(u.id, (None, 0))[0],
            rating_count=ratings.get(u.id, (None, 0))[1],
        ))

    members.sort(key=lambda m: (-m.completed, -m.taken, m.name.lower()))
    top = members[:TOP_LIMIT]
    for i, m in enumerate(top, start=1):
        m.rank = i
    return top
