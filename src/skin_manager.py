"""
Менеджер скинов для osu!
"""

import json
import os
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageTk
from tkinter import messagebox

from src.config import DEFAULT_SKIN_NAME, logger
from src.models import SkinInfo


class SkinManager:
    """Менеджер скинов для osu!"""
    
    def __init__(self, skins_dir: Path):
        self.skins_dir = skins_dir
        self.current_skin = DEFAULT_SKIN_NAME
        self.skins: Dict[str, SkinInfo] = {}
        self.skins_metadata_file = skins_dir / "skins_metadata.json"
        
        # Создание директории для скриншотов
        self.screenshots_dir = skins_dir / "screenshots"
        self.screenshots_dir.mkdir(exist_ok=True)
        
        self.load_skins()
    
    def load_skins(self):
        """Загрузка информации о скинах"""
        if self.skins_metadata_file.exists():
            try:
                with open(self.skins_metadata_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for skin_name, skin_data in data.items():
                        self.skins[skin_name] = SkinInfo.from_dict(skin_data)
            except Exception as e:
                logger.error(f"Ошибка загрузки метаданных скинов: {e}")
        
        # Создание дефолтного скина
        if DEFAULT_SKIN_NAME not in self.skins:
            default_skin_path = self.skins_dir / DEFAULT_SKIN_NAME
            default_skin_path.mkdir(exist_ok=True)
            
            self.skins[DEFAULT_SKIN_NAME] = SkinInfo(
                name=DEFAULT_SKIN_NAME,
                path=default_skin_path,
                author="osu! team",
                description="Стандартный скин osu!",
                is_default=True,
                created_at=datetime.now()
            )
            self.save_skins_metadata()
    
    def save_skins_metadata(self):
        """Сохранение метаданных скинов"""
        try:
            data = {name: skin.to_dict() for name, skin in self.skins.items()}
            with open(self.skins_metadata_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Ошибка сохранения метаданных скинов: {e}")
    
    def import_skin(self, source_path: Path, skin_name: str, author: str = "", 
                   description: str = "") -> Optional[SkinInfo]:
        """Импорт скина из папки или архива"""
        try:
            # Создание директории для скина
            skin_path = self.skins_dir / skin_name
            skin_path.mkdir(exist_ok=True)
            
            if source_path.is_dir():
                # Копирование файлов из папки
                self._copy_skin_files(source_path, skin_path)
            elif source_path.suffix.lower() == '.osk':
                # Распаковка архива .osk
                self._extract_osk_archive(source_path, skin_path)
            elif source_path.suffix.lower() == '.zip':
                # Распаковка zip архива
                self._extract_zip_archive(source_path, skin_path)
            else:
                messagebox.showerror("Ошибка", "Неподдерживаемый формат скина")
                return None
            
            # Поиск превью скина
            thumbnail = self._find_skin_thumbnail(skin_path)
            
            # Создание информации о скине
            skin_info = SkinInfo(
                name=skin_name,
                path=skin_path,
                author=author,
                description=description,
                thumbnail=thumbnail,
                created_at=datetime.now()
            )
            
            self.skins[skin_name] = skin_info
            self.save_skins_metadata()
            
            logger.info(f"Скин '{skin_name}' успешно импортирован")
            return skin_info
            
        except Exception as e:
            logger.error(f"Ошибка импорта скина: {e}")
            messagebox.showerror("Ошибка", f"Не удалось импортировать скин: {str(e)}")
            return None
    
    def _copy_skin_files(self, source: Path, destination: Path):
        """Копирование файлов скина"""
        for item in source.iterdir():
            if item.is_file():
                shutil.copy2(item, destination / item.name)
            elif item.is_dir():
                shutil.copytree(item, destination / item.name, dirs_exist_ok=True)
    
    def _extract_osk_archive(self, archive_path: Path, destination: Path):
        """Распаковка .osk архива"""
        # .osk это обычный zip архив с другим расширением
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            zip_ref.extractall(destination)
    
    def _extract_zip_archive(self, archive_path: Path, destination: Path):
        """Распаковка zip архива"""
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            zip_ref.extractall(destination)
    
    def _find_skin_thumbnail(self, skin_path: Path) -> Optional[Path]:
        """Поиск превью скина"""
        thumbnail_extensions = ['.png', '.jpg', '.jpeg', '.bmp', '.gif']
        thumbnail_names = ['preview', 'thumb', 'screenshot', 'menu-background']
        
        # Поиск по стандартным именам и расширениям
        for name in thumbnail_names:
            for ext in thumbnail_extensions:
                thumbnail_path = skin_path / f"{name}{ext}"
                if thumbnail_path.exists():
                    return thumbnail_path
        
        # Поиск любого изображения в корне скина
        for file in skin_path.iterdir():
            if file.suffix.lower() in thumbnail_extensions:
                return file
        
        return None
    
    def export_skin(self, skin_name: str, export_path: Path) -> bool:
        """Экспорт скина в архив"""
        try:
            if skin_name not in self.skins:
                return False
            
            skin_info = self.skins[skin_name]
            
            # Создание zip архива
            with zipfile.ZipFile(export_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(skin_info.path):
                    for file in files:
                        file_path = Path(root) / file
                        arcname = file_path.relative_to(skin_info.path)
                        zipf.write(file_path, arcname)
            
            logger.info(f"Скин '{skin_name}' экспортирован в {export_path}")
            return True
            
        except Exception as e:
            logger.error(f"Ошибка экспорта скина: {e}")
            return False
    
    def delete_skin(self, skin_name: str) -> bool:
        """Удаление скина"""
        try:
            if skin_name == DEFAULT_SKIN_NAME:
                messagebox.showwarning("Внимание", "Нельзя удалить стандартный скин")
                return False
            
            if skin_name not in self.skins:
                return False
            
            # Удаление директории скина
            skin_info = self.skins[skin_name]
            if skin_info.path.exists():
                shutil.rmtree(skin_info.path)
            
            # Удаление из списка
            del self.skins[skin_name]
            self.save_skins_metadata()
            
            # Если удаляемый скин был текущим, переключаемся на дефолтный
            if self.current_skin == skin_name:
                self.current_skin = DEFAULT_SKIN_NAME
            
            logger.info(f"Скин '{skin_name}' удален")
            return True
            
        except Exception as e:
            logger.error(f"Ошибка удаления скина: {e}")
            return False
    
    def get_skin_preview_image(self, skin_name: str, size: Tuple[int, int] = (200, 150)):
        """Получение превью скина для отображения"""
        try:
            if skin_name not in self.skins:
                return None
            
            skin_info = self.skins[skin_name]
            
            if skin_info.thumbnail and skin_info.thumbnail.exists():
                image = Image.open(skin_info.thumbnail)
            else:
                # Создание заглушки
                image = Image.new('RGB', size, color=(40, 40, 60))
            
            image = image.resize(size, Image.Resampling.LANCZOS)
            return ImageTk.PhotoImage(image)
            
        except Exception as e:
            logger.error(f"Ошибка загрузки превью скина: {e}")
            # Создание заглушки при ошибке
            image = Image.new('RGB', size, color=(60, 40, 40))
            return ImageTk.PhotoImage(image)
    
    def get_skin_list(self) -> List[str]:
        """Получение списка скинов"""
        return list(self.skins.keys())
    
    def set_current_skin(self, skin_name: str):
        """Установка текущего скина"""
        if skin_name in self.skins:
            self.current_skin = skin_name
            logger.info(f"Текущий скин изменен на: {skin_name}")
    
    def get_current_skin_info(self) -> Optional[SkinInfo]:
        """Получение информации о текущем скине"""
        return self.skins.get(self.current_skin)
    
    def validate_skin(self, skin_name: str) -> bool:
        """Проверка валидности скина"""
        if skin_name not in self.skins:
            return False
        
        skin_info = self.skins[skin_name]
        
        # Проверка наличия основных файлов скина
        required_dirs = ['', 'UI', 'Gameplay']  # Корень и основные поддиректории
        
        # Проверка существования директории
        if not skin_info.path.exists():
            return False
        
        # Проверка наличия хотя бы некоторых файлов
        skin_files = list(skin_info.path.rglob('*.*'))
        if len(skin_files) < 5:  # Минимальное количество файлов
            return False
        
        return True
