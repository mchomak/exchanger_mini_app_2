"""Telegram bot command handlers using aiogram 3 Router."""

import logging
from datetime import datetime

from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup, WebAppInfo
from sqlalchemy import select

from backend.app.core.config import settings
from backend.app.core.database import async_session
from backend.app.models.user import User
from backend.app.models.user_settings import UserSettings
from backend.app.services.translations import get_phrase

logger = logging.getLogger(__name__)
router = Router()


def _lang(code: str | None) -> str:
    if code and code.startswith("en"):
        return "en"
    return "ru"


def _webapp_keyboard(lang: str) -> ReplyKeyboardMarkup:
    text = get_phrase("open_app_button", lang, source="bot")
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=text, web_app=WebAppInfo(url=settings.webapp_url))]],
        resize_keyboard=True,
    )


@router.message(CommandStart())
async def cmd_start(message: Message):
    """Register user and show WebApp button."""
    tg_user = message.from_user
    if not tg_user:
        return

    lang = _lang(tg_user.language_code)
    logger.info(f"/start from user {tg_user.id} (@{tg_user.username}), lang={lang}")

    async with async_session() as db:
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
            db.add(UserSettings(user_id=user.id, language=lang))
            await db.commit()
            logger.info(f"New user registered: telegram_id={tg_user.id}")
        else:
            user.last_active_at = datetime.utcnow()
            user.username = tg_user.username
            user.first_name = tg_user.first_name
            user.last_name = tg_user.last_name
            await db.commit()

    welcome = get_phrase("welcome_message", lang, source="bot")
    await message.answer(welcome, reply_markup=_webapp_keyboard(lang))


@router.message(Command("help"))
async def cmd_help(message: Message):
    tg_user = message.from_user
    lang = _lang(tg_user.language_code if tg_user else None)
    logger.info(f"/help from user {tg_user.id if tg_user else 'unknown'}")
    await message.answer(get_phrase("help_message", lang, source="bot"))
