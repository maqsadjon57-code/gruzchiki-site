"""
Роутер авторизации: регистрация и вход.

Регистрация по номеру телефона (SMS-код можно подключить позже —
сейчас достаточно пароля; структура позволяет добавить верификацию).
При регистрации автоматически генерируется уникальный ID профиля
вида GRUZ-123456.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import AdminLog, PromoCode, Referral, User, generate_user_id
from ..schemas import LoginRequest, RegisterRequest, TokenOut, UserOut
from ..security import create_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _build_token_response(user: User) -> TokenOut:
    """Собрать ответ с JWT-токеном и профилем пользователя."""
    return TokenOut(token=create_token(user.id, user.is_admin), user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenOut, summary="Регистрация грузчика")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    """
    Создать нового грузчика.
    Уникальность проверяется по телефону (и email, если указан).
    """
    # Нормализуем телефон: убираем пробелы и скобки для единообразия
    phone = data.phone.strip().replace(" ", "").replace("(", "").replace(")", "").replace("-", "")

    # Проверяем, что телефон ещё не занят
    existing = db.scalar(select(User).where(
        or_(User.phone == phone, User.email == data.email) if data.email else User.phone == phone
    ))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Пользователь с таким телефоном или email уже существует")

    # Создаём пользователя с уникальным публичным ID
    user = User(
        public_id=generate_user_id(),
        phone=phone,
        email=data.email,
        name=data.name.strip(),
        password_hash=hash_password(data.password),
        balance=0,
    )
    db.add(user)
    db.flush()  # получаем id до commit

    # --- Промокод / реферальный код ---
    bonuses = _apply_promo_and_referral(db, user, data.promo_code)

    # Пишем в лог
    db.add(AdminLog(user_id=user.id, action="register",
                    details=f"Зарегистрирован грузчик {user.public_id} ({phone})"
                            + (f"; бонусы: {bonuses}" if bonuses else "")))
    db.commit()
    db.refresh(user)

    return _build_token_response(user)


def _apply_promo_and_referral(
    db: Session, user: User, promo_code: str | None
) -> str:
    """
    Активировать промокод или реферальный код при регистрации.

    В поле promo_code при регистрации грузчик может ввести:
      * промокод из админ-панели (код вида WELCOME-100) — начисляется
        бонус, указанный в промокоде;
      * реферальный код пригласившего (его публичный ID, GRUZ-123456) —
        создаётся запись Referral, а бонус REFERRAL_BONUS начисляется
        пригласившему ОДИН раз, когда приглашённый пополнит баланс на
        сумму >= REFERRAL_TOPUP_MIN и админ подтвердит оплату.

    Вернуть человекочитаемое описание начисленных бонусов (для лога).
    """
    code = (promo_code or "").strip()
    if not code:
        return ""

    # 1) Промокод из админ-панели (регистронезависимо)
    promo = db.scalar(select(PromoCode).where(PromoCode.code == code.upper()))
    if promo is not None:
        if not promo.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Промокод неактивен")
        if promo.max_uses > 0 and promo.uses_count >= promo.max_uses:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Промокод больше не действует (лимит использован)")
        promo.uses_count += 1
        user.balance = (user.balance or 0) + promo.bonus
        db.add(AdminLog(user_id=user.id, action="promo_used",
                        details=f"Активирован промокод {promo.code}: +{promo.bonus}₽"))
        return f"промокод {promo.code} +{promo.bonus}₽"

    # 2) Реферальный код — публичный ID пригласившего.
    #    Бонус НЕ начисляется сразу: запись фиксирует факт приглашения,
    #    а REFERRAL_BONUS пригласивший получит один раз после того, как
    #    приглашённый пополнит баланс на >= REFERRAL_TOPUP_MIN и админ
    #    подтвердит оплату (см. _confirm_payment в admin.py).
    referrer = db.scalar(select(User).where(User.public_id == code.upper()))
    if referrer is not None:
        if referrer.id == user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Нельзя пригласить самого себя")
        if referrer.is_blocked:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Аккаунт пригласившего заблокирован")
        user.referred_by = referrer.id
        db.add(Referral(referrer_id=referrer.id, referred_id=user.id,
                        bonus_amount=0, bonus_paid=False))
        db.add(AdminLog(user_id=user.id, action="referral_used",
                        details=f"Зарегистрирован по рефералке {referrer.public_id}: "
                                f"бонус {settings.REFERRAL_BONUS}₽ после пополнения "
                                f"на >= {settings.REFERRAL_TOPUP_MIN}₽"))
        return (f"рефералка {referrer.public_id}: +{settings.REFERRAL_BONUS}₽ "
                f"после пополнения на >= {settings.REFERRAL_TOPUP_MIN}₽")

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Промокод не найден или недействителен")


@router.post("/login", response_model=TokenOut, summary="Вход по телефону и паролю")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """
    Проверить телефон и пароль, выдать JWT-токен.
    Заблокированные пользователи не могут войти.
    """
    phone = data.phone.strip().replace(" ", "").replace("(", "").replace(")", "").replace("-", "")
    user = db.scalar(select(User).where(User.phone == phone))
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Неверный телефон или пароль")

    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Ваш аккаунт заблокирован администратором. Обратитесь в поддержку")

    db.add(AdminLog(user_id=user.id, action="login", details=f"Вход {user.public_id}"))
    db.commit()

    return _build_token_response(user)
