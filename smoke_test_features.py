"""Smoke-тест 7 фич: промокоды/рефералы, отзывы, гео, push-ссылка, админ-статистика + Excel.

Запуск: python smoke_test_features.py  (бэкенд должен быть поднят на 127.0.0.1:8000)
"""
import json
import sys
import time
import urllib.error
import urllib.request

# Бэкенд срезает префикс /api через ApiPrefixMiddleware (prod-режим, фронт раздаётся с того же домена)
BASE = "http://127.0.0.1:8000/api"
# Уникальный суффикс телефонов на запуск, чтобы тест можно было гонять повторно
SUF = str(int(time.time()))[-6:]
P = lambda n: f"+7999{SUF}{n:03d}"
PASSED = 0
FAILED = 0


def req(method, path, body=None, token=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            content = resp.read()
            if raw:
                return resp.status, content, dict(resp.headers)
            return resp.status, json.loads(content)
    except urllib.error.HTTPError as e:
        content = e.read()
        try:
            return e.code, json.loads(content)
        except Exception:
            return e.code, content.decode(errors="replace")


def req_form(method, path, fields, token=None):
    """POST multipart/form-data (для /profile/topup: поля Form + опциональный чек)."""
    import uuid

    boundary = "----smoke" + uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
        )
    parts.append(f"--{boundary}--\r\n".encode())
    data = b"".join(parts)
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        content = e.read()
        try:
            return e.code, json.loads(content)
        except Exception:
            return e.code, content.decode(errors="replace")


def check(name, cond, extra=""):
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  OK  {name}")
    else:
        FAILED += 1
        print(f" FAIL {name} {extra}")


def main():
    # ---------- 1. Админ ----------
    s, r = req("POST", "/auth/login", {"phone": "+70000000000", "password": "admin123"})
    check("логин админа", s == 200 and r.get("token"), str(r)[:120])
    admin_token = r["token"]

    # ---------- 2. Промокоды: seed + CRUD ----------
    s, r = req("GET", "/admin/promocodes", token=admin_token)
    check("список промокодов", s == 200 and isinstance(r, list))
    start100 = next((p for p in r if p["code"] == "START100"), None)
    check("стартовый промокод START100 в seed", start100 is not None and start100["bonus"] == 100,
          str(r)[:200])

    s, r = req("POST", "/admin/promocodes",
               {"code": "TEST100", "bonus": 50, "max_uses": 3}, token=admin_token)
    check("создание промокода", s == 200 and r.get("code") == "TEST100", str(r)[:150])
    promo_id = r.get("id")

    s, r = req("PATCH", f"/admin/promocodes/{promo_id}", {"is_active": False}, token=admin_token)
    check("выключение промокода", s == 200 and r.get("is_active") is False, str(r)[:150])

    s, r = req("PATCH", f"/admin/promocodes/{promo_id}", {"bonus": 75}, token=admin_token)
    check("изменение бонуса промокода", s == 200 and r.get("bonus") == 75, str(r)[:150])

    s, r = req("DELETE", f"/admin/promocodes/{promo_id}", token=admin_token)
    check("удаление промокода", s == 200, str(r)[:150])

    # ---------- 3. Регистрация с промокодом START100 ----------
    s, r = req("POST", "/auth/register",
               {"phone": P(1), "name": "Смоук Промо", "password": "pass123",
                "promo_code": "START100"})
    check("регистрация с промокодом", s == 200 and r.get("token"), str(r)[:150])
    check("бонус 100 за START100 начислен", r.get("user", {}).get("balance") == 100,
          f"balance={r.get('user', {}).get('balance')}")
    promo_user_token = r["token"]
    promo_user_id = r["user"]["id"]

    # Повторное использование промокода (max_uses=0 — без лимита)
    s, r = req("POST", "/auth/register",
               {"phone": P(2), "name": "Смоук Промо 2", "password": "pass123",
                "promo_code": "start100"})
    check("повторное использование START100 (нечувствительность к регистру)", s == 200 and r.get("user", {}).get("balance") == 100,
          str(r)[:150])

    # ---------- 4. Реферальная программа ----------
    s, r = req("POST", "/auth/register",
               {"phone": P(3), "name": "Реферер", "password": "pass123"})
    check("регистрация без промокода", s == 200 and r.get("user", {}).get("balance") == 0,
          str(r)[:150])
    referrer_token = r["token"]

    s, r = req("GET", "/profile/referral", token=referrer_token)
    check("GET /profile/referral", s == 200 and r.get("code") and r.get("link"), str(r)[:200])
    ref_code = r["code"]
    check("реферальная ссылка содержит код", r.get("link", "").endswith(ref_code), r.get("link", ""))

    s, r = req("POST", "/auth/register",
               {"phone": P(4), "name": "Приглашённый", "password": "pass123",
                "promo_code": ref_code})
    check("регистрация по реферальному коду", s == 200, str(r)[:150])
    check("бонус приглашённому не начислен сразу", r.get("user", {}).get("balance") == 0,
          f"balance={r.get('user', {}).get('balance')}")
    invited_token = r["token"]

    # Бонус пригласившему — только после подтверждённого пополнения приглашённого
    s, r = req("GET", "/profile", token=referrer_token)
    check("бонус рефереру не начислен до пополнения", r.get("balance") == 0,
          f"balance={r.get('balance')}")

    s, r = req_form("POST", "/profile/topup", {"amount": "300"}, token=invited_token)
    check("заявка на пополнение 300 от приглашённого",
          s == 200 and r.get("detail", {}).get("payment_id"), str(r)[:150])
    invited_payment_id = r["detail"]["payment_id"]

    s, r = req("POST", f"/admin/payments/{invited_payment_id}/confirm", token=admin_token)
    check("админ подтверждает пополнение приглашённого", s == 200, str(r)[:150])

    s, r = req("GET", "/profile", token=referrer_token)
    check("бонус рефереру 100 после пополнения >= REFERRAL_TOPUP_MIN",
          r.get("balance") == 100, f"balance={r.get('balance')}")

    s, r = req("GET", "/profile/referral", token=referrer_token)
    check("referrals_count=1 и total_bonus=100", r.get("referrals_count") == 1 and r.get("total_bonus") == 100,
          str(r)[:200])

    # Повторное пополнение — бонус начисляется только один раз (bonus_paid)
    s, r = req_form("POST", "/profile/topup", {"amount": "100"}, token=invited_token)
    second_payment_id = r.get("detail", {}).get("payment_id")
    if second_payment_id:
        req("POST", f"/admin/payments/{second_payment_id}/confirm", token=admin_token)
    s, r = req("GET", "/profile", token=referrer_token)
    check("повторное пополнение не начисляет бонус снова", r.get("balance") == 100,
          f"balance={r.get('balance')}")

    # ---------- 5. Заказ с гео-координатами (публичная форма) ----------
    s, r = req("POST", "/orders/public", {
        "region_name": "Сургут", "street": "Ул. Смоук-тест", "house": "1",
        "name": "Заказчик Тест", "phone": P(50), "price": 1500, "category": "мебель",
        "latitude": 61.254, "longitude": 73.396,
    })
    check("создание заказа с координатами", s == 200 and r.get("id"), str(r)[:200])
    order_id = r["id"]
    check("координаты сохранены", r.get("latitude") == 61.254 and r.get("longitude") == 73.396,
          f"lat={r.get('latitude')} lon={r.get('longitude')}")

    # ---------- 6. Взять заказ -> завершить -> отзывы ----------
    s, r = req("POST", f"/orders/{order_id}/take", token=promo_user_token)
    check("взять заказ грузчиком", s == 200, str(r)[:200])

    s, r = req("POST", f"/admin/orders/{order_id}/complete", token=admin_token)
    check("админ завершает заказ", s == 200, str(r)[:200])

    # Отзыв заказчика (телефон совпадает, заказ completed)
    s, r = req("POST", f"/reviews/orders/{order_id}/review",
               {"phone": P(50), "rating": 5, "comment": "Отличный грузчик!"})
    check("отзыв заказчика на грузчика", s == 200 and r.get("from_role") == "customer", str(r)[:200])

    # Повторный отзыв заказчика — должен быть отклонён
    s, r = req("POST", f"/reviews/orders/{order_id}/review",
               {"phone": P(50), "rating": 4})
    check("повторный отзыв заказчика запрещён", s == 409, str(r)[:150])

    # Отзыв грузчика на заказчика
    s, r = req("POST", f"/reviews/orders/{order_id}/review-loader",
               {"rating": 4, "comment": "Заказчик нормальный"}, token=promo_user_token)
    check("отзыв грузчика на заказчика", s == 200 and r.get("from_role") == "loader", str(r)[:200])

    # Публичный список: отзыв заказчика виден, грузчика — нет
    s, r = req("GET", f"/reviews/orders/{order_id}/reviews")
    check("публичные отзывы: только заказчиков", s == 200 and len(r) == 1, str(r)[:200])

    # Админский список: видны оба
    s, r = req("GET", "/reviews/admin/reviews", token=admin_token)
    check("админ видит все отзывы", s == 200 and len(r) >= 2, str(r)[:200])

    # Рейтинг грузчика в профиле
    s, r = req("GET", "/profile", token=promo_user_token)
    check("рейтинг грузчика 5.0 (1 отзыв)", r.get("rating_avg") == 5.0 and r.get("rating_count") == 1,
          f"rating_avg={r.get('rating_avg')} count={r.get('rating_count')}")

    # ---------- 7. Push-уведомления: ссылка на бота ----------
    s, r = req("GET", "/profile/notify-link", token=promo_user_token)
    check("GET /profile/notify-link", s == 200 and "enabled" in r and "link" in r, str(r)[:200])
    if r.get("enabled"):
        check("ссылка содержит bind_<id>", f"bind_{promo_user_id}" in r.get("link", ""), str(r)[:200])
    else:
        # Бот не настроен (нет TELEGRAM_BOT_USERNAME) -> корректная деградация
        check("без бота: enabled=False и пустая ссылка",
              r.get("link") == "" and r.get("bot") == "", str(r)[:200])

    # ---------- 8. Статистика админа + Excel ----------
    s, r = req("GET", "/admin/stats", token=admin_token)
    check("статистика админа (графики)", s == 200 and "charts" in r and "reviews" in r, str(r)[:200])
    check("график заказов за 14 дней", "orders_14d" in r.get("charts", {}), str(r.get("charts", {}).keys()))
    check("в статистике отзывы", r.get("reviews", {}).get("total", 0) >= 1, str(r.get("reviews"))[:150])

    s, content, headers = req("GET", "/admin/stats/export", token=admin_token, raw=True)
    ctype = headers.get("Content-Type") or headers.get("content-type") or ""
    is_xlsx = content[:2] == b"PK" and ("spreadsheet" in ctype or "octet-stream" in ctype or "xlsx" in ctype)
    check("Excel-выгрузка /admin/stats/export", s == 200 and is_xlsx,
          f"status={s} ctype={ctype} magic={content[:4]!r} size={len(content)}")

    # ---------- Итог ----------
    print(f"\nИтого: {PASSED} passed, {FAILED} failed")
    sys.exit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
