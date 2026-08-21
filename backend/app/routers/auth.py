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

from ..database import get_db
from ..models import AdminLog, User, generate_user_id
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

    # Пишем в лог
    db.add(AdminLog(user_id=user.id, action="register",
                    details=f"Зарегистрирован грузчик {user.public_id} ({phone})"))
    db.commit()
    db.refresh(user)

    return _build_token_response(user)


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
