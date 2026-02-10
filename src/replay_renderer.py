"""
Класс для рендеринга реплеев в видео с использованием скинов
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

from src.config import DEFAULT_SKIN_NAME, logger
from src.models import ReplayData, BeatmapAttributes, SkinInfo


class ReplayRenderer:
    """Класс для рендеринга реплеев в видео с использованием скинов"""
    
    def __init__(self, skin_manager, db_manager):
        self.skin_manager = skin_manager
        self.db_manager = db_manager
        self.render_settings = db_manager.get_render_settings()
        
    def render_replay(self, replay_data: ReplayData, beatmap_attributes: BeatmapAttributes,
                     output_path: Path, skin_name: str = None) -> bool:
        """Рендеринг реплея в видео"""
        
        if skin_name is None:
            skin_name = self.render_settings.get('default_skin', DEFAULT_SKIN_NAME)
        
        # Получение информации о скине
        skin_info = self.skin_manager.skins.get(skin_name)
        if not skin_info:
            logger.error(f"Скин '{skin_name}' не найден")
            return False
        
        # Проверка валидности скина
        if not self.skin_manager.validate_skin(skin_name):
            logger.warning(f"Скин '{skin_name}' может быть неполным или поврежденным")
        
        # В реальном приложении здесь будет вызов внешнего рендерера
        # Например, osu-replay-render или ffmpeg с кастомным pipeline
        
        # Создание команды для рендеринга
        render_command = self._build_render_command(
            replay_data, beatmap_attributes, skin_info, output_path
        )
        
        # Для демонстрации просто создаем файл-заглушку
        try:
            self._create_dummy_video(output_path)
            
            # Сохранение информации о рендере
            self._save_render_info(replay_data, skin_name, output_path)
            
            logger.info(f"Рендеринг реплея завершен: {output_path}")
            return True
            
        except Exception as e:
            logger.error(f"Ошибка рендеринга: {e}")
            return False
    
    def _build_render_command(self, replay_data: ReplayData, 
                             beatmap_attributes: BeatmapAttributes,
                             skin_info: SkinInfo, output_path: Path) -> List[str]:
        """Создание команды для внешнего рендерера"""
        # Пример команды для osu-replay-render
        command = [
            "osr-render",  # Предполагаемый рендерер
            "--replay", str(replay_data.beatmap_md5),  # Или путь к файлу .osr
            "--skin", str(skin_info.path),
            "--output", str(output_path),
            "--width", str(self.render_settings.get('resolution_width', 1920)),
            "--height", str(self.render_settings.get('resolution_height', 1080)),
            "--fps", str(self.render_settings.get('fps', 60)),
            "--bitrate", str(self.render_settings.get('bitrate', 8000))
        ]
        
        # Добавление флагов отображения UI элементов
        if self.render_settings.get('show_hit_counter', True):
            command.append("--show-hit-counter")
        if self.render_settings.get('show_score', True):
            command.append("--show-score")
        if self.render_settings.get('show_accuracy', True):
            command.append("--show-accuracy")
        if self.render_settings.get('show_combo', True):
            command.append("--show-combo")
        
        return command
    
    def _create_dummy_video(self, output_path: Path):
        """Создание заглушки видео (для демонстрации)"""
        # В реальном приложении здесь будет реальный рендеринг
        # Создаем текстовый файл с информацией о видео
        with open(output_path.with_suffix('.txt'), 'w') as f:
            f.write("Это заглушка для рендеринга видео\n")
            f.write(f"Файл: {output_path.name}\n")
            f.write("В реальном приложении здесь будет видеофайл\n")
        
        # Или создаем минимальный видеофайл с помощью ffmpeg
        # subprocess.run(['ffmpeg', '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:d=5', output_path])
    
    def _save_render_info(self, replay_data: ReplayData, skin_name: str, output_path: Path):
        """Сохранение информации о рендере"""
        render_info = {
            'timestamp': datetime.now().isoformat(),
            'player': replay_data.player_name,
            'skin': skin_name,
            'output_path': str(output_path),
            'settings': self.render_settings
        }
        
        render_info_file = output_path.parent / f"{output_path.stem}_info.json"
        with open(render_info_file, 'w', encoding='utf-8') as f:
            json.dump(render_info, f, indent=2, ensure_ascii=False)
    
    def update_render_settings(self, settings: Dict[str, Any]):
        """Обновление настроек рендеринга"""
        self.render_settings.update(settings)
        self.db_manager.save_render_settings(self.render_settings)
