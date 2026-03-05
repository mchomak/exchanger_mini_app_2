"""Send Telegram bot messages directly via Bot API (no polling needed)."""

import logging

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


async def send_order_created(telegram_id: int, order_data: dict) -> None:
    """Send order creation notification to user."""
    text = (
        f"✅ <b>Заявка создана!</b>\n\n"
        f"🆔 ID: <code>{order_data.get('id')}</code>\n"
        f"🔑 Hash: <code>{order_data.get('hash')}</code>\n"
        f"📊 Статус: {order_data.get('status_title')}\n"
        f"💰 Отдаете: {order_data.get('amount_give')} {order_data.get('currency_give')}\n"
        f"💵 Получаете: {order_data.get('amount_get')} {order_data.get('currency_get')}\n"
        f"🔗 <a href=\"{order_data.get('url')}\">Ссылка на заявку</a>"
    )
    await _send_message(telegram_id, text)


async def send_order_paid(telegram_id: int, order_data: dict) -> None:
    """Send payment confirmation notification to user."""
    text = (
        f"💳 <b>Оплата получена!</b>\n\n"
        f"🆔 ID: <code>{order_data.get('id')}</code>\n"
        f"📊 Статус: {order_data.get('status_title')}\n"
        f"💰 {order_data.get('amount_give')} {order_data.get('currency_give')} → "
        f"{order_data.get('amount_get')} {order_data.get('currency_get')}"
    )
    await _send_message(telegram_id, text)


async def send_order_error(telegram_id: int, order_data: dict) -> None:
    """Send error notification to user."""
    text = (
        f"❌ <b>Ошибка обмена</b>\n\n"
        f"🆔 ID: <code>{order_data.get('id')}</code>\n"
        f"📊 Статус: {order_data.get('status_title')}\n\n"
        f"Приносим извинения за неудобства. Обратитесь в поддержку: @sapsanpay"
    )
    await _send_message(telegram_id, text)




async def send_review_banner(telegram_id: int) -> None:
    """Send review campaign banner to user after successful exchange."""
    info_url = settings.review_info_url
    button_url = settings.review_button_url or info_url
    text = (
        "🎁 <b>Получите 50$ за отзыв!</b>\n\n"
        "Оставьте честный отзыв о SapsanEx — и примите участие в розыгрыше <b>50$</b>.\n"
        f"<a href=\"{info_url}\">Подробнее в нашем ТГ</a>"
    )
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Оставить отзыв", url=button_url)]]
    )
    await _send_message(telegram_id, text, reply_markup=keyboard)


async def _send_message(telegram_id: int, text: str, reply_markup: InlineKeyboardMarkup | None = None) -> None:
    """Send a message to a Telegram user via Bot API."""
    bot = Bot(token=settings.bot_token)
    try:
        await bot.send_message(
            chat_id=telegram_id,
            text=text,
            parse_mode="HTML",
            disable_web_page_preview=True,
            reply_markup=reply_markup,
        )
        logger.info(f"Bot message sent to {telegram_id}")
    except Exception as e:
        logger.error(f"Failed to send bot message to {telegram_id}: {e}")
    finally:
        await bot.session.close()
