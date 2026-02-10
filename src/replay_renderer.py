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
            self._create_dummy_video(output_path, replay_data)
            
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
    
    def _create_dummy_video(self, output_path: Path, replay_data):
        """Создание видео с демонстрацией реплея"""
        import os
        import cv2
        import numpy as np
        import subprocess
        import tempfile
        
        # Добавляем FFmpeg в PATH (если не найден в стандартном пути)
        ffmpeg_paths = [
            # Путь к FFmpeg из winget
            os.path.join(os.environ['LOCALAPPDATA'], 'Microsoft', 'WinGet', 'Packages', 
                       'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.0.1-full_build', 'bin'),
            # Стандартные пути
            'C:\\ffmpeg\\bin',
            'C:\\Program Files\\ffmpeg\\bin',
            'C:\\Program Files (x86)\\ffmpeg\\bin'
        ]
        
        for ffmpeg_path in ffmpeg_paths:
            if os.path.exists(ffmpeg_path) and ffmpeg_path not in os.environ['PATH']:
                os.environ['PATH'] = ffmpeg_path + os.pathsep + os.environ['PATH']
        
        try:
            # Параметры видео (стандартное разрешение osu!)
            width = 1024
            height = 768
            fps = self.render_settings.get('fps', 60)
            
            # Создаем временный файл для хранения кадров в формате rawvideo
            temp_file = tempfile.NamedTemporaryFile(suffix='.raw', delete=False)
            temp_file.close()
            
            # Загружаем скины для рендеринга
            cursor_image = None
            hitcircle_image = None
            
            # Путь к текущему скину
            skin_info = self.skin_manager.skins.get(self.render_settings.get('default_skin', 'osu!default'))
            
            if skin_info and skin_info.path.exists():
                # Загружаем изображение курсора
                cursor_path = skin_info.path / 'cursor.png'
                if cursor_path.exists():
                    cursor_image = cv2.imread(str(cursor_path), cv2.IMREAD_UNCHANGED)
                
                # Загружаем изображение хит-круга
                hitcircle_path = skin_info.path / 'hitcircle.png'
                if hitcircle_path.exists():
                    hitcircle_image = cv2.imread(str(hitcircle_path), cv2.IMREAD_UNCHANGED)
            
            # Заполняем фон белым цветом (как в osu!)
            frame = np.ones((height, width, 3), dtype=np.uint8) * 255
            
            # Рисуем сетку для имитации игрового поля
            cv2.line(frame, (width//2, 0), (width//2, height), (200, 200, 200), 1)
            cv2.line(frame, (0, height//2), (width, height//2), (200, 200, 200), 1)
            
            # Рисуем информацию о реплее
            font = cv2.FONT_HERSHEY_SIMPLEX
            text = f"Реплей: {replay_data.player_name}"
            cv2.putText(frame, text, (50, 50), font, 1, (0, 0, 0), 2)
            
            text = f"Счет: {replay_data.score}"
            cv2.putText(frame, text, (50, 80), font, 0.8, (0, 0, 0), 2)
            
            text = f"Combo: {replay_data.max_combo}"
            cv2.putText(frame, text, (50, 110), font, 0.8, (0, 0, 0), 2)
            
            text = f"300: {replay_data.count_300} 100: {replay_data.count_100} 50: {replay_data.count_50} Miss: {replay_data.count_miss}"
            cv2.putText(frame, text, (50, 140), font, 0.6, (0, 0, 0), 2)
            
            # Рисуем движения курсора из реального реплея
            if hasattr(replay_data, 'frames') and len(replay_data.frames) > 0:
                # Используем все доступные фреймы
                total_time = 0
                for frame_data in replay_data.frames:
                    total_time += frame_data.delta
                
                frame_count = len(replay_data.frames)
                
                for i in range(frame_count):
                    current_frame = frame.copy()
                    frame_data = replay_data.frames[i]
                    
                    x = int(frame_data.x * width / 512)  # Преобразуем координаты osu! в пиксели
                    y = int(frame_data.y * height / 384)
                    
                    # Рисуем курсор
                    if cursor_image is not None:
                        scale = 0.5
                        resized = cv2.resize(cursor_image, (0, 0), fx=scale, fy=scale)
                        h, w, _ = resized.shape
                        y_pos = y - h//2
                        x_pos = x - w//2
                        
                        if y_pos > 0 and y_pos + h < height and x_pos > 0 and x_pos + w < width:
                            alpha = resized[:, :, 3] / 255.0
                            for c in range(3):
                                current_frame[y_pos:y_pos+h, x_pos:x_pos+w, c] = alpha * resized[:, :, c] + (1 - alpha) * current_frame[y_pos:y_pos+h, x_pos:x_pos+w, c]
                    else:
                        cv2.circle(current_frame, (x, y), 10, (0, 0, 0), -1)
                        cv2.circle(current_frame, (x, y), 15, (0, 0, 0), 2)
                    
                    # Добавляем кадр в временный файл
                    current_frame = cv2.resize(current_frame, (self.render_settings.get('resolution_width', 1920), self.render_settings.get('resolution_height', 1080)))
                    with open(temp_file.name, 'ab') as f:
                        f.write(current_frame.tobytes())
            else:
                # Если нет данных о фреймах, рисуем имитацию
                duration = 10  # секунд
                frame_count = int(duration * fps)
                
                for i in range(frame_count):
                    current_frame = frame.copy()
                    
                    x = int(width // 2 + (width // 4) * np.sin(i * 0.05))
                    y = int(height // 2 + (height // 4) * np.sin(i * 0.03))
                    
                    # Рисуем курсор
                    if cursor_image is not None:
                        scale = 0.5
                        resized = cv2.resize(cursor_image, (0, 0), fx=scale, fy=scale)
                        h, w, _ = resized.shape
                        y_pos = y - h//2
                        x_pos = x - w//2
                        
                        if y_pos > 0 and y_pos + h < height and x_pos > 0 and x_pos + w < width:
                            alpha = resized[:, :, 3] / 255.0
                            for c in range(3):
                                current_frame[y_pos:y_pos+h, x_pos:x_pos+w, c] = alpha * resized[:, :, c] + (1 - alpha) * current_frame[y_pos:y_pos+h, x_pos:x_pos+w, c]
                    else:
                        cv2.circle(current_frame, (x, y), 10, (0, 0, 0), -1)
                        cv2.circle(current_frame, (x, y), 15, (0, 0, 0), 2)
                    
                    # Добавляем кадр в временный файл
                    current_frame = cv2.resize(current_frame, (self.render_settings.get('resolution_width', 1920), self.render_settings.get('resolution_height', 1080)))
                    with open(temp_file.name, 'ab') as f:
                        f.write(current_frame.tobytes())
            
            # Кодируем видео с помощью FFmpeg
            cmd = [
                'ffmpeg',
                '-f', 'rawvideo',
                '-vcodec', 'rawvideo',
                '-s', f"{self.render_settings.get('resolution_width', 1920)}x{self.render_settings.get('resolution_height', 1080)}",
                '-pix_fmt', 'bgr24',
                '-r', str(fps),
                '-i', temp_file.name,
                '-vcodec', 'libx264',
                '-tune', 'animation',
                '-pix_fmt', 'yuv420p',
                '-r', str(fps),
                str(output_path)
            ]
            
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            logger.info(f"Видео успешно создано: {output_path}")
            
        except FileNotFoundError:
            logger.error("FFmpeg не найден. Убедитесь, что ffmpeg установлен и доступен в PATH.")
            with open(output_path.with_suffix('.txt'), 'w') as f:
                f.write("Это заглушка для рендеринга видео\n")
                f.write(f"Файл: {output_path.name}\n")
                f.write("FFmpeg не найден. Установите ffmpeg для создания настоящего видео.\n")
        except Exception as e:
            logger.error(f"Ошибка при создании видео: {e}")
            with open(output_path.with_suffix('.txt'), 'w') as f:
                f.write("Это заглушка для рендеринга видео\n")
                f.write(f"Файл: {output_path.name}\n")
                f.write(f"Ошибка при создании видео: {str(e)}\n")
    
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
