"""
Конфигурация приложения osu! Replay Converter
"""

import logging
from pathlib import Path

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('osu_replay_converter.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Конфигурация приложения
APP_DIR = Path.home() / ".osu_replay_converter"
APP_DIR.mkdir(exist_ok=True)
CONFIG_FILE = APP_DIR / "config.json"
DATABASE_FILE = APP_DIR / "beatmaps.db"
SKINS_DIR = APP_DIR / "skins"
SKINS_DIR.mkdir(exist_ok=True)
DEFAULT_SKIN_NAME = "osu!default"

# Настройки рендеринга по умолчанию
DEFAULT_RENDER_SETTINGS = {
    'default_skin': DEFAULT_SKIN_NAME,
    'output_format': 'mp4',
    'resolution_width': 1920,
    'resolution_height': 1080,
    'fps': 60,
    'bitrate': 8000,
    'show_hit_counter': True,
    'show_score': True,
    'show_accuracy': True,
    'show_combo': True
}
