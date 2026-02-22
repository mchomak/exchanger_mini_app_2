"""
ДИАГНОСТИКА API v2 — подробная, но компактная.
Выясняем: тип поля error, структуру ответа, и почему данных нет.
"""

import requests
import json
from config import API_LOGIN, API_KEY, BASE_URL

HEADERS = {"API-LOGIN": API_LOGIN, "API-KEY": API_KEY}


def detailed_request(label, method, params=None):
    """Запрос через data= с подробным анализом ответа"""
    url = f"{BASE_URL}{method}"
    print(f"\n{'─'*50}")
    print(f"  {label}")
    print(f"  POST {url}")
    if params:
        print(f"  params: {params}")
    print(f"{'─'*50}")
    
    try:
        resp = requests.post(url, headers=HEADERS, data=params, timeout=30)
        body = resp.text.strip()
        
        print(f"  HTTP статус: {resp.status_code}")
        print(f"  Длина ответа: {len(body)} символов")
        print(f"  Сырой ответ: {body[:500]}")
        
        try:
            data = resp.json()
            print(f"\n  Структура JSON:")
            print(f"    Ключи: {list(data.keys()) if isinstance(data, dict) else type(data).__name__}")
            
            if isinstance(data, dict):
                # Анализ поля error
                if 'error' in data:
                    err = data['error']
                    print(f"    error = {repr(err)} (тип: {type(err).__name__})")
                    print(f"    error == 0: {err == 0}")
                    print(f"    error == '0': {err == '0'}")
                    print(f"    str(error) == '0': {str(err) == '0'}")
                
                if 'error_text' in data:
                    print(f"    error_text = {repr(data['error_text'])}")
                
                # Анализ поля data
                if 'data' in data:
                    inner = data['data']
                    if isinstance(inner, list):
                        print(f"    data = список из {len(inner)} элементов")
                        if inner:
                            print(f"    data[0] ключи: {list(inner[0].keys()) if isinstance(inner[0], dict) else inner[0]}")
                    elif isinstance(inner, dict):
                        print(f"    data = объект, ключи: {list(inner.keys())[:10]}")
                    elif inner is None:
                        print(f"    data = null")
                    else:
                        print(f"    data = {repr(inner)} (тип: {type(inner).__name__})")
                else:
                    print(f"    ⚠️ Ключа 'data' НЕТ в ответе!")
            
            return data
        except json.JSONDecodeError:
            print(f"  ⚠️ Ответ НЕ JSON!")
            return None
    except Exception as e:
        print(f"  ❌ Ошибка запроса: {e}")
        return None


def main():
    print("=" * 50)
    print("  ДИАГНОСТИКА API v2")
    print(f"  BASE_URL: {BASE_URL}")
    print("=" * 50)
    
    # 1. test
    detailed_request("1. test", "test")
    
    # 2. get_directions — берём 2 направления для теста
    dirs_data = detailed_request("2. get_directions", "get_directions")
    if not dirs_data:
        return
    
    directions = dirs_data.get('data', dirs_data)
    if not isinstance(directions, list):
        print("  ❌ Неожиданный формат")
        return
    
    # Находим целевое и берём первое
    target = None
    for d in directions:
        g = d.get('currency_give_title', '').lower()
        r = d.get('currency_get_title', '').lower()
        if 'rub' in g and 'usdt' in r and 'trc20' in r:
            target = d
            break
    
    first = directions[0]
    tid = target['direction_id'] if target else None
    fid = first['direction_id']
    
    if target:
        print(f"\n  Целевое: id={tid} | {target['currency_give_title']} → {target['currency_get_title']}")
    print(f"  Первое:  id={fid} | {first['currency_give_title']} → {first['currency_get_title']}")
    
    # 3. get_direction — целевое
    if tid:
        detailed_request(f"3a. get_direction (целевое id={tid})", 
                        "get_direction", {"direction_id": tid})
    
    # 4. get_direction — первое
    if fid != tid:
        detailed_request(f"3b. get_direction (первое id={fid})", 
                        "get_direction", {"direction_id": fid})
    
    # 5. get_calc — целевое
    test_id = tid or fid
    detailed_request(f"4. get_calc (data=, id={test_id})",
                    "get_calc", 
                    {"direction_id": test_id, "calc_amount": 100, "calc_action": 1})
    
    # 6. Итоговый диагноз
    print("\n" + "=" * 50)
    print("  ГОТОВО — скинь мне полный вывод")
    print("=" * 50)


if __name__ == "__main__":
    main()