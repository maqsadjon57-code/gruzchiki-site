"""
Сохранение загруженных файлов: чеков (скриншотов оплаты) и аватаров.

Файлы сохраняются в папку backend/uploads с уникальными именами (UUID),
чтобы исключить конфликты и подмену имён:
  * receipts/ — чеки оплаты (jpg/png/webp/pdf);
  * avatars/  — фото профиля (jpg/png/webp).
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from ..config import settings

# Допустимые расширения и соответствующие им типы
ALLOWED_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 МБ


async def save_receipt(file: UploadFile | None) -> str | None:
    """
    Сохранить файл чека и вернуть относительный путь (для БД).
    Если файл не передан — вернуть None.
    """
    if file is None or not file.filename:
        return None

    # Проверяем тип файла по MIME-типу из запроса
    ext = ALLOWED_EXTENSIONS.get(file.content_type or "")
    if ext is None:
        raise HTTPException(
            status_code=400,
            detail="Недопустимый формат файла. Разрешены: JPG, PNG, WEBP, PDF",
        )

    # Читаем содержимое и проверяем размер
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 10 МБ)")

    # Уникальное имя: uuid + расширение
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = Path(settings.upload_dir) / filename
    dest.write_bytes(content)

    # В БД храним относительный путь для отдачи через /uploads/receipts/...
    return f"receipts/{filename}"


# Допустимые форматы аватаров и максимальный размер
AVATAR_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5 МБ


def file_abs_path(rel_path: str) -> Path:
    """Абсолютный путь к файлу по относительному пути из БД (uploads/...)."""
    return Path(settings.upload_dir).parent / rel_path


async def save_avatar(file: UploadFile) -> str:
    """
    Сохранить фото профиля и вернуть относительный путь (для БД).
    Путь вида avatars/<uuid>.<ext>, отдаётся через /uploads/avatars/...
    """
    if file is None or not file.filename:
        raise HTTPException(status_code=400, detail="Файл не передан")

    ext = AVATAR_EXTENSIONS.get(file.content_type or "")
    if ext is None:
        raise HTTPException(
            status_code=400,
            detail="Недопустимый формат фото. Разрешены: JPG, PNG, WEBP",
        )

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Фото слишком большое (макс. 5 МБ)")

    avatar_dir = Path(settings.upload_dir).parent / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    (avatar_dir / filename).write_bytes(content)

    return f"avatars/{filename}"


# Допустимые форматы фото груза и максимальный размер
PHOTO_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5 МБ


async def save_photo(file: UploadFile | None) -> str | None:
    """
    Сохранить фото груза и вернуть относительный путь (для БД).
    Путь вида cargo/<uuid>.<ext>, отдаётся через /uploads/cargo/...
    Если файл не передан — вернуть None.
    """
    if file is None or not file.filename:
        return None

    ext = PHOTO_EXTENSIONS.get(file.content_type or "")
    if ext is None:
        raise HTTPException(
            status_code=400,
            detail="Недопустимый формат фото. Разрешены: JPG, PNG, WEBP",
        )

    content = await file.read()
    if len(content) > MAX_PHOTO_SIZE:
        raise HTTPException(status_code=400, detail="Фото слишком большое (макс. 5 МБ)")

    cargo_dir = Path(settings.upload_dir).parent / "cargo"
    cargo_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    (cargo_dir / filename).write_bytes(content)

    return f"cargo/{filename}"
