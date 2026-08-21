"""
Роутер агрегатора заказов с внешних площадок.

  GET /aggregator/sources — справочник 20+ площадок (ссылки для регистрации);
  GET /aggregator/feed    — живая лента заказов с открытых API (hh.ru, ГрузАгг и др.).

Лента содержит телефоны и адреса клиентов, поэтому доступна только
администратору. Справочник площадок остаётся публичным.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..deps import get_current_admin
from ..services import order_sources

router = APIRouter(prefix="/aggregator", tags=["aggregator"])


@router.get("/sources", summary="Справочник площадок для поиска заказов")
def list_sources() -> dict:
    """Список 20+ сайтов и сервисов, где грузчики находят заказы."""
    live = set(order_sources._FEED_SOURCES.keys())  # noqa: SLF001
    # has_feed отражает реальную доступность (SuperJob — только с ключом API)
    items = [{**s, "has_feed": s.get("has_feed", False) and s["name"] in live} for s in order_sources.SOURCES]
    return {
        "total": len(items),
        "live_sources": list(live),
        "items": items,
    }


@router.get("/feed", summary="Живая лента заказов с площадок (только для администратора)")
def feed(
    query: str = Query("грузчик", description="Поисковый запрос, например: грузчик, подработка, разгрузка"),
    limit: int = Query(60, ge=1, le=500, description="Максимум записей"),
    source: str = Query("all", description="Источник: all, ГрузАгг, hh.ru, trudvsem или SuperJob"),
    _admin=Depends(get_current_admin),
) -> dict:
    """Свежие заказы/вакансии с площадок (телефоны и адреса клиентов — только админ)."""
    return order_sources.fetch_feed(query=query, limit=limit, source=source)
