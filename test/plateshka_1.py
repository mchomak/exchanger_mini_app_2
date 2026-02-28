"""
Тестирование API обменника sapsanex.cc
Полный цикл создания заявки на обмен
"""

import requests
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from config import API_LOGIN, API_KEY, BASE_URL

# ============================================================================
# КОНФИГУРАЦИЯ
# ============================================================================

USER_DATA = {
    "currency_give": "RUB",
    "currency_get": "USDT TRC20",
    "amount": 3000,
    "account_give": "4279380625835188",
    "account_get": "TVeDa267cuNYQvsteqRxpRmbKty2eXABjg",
    "user_name": "ramil kaneev",
    "user_phone": "+79269549196",
    "user_email": "kaneevramil7@gmail.com",
    "user_telegram": "@McHomak15"
}

# НЕ указываем Content-Type — requests сам поставит для data=
HEADERS = {
    "API-LOGIN": API_LOGIN,
    "API-KEY": API_KEY,
}

# ============================================================================
# УТИЛИТЫ
# ============================================================================

class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def log_info(msg): print(f"{datetime.now():%H:%M:%S} {Colors.BLUE}[INFO]{Colors.ENDC} {msg}")
def log_success(msg): print(f"{datetime.now():%H:%M:%S} {Colors.GREEN}[SUCCESS]{Colors.ENDC} {msg}")
def log_error(msg): print(f"{datetime.now():%H:%M:%S} {Colors.RED}[ERROR]{Colors.ENDC} {msg}")
def log_warning(msg): print(f"{datetime.now():%H:%M:%S} {Colors.YELLOW}[WARNING]{Colors.ENDC} {msg}")

def print_separator(title=""):
    print("=" * 70)
    if title:
        print(f"  {Colors.BOLD}{title}{Colors.ENDC}")
        print("=" * 70)

def print_json(data, title=""):
    if title:
        print(f"\n{Colors.BOLD}{title}:{Colors.ENDC}")
    print(json.dumps(data, indent=2, ensure_ascii=False))

# ============================================================================
# API
# ============================================================================

def api_request(method: str, params: Optional[Dict] = None) -> Dict:
    url = f"{BASE_URL}{method}"
    try:
        response = requests.post(url, headers=HEADERS, data=params, timeout=30)
        response.raise_for_status()
        
        if not response.text.strip():
            log_error(f"Пустой ответ от API для метода: {method}")
            return None
        
        data = response.json()
        
        # ============================================================
        # КЛЮЧЕВОЙ ФИКС: API возвращает error как int ИЛИ как string
        # test, get_directions      → error: 0   (int)
        # get_direction, get_calc   → error: "0" (str)
        # Поэтому сравниваем через str()
        # ============================================================
        if isinstance(data, dict) and 'error' in data:
            if str(data['error']) != '0':
                error_text = data.get('error_text', 'Unknown error')
                log_error(f"API Error: {error_text}")
                return None
        
        return data
    
    except requests.exceptions.RequestException as e:
        log_error(f"Network error: {str(e)}")
        return None
    except json.JSONDecodeError as e:
        log_error(f"JSON parse error: {str(e)}")
        return None


def extract_data(response: Dict) -> Any:
    if response is None:
        return None
    if isinstance(response, dict) and 'data' in response:
        return response['data']
    return response

# ============================================================================
# ОСНОВНОЙ СЦЕНАРИЙ
# ============================================================================

def main():
    print("\n")
    print_separator("🚀 ТЕСТИРОВАНИЕ ОБМЕНА ЧЕРЕЗ API")
    log_info(f"Цель: купить {USER_DATA['currency_get']}")
    log_info(f"Отдаю: {USER_DATA['amount']} {USER_DATA['currency_give']}")
    
    # ШАГ 1: Проверка подключения
    print_separator("ШАГ 1: Проверка подключения к API")
    log_info("Вызов метода: test")
    
    test_response = api_request("test")
    if not test_response:
        log_error("Не удалось подключиться к API")
        sys.exit(1)
    
    test_data = extract_data(test_response)
    log_success(f"Подключение успешно!")
    log_success(f"User ID: {test_data.get('user_id')}")
    log_success(f"IP: {test_data.get('ip')}")
    
    # ШАГ 2: Поиск направления
    print_separator("ШАГ 2: Поиск направления обмена")
    log_info("Вызов метода: get_directions")
    
    directions_response = api_request("get_directions")
    if not directions_response:
        log_error("Не удалось получить список направлений")
        sys.exit(1)
    
    directions = extract_data(directions_response)
    if not directions or not isinstance(directions, list):
        log_error("Некорректный формат данных направлений")
        sys.exit(1)
    
    log_success(f"Всего доступных направлений: {len(directions)}")
    
    matching_direction = None
    log_info(f"Ищем направление: {USER_DATA['currency_give']} → {USER_DATA['currency_get']}")
    
    for direction in directions:
        if not isinstance(direction, dict):
            continue
        give_title = direction.get('currency_give_title', '').lower()
        get_title = direction.get('currency_get_title', '').lower()
        give_match = USER_DATA['currency_give'].lower() in give_title
        get_keywords = USER_DATA['currency_get'].lower().split()
        get_match = all(kw in get_title for kw in get_keywords)
        
        if give_match and get_match:
            matching_direction = direction
            log_success("✓ Найдено направление:")
            log_success(f"  ID: {direction['direction_id']}")
            log_success(f"  Отдаю: {direction['currency_give_title']}")
            log_success(f"  Получаю: {direction['currency_get_title']}")
            break
    
    if not matching_direction:
        log_error("❌ Не найдено подходящее направление обмена")
        for d in directions[:10]:
            if isinstance(d, dict):
                print(f"  • {d.get('currency_give_title')} → {d.get('currency_get_title')}")
        sys.exit(1)
    
    direction_id = matching_direction['direction_id']
    
    # ШАГ 3: Детали направления
    print_separator("ШАГ 3: Получение деталей направления")
    log_info(f"Вызов метода: get_direction (ID: {direction_id})")
    
    direction_info_response = api_request("get_direction", {"direction_id": direction_id})
    if not direction_info_response:
        log_error("Не удалось получить детали направления")
        sys.exit(1)
    
    direction_info = extract_data(direction_info_response)
    
    log_success(f"Курс отдаю: {direction_info.get('course_give')}")
    log_success(f"Курс получаю: {direction_info.get('course_get')}")
    log_success(f"Резерв: {direction_info.get('reserve')} {direction_info.get('currency_code_get')}")
    log_success(f"Мин. сумма: {direction_info.get('min_give')} {direction_info.get('currency_code_give')}")
    log_success(f"Макс. сумма: {direction_info.get('max_give')} {direction_info.get('currency_code_give')}")
    
    # ШАГ 4: Расчет суммы
    print_separator("ШАГ 4: Расчет суммы обмена")
    log_info("Вызов метода: get_calc")
    
    calc_response = api_request("get_calc", {
        "direction_id": direction_id,
        "calc_amount": USER_DATA['amount'],
        "calc_action": 1
    })
    if not calc_response:
        log_error("Не удалось рассчитать сумму")
        sys.exit(1)
    
    calc_data = extract_data(calc_response)
    
    log_success("Результат расчета:")
    log_success(f"  Отдаю: {calc_data.get('sum_give')} {calc_data.get('currency_code_give')}")
    log_success(f"  Отдаю с комиссией: {calc_data.get('sum_give_com')} {calc_data.get('currency_code_give')}")
    log_success(f"  Получаю: {calc_data.get('sum_get')} {calc_data.get('currency_code_get')}")
    log_success(f"  Получаю с комиссией: {calc_data.get('sum_get_com')} {calc_data.get('currency_code_get')}")
    log_success(f"  Комиссия отдаю: {calc_data.get('com_give')}")
    log_success(f"  Комиссия получаю: {calc_data.get('com_get')}")
    
    if calc_data.get('changed') == 1 or str(calc_data.get('changed')) == '1':
        log_warning("⚠️ API изменил сумму (вне лимитов)")
        log_warning(f"  Мин: {calc_data.get('min_give')} | Макс: {calc_data.get('max_give')}")
    
    # ШАГ 5: Подготовка данных для заявки
    print_separator("ШАГ 5: Подготовка данных для заявки")
    
    # give_fields и get_fields приходят как dict, а не list!
    give_fields = direction_info.get('give_fields', {})
    get_fields = direction_info.get('get_fields', {})
    dir_fields = direction_info.get('dir_fields', {})
    
    # Нормализуем: если dict — берём values(), если list — оставляем
    def normalize_fields(fields):
        if isinstance(fields, dict):
            return list(fields.values())
        elif isinstance(fields, list):
            return fields
        return []
    
    give_list = normalize_fields(give_fields)
    get_list = normalize_fields(get_fields)
    dir_list = normalize_fields(dir_fields)
    all_fields = give_list + get_list + dir_list
    
    log_info("Обязательные поля:")
    for f in all_fields:
        if not isinstance(f, dict):
            continue
        req_mark = "🔴" if f.get('req') == 1 or str(f.get('req')) == '1' else "⚪"
        log_info(f"  {req_mark} {f.get('name')} ({f.get('type')}): {f.get('label')}")
    
    # Формируем параметры
    bid_params = {
        "direction_id": direction_id,
        "calc_amount": USER_DATA['amount'],
        "calc_action": 1,
        "api_id": f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
    }
    
    field_mapping = {
        "account1": USER_DATA.get("user_phone"),       # Номер телефона, привязанный к карте
        "account2": USER_DATA.get("account_get"),       # Адрес получения (USDT TRC20)
        "cfgive3": USER_DATA.get("user_name"),          # ФИО
        "cfgive4": USER_DATA.get("account_give"),       # Номер карты
        "cfgive8": USER_DATA.get("user_name"),          # Имя владельца карты (если потребуется)
        "cf1": USER_DATA.get("user_name", "").split()[0] if USER_DATA.get("user_name") else "",
        "cf3": USER_DATA.get("user_name", "").split()[-1] if USER_DATA.get("user_name") else "",
        "cf4": USER_DATA.get("user_phone"),
        "cf6": USER_DATA.get("user_email"),
        "cf11": USER_DATA.get("user_telegram"),
    }
    
    log_info("\nЗаполнение полей:")
    missing_required = False
    
    for field in all_fields:
        if not isinstance(field, dict):
            continue
        
        field_name = field.get('name')
        field_label = field.get('label')
        field_required = str(field.get('req', '0')) == '1'
        field_type = field.get('type')
        
        if not field_required:
            continue
        
        if field_name in field_mapping and field_mapping[field_name]:
            bid_params[field_name] = field_mapping[field_name]
            log_success(f"  ✓ {field_label}: {field_mapping[field_name]}")
        else:
            if field_type == 'select' and 'options' in field:
                options = field.get('options', [])
                if isinstance(options, dict):
                    options = list(options.values())
                if options:
                    bid_params[field_name] = options[0]
                    log_warning(f"  ⚠️ {field_label}: {options[0]} (авто-выбор)")
                    continue
            log_error(f"  ❌ {field_label} ({field_name}) — не найдено значение!")
            missing_required = True
    
    if missing_required:
        log_error("Есть незаполненные обязательные поля!")
    
    # ШАГ 6: Создание заявки
    print_separator("ШАГ 6: Создание заявки")
    log_warning("⚠️ СОЗДАНИЕ ЗАЯВКИ ОТКЛЮЧЕНО")
    log_warning("Раскомментируй блок ниже для создания реальной заявки")
    
    print("\nПараметры для создания заявки:")
    print_json(bid_params)
    
    # =====================================================================
    # РАСКОММЕНТИРУЙ БЛОК НИЖЕ ДЛЯ СОЗДАНИЯ РЕАЛЬНОЙ ЗАЯВКИ
    # =====================================================================
    if missing_required:
        log_error("Невозможно создать заявку — есть незаполненные поля")
        sys.exit(1)
    
    log_info("Вызов метода: create_bid")
    bid_response = api_request("create_bid", bid_params)
    if not bid_response:
        log_error("Не удалось создать заявку")
        sys.exit(1)
    
    bid_data = extract_data(bid_response)
    log_success("✓ Заявка создана!")
    log_success(f"  ID: {bid_data.get('id')}")
    log_success(f"  Hash: {bid_data.get('hash')}")
    log_success(f"  Статус: {bid_data.get('status_title')}")
    log_success(f"  URL: {bid_data.get('url')}")
    
    api_actions = bid_data.get('api_actions', {})
    log_info(f"  Тип оплаты: {api_actions.get('type')}")
    log_info(f"  Оплата: {api_actions.get('pay')}")
    log_info(f"  Отмена: {api_actions.get('cancel')}")
    if api_actions.get('instruction'):
        print(f"\\nИнструкция: {api_actions['instruction']}")
    if api_actions.get('pay_amount'):
        log_success(f"  Сумма к оплате: {api_actions['pay_amount']}")
    
    # Проверка статуса
    print_separator("ШАГ 7: Статус заявки")
    bid_info_resp = api_request("bid_info", {"hash": bid_data.get('hash')})
    if bid_info_resp:
        bi = extract_data(bid_info_resp)
        log_success(f"Статус: {bi.get('status_title')}")
        
    # Завершение
    print_separator("✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО")
    log_success("Все этапы пройдены успешно (шаги 1-5)")
    print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log_warning("Прервано пользователем")
    except Exception as e:
        log_error(f"Критическая ошибка: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)