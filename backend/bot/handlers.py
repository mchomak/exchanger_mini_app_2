"""Telegram bot command handlers using aiogram 3 Router."""

import logging
import re
from datetime import datetime

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
)
from sqlalchemy import select

from backend.app.core.config import settings
from backend.app.core.database import async_session
from backend.app.models import User, Exchange, UserSettings  # noqa: F401
from backend.app.services.translations import get_phrase

logger = logging.getLogger(__name__)
router = Router()


# ── FSM States ────────────────────────────────────────────────────────────────

class ProfileEdit(StatesGroup):
    waiting_fio = State()
    waiting_phone = State()
    waiting_email = State()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _lang(code: str | None) -> str:
    if code and code.startswith("en"):
        return "en"
    return "ru"


def _main_keyboard(lang: str) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=get_phrase("profile_button", lang, source="bot"))],
        ],
        resize_keyboard=True,
    )


def _profile_text(lang: str, user_settings: UserSettings | None) -> str:
    not_set = get_phrase("profile_not_set", lang, source="bot")
    fio = user_settings.saved_full_name if user_settings and user_settings.saved_full_name else not_set
    phone = user_settings.saved_phone if user_settings and user_settings.saved_phone else not_set
    email = user_settings.saved_email if user_settings and user_settings.saved_email else not_set
    title = get_phrase("profile_title", lang, source="bot")
    fio_label = get_phrase("profile_fio", lang, source="bot")
    phone_label = get_phrase("profile_phone", lang, source="bot")
    email_label = get_phrase("profile_email", lang, source="bot")
    return (
        f"{title}\n\n"
        f"{fio_label}: <b>{fio}</b>\n"
        f"{phone_label}: <b>{phone}</b>\n"
        f"{email_label}: <b>{email}</b>"
    )


def _profile_keyboard(lang: str) -> InlineKeyboardMarkup:
    fio_label = get_phrase("profile_fio", lang, source="bot")
    phone_label = get_phrase("profile_phone", lang, source="bot")
    email_label = get_phrase("profile_email", lang, source="bot")
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=fio_label, callback_data="profile_edit_fio")],
        [InlineKeyboardButton(text=phone_label, callback_data="profile_edit_phone")],
        [InlineKeyboardButton(text=email_label, callback_data="profile_edit_email")],
    ])


def _edit_or_back_keyboard(lang: str, field: str) -> InlineKeyboardMarkup:
    edit_text = get_phrase("profile_edit", lang, source="bot")
    back_text = get_phrase("profile_back", lang, source="bot")
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=edit_text, callback_data=f"profile_start_edit_{field}")],
        [InlineKeyboardButton(text=back_text, callback_data="profile_back")],
    ])


def _cancel_keyboard(lang: str) -> InlineKeyboardMarkup:
    cancel_text = get_phrase("profile_cancel", lang, source="bot")
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=cancel_text, callback_data="profile_cancel")],
    ])


def _validate_phone(value: str) -> bool:
    return bool(re.match(r'^[+]?[\d\s()\-]{7,20}$', value.strip()))


def _validate_email(value: str) -> bool:
    return bool(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', value.strip()))


# ── /start ────────────────────────────────────────────────────────────────────

@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    """Register user and show main keyboard."""
    tg_user = message.from_user
    if not tg_user:
        return

    await state.clear()
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
    await message.answer(welcome, reply_markup=_main_keyboard(lang))


# ── /help ─────────────────────────────────────────────────────────────────────

@router.message(Command("help"))
async def cmd_help(message: Message):
    tg_user = message.from_user
    lang = _lang(tg_user.language_code if tg_user else None)
    logger.info(f"/help from user {tg_user.id if tg_user else 'unknown'}")
    await message.answer(get_phrase("help_message", lang, source="bot"))


# ── Profile button (reply keyboard text) ─────────────────────────────────────

@router.message(F.text.in_({"👤 Профиль", "👤 Profile"}))
async def show_profile(message: Message, state: FSMContext):
    """Show user profile with inline buttons."""
    tg_user = message.from_user
    if not tg_user:
        return

    await state.clear()
    lang = _lang(tg_user.language_code)

    async with async_session() as db:
        result = await db.execute(select(User).where(User.telegram_id == tg_user.id))
        user = result.scalar_one_or_none()
        user_settings = user.settings if user else None

    text = _profile_text(lang, user_settings)
    await message.answer(text, reply_markup=_profile_keyboard(lang), parse_mode="HTML")


# ── Profile inline callbacks ─────────────────────────────────────────────────

@router.callback_query(F.data.in_({"profile_edit_fio", "profile_edit_phone", "profile_edit_email"}))
async def profile_field_menu(callback: CallbackQuery):
    """Show edit/back menu for a specific field."""
    tg_user = callback.from_user
    lang = _lang(tg_user.language_code if tg_user else None)
    field = callback.data.replace("profile_edit_", "")  # fio, phone, email

    label_key = f"profile_{field}"
    label = get_phrase(label_key, lang, source="bot")

    not_set = get_phrase("profile_not_set", lang, source="bot")
    async with async_session() as db:
        result = await db.execute(select(User).where(User.telegram_id == tg_user.id))
        user = result.scalar_one_or_none()
        us = user.settings if user else None
        if field == "fio":
            current = us.saved_full_name if us and us.saved_full_name else not_set
        elif field == "phone":
            current = us.saved_phone if us and us.saved_phone else not_set
        else:
            current = us.saved_email if us and us.saved_email else not_set

    text = f"{label}: <b>{current}</b>"
    await callback.message.edit_text(text, reply_markup=_edit_or_back_keyboard(lang, field), parse_mode="HTML")
    await callback.answer()


@router.callback_query(F.data == "profile_back")
async def profile_back(callback: CallbackQuery, state: FSMContext):
    """Go back to profile overview."""
    await state.clear()
    tg_user = callback.from_user
    lang = _lang(tg_user.language_code if tg_user else None)

    async with async_session() as db:
        result = await db.execute(select(User).where(User.telegram_id == tg_user.id))
        user = result.scalar_one_or_none()
        user_settings = user.settings if user else None

    text = _profile_text(lang, user_settings)
    await callback.message.edit_text(text, reply_markup=_profile_keyboard(lang), parse_mode="HTML")
    await callback.answer()


@router.callback_query(F.data == "profile_cancel")
async def profile_cancel(callback: CallbackQuery, state: FSMContext):
    """Cancel editing and go back to profile."""
    await state.clear()
    tg_user = callback.from_user
    lang = _lang(tg_user.language_code if tg_user else None)

    async with async_session() as db:
        result = await db.execute(select(User).where(User.telegram_id == tg_user.id))
        user = result.scalar_one_or_none()
        user_settings = user.settings if user else None

    text = _profile_text(lang, user_settings)
    await callback.message.edit_text(text, reply_markup=_profile_keyboard(lang), parse_mode="HTML")
    await callback.answer()


@router.callback_query(F.data.in_({"profile_start_edit_fio", "profile_start_edit_phone", "profile_start_edit_email"}))
async def profile_start_edit(callback: CallbackQuery, state: FSMContext):
    """Start editing a profile field — ask user to send new value."""
    tg_user = callback.from_user
    lang = _lang(tg_user.language_code if tg_user else None)
    field = callback.data.replace("profile_start_edit_", "")  # fio, phone, email

    prompt_key = f"profile_enter_{field}"
    prompt = get_phrase(prompt_key, lang, source="bot")

    if field == "fio":
        await state.set_state(ProfileEdit.waiting_fio)
    elif field == "phone":
        await state.set_state(ProfileEdit.waiting_phone)
    else:
        await state.set_state(ProfileEdit.waiting_email)

    await callback.message.edit_text(prompt, reply_markup=_cancel_keyboard(lang))
    await callback.answer()


# ── FSM handlers: receive user input ─────────────────────────────────────────

@router.message(ProfileEdit.waiting_fio)
async def receive_fio(message: Message, state: FSMContext):
    """Receive and save full name."""
    tg_user = message.from_user
    lang = _lang(tg_user.language_code if tg_user else None)
    value = message.text.strip() if message.text else ""

    if len(value) < 2:
        await message.answer("❌ Слишком короткое значение. Попробуйте ещё раз:",
                             reply_markup=_cancel_keyboard(lang))
        return

    await _save_field(tg_user.id, "saved_full_name", value)
    await state.clear()
    saved_text = get_phrase("profile_saved", lang, source="bot")
    await message.answer(saved_text)
    await _show_profile_message(message, tg_user, lang)


@router.message(ProfileEdit.waiting_phone)
async def receive_phone(message: Message, state: FSMContext):
    """Receive and validate phone number."""
    tg_user = message.from_user
    lang = _lang(tg_user.language_code if tg_user else None)
    value = message.text.strip() if message.text else ""

    if not _validate_phone(value):
        error_text = get_phrase("profile_invalid_phone", lang, source="bot")
        await message.answer(error_text, reply_markup=_cancel_keyboard(lang))
        return

    await _save_field(tg_user.id, "saved_phone", value)
    await state.clear()
    saved_text = get_phrase("profile_saved", lang, source="bot")
    await message.answer(saved_text)
    await _show_profile_message(message, tg_user, lang)


@router.message(ProfileEdit.waiting_email)
async def receive_email(message: Message, state: FSMContext):
    """Receive and validate email."""
    tg_user = message.from_user
    lang = _lang(tg_user.language_code if tg_user else None)
    value = message.text.strip() if message.text else ""

    if not _validate_email(value):
        error_text = get_phrase("profile_invalid_email", lang, source="bot")
        await message.answer(error_text, reply_markup=_cancel_keyboard(lang))
        return

    await _save_field(tg_user.id, "saved_email", value)
    await state.clear()
    saved_text = get_phrase("profile_saved", lang, source="bot")
    await message.answer(saved_text)
    await _show_profile_message(message, tg_user, lang)


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _save_field(telegram_id: int, field_name: str, value: str) -> None:
    """Save a single field on UserSettings."""
    async with async_session() as db:
        result = await db.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalar_one_or_none()
        if user and user.settings:
            setattr(user.settings, field_name, value)
            await db.commit()
            logger.info(f"Profile updated for {telegram_id}: {field_name}={value}")


async def _show_profile_message(message: Message, tg_user, lang: str) -> None:
    """Send a fresh profile message after editing."""
    async with async_session() as db:
        result = await db.execute(select(User).where(User.telegram_id == tg_user.id))
        user = result.scalar_one_or_none()
        user_settings = user.settings if user else None

    text = _profile_text(lang, user_settings)
    await message.answer(text, reply_markup=_profile_keyboard(lang), parse_mode="HTML")
