#!/usr/bin/env python3
"""
Точка входа в приложение osu! Replay Converter & PP Calculator
"""

import sys
from src.gui import OsuReplayConverterApp


def check_dependencies():
    """Проверка установленных зависимостей"""
    try:
        import ossapi
        import osupyparser
        from PIL import Image, ImageTk
    except ImportError as e:
        print("=" * 60)
        print("ОШИБКА: Не установлены необходимые библиотеки!")
        print("=" * 60)
        print("Установите их командой:")
        print("pip install ossapi OsuPyParser pillow")
        print("\nИли установите все зависимости из requirements.txt:")
        print("pip install -r requirements.txt")
        print("\nСодержимое requirements.txt:")
        print("ossapi>=3.6.0")
        print("OsuPyParser>=1.0.7")
        print("Pillow>=10.0.0")
        print("=" * 60)
        return False
    return True


def main():
    """Главная функция"""
    # Проверка зависимостей
    if not check_dependencies():
        return

    # Создание и запуск приложения
    app = OsuReplayConverterApp()
    app.run()


if __name__ == "__main__":
    main()
