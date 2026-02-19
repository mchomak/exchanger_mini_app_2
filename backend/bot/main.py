"""Telegram bot entry point using aiogram 3."""

import asyncio
import logging
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode

from backend.app.core.config import settings
from backend.app.core.logging_config import setup_logging
from backend.bot.handlers import router

setup_logging()
logger = logging.getLogger(__name__)


async def main():
    """Start the bot."""
    if not settings.bot_token or settings.bot_token == "YOUR_BOT_TOKEN_HERE":
        logger.error("BOT_TOKEN is not set in .env file!")
        sys.exit(1)

    bot = Bot(token=settings.bot_token, parse_mode=ParseMode.HTML)
    dp = Dispatcher()
    dp.include_router(router)

    logger.info("Bot starting...")

    try:
        await dp.start_polling(bot)
    finally:
        await bot.session.close()
        logger.info("Bot stopped")


if __name__ == "__main__":
    asyncio.run(main())
