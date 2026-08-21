"""
Агрегатор заказов с внешних площадок.

Два режима:
  * «Живая лента» — реальные вакансии/заказы через открытые API
    (hh.ru, «Работа России» / trudvsem.ru). Отклики на них
    происходят на самой площадке, сайт лишь показывает находки.
  * «Справочник площадок» — прямые ссылки на 20+ сервисов,
    где грузчики регистрируются и берут заказы самостоятельно
    (Avito, YouDo, Profi.ru и т.п. блокируют автоматический парсинг,
    поэтому для них — только ссылки и описание).

Ответы внешних API кэшируются на 10 минут, чтобы не нагружать
сторонние сервисы и не тормозить страницу.
"""
from __future__ import annotations

import logging
import os
import re
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from ..config import settings

logger = logging.getLogger("gruzchiki.aggregator")

# --- Внешние API с открытым доступом ---------------------------------------
HH_API = "https://api.hh.ru/vacancies"
TRUDVSEM_API = "https://opendata.trudvsem.ru/api/v1/vacancies"
SUPERJOB_API = "https://api.superjob.ru/2.0/vacancies/"
USER_AGENT = "GruzchikiApp/1.0 (service for movers)"

# Кэш: ключ -> (время истечения, данные)
_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_TTL = 600  # 10 минут

# --- Справочник площадок -----------------------------------------------------
# kind: orders — биржа заказов/заявок, vacancy — вакансии и подработка,
#       profile — профиль исполнителя, telegram — чаты/каналы.
# has_feed: True — есть открытое API, заказы показываются в живой ленте.
SOURCES: list[dict[str, Any]] = [
    {"id": "avito", "name": "Avito", "url": "https://www.avito.ru", "kind": "orders",
     "description": "Крупнейшая доска объявлений: «Услуги» и «Работа» — заказы на перевозки и подработка грузчиком. Есть раздел «Авито Работа»."},
    {"id": "youdo", "name": "YouDo", "url": "https://youdo.com", "kind": "orders",
     "description": "Задания «перенести, поднять, разгрузить» от частных клиентов. Откликайтесь на задачи рядом с вами."},
    {"id": "profi", "name": "Profi.ru", "url": "https://profi.ru", "kind": "profile",
     "description": "Сервис подбора специалистов: создайте профиль, заявки на грузчиков приходят напрямую."},
    {"id": "youla", "name": "Юла", "url": "https://youla.ru", "kind": "orders",
     "description": "Доска объявлений: предложения «нужны грузчики», «помощь при переезде» в вашем городе."},
    {"id": "hh", "name": "hh.ru", "url": "https://hh.ru", "kind": "vacancy", "has_feed": True,
     "description": "Вакансии «грузчик», «грузчик-комплектовщик», разовая подработка. Открытое API — заказы видны в ленте сайта."},
    {"id": "superjob", "name": "SuperJob", "url": "https://www.superjob.ru", "kind": "vacancy", "has_feed": True,
     "description": "Вакансии и подработка для грузчиков, есть мобильное приложение и уведомления. Открытое API — вакансии видны в ленте сайта."},
    {"id": "rabota-ru", "name": "Работа.ру", "url": "https://rabota.ru", "kind": "vacancy",
     "description": "Работа и подработка: грузчик, разнорабочий, склад, переезды."},
    {"id": "gorodrabot", "name": "ГородРабот", "url": "https://gorodrabot.ru", "kind": "vacancy",
     "description": "Вакансии «грузчик» с быстрым откликом, в том числе с ежедневной оплатой."},
    {"id": "zarplata", "name": "Зарплата.ру", "url": "https://www.zarplata.ru", "kind": "vacancy",
     "description": "Работа рядом: склад, магазины, переезды. Фильтр по городу и графику."},
    {"id": "trud", "name": "Trud.com", "url": "https://www.trud.com", "kind": "vacancy",
     "description": "Международная биржа труда: вакансии грузчиков и подработка."},
    {"id": "trudvsem", "name": "Работа России", "url": "https://trudvsem.ru", "kind": "vacancy", "has_feed": True,
     "description": "Государственный портал: официальные вакансии от работодателей. Открытое API — заказы видны в ленте сайта."},
    {"id": "vk-work", "name": "VK Работа", "url": "https://work.vk.com", "kind": "vacancy",
     "description": "Вакансии ВКонтакте: грузчик, разнорабочий, подработка на день."},
    {"id": "yandex-uslugi", "name": "Яндекс Услуги", "url": "https://uslugi.yandex.ru", "kind": "profile",
     "description": "Профиль исполнителя: клиенты оставляют заявки на переезд и перевозку рядом с вами."},
    {"id": "nonstop", "name": "Нон Стоп Грузчик", "url": "https://nonstop-gruzchik.ru", "kind": "orders",
     "description": "Агрегатор заявок на грузчиков по городам, выдача на руки по окончании смены."},
    {"id": "gruzchiki24", "name": "Грузчики24", "url": "https://gruzchiki24.ru", "kind": "orders",
     "description": "Заявки на грузчиков и бригады: переезды, разгрузка, склад."},
    {"id": "vsegruzchiki", "name": "ВсеГрузчики", "url": "https://vsegruzchiki.ru", "kind": "orders",
     "description": "Биржа заказов для грузчиков и бригад по городам России."},
    {"id": "gruzchiki-servis", "name": "Грузчики-Сервис", "url": "https://gruzchiki-servis.ru", "kind": "orders",
     "description": "Заявки на переезды и разгрузку, регистрация исполнителей."},
    {"id": "gruzovichkof", "name": "Грузовичкоф", "url": "https://gruzovichkof.ru", "kind": "vacancy",
     "description": "Вакансии водитель-грузчик и грузчиков в бригады переездов."},
    {"id": "gazelkin", "name": "Газелькин", "url": "https://gazelkin.ru", "kind": "orders",
     "description": "Заказы на перевозки: грузчик-экспедитор в паре с водителем."},
    {"id": "ati", "name": "ATI.SU", "url": "https://ati.su", "kind": "orders",
     "description": "Крупнейшая биржа грузоперевозок: заявки на погрузочно-разгрузочные работы."},
    {"id": "pereezd", "name": "Переезд.ру", "url": "https://pereezd.ru", "kind": "orders",
     "description": "Заказы на квартирные и офисные переезды, работа в бригадах."},
    {"id": "telegram", "name": "Telegram и VK-группы", "url": "https://t.me", "kind": "telegram",
     "description": "Поиск «грузчики [ваш город]»: чаты и каналы с ежедневными заявками на подработку."},
    {"id": "gruzagg-db", "name": "ГрузАгг", "url": "", "kind": "orders", "has_feed": True,
     "description": "Собственная база заказов приложения «ГрузАгг»: 21 площадка (Avito, Юла, YouDo и тематические сайты грузчиков), телефоны клиентов и ставки. Заказы видны в живой ленте."},
]

# Живые источники ленты: id в SOURCES -> функция-загрузчик
_FEED_SOURCES: dict[str, Any] = {}


# --- Утилиты ---------------------------------------------------------------

def _strip_html(text: str) -> str:
    """Убирает HTML-теги и лишние пробелы из описания."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_dt(value: str | None) -> float:
    """ISO-дата -> timestamp для сортировки (неудачные -> 0)."""
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return 0.0


def _salary_text(frm: Any, to: Any, currency: str | None) -> str:
    cur = (currency or "RUR").upper()
    symbol = {"RUR": "₽", "RUB": "₽", "USD": "$", "EUR": "€"}.get(cur, cur)

    def num(v: Any) -> str | None:
        try:
            return f"{int(v):,}".replace(",", " ")
        except (TypeError, ValueError):
            return None

    frm, to = num(frm), num(to)
    if frm and to:
        return f"{frm}–{to} {symbol}"
    if frm:
        return f"от {frm} {symbol}"
    if to:
        return f"до {to} {symbol}"
    return "з/п не указана"


def _cached(key: str, loader):
    """Кэш с TTL: возвращает свежие данные, при ошибке источника — пустой список."""
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    try:
        payload = loader()
    except Exception as exc:  # noqa: BLE001 — источник недоступен, не роняем сайт
        logger.warning("Источник %s недоступен: %s", key, exc)
        return []
    _cache[key] = (now + _CACHE_TTL, payload)
    return payload


# --- Загрузчики живых источников -------------------------------------------

def _fetch_hh(query: str, limit: int) -> list[dict[str, Any]]:
    resp = requests.get(
        HH_API,
        params={
            "text": query,
            "per_page": limit,
            "period": 7,
            "area": 113,  # Россия
            "order_by": "publication_time",
        },
        headers={"User-Agent": USER_AGENT},
        timeout=6,
    )
    resp.raise_for_status()
    data = resp.json()
    items: list[dict[str, Any]] = []
    for it in data.get("items", [])[:limit]:
        salary = it.get("salary") or {}
        snippet = it.get("snippet") or {}
        items.append(
            {
                "id": f"hh-{it.get('id')}",
                "source": "hh.ru",
                "title": it.get("name") or "Вакансия",
                "company": (it.get("employer") or {}).get("name"),
                "area": (it.get("area") or {}).get("name"),
                "salary_text": _salary_text(salary.get("from"), salary.get("to"), salary.get("currency")),
                "description": _strip_html(snippet.get("requirement") or snippet.get("responsibility") or "")[:300],
                "url": it.get("alternate_url"),
                "published_at": it.get("published_at"),
            }
        )
    return items


def _fetch_trudvsem(query: str, limit: int) -> list[dict[str, Any]]:
    resp = requests.get(
        TRUDVSEM_API,
        params={"text": query, "limit": min(limit, 50), "offset": 0},
        headers={"User-Agent": USER_AGENT},
        timeout=8,
    )
    resp.raise_for_status()
    data = resp.json()
    vacancies = (((data or {}).get("results") or {}).get("vacancies")) or []
    items: list[dict[str, Any]] = []
    for raw in vacancies[:limit]:
        v = raw.get("vacancy") or {}
        company = v.get("company") or {}
        if isinstance(company, dict):
            company_name = company.get("name") or company.get("legal_name")
        else:
            company_name = str(company)
        region = v.get("region") or {}
        items.append(
            {
                "id": f"trudvsem-{v.get('id')}",
                "source": "Работа России",
                "title": v.get("job-name") or "Вакансия",
                "company": company_name,
                "area": region.get("name") if isinstance(region, dict) else str(region),
                "salary_text": _salary_text(v.get("salary_min"), v.get("salary_max"), "RUR"),
                "description": _strip_html(str(v.get("snippet") or ""))[:300],
                "url": v.get("url") or "https://trudvsem.ru",
                "published_at": v.get("creation-date"),
            }
        )
    return items


# --- Локальная база «ГрузАгг» ------------------------------------------------
# Заказы, накопленные парсерами приложения «ГрузАгг» (21 площадка: Avito, Юла,
# YouDo, тематические сайты грузчиков). Читаем базу напрямую (read-only)
# и превращаем её в ещё один «живой» источник ленты сайта.
GRUZAGG_DB = os.environ.get("GRUZAGG_DB", "D:/HackerAI/gruzagg/server/orders.db")

# Домашние страницы площадок, откуда ГрузАгг собрал заказ (для кнопки «Открыть»)
_GRUZAGG_SOURCE_URLS: dict[str, str] = {
    "Avito": "https://www.avito.ru",
    "Юла": "https://youla.ru",
    "YouDo": "https://youdo.com",
    "HH.ru": "https://hh.ru",
    "Profi.ru": "https://profi.ru",
    "Работа.ру": "https://rabota.ru",
    "Грузчики24": "http://gruzchiki24.ru/",
    "Перевозка24": "https://perevozka24.ru/",
    "Грузботик": "https://грузботик.рф",
    "Груз-Москва": "https://gruz-moscow.ru/",
    "Куда.ру": "https://kuda.ru/",
    "Вездеход": "https://vezdehod.ru/",
    "Транс-Экспресс": "https://trans-express.ru/",
    "Моб. грузчик": "https://m-gruzchik.ru",
    "Срочный грузчик": "https://srochniy-gruzchik.ru/",
    "Лучшие грузчики": "https://luchshie-gruzchiki.ru/",
    "Груз-сервис": "https://gruz-service.ru/",
    "Переезд-Москва": "https://pereezd-moscow.ru/",
    "Мега-груз": "https://mega-gruz.ru/",
    "Грузоперевозки24": "https://gruzoperevozki24.ru/",
    "Спец-груз": "https://spec-gruz.ru/",
}

# Окончания для простого «стемминга» русских слов:
# грузчик/грузчики/грузчиков/грузчикам сводятся к общему корню
_RU_ENDINGS = (
    "ками", "ями", "ами", "иям", "еям",
    "ов", "ев", "ей", "их", "ий", "ый", "ая", "ое", "ые", "ой",
    "ом", "ем", "ах", "ях", "ам", "ям", "ым", "им",
    "ить", "еть", "ать", "ять", "сть",
    "ит", "ет", "ат", "ят", "ут", "ют",
    "ик", "ек", "ок", "ль", "ка", "ки", "ку", "ко",
    "ы", "и", "а", "я", "е", "у", "ю",
)


def _stem_word(word: str) -> str:
    """Срезает русские окончания, оставляя корень слова (не более 2 срезов)."""
    word = word.lower()
    for _ in range(2):
        for end in _RU_ENDINGS:
            if word.endswith(end) and len(word) - len(end) >= 3:
                word = word[: len(word) - len(end)]
                break
        else:
            break
    return word


def _order_matches(text: str, query: str) -> bool:
    """True, если текст заказа соответствует запросу (по корням слов)."""
    query = (query or "").strip().lower()
    text = (text or "").lower()
    if not query or not text:
        return not bool(query)
        return True
    q_words = re.findall(r"[а-яёa-z0-9]+", query)
    t_words = re.findall(r"[а-яёa-z0-9]+", text)
    for qw in q_words:
        if len(qw) <= 2:
            continue
        qs = _stem_word(qw)
        for tw in t_words:
            ts = _stem_word(tw)
            # корни совпали или пересекаются по общему началу (разгруз/разгрузить)
            if qs == ts:
                return True
            if len(qs) >= 3 and len(ts) >= 3 and (qs.startswith(ts) or ts.startswith(qs)):
                return True
            if len(qs) >= 5 and len(ts) >= 5 and qs[:5] == ts[:5]:
                return True
    return False


def _gruzagg_total() -> int:
    """Число активных заказов в базе ГрузАгг (кэш 60 секунд)."""
    if not GRUZAGG_DB or not os.path.exists(GRUZAGG_DB):
        return 0
    now = time.monotonic()
    key = "gruzagg|total"
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    total = 0
    try:
        con = sqlite3.connect(f"file:{GRUZAGG_DB}?mode=ro", uri=True)
        try:
            row = con.execute("SELECT COUNT(*) FROM orders WHERE status='active'").fetchone()
            total = int(row[0]) if row else 0
        finally:
            con.close()
    except sqlite3.Error as exc:
        logger.warning("Не удалось посчитать заказы ГрузАгг: %s", exc)
    _cache[key] = (now + 60, total)
    return total


def _fetch_gruzagg(query: str, limit: int) -> list[dict[str, Any]]:
    """Свежие заказы из локальной базы ГрузАгг (read-only, окно 72 часа).

    Поиск идёт по корням слов: запрос «разнорабочий» найдёт и
    «разнорабочих», и «разнорабочие». Если совпадений нет —
    показываются самые свежие заказы, чтобы лента не пустовала.
    """
    if not GRUZAGG_DB or not os.path.exists(GRUZAGG_DB):
        return []
    try:
        con = sqlite3.connect(f"file:{GRUZAGG_DB}?mode=ro", uri=True)
    except sqlite3.Error as exc:
        logger.warning("База ГрузАгг недоступна: %s", exc)
        return []
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=72)).strftime("%Y-%m-%d %H:%M:%S.%f")
        rows = con.execute(
            """
            SELECT id, source, address, city, price, duration_min, hourly_rate,
                   weight, category, description, contact_phone, published_at, region
            FROM orders
            WHERE status='active' AND published_at >= ?
                  AND contact_phone IS NOT NULL AND trim(contact_phone) <> ''
            ORDER BY published_at DESC
            LIMIT 60000
            """,
            (cutoff,),
        ).fetchall()
    except sqlite3.Error as exc:
        logger.warning("Ошибка чтения базы ГрузАгг: %s", exc)
        return []
    finally:
        con.close()

    if not rows:
        return []

    indexed: list[tuple[tuple, str]] = []
    for r in rows:
        searchable = " ".join(
            [r[9] or "", r[2] or "", r[8] or "", r[3] or "", r[12] or "", r[1] or ""]
        ).lower()
        indexed.append((r, searchable))

    matched = [r for r, text in indexed if _order_matches(text, query)]
    if not matched:
        matched = [r for r, _ in indexed]

    items: list[dict[str, Any]] = []
    for r in matched[:limit]:
        oid, src, address, city, price, dur, hourly, weight, cat, desc, phone, pub, region = r

        dur_text = ""
        if dur:
            h, m = divmod(int(dur), 60)
            dur_text = f"≈ {h} ч {m} мин" if h else f"≈ {m} мин"
        weight_text = f"{weight:g} кг" if weight else ""
        detail = " · ".join(x for x in [dur_text, weight_text] if x)
        text = re.sub(r"\s+", " ", " ".join(x for x in [desc, address, detail] if x)).strip()[:300]

        salary = f"{int(price):,} ₽".replace(",", " ") if price else ""
        if hourly:
            salary = f"{salary} · {hourly:g} ₽/час" if salary else f"{hourly:g} ₽/час"

        items.append(
            {
                "id": f"gruzagg-{oid}",
                "source": "ГрузАгг",
                "title": f"Заказ — {cat.strip().capitalize()}" if cat and cat.strip() else "Заказ грузчика",
                "company": src,
                "area": region or city,
                "salary_text": salary or None,
                "description": text or None,
                "url": _GRUZAGG_SOURCE_URLS.get(src, ""),
                "published_at": (
                    datetime.fromisoformat(pub).astimezone(timezone.utc).isoformat() if pub else None
                ),
                "contact_phone": phone or None,
            }
        )
    return items


def _gruzagg_conn() -> sqlite3.Connection | None:
    """Read-only подключение к базе ГрузАгг (None, если базы нет)."""
    if not GRUZAGG_DB or not os.path.exists(GRUZAGG_DB):
        return None
    try:
        return sqlite3.connect(f"file:{GRUZAGG_DB}?mode=ro", uri=True)
    except sqlite3.Error as exc:
        logger.warning("База ГрузАгг недоступна: %s", exc)
        return None


def _parse_gruzagg_dt(value: str | None) -> datetime | None:
    """'2026-08-21 12:56:13.218590' (в БД naive UTC) -> aware datetime (UTC)."""
    if not value:
        return None
    value = value.strip()
    if len(value) == 19:  # без микросекунд
        value += ".000000"
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S.%f").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _split_gruzagg_address(
    address: str | None, city: str | None
) -> tuple[str, str, str | None, str | None, str | None]:
    """Разбор строки адреса ГрузАгг вида:
    'Сургут, улица Энтузиастов, 63, кв. 1, подъезд 6, этаж 2'
    или 'Пермь, улица Мира, 45А, частный дом, 1 эт.'.

    Возвращает (street, house, apartment, entrance, floor).
    Город из начала строки снимается (он уезжает в поле region),
    чтобы в карточке не было дубля «Сургут · Сургут, улица …».
    Если строка не похожа на такой формат — вся строка остаётся
    в street, остальные поля пустые (поведение как раньше).
    """
    empty = ("", "", None, None, None)
    raw = (address or "").strip()
    if not raw:
        return empty
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if len(parts) < 2:
        return raw, "", None, None, None
    city_prefix = (city or "").strip()
    if city_prefix and parts[0].lower() == city_prefix.lower():
        parts = parts[1:]
    # После снятия города должны остаться минимум улица и дом
    if len(parts) < 2:
        return raw, "", None, None, None
    street = parts[0]
    house: str | None = None
    apartment: str | None = None
    entrance: str | None = None
    floor: str | None = None

    def _num(seg: str) -> str | None:
        m = re.search(r"\d+", seg)
        return m.group(0) if m else None

    for seg in parts[1:]:
        low = seg.lower()
        if low.startswith(("квартир", "кв")):
            apartment = _num(seg)
        elif low.startswith(("подъезд", "под.", "под ", "п. ")):
            entrance = _num(seg)
        elif low.startswith(("этаж", "эт.", "эт ")) or re.match(r"^\d+\s*эт", low):
            floor = _num(seg)
        elif low.startswith("частн"):
            # «частный дом» — признак частного сектора, сам по себе не дом
            continue
        elif house is None:
            house = seg
        else:
            # Лишний сегмент (например «2 эт.» без слова «этаж») — в floor
            if floor is None and _num(seg):
                floor = _num(seg)
    return street, house or "", apartment, entrance, floor


def _gruzagg_row_to_item(
    row: tuple,
    *,
    start_of_day: datetime,
    with_phone: bool = False,
) -> dict[str, Any]:
    """Строка из БД ГрузАгг -> dict формата OrderOut (id отрицательный).

    Телефон заказчика отдаётся только при with_phone=True (это происходит
    в деталях заказа, который грузчик уже взял); в ленте всегда False.
    Служебный ключ _customer_phone содержит телефон только при with_phone=True
    и удаляется сериализацией наружу.
    """
    (oid, src, address, city, price, dur, hourly, weight,
     cat, urg, desc, phone, pub, region_col) = row
    published = _parse_gruzagg_dt(pub) or start_of_day
    # Лейбл для карточки — по Москве (UTC+3) как fallback: фронтенд всё равно
    # пересчитывает время в часовом поясе браузера.
    moscow = published.astimezone(timezone(timedelta(hours=3)))
    # Адрес ГрузАгг хранится одной строкой «Город, улица, дом, кв. N, …» —
    # разбираем на поля, чтобы карточка показывала улицу без дубля города
    street, house, apartment, entrance, floor = _split_gruzagg_address(address, city)
    return {
        "id": -(1_000_000 + oid),
        "region": (region_col or city or "").strip(),
        "street": street,
        "house": house,
        "apartment": apartment,
        "entrance": entrance,
        "floor": floor,
        "landmarks": None,
        # Публичный телефон всегда скрыт; реальный — только в _customer_phone
        "phone": None,
        "phone_available": False,
        "price": int(price or 0),
        "hourly_rate": int(hourly) if hourly else None,
        "weight": int(weight) if weight else None,
        # Продолжительность работ (мин.), колонка duration_min базы ГрузАгг
        "duration_min": int(dur) if dur else None,
        "duration_max": None,
        "deadline": None,
        "category": (cat or "").strip(),
        "urgency": bool(urg),
        "description": desc or None,
        "published_at": published,
        "status": "active",
        "status_label": "активен",
        "time_label": f"Сегодня, {moscow.hour:02d}:{moscow.minute:02d}",
        "source": "ГрузАгг",
        "is_external": True,
        # Служебный ключ: телефон заказчика (только для взявшего заказ)
        "_customer_phone": phone if with_phone else None,
    }


def external_order_detail(ext_order_id: int) -> dict[str, Any] | None:
    """Заказ ГрузАгг по id базы (положительный) для страницы деталей.

    Возвращает dict формата OrderOut: публичный phone=None, телефон заказчика
    лежит под служебным ключом _customer_phone (отдаётся только взявшему).
    None, если заказа с таким id нет.
    """
    con = _gruzagg_conn()
    if con is None:
        return None
    try:
        row = con.execute(
            """SELECT id, source, address, city, price, duration_min, hourly_rate,
                      weight, category, urgency, description, contact_phone, published_at, region
               FROM orders WHERE id = ?
                     AND contact_phone IS NOT NULL AND trim(contact_phone) <> ''""" ,
            (ext_order_id,),
        ).fetchone()
    except sqlite3.Error as exc:
        logger.warning("Ошибка чтения базы ГрузАгг: %s", exc)
        return None
    finally:
        con.close()
    if row is None:
        return None
    start_of_day = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return _gruzagg_row_to_item(row, start_of_day=start_of_day, with_phone=True)


def external_orders_for_feed(
    *,
    region: str | None = None,
    price_from: int | None = None,
    price_to: int | None = None,
    urgency: bool | None = None,
    category: str | None = None,
    search: str | None = None,
    limit: int = 10000,
    sql_order: str = "new",
) -> list[dict[str, Any]]:
    """Заказы ГрузАгг за сегодня для публичной ленты (формат OrderOut).

    Телефон контактного лица не отдаётся: phone=None, phone_available=False.
    id отрицательный (-(1_000_000 + id базы)), чтобы не пересекаться с
    локальными заказами; source='ГрузАгг', is_external=True.
    Регион/цена/срочность грубо фильтруются в SQL, категория и поиск
    дофильтровываются в Python (стемминг как у локального поиска).
    sql_order: 'new' — самые свежие, 'price_asc'/'price_desc' — по цене
    (выборка в SQL сразу нужного порядка, чтобы топ-150 был представительным).
    """
    con = _gruzagg_conn()
    if con is None:
        return []
    try:
        start_of_day = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        cutoff = start_of_day.strftime("%Y-%m-%d %H:%M:%S.%f")
        sql = """
            SELECT id, source, address, city, price, duration_min, hourly_rate,
                   weight, category, urgency, description, contact_phone, published_at, region
            FROM orders
            WHERE status='active' AND published_at >= ?
                  AND contact_phone IS NOT NULL AND trim(contact_phone) <> ''
        """
        params: list[Any] = [cutoff]
        if region:
            sql += " AND (city = ? OR region = ?)"
            params += [region, region]
        if price_from is not None:
            sql += " AND price >= ?"
            params.append(price_from)
        if price_to is not None:
            sql += " AND price <= ?"
            params.append(price_to)
        if urgency is not None:
            sql += " AND urgency = ?"
            params.append(1 if urgency else 0)
        if category:
            stem = _stem_word(category.strip()).strip()
            if stem and " " not in stem and len(stem) >= 4:
                sql += " AND LOWER(category) LIKE ?"
                params.append(f"%{stem}%")
        if sql_order == "price_asc":
            sql += " ORDER BY price ASC LIMIT ?"
        elif sql_order == "price_desc":
            sql += " ORDER BY price DESC LIMIT ?"
        else:
            sql += " ORDER BY published_at DESC LIMIT ?"
        params.append(int(limit))
        rows = con.execute(sql, params).fetchall()
    except sqlite3.Error as exc:
        logger.warning("Ошибка чтения базы ГрузАгг: %s", exc)
        return []
    finally:
        con.close()

    items: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()  # дедупликация по (город, адрес)
    for r in rows:
        if category and not _order_matches(r[8], category):
            continue
        if search and not _order_matches(
            " ".join([r[2] or "", r[3] or "", r[10] or "", r[8] or ""]), search
        ):
            continue
        if price_from is not None and (r[4] is None or r[4] < price_from):
            continue
        if price_to is not None and (r[4] is None or r[4] > price_to):
            continue
        if urgency is not None and bool(r[9]) != urgency:
            continue
        # Демо-заказы без телефона заказчика не показываем: с ними всё равно
        # нельзя связаться, номер нужен для взятия заказа
        if not (r[11] or "").strip():
            continue
        # В базе встречаются дубликаты одной и той же заявки (одинаковый
        # город и адрес) — в ленте оставляем только самый свежий экземпляр
        key = ((r[3] or "").strip(), (r[2] or "").strip())
        if key in seen:
            continue
        seen.add(key)
        items.append(
            _gruzagg_row_to_item(r, start_of_day=start_of_day, with_phone=False)
        )
    return items


def external_region_counts(limit: int = 30) -> list[dict]:
    """Счётчики заказов ГрузАгг за сегодня по городам (для фильтра регионов)."""
    con = _gruzagg_conn()
    if con is None:
        return []
    try:
        cutoff = (
            datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            .strftime("%Y-%m-%d %H:%M:%S.%f")
        )
        rows = con.execute(
            """
            SELECT COALESCE(NULLIF(city, ''), NULLIF(region, ''), 'Без региона'), COUNT(*)
            FROM orders
            WHERE status='active' AND published_at >= ?
                  AND contact_phone IS NOT NULL AND trim(contact_phone) <> ''
            GROUP BY 1
            ORDER BY COUNT(*) DESC
            LIMIT ?
            """,
            (cutoff, int(limit)),
        ).fetchall()
    except sqlite3.Error as exc:
        logger.warning("Ошибка подсчёта регионов ГрузАгг: %s", exc)
        return []
    finally:
        con.close()
    return [{"region": c, "count": n} for c, n in rows]


def _fetch_superjob(query: str, limit: int) -> list[dict[str, Any]]:
    """Вакансии SuperJob через открытое API 2.0 (ключ из .env)."""
    if not settings.SUPERJOB_API_KEY:
        logger.warning("SUPERJOB_API_KEY не задан — SuperJob недоступен")
        return []
    try:
        resp = requests.get(
            SUPERJOB_API,
            params={"keyword": query, "count": min(limit, 100), "page": 0},
            headers={"X-Api-App-Id": settings.SUPERJOB_API_KEY},
            timeout=6,
        )
    except requests.RequestException as exc:
        logger.warning("SuperJob недоступен: %s", exc)
        return []
    if resp.status_code in (401, 403):
        logger.warning(
            "SuperJob отказал в доступе (HTTP %s) — проверьте SUPERJOB_API_KEY", resp.status_code
        )
        return []
    if not resp.ok:
        logger.warning("SuperJob вернул HTTP %s", resp.status_code)
        return []
    data = resp.json()

    items: list[dict[str, Any]] = []
    for it in data.get("objects", [])[:limit]:
        town = (it.get("town") or {}).get("title", "")
        frm, to = it.get("payment_from") or 0, it.get("payment_to") or 0
        salary_text = None
        if frm or to:
            symbol = {"rub": "₽", "uah": "₴", "uzs": "сум", "eur": "€", "usd": "$"}.get(
                it.get("currency") or "rub", it.get("currency") or "₽"
            )
            if frm and to:
                salary_text = f"{frm:,}–{to:,} {symbol}".replace(",", " ")
            elif frm:
                salary_text = f"от {frm:,} {symbol}".replace(",", " ")
            else:
                salary_text = f"до {to:,} {symbol}".replace(",", " ")
        raw_desc = it.get("vacancyRichText") or it.get("candidat") or ""
        desc = re.sub(r"<[^>]+>", " ", raw_desc)
        desc = re.sub(r"\s+", " ", desc).strip()[:300]
        published = None
        if it.get("date_published"):
            published = datetime.fromtimestamp(int(it["date_published"]), timezone.utc).isoformat()
        items.append(
            {
                "id": f"superjob-{it.get('id')}",
                "source": "SuperJob",
                "title": it.get("profession") or "Вакансия",
                "company": it.get("firm_name") or "",
                "area": town,
                "salary_text": salary_text,
                "description": desc or None,
                "url": it.get("link") or "",
                "published_at": published,
                "contact_phone": None,
            }
        )
    return items


_FEED_SOURCES: dict[str, Any] = {
    "ГрузАгг": _fetch_gruzagg,
    "hh.ru": _fetch_hh,
    "trudvsem": _fetch_trudvsem,
}
# SuperJob подключается к ленте только при заданном ключе API (SUPERJOB_API_KEY в .env)
if settings.SUPERJOB_API_KEY:
    _FEED_SOURCES["SuperJob"] = _fetch_superjob


# --- Публичные функции -----------------------------------------------------

def fetch_feed(query: str = "грузчик", limit: int = 20, source: str = "all") -> dict[str, Any]:
    """Живая лента заказов/вакансий с внешних площадок (с кэшем).

    Каждый источник отдаёт до limit записей, итоговый список обрезается
    до limit — лента получается полнее, чем при старом per_source = limit // n.
    """
    limit = max(1, min(int(limit), 500))

    items: list[dict[str, Any]] = []
    statuses: dict[str, str] = {}

    for name, loader in _FEED_SOURCES.items():
        if source != "all" and source != name:
            continue
        key = f"{name}|{query.lower()}|{limit}"
        batch = _cached(key, lambda n=name, q=query, l=limit: loader(q, l))
        if batch:
            if name == "ГрузАгг":
                statuses[name] = f"в базе {_gruzagg_total():,} заказов".replace(",", " ")
            else:
                statuses[name] = "ok"
        else:
            statuses[name] = "нет данных"
        items.extend(batch)

    items.sort(key=lambda it: _parse_dt(it.get("published_at")), reverse=True)

    return {
        "query": query,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": statuses,
        "items": items[:limit],
    }
