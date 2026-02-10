"""
Класс для работы с API osu!
"""

from datetime import datetime
from typing import Optional

from ossapi import Ossapi

from src.config import logger
from src.models import BeatmapAttributes


class OsuAPI:
    """Класс для работы с API osu!"""
    
    def __init__(self, client_id: str, client_secret: str):
        """
        Инициализация API клиента
        
        Для получения client_id и client_secret:
        1. Перейдите на https://osu.ppy.sh/home/account/edit#oauth
        2. Создайте новое OAuth приложение
        3. Используйте полученные данные
        """
        try:
            self.api = Ossapi(client_id, client_secret)
            logger.info("API osu! успешно инициализировано")
        except Exception as e:
            logger.error(f"Ошибка инициализации API: {e}")
            raise
    
    def get_beatmap_attributes(self, beatmap_id: int) -> Optional[BeatmapAttributes]:
        """Получение атрибутов карты через API"""
        try:
            beatmap = self.api.beatmap(beatmap_id)
            beatmapset = beatmap.beatmapset()
            
            # Получаем детализированную информацию о карте
            beatmap_details = self.api.beatmap(beatmap_id)
            
            attributes = BeatmapAttributes(
                beatmap_id=beatmap_id,
                aim=beatmap_details.difficulty_rating or 0.0,
                speed=beatmap_details.difficulty_rating or 0.0,
                od=beatmap_details.accuracy or 0.0,
                ar=beatmap_details.ar or 0.0,
                max_combo=beatmap_details.max_combo or 0,
                num_sliders=beatmap_details.count_sliders or 0,
                num_spinners=beatmap_details.count_spinners or 0,
                num_hit_circles=beatmap_details.count_circles or 0,
                total_hits=(beatmap_details.count_circles or 0) + 
                          (beatmap_details.count_sliders or 0) + 
                          (beatmap_details.count_spinners or 0),
                last_updated=datetime.now(),
                beatmap_md5=beatmap_details.checksum or ""
            )
            
            logger.info(f"Получены атрибуты для карты {beatmap_id}")
            return attributes
            
        except Exception as e:
            logger.error(f"Ошибка получения атрибутов карты {beatmap_id}: {e}")
            return None
    
    def get_beatmap_by_md5(self, beatmap_md5: str) -> Optional[int]:
        """Получение ID карты по MD5 хешу"""
        try:
            # Поиск карты через API (непрямой метод)
            # В реальном приложении может потребоваться дополнительная логика
            return None
        except Exception as e:
            logger.error(f"Ошибка поиска карты по MD5 {beatmap_md5}: {e}")
            return None
