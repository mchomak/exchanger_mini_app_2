"""Logging configuration with file rotation."""

import logging
from logging.handlers import RotatingFileHandler
import os

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FORMAT = "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"


def setup_logging() -> None:
    """Configure logging with INFO and DEBUG file handlers + console."""
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    # Console handler - INFO level
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root_logger.addHandler(console_handler)

    # Info file handler - INFO level, 10MB rotation, 5 backups
    info_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, "info.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    info_handler.setLevel(logging.INFO)
    info_handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root_logger.addHandler(info_handler)

    # Debug file handler - DEBUG level, 50MB rotation, 3 backups
    debug_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, "debug.log"),
        maxBytes=50 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    debug_handler.setLevel(logging.DEBUG)
    debug_handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root_logger.addHandler(debug_handler)
