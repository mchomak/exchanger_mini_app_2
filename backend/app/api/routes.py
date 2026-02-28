"""FastAPI route handlers."""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.api.schemas import (
    CalculateRequest,
    CalculateResponse,
    CreateExchangeRequest,
    InitUserRequest,
    SaveUserProfileRequest,
    UserResponse,
    UserSettingsResponse,
)
from backend.app.core.database import get_db
from backend.app.models.exchange import Exchange
from backend.app.models.user import User
from backend.app.models.user_settings import UserSettings
from backend.app.services.bot_notify import send_order_created, send_order_error, send_order_paid
from backend.app.services.exchanger import (
    calculate_exchange,
    create_exchange,
    get_bid_status,
    get_direction_fields,
    get_directions_cached,
)
from backend.app.services.telegram_auth import validate_init_data
from backend.app.services.translations import get_all_phrases

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


def _error(message: str, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": True, "message": message})


# ── Users ─────────────────────────────────────────────────────────────────────

@router.post("/users/init", response_model=UserResponse)
async def init_user(body: InitUserRequest, db: AsyncSession = Depends(get_db)):
    """Validate Telegram initData, find or create user, return user + settings."""
    user_data = validate_init_data(body.init_data)
    if not user_data:
        raise _error("Invalid Telegram initData", 401)

    telegram_id = user_data.get("id")
    if not telegram_id:
        raise _error("No user ID in initData", 401)

    logger.info(f"User init: telegram_id={telegram_id}")

    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            telegram_id=telegram_id,
            username=user_data.get("username"),
            first_name=user_data.get("first_name"),
            last_name=user_data.get("last_name"),
            language_code=user_data.get("language_code", "ru"),
        )
        db.add(user)
        await db.flush()
        db.add(UserSettings(user_id=user.id, language=user_data.get("language_code", "ru")))
        await db.flush()
        logger.info(f"New user created: telegram_id={telegram_id}")
    else:
        user.last_active_at = datetime.utcnow()
        user.username = user_data.get("username", user.username)
        user.first_name = user_data.get("first_name", user.first_name)
        user.last_name = user_data.get("last_name", user.last_name)

    await db.commit()

    result = await db.execute(select(User).where(User.id == user.id))
    user = result.scalar_one()

    settings_resp = None
    if user.settings:
        settings_resp = UserSettingsResponse(
            default_currency_give=user.settings.default_currency_give,
            default_currency_get=user.settings.default_currency_get,
            notifications_enabled=user.settings.notifications_enabled,
            language=user.settings.language,
            saved_full_name=user.settings.saved_full_name,
            saved_email=user.settings.saved_email,
        )

    return UserResponse(
        id=user.id,
        telegram_id=user.telegram_id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        language_code=user.language_code,
        settings=settings_resp,
    )


# ── Exchange ──────────────────────────────────────────────────────────────────

@router.get("/exchange/directions")
async def get_directions():
    """Get all exchange directions (cached 5 min)."""
    try:
        directions = get_directions_cached()
        logger.debug(f"Returning {len(directions)} directions")
        return directions
    except Exception as e:
        logger.error(f"Error fetching directions: {e}")
        raise _error(f"Failed to fetch directions: {e}", 500)


@router.post("/exchange/calculate", response_model=CalculateResponse)
async def calculate(body: CalculateRequest):
    """Calculate exchange amounts for a direction."""
    try:
        logger.debug(f"Calculate: direction={body.direction_id}, amount={body.amount}")
        result = calculate_exchange(body.direction_id, body.amount, body.calc_action)
        return CalculateResponse(**result)
    except Exception as e:
        logger.error(f"Error calculating: {e}")
        raise _error(f"Calculation failed: {e}", 500)


@router.post("/exchange/create")
async def create_exchange_order(body: CreateExchangeRequest, db: AsyncSession = Depends(get_db)):
    """Create a new exchange order."""
    try:
        result = await db.execute(select(User).where(User.telegram_id == body.user_telegram_id))
        user = result.scalar_one_or_none()
        if not user:
            raise _error("User not found", 404)

        logger.info(f"Creating exchange: user={body.user_telegram_id}, direction={body.direction_id}")
        bid_data = create_exchange(body.direction_id, body.amount, body.fields)

        exchange = Exchange(
            user_id=user.id,
            exchanger_order_id=int(bid_data["id"]) if bid_data.get("id") else None,
            exchanger_order_hash=bid_data.get("hash"),
            direction_id=body.direction_id,
            currency_give_code=bid_data.get("currency_give"),
            currency_get_code=bid_data.get("currency_get"),
            amount_give=float(bid_data.get("amount_give", 0)),
            amount_get=float(bid_data.get("amount_get", 0)),
            status=bid_data.get("status_title"),
            payment_type=bid_data.get("payment_type"),
            can_cancel=bid_data.get("can_cancel", False),
            can_pay_via_api=bid_data.get("can_pay_via_api", False),
            payment_url=bid_data.get("payment_url"),
            order_url=bid_data.get("url"),
        )
        db.add(exchange)
        await db.commit()
        logger.info(f"Exchange created: hash={bid_data.get('hash')}")

        # Send bot notification about order creation
        try:
            await send_order_created(body.user_telegram_id, bid_data)
        except Exception as notify_err:
            logger.error(f"Failed to send order notification: {notify_err}")

        return bid_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating exchange: {e}")
        raise _error(f"Exchange creation failed: {e}", 500)


@router.get("/exchange/{hash}/status")
async def get_exchange_status(hash: str, db: AsyncSession = Depends(get_db)):
    """Get exchange status by hash."""
    try:
        status_data = get_bid_status(hash)

        result = await db.execute(
            select(Exchange)
            .where(Exchange.exchanger_order_hash == hash)
            .options(selectinload(Exchange.user))
        )
        exchange = result.scalar_one_or_none()
        if exchange and exchange.status != status_data.get("status_title"):
            old_status = exchange.status
            new_status = status_data.get("status_title", "")
            exchange.status = new_status
            exchange.updated_at = datetime.utcnow()
            await db.commit()
            logger.info(f"Exchange {hash} status updated: {old_status} -> {new_status}")

            # Send bot notification on status change
            if exchange.user:
                telegram_id = exchange.user.telegram_id
                try:
                    new_lower = new_status.lower()
                    if any(kw in new_lower for kw in ("оплач", "выполн", "paid", "done", "complet")):
                        await send_order_paid(telegram_id, status_data)
                    elif any(kw in new_lower for kw in ("ошибк", "отмен", "error", "cancel", "reject")):
                        await send_order_error(telegram_id, status_data)
                except Exception as notify_err:
                    logger.error(f"Failed to send status notification: {notify_err}")

        return status_data
    except Exception as e:
        logger.error(f"Error getting status for {hash}: {e}")
        raise _error(f"Status check failed: {e}", 500)


@router.get("/exchange/direction/{direction_id}/fields")
async def get_fields(direction_id: str):
    """Get required and optional fields for an exchange direction."""
    try:
        fields_data = get_direction_fields(direction_id)
        return fields_data
    except Exception as e:
        logger.error(f"Error fetching fields for direction {direction_id}: {e}")
        raise _error(f"Failed to fetch direction fields: {e}", 500)


# ── User Profile ─────────────────────────────────────────────────────────────

@router.post("/users/profile/save")
async def save_user_profile(body: SaveUserProfileRequest, db: AsyncSession = Depends(get_db)):
    """Save user profile fields (full_name, email) for auto-fill."""
    result = await db.execute(select(User).where(User.telegram_id == body.telegram_id))
    user = result.scalar_one_or_none()
    if not user:
        raise _error("User not found", 404)

    if user.settings:
        if body.full_name is not None:
            user.settings.saved_full_name = body.full_name
        if body.email is not None:
            user.settings.saved_email = body.email
        await db.commit()

    return {"ok": True}


# ── Translations ──────────────────────────────────────────────────────────────

@router.get("/translations/{language}")
async def get_translations(language: str):
    """Get all app phrases for a given language."""
    return get_all_phrases(lang=language, source="app")
