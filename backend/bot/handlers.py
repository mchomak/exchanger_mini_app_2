"""Telegram bot command handlers using aiogram 3 Router."""

import logging
from datetime import datetime

from aiogram import Router
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, WebAppInfo, ReplyKeyboardMarkup, KeyboardButton
from sqlalchemy import select

from backend.app.core.config import settings
from backend.app.core.database import async_session
from backend.app.models.user import User
from backend.app.models.user_settings import UserSettings
from backend.app.services.translations import get_phrase

logger = logging.getLogger(__name__)
router = Router()


def _get_language(user_lang: str | None) -> str:
    """Normalize language code to 'ru' or 'en'."""
    if user_lang and user_lang.startswith("en"):
        return "en"
    return "ru"


def _get_webapp_keyboard(lang: str) -> ReplyKeyboardMarkup:
    """Build keyboard with WebApp button."""
    webapp_url = settings.webapp_url
    button_text = get_phrase("open_app_button", lang, source="bot")
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=button_text, web_app=WebAppInfo(url=webapp_url))]
        ],
        resize_keyboard=True,
    )


@router.message(CommandStart())
async def cmd_start(message: Message):
    """Handle /start command: register user and show WebApp button."""
    tg_user = message.from_user
    if not tg_user:
        return

    lang = _get_language(tg_user.language_code)
    logger.info(f"/start from user {tg_user.id} (@{tg_user.username}), lang={lang}")

    async with async_session() as db:
        # Find or create user
        result = await db.execute(select(User).where(User.telegram_id == tg_user.id))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                telegram_id=tg_user.id,
                username=tg_user.username,
                first_name=tg_user.first_name,
                last_name=tg_user.last_name,
                language_code=lang,
            )
            db.add(user)
            await db.flush()

            user_settings = UserSettings(user_id=user.id, language=lang)
            db.add(user_settings)
            await db.commit()
            logger.info(f"New user registered: telegram_id={tg_user.id}")
        else:
            user.last_active_at = datetime.utcnow()
            user.username = tg_user.username
            user.first_name = tg_user.first_name
            user.last_name = tg_user.last_name
            await db.commit()

    welcome = get_phrase("welcome_message", lang, source="bot")
    keyboard = _get_webapp_keyboard(lang)
    await message.answer(welcome, reply_markup=keyboard)


@router.message(Command("help"))
async def cmd_help(message: Message):
    """Handle /help command."""
    tg_user = message.from_user
    lang = _get_language(tg_user.language_code if tg_user else None)
    logger.info(f"/help from user {tg_user.id if tg_user else 'unknown'}")

    help_text = get_phrase("help_message", lang, source="bot")
    await message.answer(help_text)
