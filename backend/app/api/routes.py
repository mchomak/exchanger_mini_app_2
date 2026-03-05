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
    ExchangeHistoryItem,
    InitUserRequest,
    SaveUserProfileRequest,
    UserAccountsResponse,
    UserCardCreate,
    UserCardItem,
    UserCardUpdate,
    UserPhoneCreate,
    UserPhoneItem,
    UserPhoneUpdate,
    UserResponse,
    UserSettingsResponse,
    UserWalletCreate,
    UserWalletItem,
    UserWalletUpdate,
)
from backend.app.core.database import get_db
from backend.app.models.exchange import Exchange
from backend.app.models.user import User
from backend.app.models.user_card import UserCard
from backend.app.models.user_crypto_wallet import UserCryptoWallet
from backend.app.models.user_phone import UserPhone
from backend.app.models.user_settings import UserSettings
from backend.app.services.bot_notify import send_order_created, send_order_error, send_order_paid, send_review_banner
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
    logger.debug(f"init_user called, initData length: {len(body.init_data)}")
    user_data = validate_init_data(body.init_data)
    if not user_data:
        logger.warning(f"initData validation failed, initData length={len(body.init_data)}")
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
    logger.debug(f"User {telegram_id} has settings: {user.settings is not None}")
    if user.settings:
        logger.debug(f"Settings: full_name={user.settings.saved_full_name}, email={user.settings.saved_email}, phone={user.settings.saved_phone}")
        settings_resp = UserSettingsResponse(
            default_currency_give=user.settings.default_currency_give,
            default_currency_get=user.settings.default_currency_get,
            notifications_enabled=user.settings.notifications_enabled,
            language=user.settings.language,
            saved_full_name=user.settings.saved_full_name,
            saved_email=user.settings.saved_email,
            saved_phone=user.settings.saved_phone,
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
        logger.debug(f"Exchange fields: {body.fields}")
        logger.debug(f"Exchange amount: {body.amount}")
        bid_data = create_exchange(body.direction_id, body.amount, body.fields)
        logger.debug(f"Exchange API response: {bid_data}")

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
            status_title=bid_data.get("status_title"),
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
            exchange.status_title = new_status
            exchange.updated_at = datetime.utcnow()
            # Save error message if status indicates error
            new_lower = new_status.lower()
            if any(kw in new_lower for kw in ("ошибк", "отмен", "error", "cancel", "reject")):
                exchange.error_message = new_status
            await db.commit()
            logger.info(f"Exchange {hash} status updated: {old_status} -> {new_status}")

            # Send bot notification on status change
            if exchange.user:
                telegram_id = exchange.user.telegram_id
                try:
                    if any(kw in new_lower for kw in ("оплач", "выполн", "paid", "done", "complet")):
                        await send_order_paid(telegram_id, status_data)
                        await send_review_banner(telegram_id)
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
    """Save user profile fields (full_name, email, phone) for auto-fill."""
    logger.debug(f"save_user_profile: telegram_id={body.telegram_id}")
    if not body.telegram_id or body.telegram_id <= 0:
        logger.warning(f"Invalid telegram_id in profile save: {body.telegram_id}")
        raise _error("Invalid Telegram ID", 400)

    result = await db.execute(select(User).where(User.telegram_id == body.telegram_id))
    user = result.scalar_one_or_none()
    if not user:
        logger.warning(f"User not found for telegram_id={body.telegram_id}")
        raise _error("User not found", 404)

    if user.settings:
        if body.full_name is not None:
            user.settings.saved_full_name = body.full_name
        if body.email is not None:
            user.settings.saved_email = body.email
        if body.phone is not None:
            user.settings.saved_phone = body.phone
        await db.commit()

    return {"ok": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_user_by_tg(telegram_id: int, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()
    if not user:
        raise _error("User not found", 404)
    return user


# ── Exchange History ─────────────────────────────────────────────────────────

@router.get("/exchange/history/{telegram_id}")
async def get_exchange_history(telegram_id: int, db: AsyncSession = Depends(get_db)):
    """Get user exchange history ordered by date descending."""
    user = await _get_user_by_tg(telegram_id, db)
    result = await db.execute(
        select(Exchange)
        .where(Exchange.user_id == user.id)
        .order_by(Exchange.created_at.desc())
        .limit(100)
    )
    exchanges = result.scalars().all()
    items = []
    for ex in exchanges:
        items.append(ExchangeHistoryItem(
            id=ex.id,
            currency_give=ex.currency_give_code,
            currency_get=ex.currency_get_code,
            amount_give=str(ex.amount_give) if ex.amount_give else None,
            amount_get=str(ex.amount_get) if ex.amount_get else None,
            status=ex.status,
            status_title=ex.status_title,
            error_message=ex.error_message,
            created_at=ex.created_at.isoformat() if ex.created_at else None,
        ))
    return items


# ── User Accounts CRUD ──────────────────────────────────────────────────────

@router.get("/users/{telegram_id}/accounts")
async def get_user_accounts(telegram_id: int, db: AsyncSession = Depends(get_db)):
    """Get all saved accounts (cards, wallets, phones) for a user."""
    user = await _get_user_by_tg(telegram_id, db)
    return UserAccountsResponse(
        cards=[UserCardItem(id=c.id, label=c.label, card_number=c.card_number) for c in user.cards],
        wallets=[UserWalletItem(id=w.id, label=w.label, address=w.address) for w in user.crypto_wallets],
        phones=[UserPhoneItem(id=p.id, label=p.label, phone_number=p.phone_number) for p in user.phones],
    )


# Cards
@router.post("/users/{telegram_id}/cards")
async def add_card(telegram_id: int, body: UserCardCreate, db: AsyncSession = Depends(get_db)):
    user = await _get_user_by_tg(telegram_id, db)
    card = UserCard(user_id=user.id, label=body.label, card_number=body.card_number)
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return UserCardItem(id=card.id, label=card.label, card_number=card.card_number)


@router.put("/users/{telegram_id}/cards/{card_id}")
async def update_card(telegram_id: int, card_id: int, body: UserCardUpdate, db: AsyncSession = Depends(get_db)):
    user = await _get_user_by_tg(telegram_id, db)
    result = await db.execute(select(UserCard).where(UserCard.id == card_id, UserCard.user_id == user.id))
    card = result.scalar_one_or_none()
    if not card:
        raise _error("Card not found", 404)
    if body.label is not None:
        card.label = body.label
    if body.card_number is not None:
        card.card_number = body.card_number
    await db.commit()
    return UserCardItem(id=card.id, label=card.label, card_number=card.card_number)


@router.delete("/users/{telegram_id}/cards/{card_id}")
async def delete_card(telegram_id: int, card_id: int, db: AsyncSession = Depends(get_db)):
    user = await _get_user_by_tg(telegram_id, db)
    result = await db.execute(select(UserCard).where(UserCard.id == card_id, UserCard.user_id == user.id))
    card = result.scalar_one_or_none()
    if not card:
        raise _error("Card not found", 404)
    await db.delete(card)
    await db.commit()
    return {"ok": True}


# Wallets
@router.post("/users/{telegram_id}/wallets")
async def add_wallet(telegram_id: int, body: UserWalletCreate, db: AsyncSession = Depends(get_db)):
    user = await _get_user_by_tg(telegram_id, db)
    wallet = UserCryptoWallet(user_id=user.id, label=body.label, address=body.address)
    db.add(wallet)
    await db.commit()
    await db.refresh(wallet)
    return UserWalletItem(id=wallet.id, label=wallet.label, address=wallet.address)


@router.put("/users/{telegram_id}/wallets/{wallet_id}")
async def update_wallet(telegram_id: int, wallet_id: int, body: UserWalletUpdate, db: AsyncSession = Depends(get_db)):
    user = await _get_user_by_tg(telegram_id, db)
    result = await db.execute(select(UserCryptoWallet).where(UserCryptoWallet.id == wallet_id, UserCryptoWallet.user_id == user.id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise _error("Wallet not found", 404)
    if body.label is not None:
        wallet.label = body.label
    if body.address is not None:
        wallet.address = body.address
    await db.commit()
    return UserWalletItem(id=wallet.id, label=wallet.label, address=wallet.address)


@router.delete("/users/{telegram_id}/wallets/{wallet_id}")
async def delete_wallet(telegram_id: int, wallet_id: int, db: AsyncSession = Depends(get_db)):
    user = await _get_user_by_tg(telegram_id, db)
    result = await db.execute(select(UserCryptoWallet).where(UserCryptoWallet.id == wallet_id, UserCryptoWallet.user_id == user.id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise _error("Wallet not found", 404)
    await db.delete(wallet)
    await db.commit()
    return {"ok": True}


# Phones
@router.post("/users/{telegram_id}/phones")
async def add_phone(telegram_id: int, body: UserPhoneCreate, db: AsyncSession = Depends(get_db)):
    user = await _get_user_by_tg(telegram_id, db)
    phone = UserPhone(user_id=user.id, label=body.label, phone_number=body.phone_number)
    db.add(phone)
    await db.commit()
    await db.refresh(phone)
    return UserPhoneItem(id=phone.id, label=phone.label, phone_number=phone.phone_number)


@router.put("/users/{telegram_id}/phones/{phone_id}")
async def update_phone(telegram_id: int, phone_id: int, body: UserPhoneUpdate, db: AsyncSession = Depends(get_db)):
    user = await _get_user_by_tg(telegram_id, db)
    result = await db.execute(select(UserPhone).where(UserPhone.id == phone_id, UserPhone.user_id == user.id))
    phone = result.scalar_one_or_none()
    if not phone:
        raise _error("Phone not found", 404)
    if body.label is not None:
        phone.label = body.label
    if body.phone_number is not None:
        phone.phone_number = body.phone_number
    await db.commit()
    return UserPhoneItem(id=phone.id, label=phone.label, phone_number=phone.phone_number)


@router.delete("/users/{telegram_id}/phones/{phone_id}")
async def delete_phone(telegram_id: int, phone_id: int, db: AsyncSession = Depends(get_db)):
    user = await _get_user_by_tg(telegram_id, db)
    result = await db.execute(select(UserPhone).where(UserPhone.id == phone_id, UserPhone.user_id == user.id))
    phone = result.scalar_one_or_none()
    if not phone:
        raise _error("Phone not found", 404)
    await db.delete(phone)
    await db.commit()
    return {"ok": True}


# ── Translations ──────────────────────────────────────────────────────────────

@router.get("/translations/{language}")
async def get_translations(language: str):
    """Get all app phrases for a given language."""
    return get_all_phrases(lang=language, source="app")
