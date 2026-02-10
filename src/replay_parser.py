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
                count_300=replay.n300,
                count_100=replay.n100,
                count_50=replay.n50,
                count_miss=replay.nmiss,
                count_geki=replay.ngeki,
                count_katu=replay.nkatu,
                mods=replay.mods,
                timestamp=replay.timestamp,
                beatmap_md5=replay.map_md5,
                player_id=0  # osupyparser не предоставляет player_id
            )
            
            logger.info(f"Успешно распарсен реплей: {filepath.name}")
            return replay_data
            
        except Exception as e:
            logger.error(f"Ошибка парсинга реплея {filepath}: {e}")
            return None
