"""
Модели данных приложения osu! Replay Converter
"""

from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from src.config import DEFAULT_SKIN_NAME


@dataclass
class SkinInfo:
    """Информация о скине"""
    name: str
    path: Path
    author: str = ""
    version: str = "1.0"
    description: str = ""
    thumbnail: Optional[Path] = None
    created_at: datetime = None
    is_default: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """Преобразование в словарь"""
        data = asdict(self)
        data['path'] = str(self.path)
        data['thumbnail'] = str(self.thumbnail) if self.thumbnail else None
        data['created_at'] = self.created_at.isoformat() if self.created_at else None
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SkinInfo':
        """Создание из словаря"""
        data = data.copy()
        data['path'] = Path(data['path'])
        if data.get('thumbnail'):
            data['thumbnail'] = Path(data['thumbnail'])
        if data.get('created_at'):
            data['created_at'] = datetime.fromisoformat(data['created_at'])
        return cls(**data)


@dataclass
class BeatmapAttributes:
    """Атрибуты сложности карты"""
    beatmap_id: int
    aim: float = 0.0
    speed: float = 0.0
    flashlight: float = 0.0
    od: float = 0.0
    ar: float = 0.0
    max_combo: int = 0
    slider_factor: float = 0.0
    num_sliders: int = 0
    num_spinners: int = 0
    num_hit_circles: int = 0
    total_hits: int = 0
    speed_note_count: float = 0.0
    last_updated: datetime = None
    beatmap_md5: str = ""


@dataclass 
class ReplayData:
    """Данные реплея"""
    player_name: str
    score: int
    max_combo: int
    count_300: int
    count_100: int
    count_50: int
    count_miss: int
    count_geki: int
    count_katu: int
    mods: int
    timestamp: datetime
    beatmap_md5: str
    player_id: int
    skin_used: str = DEFAULT_SKIN_NAME  # Имя используемого скина
    frames: list = None  # Фреймы реплея (координаты курсора, время, клавиши)
