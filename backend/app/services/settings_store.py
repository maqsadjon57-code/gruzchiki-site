"""
Хранилище числовых настроек из таблицы settings.

Настройки можно менять через админ-панель (они хранятся в БД),
а значения по умолчанию берутся из конфига (.env).
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import Setting


def get_int_setting(db: Session, key: str, default: int) -> int:
    """Прочитать числовую настройку; при отсутствии/ошибке — default."""
    setting = db.get(Setting, key)
    if setting is None:
        return default
    try:
        return int(setting.value)
    except (TypeError, ValueError):
        return default


def set_int_setting(db: Session, key: str, value: int) -> None:
    """Записать числовую настройку (создаёт, если её ещё нет)."""
    setting = db.get(Setting, key)
    if setting is None:
        db.add(Setting(key=key, value=str(value)))
    else:
        setting.value = str(value)
