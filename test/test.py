import requests
import json

# Конфигурация
BASE_URL = "https://sapsanex.cc/api/userapi/v1/"
API_LOGIN = "w8i1uIa0K3QEBYsanCfumIKTw0S8UK0y"
API_KEY = "dC4INJt3s9cHtLSiiSxxBnZGX0CzvKwl"

headers = {
    "API-LOGIN": API_LOGIN,
    "API-KEY": API_KEY,
    "Content-Type": "application/json"
}

# Тест 1: Проверка работы API
def test_api():
    response = requests.post(f"{BASE_URL}test", headers=headers)
    print("=== TEST API ===")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}\n")
    return response.json()

# Тест 2: Получение списка валют
def get_currencies():
    response = requests.post(f"{BASE_URL}get_direction_currencies", headers=headers)
    print("=== CURRENCIES ===")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Raw response: {json.dumps(data, indent=2, ensure_ascii=False)}\n")
    return data

# Тест 3: Получение направлений обмена
def get_directions():
    response = requests.post(f"{BASE_URL}get_directions", headers=headers)
    print("=== DIRECTIONS ===")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Raw response: {json.dumps(data, indent=2, ensure_ascii=False)}\n")
    
    # Проверяем структуру ответа
    if isinstance(data, dict):
        if 'data' in data:
            directions_list = data['data']
        else:
            directions_list = data
    else:
        directions_list = data
    
    if directions_list:
        print(f"Доступно направлений: {len(directions_list)}")
        print(f"Первое направление: {json.dumps(directions_list[0], indent=2, ensure_ascii=False)}\n")
    
    return data

# Тест 4: Детали конкретного направления
def get_direction_info(direction_id):
    payload = {"direction_id": direction_id}
    response = requests.post(f"{BASE_URL}get_direction", headers=headers, json=payload)
    print(f"=== DIRECTION {direction_id} INFO ===")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Raw response: {json.dumps(data, indent=2, ensure_ascii=False)}\n")
    return data

# Тест 5: Калькулятор
def calculate(direction_id, amount, action=1):
    payload = {
        "direction_id": direction_id,
        "calc_amount": amount,
        "calc_action": action
    }
    response = requests.post(f"{BASE_URL}get_calc", headers=headers, json=payload)
    print(f"=== CALCULATOR ===")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Raw response: {json.dumps(data, indent=2, ensure_ascii=False)}\n")
    return data

# Запуск тестов
if __name__ == "__main__":
    # Тест API
    test_api()
    
    # Получаем валюты
    # currencies = get_currencies()
    
    # # Получаем направления
    # directions = get_directions()

    response = requests.post(f"{BASE_URL}get_directions", headers=headers)
    print("=== RAW RESPONSE ===")
    print(json.dumps(response.json(), indent=2, ensure_ascii=False))