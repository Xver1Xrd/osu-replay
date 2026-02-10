"""
Менеджер базы данных SQLite для хранения атрибутов карт и скинов
"""

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from src.config import DEFAULT_SKIN_NAME, DEFAULT_RENDER_SETTINGS, logger
from src.models import BeatmapAttributes


class DatabaseManager:
    """Менеджер базы данных SQLite для хранения атрибутов карт и скинов"""
    
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Инициализация базы данных"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Создание таблицы для атрибутов карт
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS beatmap_attributes (
                beatmap_id INTEGER PRIMARY KEY,
                beatmap_md5 TEXT UNIQUE,
                aim REAL,
                speed REAL,
                flashlight REAL,
                od REAL,
                ar REAL,
                max_combo INTEGER,
                slider_factor REAL,
                num_sliders INTEGER,
                num_spinners INTEGER,
                num_hit_circles INTEGER,
                total_hits INTEGER,
                speed_note_count REAL,
                last_updated TIMESTAMP
            )
            ''')
            
            # Создание таблицы для истории реплеев
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS replay_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TIMESTAMP,
                player_name TEXT,
                beatmap_id INTEGER,
                score INTEGER,
                pp REAL,
                accuracy REAL,
                skin_used TEXT,
                FOREIGN KEY (beatmap_id) REFERENCES beatmap_attributes(beatmap_id)
            )
            ''')
            
            # Создание таблицы для настроек рендеринга
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS render_settings (
                id INTEGER PRIMARY KEY,
                default_skin TEXT,
                output_format TEXT,
                resolution_width INTEGER,
                resolution_height INTEGER,
                fps INTEGER,
                bitrate INTEGER,
                show_hit_counter BOOLEAN,
                show_score BOOLEAN,
                show_accuracy BOOLEAN,
                show_combo BOOLEAN
            )
            ''')
            
            # Инициализация настроек по умолчанию
            cursor.execute('''
            INSERT OR IGNORE INTO render_settings 
            (id, default_skin, output_format, resolution_width, resolution_height, 
             fps, bitrate, show_hit_counter, show_score, show_accuracy, show_combo)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                DEFAULT_SKIN_NAME,
                'mp4',
                1920,
                1080,
                60,
                8000,
                1, 1, 1, 1
            ))
            
            conn.commit()
    
    def get_beatmap_attributes(self, beatmap_id: int = None, beatmap_md5: str = None) -> Optional[BeatmapAttributes]:
        """Получение атрибутов карты из базы данных"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            if beatmap_id:
                cursor.execute('SELECT * FROM beatmap_attributes WHERE beatmap_id = ?', (beatmap_id,))
            elif beatmap_md5:
                cursor.execute('SELECT * FROM beatmap_attributes WHERE beatmap_md5 = ?', (beatmap_md5,))
            else:
                return None
            
            row = cursor.fetchone()
            if row:
                return BeatmapAttributes(
                    beatmap_id=row[0],
                    beatmap_md5=row[1],
                    aim=row[2] or 0.0,
                    speed=row[3] or 0.0,
                    flashlight=row[4] or 0.0,
                    od=row[5] or 0.0,
                    ar=row[6] or 0.0,
                    max_combo=row[7] or 0,
                    slider_factor=row[8] or 0.0,
                    num_sliders=row[9] or 0,
                    num_spinners=row[10] or 0,
                    num_hit_circles=row[11] or 0,
                    total_hits=row[12] or 0,
                    speed_note_count=row[13] or 0.0,
                    last_updated=datetime.fromisoformat(row[14]) if row[14] else None
                )
        return None
    
    def save_beatmap_attributes(self, attributes: BeatmapAttributes):
        """Сохранение атрибутов карты в базу данных"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
            INSERT OR REPLACE INTO beatmap_attributes 
            (beatmap_id, beatmap_md5, aim, speed, flashlight, od, ar, max_combo, 
             slider_factor, num_sliders, num_spinners, num_hit_circles, total_hits, 
             speed_note_count, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                attributes.beatmap_id,
                attributes.beatmap_md5,
                attributes.aim,
                attributes.speed,
                attributes.flashlight,
                attributes.od,
                attributes.ar,
                attributes.max_combo,
                attributes.slider_factor,
                attributes.num_sliders,
                attributes.num_spinners,
                attributes.num_hit_circles,
                attributes.total_hits,
                attributes.speed_note_count,
                datetime.now().isoformat()
            ))
            
            conn.commit()
    
    def add_replay_to_history(self, player_name: str, beatmap_id: int, 
                              score: int, pp: float, accuracy: float, skin_used: str):
        """Добавление реплея в историю"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
            INSERT INTO replay_history (timestamp, player_name, beatmap_id, score, pp, accuracy, skin_used)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                datetime.now().isoformat(),
                player_name,
                beatmap_id,
                score,
                pp,
                accuracy,
                skin_used
            ))
            
            conn.commit()
    
    def get_render_settings(self) -> Dict[str, Any]:
        """Получение настроек рендеринга"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM render_settings WHERE id = 1')
            row = cursor.fetchone()
            
            if row:
                return {
                    'default_skin': row[1],
                    'output_format': row[2],
                    'resolution_width': row[3],
                    'resolution_height': row[4],
                    'fps': row[5],
                    'bitrate': row[6],
                    'show_hit_counter': bool(row[7]),
                    'show_score': bool(row[8]),
                    'show_accuracy': bool(row[9]),
                    'show_combo': bool(row[10])
                }
        
        return DEFAULT_RENDER_SETTINGS.copy()
    
    def save_render_settings(self, settings: Dict[str, Any]):
        """Сохранение настроек рендеринга"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
            INSERT OR REPLACE INTO render_settings 
            (id, default_skin, output_format, resolution_width, resolution_height, 
             fps, bitrate, show_hit_counter, show_score, show_accuracy, show_combo)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                settings.get('default_skin', DEFAULT_SKIN_NAME),
                settings.get('output_format', 'mp4'),
                settings.get('resolution_width', 1920),
                settings.get('resolution_height', 1080),
                settings.get('fps', 60),
                settings.get('bitrate', 8000),
                1 if settings.get('show_hit_counter', True) else 0,
                1 if settings.get('show_score', True) else 0,
                1 if settings.get('show_accuracy', True) else 0,
                1 if settings.get('show_combo', True) else 0
            ))
            
            conn.commit()
