"""Telegram WebApp initData validation (HMAC-SHA256)."""

import hashlib
import hmac
import json
import logging
from typing import Any, Dict, Optional
from urllib.parse import parse_qs, unquote

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


def validate_init_data(init_data: str) -> Optional[Dict[str, Any]]:
    """
    Validate Telegram WebApp initData using HMAC-SHA256.

    Returns parsed user data dict if valid, None if invalid.
    """
    if not init_data:
        logger.warning("Empty initData received")
        return None

    try:
        parsed = parse_qs(init_data, keep_blank_values=True)

        received_hash = parsed.get("hash", [None])[0]
        if not received_hash:
            logger.warning("No hash in initData")
            return None

        # Build data-check-string (sorted, excluding hash)
        data_pairs = []
        for key, values in parsed.items():
            if key == "hash":
                continue
            data_pairs.append(f"{key}={values[0]}")
        data_pairs.sort()
        data_check_string = "\n".join(data_pairs)

        # Compute HMAC
        secret_key = hmac.new(
            b"WebAppData",
            settings.bot_token.encode("utf-8"),
            hashlib.sha256,
        ).digest()

        computed_hash = hmac.new(
            secret_key,
            data_check_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(computed_hash, received_hash):
            logger.warning("initData HMAC validation failed")
            return None

        user_raw = parsed.get("user", [None])[0]
        if user_raw:
            user_data = json.loads(unquote(user_raw))
            logger.info(f"Validated initData for user {user_data.get('id')}")
            return user_data

        logger.warning("No user data in initData")
        return None

    except Exception as e:
        logger.error(f"Error validating initData: {e}")
        return None
