"""Logging configuration with file rotation."""

import logging
import os
from logging.handlers import RotatingFileHandler

LOG_DIR = os.environ.get("LOG_DIR", "/app/logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FORMAT = "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"


def setup_logging() -> None:
    """Configure logging with INFO and DEBUG file handlers + console."""
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    # Console handler — INFO level
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter(LOG_FORMAT))
    root_logger.addHandler(console)

    # info.log — INFO level, 10 MB rotation, 5 backups
    info_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, "info.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    info_handler.setLevel(logging.INFO)
    info_handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root_logger.addHandler(info_handler)

    # debug.log — DEBUG level, 50 MB rotation, 3 backups
    debug_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, "debug.log"),
        maxBytes=50 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    debug_handler.setLevel(logging.DEBUG)
    debug_handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root_logger.addHandler(debug_handler)
