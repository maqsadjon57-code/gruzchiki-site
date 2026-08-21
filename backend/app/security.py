"""
Безопасность: хеширование паролей и JWT-токены.

Пароли хранятся в виде PBKDF2-SHA256 с солью — это стандартный
алгоритм из стандартной библиотеки Python, не требующий внешних
зависимостей (bcrypt/argon2 не нужны).

JWT-токены подписываются HMAC-SHA256 секретным ключом из настроек.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt

from .config import settings

# --- Хеширование паролей -------------------------------------------------


def hash_password(password: str) -> str:
    """
    Хешировать пароль алгоритмом PBKDF2-SHA256.
    Формат хранения: pbkdf2$<iterations>$<salt_hex>$<hash_hex>
    """
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, 120_000
    )
    return f"pbkdf2${120_000}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """
    Проверить пароль против сохранённого хеша.
    Сравнение выполняется через hmac.compare_digest — защита
    от атак по времени (timing attacks).
    """
    try:
        scheme, iterations, salt_hex, hash_hex = stored.split("$")
        if scheme != "pbkdf2":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(digest.hex(), hash_hex)
    except (ValueError, TypeError):
        return False

# --- JWT-токены -----------------------------------------------------------


def create_token(user_id: int, is_admin: bool) -> str:
    """
    Создать JWT-токен доступа.
    Внутри токена: user_id, is_admin, срок действия.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "admin": is_admin,
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    """
    Расшифровать и проверить JWT-токен.
    Возвращает payload или None, если токен недействителен/просрочен.
    """
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
