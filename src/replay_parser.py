"""
Парсер реплеев osu!
"""

from pathlib import Path
from typing import Optional

from osupyparser import ReplayFile

from src.config import logger
from src.models import ReplayData


class ReplayParser:
    """Парсер реплеев osu!"""
    
    @staticmethod
    def parse_replay(filepath: Path) -> Optional[ReplayData]:
        """Парсинг файла реплея .osr"""
        try:
            replay = ReplayFile.from_file(str(filepath))
            
            # Преобразование данных реплея
            replay_data = ReplayData(
                player_name=replay.player_name,
                score=replay.score,
                max_combo=replay.max_combo,
                count_300=replay.count_300,
                count_100=replay.count_100,
                count_50=replay.count_50,
                count_miss=replay.count_miss,
                count_geki=replay.count_geki,
                count_katu=replay.count_katu,
                mods=replay.mods,
                timestamp=replay.timestamp,
                beatmap_md5=replay.beatmap_hash,
                player_id=replay.player_id
            )
            
            logger.info(f"Успешно распарсен реплей: {filepath.name}")
            return replay_data
            
        except Exception as e:
            logger.error(f"Ошибка парсинга реплея {filepath}: {e}")
            return None
