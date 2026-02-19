"""
SapsanEx API — модуль-обёртка над API Premium Exchanger (v1).

Предназначен для интеграции в Telegram Mini App обменника.
Все данные пользователя приходят извне (из БД), модуль занимается
только взаимодействием с API обменника.

Использование:
    from sapsanex_api import ExchangerAPI, ExchangerAPIError

    api = ExchangerAPI(login="...", key="...", base_url="https://sapsanex.cc/api/userapi/v1/")

    # Проверка подключения
    info = api.test_connection()

    # Поиск направления
    direction = api.find_direction("RUB", "USDT TRC20")

    # Расчёт суммы
    calc = api.calculate(direction["direction_id"], amount=5000, action="give")

    # Создание заявки
    bid = api.create_bid(
        direction_id=direction["direction_id"],
        amount=5000,
        fields={"account1": "+7...", "account2": "T...", ...}
    )

    # Проверка статуса
    status = api.get_bid_status(bid.hash)

    # Оплата / отмена
    if bid.can_cancel_via_api:
        api.cancel_bid(bid.hash)

Особенности API Premium Exchanger, учтённые в модуле:
    - Поле `error` приходит то как int(0), то как str("0") — нормализуем через str()
    - Поля `fields` приходят то как dict, то как list — нормализуем
    - Поле `req` (обязательность) тоже нестабильно по типу
    - Параметры передаются как form-data (НЕ json)
    - pay_bid работает ТОЛЬКО если api_actions.pay == "api" (без мерчанта)
"""

import logging
import requests
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Union

# ============================================================================
# ЛОГИРОВАНИЕ
# ============================================================================

logger = logging.getLogger("sapsanex_api")


def setup_logging(level: int = logging.INFO):
    """
    Настройка логирования модуля. Вызывай один раз при старте приложения.
    
    Уровни:
        DEBUG   — полный дамп запросов/ответов (для отладки)
        INFO    — основные операции (создание заявки, расчёт и т.д.)
        WARNING — некритичные проблемы (сумма скорректирована, поле не найдено)
        ERROR   — ошибки API, сети, валидации
    """
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S"
    ))
    logger.addHandler(handler)
    logger.setLevel(level)


# ============================================================================
# ИСКЛЮЧЕНИЯ
# ============================================================================

class ExchangerAPIError(Exception):
    """Базовое исключение для всех ошибок API обменника."""

    def __init__(self, message: str, error_code: Any = None, method: str = ""):
        self.message = message
        self.error_code = error_code
        self.method = method
        super().__init__(self.message)


class NetworkError(ExchangerAPIError):
    """Ошибка сети: таймаут, DNS, отказ соединения."""
    pass


class APIResponseError(ExchangerAPIError):
    """API вернул ошибку (error != 0)."""
    pass


class DirectionNotFoundError(APIResponseError):
    """Направление обмена не найдено или не разрешено для API."""
    pass


class BidNotFoundError(APIResponseError):
    """Заявка не найдена."""
    pass


class MethodNotSupportedError(APIResponseError):
    """Метод не активирован для данного API-ключа."""
    pass


class ValidationError(ExchangerAPIError):
    """Ошибка валидации данных перед отправкой."""
    pass


class PaymentNotAvailableError(ExchangerAPIError):
    """Попытка вызвать pay_bid, когда оплата через API недоступна."""
    pass


class CancelNotAvailableError(ExchangerAPIError):
    """Попытка вызвать cancel_bid, когда отмена через API недоступна."""
    pass


# ============================================================================
# ДАТАКЛАССЫ ДЛЯ СТРУКТУРИРОВАННЫХ ОТВЕТОВ
# ============================================================================

@dataclass
class BidResult:
    """
    Результат создания заявки. Содержит всю информацию для дальнейшей работы.
    
    Поля:
        id              — ID заявки в обменнике
        hash            — хеш заявки (используется в bid_info, cancel_bid, pay_bid)
        url             — ссылка на страницу заявки на сайте обменника
        status          — числовой статус
        status_title    — текстовый статус ("Ожидание оплаты" и т.д.)
        amount_give     — сумма отдачи
        amount_get      — сумма получения
        currency_give   — код валюты отдачи
        currency_get    — код валюты получения
        api_actions     — словарь доступных действий (pay, cancel, type, instruction)
        raw             — полный сырой ответ от API
    """
    id: str
    hash: str
    url: str
    status: str
    status_title: str
    amount_give: str
    amount_get: str
    currency_give: str
    currency_get: str
    api_actions: Dict[str, Any] = field(default_factory=dict)
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)

    # --- Свойства-помощники для определения доступных действий ---

    @property
    def payment_type(self) -> str:
        """Тип оплаты: 'link' (через мерчант) или другой."""
        return self.api_actions.get("type", "")

    @property
    def payment_url(self) -> Optional[str]:
        """
        Ссылка на оплату через мерчант, если оплата через ссылку.
        Вернёт None, если pay == "api" или "disabled".
        """
        pay = self.api_actions.get("pay", "")
        if pay.startswith("http"):
            return pay
        return None

    @property
    def can_pay_via_api(self) -> bool:
        """
        True, если оплату можно подтвердить через API (метод pay_bid).
        
        Это возможно ТОЛЬКО когда в направлении обмена НЕ используется мерчант.
        Если используется мерчант — оплата подтверждается автоматически,
        когда мерчант увидит поступление средств.
        """
        return self.api_actions.get("pay") == "api"

    @property
    def can_cancel_via_api(self) -> bool:
        """True, если заявку можно отменить через API (метод cancel_bid)."""
        return self.api_actions.get("cancel") == "api"

    @property
    def cancel_url(self) -> Optional[str]:
        """Ссылка на отмену через сайт, если отмена не через API."""
        cancel = self.api_actions.get("cancel", "")
        if cancel.startswith("http"):
            return cancel
        return None

    @property
    def instruction(self) -> Optional[str]:
        """Инструкция по оплате (HTML), если есть."""
        return self.api_actions.get("instruction")

    @property
    def pay_amount(self) -> Optional[str]:
        """Сумма к оплате, если указана."""
        return self.api_actions.get("pay_amount")


@dataclass
class CalcResult:
    """
    Результат расчёта суммы обмена.
    
    Поля changed / amount_corrected показывают, что API скорректировал сумму
    (например, если запрошенная сумма ниже минимума).
    """
    sum_give: str
    sum_give_com: str
    sum_get: str
    sum_get_com: str
    currency_give: str
    currency_get: str
    course_give: str
    course_get: str
    reserve: str
    com_give: str
    com_get: str
    min_give: str
    max_give: str
    min_get: str
    max_get: str
    changed: bool  # True = API скорректировал сумму
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)

    @property
    def amount_corrected(self) -> bool:
        """Алиас для changed — True если сумма была скорректирована API."""
        return self.changed


@dataclass
class DirectionInfo:
    """
    Детальная информация о направлении обмена.
    
    Содержит курсы, лимиты, резервы и список полей для заполнения.
    Поля разделены на 3 категории:
        give_fields — относятся к валюте "Отдаю"
        get_fields  — относятся к валюте "Получаю"  
        dir_fields  — относятся к направлению обмена
    """
    id: str
    url: str
    currency_give: str
    currency_get: str
    course_give: str
    course_get: str
    reserve: str
    min_give: str
    max_give: str
    min_get: str
    max_get: str
    give_fields: List[Dict]
    get_fields: List[Dict]
    dir_fields: List[Dict]
    info: Dict[str, Any]
    raw: Dict[str, Any] = field(default_factory=dict, repr=False)

    @property
    def all_fields(self) -> List[Dict]:
        """Все поля (give + get + dir) в одном списке."""
        return self.give_fields + self.get_fields + self.dir_fields

    @property
    def required_fields(self) -> List[Dict]:
        """Только обязательные поля (req == 1)."""
        return [f for f in self.all_fields if str(f.get("req", "0")) == "1"]

    @property
    def optional_fields(self) -> List[Dict]:
        """Только необязательные поля (req == 0)."""
        return [f for f in self.all_fields if str(f.get("req", "0")) != "1"]

    def validate_fields(self, user_fields: Dict[str, str]) -> List[str]:
        """
        Проверяет, заполнены ли все обязательные поля.
        
        Args:
            user_fields: словарь {имя_поля: значение}
            
        Returns:
            Список имён незаполненных обязательных полей (пустой = всё ок).
        """
        missing = []
        for f in self.required_fields:
            name = f.get("name", "")
            if name not in user_fields or not user_fields[name]:
                missing.append(name)
        return missing


# ============================================================================
# ОСНОВНОЙ КЛАСС API
# ============================================================================

class ExchangerAPI:
    """
    Клиент для работы с API Premium Exchanger (v1).
    
    Args:
        login:    API-логин из панели обменника
        key:      API-ключ из панели обменника
        base_url: точка входа (https://домен/api/userapi/v1/)
        timeout:  таймаут запросов в секундах
        lang:     язык ответов (опционально, пример: "ru_RU")
    """

    def __init__(
        self,
        login: str,
        key: str,
        base_url: str,
        timeout: int = 30,
        lang: Optional[str] = None,
    ):
        self.base_url = base_url.rstrip("/") + "/"
        self.timeout = timeout
        self.headers = {
            "API-LOGIN": login,
            "API-KEY": key,
        }
        if lang:
            self.headers["API-LANG"] = lang


    # ========================================================================
    # ВНУТРЕННИЙ ТРАНСПОРТ
    # ========================================================================


    def _request(self, method: str, params: Optional[Dict] = None) -> Dict:
        """
        Низкоуровневый запрос к API.
        
        - Отправляет POST с параметрами как form-data (НЕ json!)
        - Нормализует поле error (int/str → единообразная проверка)
        - Бросает типизированные исключения
        
        Returns:
            Содержимое поля 'data' из ответа API.
            
        Raises:
            NetworkError              — проблемы с сетью
            DirectionNotFoundError    — направление не найдено / не разрешено
            MethodNotSupportedError   — метод не активирован для ключа
            BidNotFoundError          — заявка не найдена
            APIResponseError          — прочие ошибки API
        """
        url = f"{self.base_url}{method}"
        logger.debug(f"→ POST {url} | params={params}")

        try:
            response = requests.post(
                url, headers=self.headers, data=params, timeout=self.timeout
            )
            response.raise_for_status()
        except requests.exceptions.Timeout:
            raise NetworkError(f"Таймаут при запросе {method}", method=method)
        
        except requests.exceptions.ConnectionError as e:
            raise NetworkError(f"Ошибка соединения: {e}", method=method)
        
        except requests.exceptions.HTTPError as e:
            raise NetworkError(
                f"HTTP {response.status_code}: {response.text[:200]}", method=method
            )
        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Ошибка запроса: {e}", method=method)

        # Парсим JSON
        raw_text = response.text.strip()
        if not raw_text:
            raise APIResponseError("Пустой ответ от API", method=method)

        try:
            data = response.json()
        except ValueError:
            raise APIResponseError(
                f"Невалидный JSON: {raw_text[:200]}", method=method
            )

        logger.debug(f"← {method} | keys={list(data.keys()) if isinstance(data, dict) else '?'}")

        # Проверка ошибок
        # ВАЖНО: API возвращает error как int(0) или str("0") — сравниваем через str()
        if isinstance(data, dict) and "error" in data:
            error_val = str(data["error"])
            if error_val != "0":
                error_text = str(data.get("error_text", "")).strip()
                error_lower = error_text.lower()

                # Классифицируем ошибку по тексту
                if "direction not found" in error_lower:
                    raise DirectionNotFoundError(
                        f"Направление не найдено или не разрешено для API. "
                        f"Проверьте настройки направления → Ограничения и проверки → API",
                        error_code=error_val, method=method,
                    )
                elif "method not supported" in error_lower:
                    raise MethodNotSupportedError(
                        f"Метод '{method}' не активирован для данного API-ключа",
                        error_code=error_val, method=method,
                    )
                elif "no bid exists" in error_lower:
                    raise BidNotFoundError(
                        f"Заявка не найдена", error_code=error_val, method=method
                    )
                elif "api disabled" in error_lower:
                    raise APIResponseError(
                        f"API отключён. Проверьте настройки модуля API и данные авторизации",
                        error_code=error_val, method=method,
                    )
                else:
                    raise APIResponseError(
                        error_text or f"Неизвестная ошибка (code={error_val})",
                        error_code=error_val, method=method,
                    )

        # Извлекаем data
        if isinstance(data, dict) and "data" in data:
            return data["data"]
        return data


    # ========================================================================
    # УТИЛИТЫ
    # ========================================================================


    @staticmethod
    def _normalize_fields(fields: Any) -> List[Dict]:
        """
        Нормализует поля из ответа API.
        
        API возвращает fields то как dict ({"account1": {...}, "cfgive3": {...}}),
        то как list ([{...}, {...}]), то как пустой list [].
        Приводим к единому формату: List[Dict].
        """
        if isinstance(fields, dict):
            return list(fields.values())
        
        elif isinstance(fields, list):
            return fields
        
        return []


    @staticmethod
    def _is_required(field: Dict) -> bool:
        """Проверяет, обязательно ли поле (req может быть int или str)."""
        return str(field.get("req", "0")) == "1"

    # ========================================================================
    # МЕТОДЫ API
    # ========================================================================


    def test_connection(self) -> Dict:
        """
        Проверка подключения к API.
        
        Returns:
            {"ip": "...", "user_id": ..., "locale": "...", "partner_id": ...}
            
        Raises:
            ExchangerAPIError при любых проблемах с подключением.
        """
        result = self._request("test")
        logger.info(
            f"Подключение к API: OK | user_id={result.get('user_id')} | ip={result.get('ip')}"
        )
        return result


    def get_currencies(
        self,
        currency_id_give: Optional[int] = None,
        currency_id_get: Optional[int] = None,
    ) -> Dict[str, List[Dict]]:
        """
        Получение списка доступных валют.
        
        Args:
            currency_id_give: фильтр по ID валюты "Отдаю"
            currency_id_get:  фильтр по ID валюты "Получаю"
            
        Returns:
            {"give": [...], "get": [...]} — два списка валют.
        """
        params = {}
        if currency_id_give is not None:
            params["currency_id_give"] = currency_id_give
        if currency_id_get is not None:
            params["currency_id_get"] = currency_id_get

        result = self._request("get_direction_currencies", params or None)
        logger.info(
            f"Валюты: {len(result.get('give', []))} отдаю, {len(result.get('get', []))} получаю"
        )
        return result


    def get_directions(
        self,
        currency_id_give: Optional[int] = None,
        currency_id_get: Optional[int] = None,
    ) -> List[Dict]:
        """
        Получение списка направлений обмена.
        
        Args:
            currency_id_give: фильтр по ID валюты "Отдаю"
            currency_id_get:  фильтр по ID валюты "Получаю"
            
        Returns:
            Список направлений, каждое содержит:
            direction_id, currency_give_id, currency_give_title, currency_get_id, ...
        """
        params = {}
        if currency_id_give is not None:
            params["currency_id_give"] = currency_id_give

        if currency_id_get is not None:
            params["currency_id_get"] = currency_id_get

        result = self._request("get_directions", params or None)

        if not isinstance(result, list):
            raise APIResponseError("Неожиданный формат списка направлений")

        logger.info(f"Направлений обмена: {len(result)}")
        return result


    def find_direction(
        self, currency_give: str, currency_get: str
    ) -> Optional[Dict]:
        """
        Поиск направления по текстовым названиям валют.
        
        Ищет по вхождению ключевых слов в currency_give_title / currency_get_title.
        Например: find_direction("RUB", "USDT TRC20")
        
        Args:
            currency_give: валюта отдачи (или её часть): "RUB", "BTC", ...
            currency_get:  валюта получения: "USDT TRC20", "ETH", ...
            
        Returns:
            Словарь направления или None, если не найдено.
        """
        directions = self.get_directions()
        give_lower = currency_give.lower()
        get_keywords = currency_get.lower().split()

        for d in directions:
            if not isinstance(d, dict):
                continue

            give_title = d.get("currency_give_title", "").lower()
            get_title = d.get("currency_get_title", "").lower()

            if give_lower in give_title and all(kw in get_title for kw in get_keywords):
                logger.info(
                    f"Найдено направление: {d.get('currency_give_title')} → "
                    f"{d.get('currency_get_title')} (id={d.get('direction_id')})"
                )
                return d

        logger.warning(f"Направление {currency_give} → {currency_get} не найдено")
        return None


    def get_direction(self, direction_id: Union[str, int]) -> DirectionInfo:
        """
        Получение детальной информации о направлении обмена.
        
        Содержит курсы, лимиты, резервы и список полей для заполнения заявки.
        
        Args:
            direction_id: ID направления из get_directions()
            
        Returns:
            DirectionInfo с курсами, лимитами и списком полей.
            
        Raises:
            DirectionNotFoundError если направление не найдено или не разрешено для API.
        """
        data = self._request("get_direction", {"direction_id": str(direction_id)})

        give_fields = self._normalize_fields(data.get("give_fields", []))
        get_fields = self._normalize_fields(data.get("get_fields", []))
        dir_fields = self._normalize_fields(data.get("dir_fields", []))

        info = DirectionInfo(
            id=str(data.get("id", "")),
            url=data.get("url", ""),
            currency_give=data.get("currency_code_give", ""),
            currency_get=data.get("currency_code_get", ""),
            course_give=data.get("course_give", ""),
            course_get=data.get("course_get", ""),
            reserve=data.get("reserve", ""),
            min_give=data.get("min_give", "no"),
            max_give=data.get("max_give", "no"),
            min_get=data.get("min_get", "no"),
            max_get=data.get("max_get", "no"),
            give_fields=give_fields,
            get_fields=get_fields,
            dir_fields=dir_fields,
            info=data.get("info", {}),
            raw=data,
        )

        logger.info(
            f"Направление {info.id}: {info.currency_give} → {info.currency_get} | "
            f"курс {info.course_give}:{info.course_get} | "
            f"лимит {info.min_give}–{info.max_give} {info.currency_give}"
        )
        return info


    def calculate(
        self,
        direction_id: Union[str, int],
        amount: Union[int, float],
        action: str = "give",
        cd: Optional[str] = None,
    ) -> CalcResult:
        """
        Калькулятор суммы обмена.
        
        Args:
            direction_id: ID направления
            amount:       сумма
            action:       к какой валюте относится сумма:
                          "give"     — сумма в валюте "Отдаю"
                          "get"      — сумма в валюте "Получаю"
                          "give_com" — сумма "Отдаю" с комиссией
                          "get_com"  — сумма "Получаю" с комиссией
            cd:           доп. параметры (для полей с cd=1, URL-encoded)
            
        Returns:
            CalcResult с суммами, курсами и флагом коррекции.
        """
        action_map = {"give": 1, "get": 2, "give_com": 3, "get_com": 4}
        calc_action = action_map.get(action)
        if calc_action is None:
            raise ValidationError(
                f"Недопустимое значение action='{action}'. "
                f"Допустимые: {list(action_map.keys())}"
            )

        params = {
            "direction_id": str(direction_id),
            "calc_amount": amount,
            "calc_action": calc_action,
        }
        if cd is not None:
            params["cd"] = cd

        data = self._request("get_calc", params)

        changed = str(data.get("changed", "0")) == "1"

        result = CalcResult(
            sum_give=data.get("sum_give", ""),
            sum_give_com=data.get("sum_give_com", ""),
            sum_get=data.get("sum_get", ""),
            sum_get_com=data.get("sum_get_com", ""),
            currency_give=data.get("currency_code_give", ""),
            currency_get=data.get("currency_code_get", ""),
            course_give=data.get("course_give", ""),
            course_get=data.get("course_get", ""),
            reserve=data.get("reserve", ""),
            com_give=data.get("com_give", ""),
            com_get=data.get("com_get", ""),
            min_give=data.get("min_give", "no"),
            max_give=data.get("max_give", "no"),
            min_get=data.get("min_get", "no"),
            max_get=data.get("max_get", "no"),
            changed=changed,
            raw=data,
        )

        if changed:
            logger.warning(
                f"Сумма скорректирована API! "
                f"Лимиты: {result.min_give}–{result.max_give} {result.currency_give}"
            )

        logger.info(
            f"Расчёт: {result.sum_give} {result.currency_give} → "
            f"{result.sum_get} {result.currency_get}"
        )
        return result


    def create_bid(
        self,
        direction_id: Union[str, int],
        amount: Union[int, float],
        fields: Dict[str, str],
        action: str = "give",
        api_id: Optional[str] = None,
        partner_id: Optional[int] = None,
        callback_url: Optional[str] = None,
    ) -> BidResult:
        """
        Создание заявки на обмен.
        
        Args:
            direction_id: ID направления обмена
            amount:       сумма обмена
            fields:       заполненные поля формы (account1, account2, cfgive3, cf6, ...)
                          Получи список полей через get_direction().required_fields
            action:       к чему относится сумма ("give" / "get" / "give_com" / "get_com")
            api_id:       твой внутренний ID заявки (для отслеживания)
            partner_id:   ID партнёра (если есть)
            callback_url: URL для вебхуков при смене статуса заявки (POST)
            
        Returns:
            BidResult со всей информацией о заявке.
            
        Raises:
            ValidationError если не заполнены обязательные поля.
        """
        action_map = {"give": 1, "get": 2, "give_com": 3, "get_com": 4}
        calc_action = action_map.get(action)
        if calc_action is None:
            raise ValidationError(
                f"Недопустимое значение action='{action}'. "
                f"Допустимые: {list(action_map.keys())}"
            )

        params = {
            "direction_id": str(direction_id),
            "calc_amount": amount,
            "calc_action": calc_action,
        }

        # Опциональные параметры
        if api_id:
            params["api_id"] = api_id
        if partner_id is not None:
            params["partner_id"] = partner_id
        if callback_url:
            params["callback_url"] = callback_url

        # Пользовательские поля
        params.update(fields)

        logger.info(f"Создание заявки: направление={direction_id}, сумма={amount}")
        logger.debug(f"Параметры заявки: {params}")

        data = self._request("create_bid", params)

        bid = BidResult(
            id=str(data.get("id", "")),
            hash=data.get("hash", ""),
            url=data.get("url", ""),
            status=str(data.get("status", "")),
            status_title=data.get("status_title", ""),
            amount_give=str(data.get("amount_give", "")),
            amount_get=str(data.get("amount_get", "")),
            currency_give=data.get("currency_code_give", ""),
            currency_get=data.get("currency_code_get", ""),
            api_actions=data.get("api_actions", {}),
            raw=data,
        )

        logger.info(
            f"Заявка создана: id={bid.id} | {bid.status_title} | "
            f"{bid.amount_give} {bid.currency_give} → {bid.amount_get} {bid.currency_get}"
        )

        # Логируем способ оплаты для наглядности
        if bid.can_pay_via_api:
            logger.info("Оплата: через API (pay_bid)")
        elif bid.payment_url:
            logger.info(f"Оплата: через мерчант → {bid.payment_url}")
        else:
            logger.warning("Оплата: способ не определён")

        if bid.can_cancel_via_api:
            logger.debug("Отмена: доступна через API (cancel_bid)")

        return bid


    def get_bid_status(self, hash: Optional[str] = None, bid_id: Optional[str] = None) -> BidResult:
        """
        Получение статуса заявки.
        
        Можно указать hash ИЛИ bid_id (одно из двух обязательно).
        Работает ТОЛЬКО для заявок, созданных через API.
        
        Args:
            hash:   хеш заявки (из create_bid)
            bid_id: ID заявки (из create_bid)
            
        Returns:
            BidResult с актуальным статусом.
        """
        if not hash and not bid_id:
            raise ValidationError("Нужно указать hash или bid_id")

        params = {}
        if hash:
            params["hash"] = hash
        if bid_id:
            params["id"] = bid_id

        data = self._request("bid_info", params)

        bid = BidResult(
            id=str(data.get("id", "")),
            hash=data.get("hash", ""),
            url=data.get("url", ""),
            status=str(data.get("status", "")),
            status_title=data.get("status_title", ""),
            amount_give=str(data.get("amount_give", "")),
            amount_get=str(data.get("amount_get", "")),
            currency_give=data.get("currency_code_give", ""),
            currency_get=data.get("currency_code_get", ""),
            api_actions=data.get("api_actions", {}),
            raw=data,
        )

        logger.info(f"Статус заявки {bid.id}: {bid.status_title}")
        return bid


    def cancel_bid(self, hash: str) -> Dict:
        """
        Отмена заявки.
        
        Работает ТОЛЬКО если при создании заявки api_actions.cancel == "api".
        Рекомендуется проверять bid.can_cancel_via_api перед вызовом.
        
        Args:
            hash: хеш заявки
            
        Raises:
            CancelNotAvailableError если отмена через API недоступна.
        """
        logger.info(f"Отмена заявки: hash={hash}")
        result = self._request("cancel_bid", {"hash": hash})
        logger.info(f"Заявка отменена: {result}")
        return result


    def pay_bid(self, hash: str) -> Dict:
        """
        Подтверждение оплаты заявки через API.
        
        ⚠️ Работает ТОЛЬКО если api_actions.pay == "api" (без мерчанта).
        Если используется мерчант — оплата подтверждается АВТОМАТИЧЕСКИ,
        когда мерчант увидит поступление средств. В этом случае вызов
        pay_bid не нужен и приведёт к ошибке.
        
        Рекомендуется проверять bid.can_pay_via_api перед вызовом.
        
        Args:
            hash: хеш заявки
            
        Raises:
            PaymentNotAvailableError если оплата через API недоступна.
        """
        logger.info(f"Подтверждение оплаты: hash={hash}")
        result = self._request("pay_bid", {"hash": hash})
        logger.info(f"Оплата подтверждена: {result}")
        return result


    def confirm_bid(self, hash: str) -> Dict:
        """
        Отметка заявки выполненной (success_bid).
        
        Args:
            hash: хеш заявки
        """
        logger.info(f"Подтверждение выполнения: hash={hash}")
        result = self._request("success_bid", {"hash": hash})
        logger.info(f"Заявка выполнена: {result}")
        return result


    def get_exchanges(
        self,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        ip: Optional[str] = None,
        bid_id: Optional[str] = None,
        api_id: Optional[str] = None,
        status_history: bool = False,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> List[Dict]:
        """
        Получение списка заявок, созданных через данный API-ключ.
        
        Args:
            start_time:     unix-время начала выборки
            end_time:       unix-время конца выборки
            ip:             фильтр по IP
            bid_id:         фильтр по ID заявки
            api_id:         фильтр по вашему api_id
            status_history: включить историю статусов
            limit:          количество заявок
            offset:         сколько пропустить
            
        Returns:
            Список заявок.
        """
        params = {}
        if start_time is not None:
            params["start_time"] = start_time
        if end_time is not None:
            params["end_time"] = end_time
        if ip:
            params["ip"] = ip
        if bid_id:
            params["id"] = bid_id
        if api_id:
            params["api_id"] = api_id
        if status_history:
            params["status_history"] = 1
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset

        data = self._request("get_exchanges", params or None)

        items = data.get("items", []) if isinstance(data, dict) else data
        logger.info(f"Заявки: получено {len(items)} шт.")
        return items


    # ========================================================================
    # ВЫСОКОУРОВНЕВЫЕ МЕТОДЫ (для удобства)
    # ========================================================================


    def safe_pay(self, bid: BidResult) -> Dict:
        """
        Безопасное подтверждение оплаты с проверкой доступности.
        
        Если оплата через API недоступна (используется мерчант),
        бросает PaymentNotAvailableError с информативным сообщением.
        """
        if not bid.can_pay_via_api:
            if bid.payment_url:
                raise PaymentNotAvailableError(
                    f"Оплата через API недоступна — используется мерчант. "
                    f"Пользователь должен оплатить по ссылке: {bid.payment_url}. "
                    f"Статус обновится автоматически после поступления средств."
                )
            else:
                raise PaymentNotAvailableError(
                    f"Оплата через API недоступна. "
                    f"api_actions.pay = '{bid.api_actions.get('pay')}'"
                )
        return self.pay_bid(bid.hash)


    def safe_cancel(self, bid: BidResult) -> Dict:
        """
        Безопасная отмена заявки с проверкой доступности.
        
        Если отмена через API недоступна, бросает CancelNotAvailableError.
        """
        if not bid.can_cancel_via_api:
            cancel_val = bid.api_actions.get("cancel", "")
            if cancel_val.startswith("http"):
                raise CancelNotAvailableError(
                    f"Отмена через API недоступна. "
                    f"Ссылка для отмены: {cancel_val}"
                )
            else:
                raise CancelNotAvailableError(
                    f"Отмена через API недоступна. "
                    f"api_actions.cancel = '{cancel_val}'"
                )
        return self.cancel_bid(bid.hash)


    def full_exchange(
        self,
        direction_id: Union[str, int],
        amount: Union[int, float],
        fields: Dict[str, str],
        action: str = "give",
        api_id: Optional[str] = None,
        callback_url: Optional[str] = None,
        validate: bool = True,
    ) -> BidResult:
        """
        Полный цикл: расчёт → валидация полей → создание заявки.
        
        Удобный метод, объединяющий несколько шагов.
        
        Args:
            direction_id: ID направления
            amount:       сумма обмена
            fields:       заполненные поля формы
            action:       к чему относится сумма
            api_id:       внутренний ID
            callback_url: URL для вебхуков
            validate:     проверять ли обязательные поля перед созданием
            
        Returns:
            BidResult
            
        Raises:
            ValidationError если не заполнены обязательные поля (при validate=True).
        """
        # 1. Расчёт
        calc = self.calculate(direction_id, amount, action)
        if calc.changed:
            logger.warning(
                f"Сумма {amount} вне лимитов ({calc.min_give}–{calc.max_give}). "
                f"API скорректирует при создании заявки."
            )

        # 2. Валидация полей
        if validate:
            direction = self.get_direction(direction_id)
            missing = direction.validate_fields(fields)
            if missing:
                raise ValidationError(
                    f"Не заполнены обязательные поля: {', '.join(missing)}. "
                    f"Все обязательные поля: "
                    f"{[f.get('name') + ' (' + f.get('label', '') + ')' for f in direction.required_fields]}"
                )

        # 3. Создание заявки
        bid = self.create_bid(
            direction_id=direction_id,
            amount=amount,
            fields=fields,
            action=action,
            api_id=api_id,
            callback_url=callback_url,
        )
        return bid