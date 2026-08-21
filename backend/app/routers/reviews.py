"""
Роутер отзывов и рейтингов.

Правила:
  * Заказчик (без авторизации) оставляет отзыв на грузчика, если заказ
    выполнен (completed) и телефон совпадает с телефоном в заказе.
    Отзыв от заказчика на один заказ — только один.
  * Грузчик (с авторизацией) оставляет отзыв на заказчика, только если
    именно он взял этот заказ и заказ выполнен.
  * Публичные отзывы (от заказчиков) видны всем; отзывы грузчиков
    на заказчиков — только администратору.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..deps import get_current_admin, get_current_user, get_optional_current_user
from ..models import Order, Review, TakenOrder, User
from ..schemas import ReviewCreate, ReviewLoaderCreate, ReviewOut
from ..serializers import serialize_order

router = APIRouter(prefix="/reviews", tags=["reviews"])


def _normalize_phone(phone: str) -> str:
    """Привести телефон к единому виду (как при регистрации)."""
    return phone.strip().replace(" ", "").replace("(", "").replace(")", "").replace("-", "")


def get_loader_rating(db: Session, user_id: int) -> tuple[float | None, int]:
    """Средняя оценка грузчика и количество отзывов (только от заказчиков)."""
    row = db.execute(
        select(
            func.avg(Review.rating),
            func.count(Review.id),
        ).where(
            Review.to_user_id == user_id,
            Review.from_role == "customer",
        )
    ).one()
    avg, count = row[0], row[1]
    if not count:
        return None, 0
    return round(float(avg), 2), int(count)


def _serialize_review(review: Review, from_name: str | None = None) -> ReviewOut:
    """ORM-объект отзыва -> Pydantic-схема (имя автора подставляется отдельно)."""
    return ReviewOut(
        id=review.id,
        order_id=review.order_id,
        from_role=review.from_role,
        from_name=from_name,
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
    )


def _order_for_review(db: Session, order_id: int) -> Order:
    """Заказ, пригодный для отзыва: существует и является локальным."""
    if order_id < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Отзывы доступны только для заказов с сайта")
    order = db.scalar(
        select(Order)
        .options(joinedload(Order.taken).joinedload(TakenOrder.user))
        .where(Order.id == order_id)
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заказ не найден")
    if order.status != "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Оставить отзыв можно только после выполнения заказа")
    return order


@router.post("/orders/{order_id}/review", response_model=ReviewOut,
             summary="Отзыв заказчика на грузчика")
def create_customer_review(
    order_id: int,
    data: ReviewCreate,
    db: Session = Depends(get_db),
):
    """Оценить грузчика после выполнения заказа (по телефону заказчика)."""
    order = _order_for_review(db, order_id)

    # Телефон заказчика должен совпадать с телефоном в заказе
    if _normalize_phone(data.phone) != _normalize_phone(order.phone or ""):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Телефон не совпадает с телефоном в заказе")

    taken = order.taken
    if taken is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Заказ не был взят грузчиком — оценить некого")

    duplicate = db.scalar(select(Review).where(
        Review.order_id == order.id, Review.from_role == "customer"
    ))
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Вы уже оставили отзыв на этот заказ")

    review = Review(
        order_id=order.id,
        from_role="customer",
        from_phone=_normalize_phone(data.phone),
        to_user_id=taken.user_id,
        rating=data.rating,
        comment=data.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    return _serialize_review(review, from_name=order.customer_name or "Заказчик")


@router.post("/orders/{order_id}/review-loader", response_model=ReviewOut,
             summary="Отзыв грузчика на заказчика")
def create_loader_review(
    order_id: int,
    data: ReviewLoaderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Оценить заказчика после выполнения заказа (только взявший грузчик)."""
    order = _order_for_review(db, order_id)

    taken = order.taken
    if taken is None or taken.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Отзыв может оставить только грузчик, взявший заказ")

    duplicate = db.scalar(select(Review).where(
        Review.order_id == order.id, Review.from_role == "loader"
    ))
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Вы уже оставили отзыв на этот заказ")

    review = Review(
        order_id=order.id,
        from_role="loader",
        from_user_id=current_user.id,
        rating=data.rating,
        comment=data.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    return _serialize_review(review, from_name=current_user.name)


@router.get("/orders/{order_id}/reviews", response_model=list[ReviewOut],
            summary="Отзывы по заказу")
def order_reviews(
    order_id: int,
    db: Session = Depends(get_db),
    _current_user: User | None = Depends(get_optional_current_user),
):
    """
    Отзывы по заказу.

    Публично видны только отзывы заказчиков. Отзыв грузчика на заказчика
    получает только администратор.
    """
    if order_id < 0:
        return []
    q = select(Review).where(Review.order_id == order_id)
    reviews = db.scalars(q.order_by(Review.created_at.desc())).all()

    is_admin = bool(_current_user is not None and _current_user.is_admin)
    result = []
    for r in reviews:
        if r.from_role == "loader" and not is_admin:
            continue
        from_name = None
        if r.from_role == "customer":
            order = db.get(Order, r.order_id)
            from_name = order.customer_name if order else None
        elif r.from_user is not None:
            from_name = r.from_user.name
        result.append(_serialize_review(r, from_name=from_name))
    return result


@router.get("/users/{user_id}/reviews", response_model=list[ReviewOut],
            summary="Отзывы о грузчике")
def user_reviews(
    user_id: int,
    db: Session = Depends(get_db),
):
    """Публичные отзывы заказчиков о грузчике (формируют его рейтинг)."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Грузчик не найден")

    reviews = db.scalars(
        select(Review)
        .where(Review.to_user_id == user_id, Review.from_role == "customer")
        .order_by(Review.created_at.desc())
    ).all()
    result = []
    for r in reviews:
        order = db.get(Order, r.order_id)
        from_name = order.customer_name if order else None
        result.append(_serialize_review(r, from_name=from_name))
    return result


@router.get("/admin/reviews", response_model=list[ReviewOut],
            summary="Все отзывы (включая отзывы грузчиков) — для админа")
def admin_all_reviews(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """Полный список отзывов обоих типов (заказчики и грузчики)."""
    reviews = db.scalars(select(Review).order_by(Review.created_at.desc())).all()
    result = []
    for r in reviews:
        order = db.get(Order, r.order_id)
        if r.from_role == "customer":
            from_name = order.customer_name if order else None
        else:
            from_name = r.from_user.name if r.from_user else None
        result.append(_serialize_review(r, from_name=from_name))
    return result
