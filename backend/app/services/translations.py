"""Translation service that reads phrases from CSV files."""

import csv
import os
import logging
from typing import Dict

logger = logging.getLogger(__name__)

TRANSLATIONS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "translations",
)

_cache: Dict[str, Dict[str, Dict[str, str]]] = {}


def _load_csv(filename: str) -> Dict[str, Dict[str, str]]:
    """Load a CSV translation file and return {key: {lang: text}} mapping."""
    if filename in _cache:
        return _cache[filename]

    filepath = os.path.join(TRANSLATIONS_DIR, filename)
    result: Dict[str, Dict[str, str]] = {}

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                key = row.get("key", "")
                if key:
                    result[key] = {
                        lang: row.get(lang, "")
                        for lang in row
                        if lang != "key"
                    }
    except FileNotFoundError:
        logger.error(f"Translation file not found: {filepath}")
    except Exception as e:
        logger.error(f"Error loading translations from {filepath}: {e}")

    _cache[filename] = result
    return result


def get_phrase(key: str, lang: str = "ru", source: str = "bot") -> str:
    """
    Get a translated phrase by key and language.

    Args:
        key: Translation key from CSV
        lang: Language code (ru, en)
        source: 'bot' for bot_phrases.csv, 'app' for app_phrases.csv
    """
    filename = f"{source}_phrases.csv"
    translations = _load_csv(filename)

    phrase_dict = translations.get(key, {})
    text = phrase_dict.get(lang, phrase_dict.get("ru", key))
    return text.replace("\\n", "\n")


def get_all_phrases(lang: str = "ru", source: str = "app") -> Dict[str, str]:
    """Get all phrases for a language from a source file."""
    filename = f"{source}_phrases.csv"
    translations = _load_csv(filename)

    result = {}
    for key, phrase_dict in translations.items():
        text = phrase_dict.get(lang, phrase_dict.get("ru", key))
        result[key] = text.replace("\\n", "\n")
    return result


def clear_cache() -> None:
    """Clear the translation cache (useful for development)."""
    _cache.clear()
