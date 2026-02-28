"""Exchanger API service with in-memory caching."""

import logging
import sys
import os
import time
from typing import Any, Dict, List

# exchanger_api.py lives in the project root; inside Docker it is copied to /app
sys.path.insert(0, os.environ.get("PROJECT_ROOT", "/app"))

from exchanger_api import ExchangerAPI  # noqa: E402
from backend.app.core.config import settings  # noqa: E402

logger = logging.getLogger(__name__)

_directions_cache: Dict[str, Any] = {"data": None, "timestamp": 0}
CACHE_TTL = 300  # 5 minutes


def get_api() -> ExchangerAPI:
    """Create an ExchangerAPI instance."""
    return ExchangerAPI(
        login=settings.api_login,
        key=settings.api_key,
        base_url=settings.base_url,
    )


def get_directions_cached() -> List[Dict]:
    """Get exchange directions with 5-minute in-memory cache."""
    now = time.time()
    if _directions_cache["data"] is not None and (now - _directions_cache["timestamp"]) < CACHE_TTL:
        logger.debug("Returning cached directions")
        return _directions_cache["data"]

    logger.info("Fetching fresh directions from API")
    api = get_api()
    directions = api.get_directions()
    _directions_cache["data"] = directions
    _directions_cache["timestamp"] = now
    return directions


def calculate_exchange(direction_id: str, amount: float, calc_action: str = "give") -> Dict:
    """Calculate exchange amount."""
    api = get_api()
    result = api.calculate(direction_id, amount, action=calc_action)
    return {
        "sum_give": result.sum_give,
        "sum_give_com": result.sum_give_com,
        "sum_get": result.sum_get,
        "sum_get_com": result.sum_get_com,
        "currency_give": result.currency_give,
        "currency_get": result.currency_get,
        "course_give": result.course_give,
        "course_get": result.course_get,
        "reserve": result.reserve,
        "min_give": result.min_give,
        "max_give": result.max_give,
        "min_get": result.min_get,
        "max_get": result.max_get,
        "changed": result.changed,
    }


def get_direction_fields(direction_id: str) -> Dict:
    """Get required and optional fields for a direction."""
    api = get_api()
    direction_info = api.get_direction(direction_id)

    def _format_field(f: Dict, required: bool) -> Dict:
        return {
            "name": f.get("name", ""),
            "label": f.get("label", f.get("name", "")),
            "type": f.get("type", "text"),
            "req": required,
        }

    required = [_format_field(f, True) for f in direction_info.required_fields]
    optional = [_format_field(f, False) for f in direction_info.optional_fields]

    return {"required_fields": required, "optional_fields": optional}


def create_exchange(direction_id: str, amount: float, fields: Dict[str, str], action: str = "give") -> Dict:
    """Create an exchange bid."""
    api = get_api()
    bid = api.full_exchange(direction_id=direction_id, amount=amount, fields=fields, action=action)
    return {
        "id": bid.id,
        "hash": bid.hash,
        "url": bid.url,
        "status": bid.status,
        "status_title": bid.status_title,
        "amount_give": bid.amount_give,
        "amount_get": bid.amount_get,
        "currency_give": bid.currency_give,
        "currency_get": bid.currency_get,
        "can_pay_via_api": bid.can_pay_via_api,
        "can_cancel": bid.can_cancel_via_api,
        "payment_url": bid.payment_url,
        "payment_type": bid.payment_type,
    }


def get_bid_status(hash: str) -> Dict:
    """Get bid status by hash."""
    api = get_api()
    bid = api.get_bid_status(hash=hash)
    return {
        "id": bid.id,
        "hash": bid.hash,
        "url": bid.url,
        "status": bid.status,
        "status_title": bid.status_title,
        "amount_give": bid.amount_give,
        "amount_get": bid.amount_get,
        "currency_give": bid.currency_give,
        "currency_get": bid.currency_get,
        "can_pay_via_api": bid.can_pay_via_api,
        "can_cancel": bid.can_cancel_via_api,
        "payment_url": bid.payment_url,
        "payment_type": bid.payment_type,
    }
