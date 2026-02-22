"""
Примеры использования модуля sapsanex_api.

Показывает все основные сценарии работы с API обменника.
"""

import logging
from exchanger_api import (
    ExchangerAPI,
    ExchangerAPIError,
    ValidationError,
    PaymentNotAvailableError,
    CancelNotAvailableError,
    DirectionNotFoundError,
    setup_logging,
)
from test.config import API_LOGIN, API_KEY, BASE_URL


def main():
    # ── Настройка ──────────────────────────────────────────────────────────
    # DEBUG  — полные дампы запросов/ответов
    # INFO   — основные операции
    # WARNING — только предупреждения и ошибки
    setup_logging(level=logging.INFO)

    api = ExchangerAPI(login=API_LOGIN, key=API_KEY, base_url=BASE_URL)

    # ── 1. Проверка подключения ────────────────────────────────────────────
    print("\n=== 1. Проверка подключения ===")
    info = api.test_connection()
    print(f"  User ID: {info['user_id']}, IP: {info['ip']}")

    # ── 2. Поиск направления ───────────────────────────────────────────────
    print("\n=== 2. Поиск направления ===")
    direction = api.find_direction("RUB", "USDT TRC20")
    if not direction:
        print("  Направление не найдено!")
        return
    direction_id = direction["direction_id"]
    print(f"  ID: {direction_id}")
    print(f"  {direction['currency_give_title']} → {direction['currency_get_title']}")

    # ── 3. Детали направления ──────────────────────────────────────────────
    print("\n=== 3. Детали направления ===")
    details = api.get_direction(direction_id)
    print(f"  Курс: {details.course_give} {details.currency_give} = {details.course_get} {details.currency_get}")
    print(f"  Лимит: {details.min_give} – {details.max_give} {details.currency_give}")
    print(f"  Резерв: {details.reserve} {details.currency_get}")

    print(f"\n  Обязательные поля:")
    for f in details.required_fields:
        print(f"    • {f['name']}: {f['label']} ({f['type']})")

    print(f"\n  Необязательные поля:")
    for f in details.optional_fields:
        print(f"    ○ {f['name']}: {f['label']} ({f['type']})")

    # ── 4. Расчёт суммы ───────────────────────────────────────────────────
    print("\n=== 4. Расчёт суммы ===")
    calc = api.calculate(direction_id, amount=5000, action="give")
    print(f"  Отдаю: {calc.sum_give} {calc.currency_give}")
    print(f"  Получаю: {calc.sum_get} {calc.currency_get}")
    print(f"  Сумма скорректирована: {'Да' if calc.changed else 'Нет'}")

    # ── 5. Валидация полей ─────────────────────────────────────────────────
    print("\n=== 5. Валидация полей ===")
    
    # Данные пользователя (в реальном приложении — из БД)
    user_fields = {
        "account1": "+79269549196",          # Телефон, привязанный к карте
        "cfgive3": "Иванов Иван Иванович",  # ФИО
        "cfgive4": "4279380625835188",       # Номер карты
        "account2": "TVeDa267cuNYQvsteqRxpRmbKty2eXABjg",  # Адрес USDT
        "cf6": "user@example.com",           # E-mail
    }

    missing = details.validate_fields(user_fields)
    if missing:
        print(f"  ❌ Не заполнены поля: {missing}")
        return
    else:
        print(f"  ✅ Все обязательные поля заполнены")

    # ── 6. Создание заявки ─────────────────────────────────────────────────
    # ⚠️ РАСКОММЕНТИРУЙ ДЛЯ РЕАЛЬНОГО ОБМЕНА
    print("\n=== 6. Создание заявки ===")
    try:
        bid = api.create_bid(
            direction_id=direction_id,
            amount=5000,
            fields=user_fields,
            action="give",
            api_id="tg_user_12345_order_1",
            callback_url="https://your-backend.com/api/callback",
        )
        
        print(f"  ID: {bid.id}")
        print(f"  Hash: {bid.hash}")
        print(f"  Статус: {bid.status_title}")
        print(f"  URL: {bid.url}")
        print(f"  Сумма к оплате: {bid.pay_amount}")
        
        # Определяем способ оплаты
        if bid.payment_url:
            print(f"  💳 Оплата через мерчант: {bid.payment_url}")
            print(f"     Статус обновится автоматически после оплаты")
        elif bid.can_pay_via_api:
            print(f"  🔑 Оплата через API (pay_bid)")
        
        # Проверяем возможность отмены
        if bid.can_cancel_via_api:
            print(f"  ❌ Отмена доступна через API")
        elif bid.cancel_url:
            print(f"  ❌ Отмена по ссылке: {bid.cancel_url}")
        
        # Инструкция
        if bid.instruction:
            print(f"  📋 Инструкция: {bid.instruction[:100]}...")
    
    except ValidationError as e:
        print(f"  ❌ Ошибка валидации: {e}")
    except ExchangerAPIError as e:
        print(f"  ❌ Ошибка API: {e}")
    """

    # ── 7. Проверка статуса (если заявка создана) ──────────────────────────
    """
    print("\n=== 7. Проверка статуса ===")
    status = api.get_bid_status(hash=bid.hash)
    print(f"  Статус: {status.status_title}")
    
    # Безопасная оплата (с проверкой)
    try:
        api.safe_pay(bid)
    except PaymentNotAvailableError as e:
        print(f"  ℹ️ {e}")
    
    # Безопасная отмена (с проверкой)
    try:
        api.safe_cancel(bid)
    except CancelNotAvailableError as e:
        print(f"  ℹ️ {e}")
    """

    # ── 8. Или используй full_exchange для всего в одном вызове ────────────
    """
    print("\n=== 8. Полный обмен одним вызовом ===")
    try:
        bid = api.full_exchange(
            direction_id=direction_id,
            amount=5000,
            fields=user_fields,
            action="give",
            api_id="tg_user_12345_order_2",
            callback_url="https://your-backend.com/api/callback",
            validate=True,  # проверить поля перед созданием
        )
        print(f"  Заявка {bid.id}: {bid.status_title}")
    except ValidationError as e:
        print(f"  ❌ {e}")
    except DirectionNotFoundError as e:
        print(f"  ❌ {e}")
    except ExchangerAPIError as e:
        print(f"  ❌ {e}")

    print("\n=== Готово ===")


if __name__ == "__main__":
    main()