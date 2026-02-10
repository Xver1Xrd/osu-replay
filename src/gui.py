"""
Главное приложение с графическим интерфейсом
"""

import json
import os
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext, simpledialog

from src.config import APP_DIR, CONFIG_FILE, DATABASE_FILE, SKINS_DIR, DEFAULT_SKIN_NAME, logger
from src.database import DatabaseManager
from src.models import BeatmapAttributes
from src.osu_api import OsuAPI
from src.pp_calculator import OsuPPCalculator
from src.replay_parser import ReplayParser
from src.replay_renderer import ReplayRenderer
from src.skin_manager import SkinManager


class OsuReplayConverterApp:
    """Главное приложение с графическим интерфейсом"""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("osu! Replay Converter & PP Calculator")
        self.root.geometry("900x750")
        
        # Загрузка конфигурации
        self.config = self.load_config()
        
        # Инициализация компонентов
        self.db_manager = DatabaseManager(DATABASE_FILE)
        self.skin_manager = SkinManager(SKINS_DIR)
        self.replay_parser = ReplayParser()
        self.pp_calculator = OsuPPCalculator()
        self.renderer = ReplayRenderer(self.skin_manager, self.db_manager)
        
        # Инициализация API (если есть конфигурация)
        self.api = None
        if self.config.get("client_id") and self.config.get("client_secret"):
            try:
                self.api = OsuAPI(
                    self.config["client_id"],
                    self.config["client_secret"]
                )
            except:
                logger.warning("Не удалось инициализировать API")
        
        # Текущие данные
        self.current_replay = None
        self.current_beatmap_attributes = None
        self.current_skin_preview = None
        
        # Переменные интерфейса
        self.replay_file = tk.StringVar()
        self.pp_total = tk.StringVar(value="0.00")
        self.pp_aim = tk.StringVar(value="0.00")
        self.pp_speed = tk.StringVar(value="0.00")
        self.pp_accuracy = tk.StringVar(value="0.00")
        self.pp_flashlight = tk.StringVar(value="0.00")
        
        self.hundreds_count = tk.StringVar(value="0")
        self.fifties_count = tk.StringVar(value="0")
        self.misses_count = tk.StringVar(value="0")
        self.max_combo_var = tk.StringVar(value="0")
        self.accuracy_var = tk.StringVar(value="0.00%")
        
        self.skin_var = tk.StringVar(value=self.skin_manager.current_skin)
        self.skin_info_var = tk.StringVar(value="")
        
        self.status_text = tk.StringVar(value="Готов к работе")
        
        # Настройка интерфейса
        self.setup_ui()
        
        # Проверка API конфигурации
        if not self.api:
            self.show_api_config_dialog()
    
    def setup_ui(self):
        """Настройка графического интерфейса"""
        # Создание Notebook (вкладок)
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill='both', expand=True, padx=10, pady=10)
        
        # Вкладка 1: Основные функции
        main_tab = ttk.Frame(notebook)
        notebook.add(main_tab, text="Реплей и PP")
        
        self.setup_main_tab(main_tab)
        
        # Вкладка 2: Скины
        skins_tab = ttk.Frame(notebook)
        notebook.add(skins_tab, text="Скины")
        
        self.setup_skins_tab(skins_tab)
        
        # Вкладка 3: Рендеринг
        render_tab = ttk.Frame(notebook)
        notebook.add(render_tab, text="Рендеринг")
        
        self.setup_render_tab(render_tab)
        
        # Вкладка 4: История
        history_tab = ttk.Frame(notebook)
        notebook.add(history_tab, text="История")
        
        self.setup_history_tab(history_tab)
        
        # Вкладка 5: Настройки
        settings_tab = ttk.Frame(notebook)
        notebook.add(settings_tab, text="Настройки")
        
        self.setup_settings_tab(settings_tab)
        
        # Статус бар
        status_frame = ttk.Frame(self.root)
        status_frame.pack(fill='x', padx=10, pady=(0, 10))
        
        self.status_label = ttk.Label(
            status_frame, 
            textvariable=self.status_text,
            relief=tk.SUNKEN,
            anchor=tk.W
        )
        self.status_label.pack(fill='x', ipady=5)
        
        # Прогресс бар
        self.progress = ttk.Progressbar(
            self.root, 
            mode='indeterminate',
            length=400
        )
        self.progress.pack(pady=(0, 10))
    
    def setup_main_tab(self, parent):
        """Настройка основной вкладки"""
        # Фрейм выбора файла
        file_frame = ttk.LabelFrame(parent, text="Файл реплея", padding=10)
        file_frame.pack(fill='x', padx=5, pady=5)
        
        ttk.Label(file_frame, text="Файл .osr:").pack(anchor=tk.W)
        
        file_entry_frame = ttk.Frame(file_frame)
        file_entry_frame.pack(fill='x', pady=5)
        
        self.replay_entry = ttk.Entry(
            file_entry_frame, 
            textvariable=self.replay_file,
            width=60
        )
        self.replay_entry.pack(side=tk.LEFT, fill='x', expand=True, padx=(0, 5))
        
        ttk.Button(
            file_entry_frame, 
            text="Обзор",
            command=self.browse_replay
        ).pack(side=tk.RIGHT)
        
        ttk.Button(
            file_entry_frame,
            text="Анализировать",
            command=self.analyze_replay
        ).pack(side=tk.RIGHT, padx=5)
        
        # Фрейм выбора скина
        skin_frame = ttk.LabelFrame(parent, text="Скин для реплея", padding=10)
        skin_frame.pack(fill='x', padx=5, pady=5)
        
        skin_select_frame = ttk.Frame(skin_frame)
        skin_select_frame.pack(fill='x', pady=5)
        
        ttk.Label(skin_select_frame, text="Скин:").pack(side=tk.LEFT, padx=(0, 10))
        
        self.skin_combo = ttk.Combobox(
            skin_select_frame,
            textvariable=self.skin_var,
            values=self.skin_manager.get_skin_list(),
            state='readonly',
            width=30
        )
        self.skin_combo.pack(side=tk.LEFT, padx=(0, 10))
        self.skin_combo.bind('<<ComboboxSelected>>', self.on_skin_selected)
        
        ttk.Button(
            skin_select_frame,
            text="Обновить",
            command=self.refresh_skin_list
        ).pack(side=tk.LEFT, padx=5)
        
        # Превью скина
        self.preview_frame = ttk.Frame(skin_frame)
        self.preview_frame.pack(fill='x', pady=10)
        
        self.preview_label = ttk.Label(self.preview_frame, text="Превью скина:")
        self.preview_label.pack(anchor=tk.W)
        
        self.preview_canvas = tk.Canvas(self.preview_frame, width=200, height=150, bg='gray')
        self.preview_canvas.pack(pady=5)
        
        self.skin_info_label = ttk.Label(
            skin_frame,
            textvariable=self.skin_info_var,
            wraplength=400
        )
        self.skin_info_label.pack(anchor=tk.W)
        
        # Фрейм статистики
        stats_frame = ttk.LabelFrame(parent, text="Статистика реплея", padding=10)
        stats_frame.pack(fill='x', padx=5, pady=5)
        
        # Счетчики хитов
        counters_frame = ttk.Frame(stats_frame)
        counters_frame.pack(fill='x', pady=5)
        
        ttk.Label(counters_frame, text="100:").grid(row=0, column=0, sticky=tk.W, padx=5)
        self.hundreds_label = ttk.Label(
            counters_frame, 
            textvariable=self.hundreds_count,
            font=('Arial', 12, 'bold'),
            foreground='orange'
        )
        self.hundreds_label.grid(row=0, column=1, sticky=tk.W, padx=(0, 20))
        
        ttk.Label(counters_frame, text="50:").grid(row=0, column=2, sticky=tk.W, padx=5)
        self.fifties_label = ttk.Label(
            counters_frame, 
            textvariable=self.fifties_count,
            font=('Arial', 12, 'bold'),
            foreground='green'
        )
        self.fifties_label.grid(row=0, column=3, sticky=tk.W, padx=(0, 20))
        
        ttk.Label(counters_frame, text="Miss:").grid(row=0, column=4, sticky=tk.W, padx=5)
        self.misses_label = ttk.Label(
            counters_frame, 
            textvariable=self.misses_count,
            font=('Arial', 12, 'bold'),
            foreground='red'
        )
        self.misses_label.grid(row=0, column=5, sticky=tk.W, padx=(0, 20))
        
        ttk.Label(counters_frame, text="Combo:").grid(row=0, column=6, sticky=tk.W, padx=5)
        ttk.Label(
            counters_frame, 
            textvariable=self.max_combo_var,
            font=('Arial', 12, 'bold')
        ).grid(row=0, column=7, sticky=tk.W)
        
        # Точность
        accuracy_frame = ttk.Frame(stats_frame)
        accuracy_frame.pack(fill='x', pady=5)
        
        ttk.Label(accuracy_frame, text="Точность:").pack(side=tk.LEFT, padx=5)
        ttk.Label(
            accuracy_frame, 
            textvariable=self.accuracy_var,
            font=('Arial', 12, 'bold')
        ).pack(side=tk.LEFT)
        
        # Фрейм расчета PP
        pp_frame = ttk.LabelFrame(parent, text="Расчет PP", padding=10)
        pp_frame.pack(fill='x', padx=5, pady=5)
        
        # Компоненты PP
        components = [
            ("Общий PP:", self.pp_total, 0, 0),
            ("Aim PP:", self.pp_aim, 0, 2),
            ("Speed PP:", self.pp_speed, 1, 0),
            ("Accuracy PP:", self.pp_accuracy, 1, 2),
            ("Flashlight PP:", self.pp_flashlight, 2, 0)
        ]
        
        for label_text, var, row, col in components:
            frame = ttk.Frame(pp_frame)
            frame.grid(row=row, column=col, sticky=tk.W, padx=10, pady=5)
            
            ttk.Label(frame, text=label_text, font=('Arial', 10)).pack(side=tk.LEFT)
            ttk.Label(
                frame, 
                textvariable=var,
                font=('Arial', 11, 'bold'),
                foreground='blue'
            ).pack(side=tk.LEFT, padx=(5, 0))
        
        # Кнопки действий
        action_frame = ttk.Frame(parent)
        action_frame.pack(fill='x', padx=5, pady=10)
        
        ttk.Button(
            action_frame,
            text="Рассчитать PP",
            command=self.calculate_pp
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            action_frame,
            text="Экспорт данных",
            command=self.export_data
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            action_frame,
            text="Очистить",
            command=self.clear_data
        ).pack(side=tk.LEFT, padx=5)
        
        # Обновление превью скина
        self.update_skin_preview()
    
    def setup_skins_tab(self, parent):
        """Настройка вкладки управления скинами"""
        # Фрейм импорта скина
        import_frame = ttk.LabelFrame(parent, text="Импорт скина", padding=10)
        import_frame.pack(fill='x', padx=5, pady=5)
        
        # Имя скина
        ttk.Label(import_frame, text="Имя скина:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.new_skin_name = tk.StringVar()
        ttk.Entry(import_frame, textvariable=self.new_skin_name, width=30).grid(
            row=0, column=1, sticky=tk.W, pady=5, padx=5
        )
        
        # Автор
        ttk.Label(import_frame, text="Автор:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.new_skin_author = tk.StringVar()
        ttk.Entry(import_frame, textvariable=self.new_skin_author, width=30).grid(
            row=1, column=1, sticky=tk.W, pady=5, padx=5
        )
        
        # Описание
        ttk.Label(import_frame, text="Описание:").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.new_skin_desc = tk.StringVar()
        ttk.Entry(import_frame, textvariable=self.new_skin_desc, width=30).grid(
            row=2, column=1, sticky=tk.W, pady=5, padx=5
        )
        
        # Путь к скину
        ttk.Label(import_frame, text="Источник:").grid(row=3, column=0, sticky=tk.W, pady=5)
        self.import_skin_path = tk.StringVar()
        import_entry = ttk.Entry(import_frame, textvariable=self.import_skin_path, width=30)
        import_entry.grid(row=3, column=1, sticky=tk.W, pady=5, padx=5)
        
        ttk.Button(
            import_frame,
            text="Обзор",
            command=self.browse_skin_import
        ).grid(row=3, column=2, padx=5)
        
        # Кнопки импорта
        button_frame = ttk.Frame(import_frame)
        button_frame.grid(row=4, column=0, columnspan=3, pady=10)
        
        ttk.Button(
            button_frame,
            text="Импортировать скин",
            command=self.import_skin
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            button_frame,
            text="Импортировать из osu!",
            command=self.import_from_osu
        ).pack(side=tk.LEFT, padx=5)
        
        # Список установленных скинов
        list_frame = ttk.LabelFrame(parent, text="Установленные скины", padding=10)
        list_frame.pack(fill='both', expand=True, padx=5, pady=5)
        
        # Таблица скинов
        columns = ('Имя', 'Автор', 'Версия', 'Описание', 'Дата создания')
        
        tree_frame = ttk.Frame(list_frame)
        tree_frame.pack(fill='both', expand=True, pady=5)
        
        scrollbar = ttk.Scrollbar(tree_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.skins_tree = ttk.Treeview(
            tree_frame,
            columns=columns,
            show='headings',
            yscrollcommand=scrollbar.set,
            height=10
        )
        
        for col in columns:
            self.skins_tree.heading(col, text=col)
            self.skins_tree.column(col, width=150)
        
        self.skins_tree.pack(side=tk.LEFT, fill='both', expand=True)
        scrollbar.config(command=self.skins_tree.yview)
        
        # Кнопки управления скинами
        skin_buttons_frame = ttk.Frame(list_frame)
        skin_buttons_frame.pack(fill='x', pady=5)
        
        ttk.Button(
            skin_buttons_frame,
            text="Удалить выбранный",
            command=self.delete_selected_skin
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            skin_buttons_frame,
            text="Экспортировать скин",
            command=self.export_selected_skin
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            skin_buttons_frame,
            text="Установить как текущий",
            command=self.set_selected_as_current
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            skin_buttons_frame,
            text="Обновить список",
            command=self.refresh_skin_list
        ).pack(side=tk.LEFT, padx=5)
        
        # Загрузка списка скинов
        self.refresh_skin_list()
    
    def setup_render_tab(self, parent):
        """Настройка вкладки рендеринга"""
        # Настройки рендеринга
        settings_frame = ttk.LabelFrame(parent, text="Настройки рендеринга", padding=10)
        settings_frame.pack(fill='x', padx=5, pady=5)
        
        # Выбор скина по умолчанию
        ttk.Label(settings_frame, text="Скин по умолчанию:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.default_skin_var = tk.StringVar(value=self.renderer.render_settings.get('default_skin', DEFAULT_SKIN_NAME))
        default_skin_combo = ttk.Combobox(
            settings_frame,
            textvariable=self.default_skin_var,
            values=self.skin_manager.get_skin_list(),
            state='readonly',
            width=25
        )
        default_skin_combo.grid(row=0, column=1, sticky=tk.W, pady=5, padx=5)
        
        # Формат вывода
        ttk.Label(settings_frame, text="Формат видео:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.output_format_var = tk.StringVar(value=self.renderer.render_settings.get('output_format', 'mp4'))
        format_combo = ttk.Combobox(
            settings_frame,
            textvariable=self.output_format_var,
            values=['mp4', 'avi', 'mov', 'webm'],
            state='readonly',
            width=25
        )
        format_combo.grid(row=1, column=1, sticky=tk.W, pady=5, padx=5)
        
        # Разрешение
        ttk.Label(settings_frame, text="Разрешение:").grid(row=2, column=0, sticky=tk.W, pady=5)
        res_frame = ttk.Frame(settings_frame)
        res_frame.grid(row=2, column=1, sticky=tk.W, pady=5, padx=5)
        
        self.res_width_var = tk.StringVar(value=str(self.renderer.render_settings.get('resolution_width', 1920)))
        self.res_height_var = tk.StringVar(value=str(self.renderer.render_settings.get('resolution_height', 1080)))
        
        ttk.Entry(res_frame, textvariable=self.res_width_var, width=6).pack(side=tk.LEFT)
        ttk.Label(res_frame, text="x").pack(side=tk.LEFT, padx=2)
        ttk.Entry(res_frame, textvariable=self.res_height_var, width=6).pack(side=tk.LEFT)
        
        # FPS
        ttk.Label(settings_frame, text="Кадров в секунду:").grid(row=3, column=0, sticky=tk.W, pady=5)
        self.fps_var = tk.StringVar(value=str(self.renderer.render_settings.get('fps', 60)))
        ttk.Entry(settings_frame, textvariable=self.fps_var, width=10).grid(row=3, column=1, sticky=tk.W, pady=5, padx=5)
        
        # Битрейт
        ttk.Label(settings_frame, text="Битрейт (kbps):").grid(row=4, column=0, sticky=tk.W, pady=5)
        self.bitrate_var = tk.StringVar(value=str(self.renderer.render_settings.get('bitrate', 8000)))
        ttk.Entry(settings_frame, textvariable=self.bitrate_var, width=10).grid(row=4, column=1, sticky=tk.W, pady=5, padx=5)
        
        # Отображаемые элементы UI
        ttk.Label(settings_frame, text="Отображаемые элементы:").grid(row=5, column=0, sticky=tk.W, pady=5)
        
        ui_frame = ttk.Frame(settings_frame)
        ui_frame.grid(row=5, column=1, sticky=tk.W, pady=5, padx=5)
        
        self.show_hits_var = tk.BooleanVar(value=self.renderer.render_settings.get('show_hit_counter', True))
        self.show_score_var = tk.BooleanVar(value=self.renderer.render_settings.get('show_score', True))
        self.show_accuracy_var = tk.BooleanVar(value=self.renderer.render_settings.get('show_accuracy', True))
        self.show_combo_var = tk.BooleanVar(value=self.renderer.render_settings.get('show_combo', True))
        
        ttk.Checkbutton(ui_frame, text="Счетчик хитов", variable=self.show_hits_var).pack(anchor=tk.W)
        ttk.Checkbutton(ui_frame, text="Счет", variable=self.show_score_var).pack(anchor=tk.W)
        ttk.Checkbutton(ui_frame, text="Точность", variable=self.show_accuracy_var).pack(anchor=tk.W)
        ttk.Checkbutton(ui_frame, text="Комбо", variable=self.show_combo_var).pack(anchor=tk.W)
        
        # Кнопки управления настройками
        settings_buttons = ttk.Frame(settings_frame)
        settings_buttons.grid(row=6, column=0, columnspan=2, pady=10)
        
        ttk.Button(
            settings_buttons,
            text="Сохранить настройки",
            command=self.save_render_settings
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            settings_buttons,
            text="Сбросить настройки",
            command=self.reset_render_settings
        ).pack(side=tk.LEFT, padx=5)
        
        # Фрейм рендеринга
        render_frame = ttk.LabelFrame(parent, text="Рендеринг реплея", padding=10)
        render_frame.pack(fill='x', padx=5, pady=5)
        
        ttk.Label(render_frame, text="Выходной файл:").pack(anchor=tk.W)
        
        output_frame = ttk.Frame(render_frame)
        output_frame.pack(fill='x', pady=5)
        
        self.render_output_path = tk.StringVar()
        ttk.Entry(output_frame, textvariable=self.render_output_path, width=50).pack(side=tk.LEFT, fill='x', expand=True, padx=(0, 5))
        
        ttk.Button(
            output_frame,
            text="Обзор",
            command=self.browse_render_output
        ).pack(side=tk.RIGHT)
        
        # Кнопки рендеринга
        render_buttons = ttk.Frame(render_frame)
        render_buttons.pack(fill='x', pady=10)
        
        ttk.Button(
            render_buttons,
            text="Начать рендеринг",
            command=self.start_rendering,
            style='Accent.TButton'
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            render_buttons,
            text="Рендеринг с текущим скином",
            command=lambda: self.start_rendering(use_current_skin=True)
        ).pack(side=tk.LEFT, padx=5)
    
    def setup_history_tab(self, parent):
        """Настройка вкладки истории"""
        # Таблица истории
        columns = ('Дата', 'Игрок', 'Карта', 'Счет', 'PP', 'Точность', 'Скин')
        
        tree_frame = ttk.Frame(parent)
        tree_frame.pack(fill='both', expand=True, padx=5, pady=5)
        
        scrollbar = ttk.Scrollbar(tree_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.history_tree = ttk.Treeview(
            tree_frame,
            columns=columns,
            show='headings',
            yscrollcommand=scrollbar.set,
            height=15
        )
        
        for col in columns:
            self.history_tree.heading(col, text=col)
            self.history_tree.column(col, width=100)
        
        self.history_tree.pack(side=tk.LEFT, fill='both', expand=True)
        scrollbar.config(command=self.history_tree.yview)
        
        # Кнопки управления историей
        button_frame = ttk.Frame(parent)
        button_frame.pack(fill='x', padx=5, pady=5)
        
        ttk.Button(
            button_frame,
            text="Обновить историю",
            command=self.load_history
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            button_frame,
            text="Очистить историю",
            command=self.clear_history
        ).pack(side=tk.LEFT, padx=5)
        
        ttk.Button(
            button_frame,
            text="Экспорт истории",
            command=self.export_history
        ).pack(side=tk.LEFT, padx=5)
        
        # Загрузка истории при запуске
        self.load_history()
    
    def setup_settings_tab(self, parent):
        """Настройка вкладки настроек"""
        # Настройки API
        api_frame = ttk.LabelFrame(parent, text="API Настройки", padding=10)
        api_frame.pack(fill='x', padx=5, pady=5)
        
        ttk.Label(api_frame, text="Client ID:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.client_id_var = tk.StringVar(value=self.config.get("client_id", ""))
        ttk.Entry(api_frame, textvariable=self.client_id_var, width=40).grid(
            row=0, column=1, sticky=tk.W, pady=5, padx=5
        )
        
        ttk.Label(api_frame, text="Client Secret:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.client_secret_var = tk.StringVar(value=self.config.get("client_secret", ""))
        ttk.Entry(api_frame, textvariable=self.client_secret_var, show="*", width=40).grid(
            row=1, column=1, sticky=tk.W, pady=5, padx=5
        )
        
        ttk.Button(
            api_frame,
            text="Сохранить настройки API",
            command=self.save_api_settings
        ).grid(row=2, column=0, columnspan=2, pady=10)
        
        # Настройки базы данных
        db_frame = ttk.LabelFrame(parent, text="База данных", padding=10)
        db_frame.pack(fill='x', padx=5, pady=5)
        
        ttk.Label(db_frame, text="Путь к базе данных:").pack(anchor=tk.W)
        ttk.Label(db_frame, text=str(DATABASE_FILE), foreground='gray').pack(anchor=tk.W, pady=5)
        
        ttk.Button(
            db_frame,
            text="Очистить кеш карт",
            command=self.clear_cache
        ).pack(anchor=tk.W, pady=5)
        
        # Информация о базе данных
        db_info = ttk.Label(db_frame, text="", foreground='green')
        db_info.pack(anchor=tk.W, pady=5)
        
        # Обновление информации
        self.update_db_info(db_info)
    
    def browse_replay(self):
        """Выбор файла реплея"""
        filename = filedialog.askopenfilename(
            title="Выберите файл реплея osu!",
            filetypes=[
                ("osu! replay files", "*.osr"),
                ("All files", "*.*")
            ]
        )
        
        if filename:
            self.replay_file.set(filename)
            self.status_text.set(f"Выбран файл: {Path(filename).name}")
    
    def browse_skin_import(self):
        """Выбор файла или папки скина для импорта"""
        # Диалог выбора файла или папки
        selection = filedialog.askopenfilename(
            title="Выберите файл скина или папку",
            filetypes=[
                ("osu! skin files", "*.osk"),
                ("ZIP archives", "*.zip"),
                ("All files", "*.*")
            ]
        )
        
        if not selection:
            return
        
        # Проверка, выбрана ли папка
        if os.path.isdir(selection):
            self.import_skin_path.set(selection)
        else:
            self.import_skin_path.set(selection)
    
    def import_from_osu(self):
        """Импорт скина из установленной игры osu!"""
        # Попытка найти стандартные пути osu!
        possible_paths = [
            Path.home() / "AppData/Local/osu!/Skins",  # Windows
            Path.home() / ".local/share/osu/Skins",    # Linux
            Path.home() / "Library/Application Support/osu!/Skins",  # macOS
        ]
        
        skin_paths = []
        for path in possible_paths:
            if path.exists():
                skin_paths.extend([p for p in path.iterdir() if p.is_dir()])
        
        if not skin_paths:
            messagebox.showinfo("Информация", "Не найдены скины osu! в стандартных расположениях")
            return
        
        # Диалог выбора скина
        dialog = tk.Toplevel(self.root)
        dialog.title("Импорт скина из osu!")
        dialog.geometry("400x300")
        dialog.transient(self.root)
        dialog.grab_set()
        
        ttk.Label(dialog, text="Выберите скин для импорта:", font=('Arial', 10, 'bold')).pack(pady=10)
        
        skin_listbox = tk.Listbox(dialog, height=10)
        skin_listbox.pack(fill='both', expand=True, padx=10, pady=5)
        
        for skin_path in skin_paths:
            skin_listbox.insert(tk.END, skin_path.name)
        
        def on_import_selected():
            selection = skin_listbox.curselection()
            if selection:
                skin_name = skin_listbox.get(selection[0])
                source_path = possible_paths[0] / skin_name  # Берем первый найденный путь
                
                # Запрос имени для импорта
                import_name = simpledialog.askstring(
                    "Имя скина",
                    "Введите имя для импортируемого скина:",
                    initialvalue=skin_name
                )
                
                if import_name:
                    self.import_skin_path.set(str(source_path))
                    self.new_skin_name.set(import_name)
                    dialog.destroy()
        
        button_frame = ttk.Frame(dialog)
        button_frame.pack(pady=10)
        
        ttk.Button(button_frame, text="Импортировать", command=on_import_selected).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Отмена", command=dialog.destroy).pack(side=tk.LEFT, padx=5)
    
    def import_skin(self):
        """Импорт выбранного скина"""
        source_path = Path(self.import_skin_path.get())
        skin_name = self.new_skin_name.get().strip()
        
        if not source_path.exists():
            messagebox.showerror("Ошибка", "Указанный путь не существует!")
            return
        
        if not skin_name:
            messagebox.showerror("Ошибка", "Введите имя скина!")
            return
        
        # Проверка, существует ли уже скин с таким именем
        if skin_name in self.skin_manager.skins and skin_name != DEFAULT_SKIN_NAME:
            if not messagebox.askyesno("Подтверждение", f"Скин '{skin_name}' уже существует. Заменить?"):
                return
        
        # Импорт скина
        skin_info = self.skin_manager.import_skin(
            source_path,
            skin_name,
            self.new_skin_author.get(),
            self.new_skin_desc.get()
        )
        
        if skin_info:
            # Обновление интерфейса
            self.refresh_skin_list()
            self.skin_var.set(skin_name)
            self.update_skin_preview()
            
            # Очистка полей
            self.new_skin_name.set("")
            self.new_skin_author.set("")
            self.new_skin_desc.set("")
            self.import_skin_path.set("")
            
            messagebox.showinfo("Успех", f"Скин '{skin_name}' успешно импортирован")
            self.status_text.set(f"Скин импортирован: {skin_name}")
    
    def refresh_skin_list(self):
        """Обновление списка скинов"""
        # Обновление комбобокса в основной вкладке
        self.skin_combo['values'] = self.skin_manager.get_skin_list()
        
        # Обновление таблицы скинов
        for item in self.skins_tree.get_children():
            self.skins_tree.delete(item)
        
        for skin_name, skin_info in self.skin_manager.skins.items():
            self.skins_tree.insert('', 'end', values=(
                skin_name,
                skin_info.author,
                skin_info.version,
                skin_info.description[:50] + "..." if len(skin_info.description) > 50 else skin_info.description,
                skin_info.created_at.strftime("%Y-%m-%d") if skin_info.created_at else ""
            ))
    
    def update_skin_preview(self):
        """Обновление превью текущего скина"""
        skin_name = self.skin_var.get()
        
        # Получение превью изображения
        preview_image = self.skin_manager.get_skin_preview_image(skin_name)
        
        if preview_image:
            # Сохранение ссылки на изображение
            self.current_skin_preview = preview_image
            
            # Очистка канваса
            self.preview_canvas.delete("all")
            
            # Отображение изображения
            self.preview_canvas.create_image(100, 75, image=preview_image)
            
            # Обновление информации о скине
            skin_info = self.skin_manager.skins.get(skin_name)
            if skin_info:
                info_text = f"Автор: {skin_info.author}\n"
                if skin_info.description:
                    info_text += f"Описание: {skin_info.description}"
                self.skin_info_var.set(info_text)
    
    def on_skin_selected(self, event):
        """Обработка выбора скина"""
        skin_name = self.skin_var.get()
        self.skin_manager.set_current_skin(skin_name)
        self.update_skin_preview()
        self.status_text.set(f"Выбран скин: {skin_name}")
    
    def delete_selected_skin(self):
        """Удаление выбранного скина"""
        selection = self.skins_tree.selection()
        if not selection:
            messagebox.showwarning("Внимание", "Выберите скин для удаления")
            return
        
        item = self.skins_tree.item(selection[0])
        skin_name = item['values'][0]
        
        if messagebox.askyesno("Подтверждение", f"Удалить скин '{skin_name}'?"):
            if self.skin_manager.delete_skin(skin_name):
                self.refresh_skin_list()
                self.update_skin_preview()
                messagebox.showinfo("Успех", f"Скин '{skin_name}' удален")
    
    def export_selected_skin(self):
        """Экспорт выбранного скина"""
        selection = self.skins_tree.selection()
        if not selection:
            messagebox.showwarning("Внимание", "Выберите скин для экспорта")
            return
        
        item = self.skins_tree.item(selection[0])
        skin_name = item['values'][0]
        
        # Диалог сохранения
        filename = filedialog.asksaveasfilename(
            title="Экспорт скина",
            defaultextension=".osk",
            filetypes=[
                ("osu! skin files", "*.osk"),
                ("ZIP archives", "*.zip"),
                ("All files", "*.*")
            ],
            initialfile=f"{skin_name}.osk"
        )
        
        if filename:
            if self.skin_manager.export_skin(skin_name, Path(filename)):
                messagebox.showinfo("Успех", f"Скин '{skin_name}' экспортирован")
            else:
                messagebox.showerror("Ошибка", "Не удалось экспортировать скин")
    
    def set_selected_as_current(self):
        """Установка выбранного скина как текущего"""
        selection = self.skins_tree.selection()
        if not selection:
            messagebox.showwarning("Внимание", "Выберите скин")
            return
        
        item = self.skins_tree.item(selection[0])
        skin_name = item['values'][0]
        
        self.skin_var.set(skin_name)
        self.skin_manager.set_current_skin(skin_name)
        self.update_skin_preview()
        self.status_text.set(f"Текущий скин: {skin_name}")
    
    def analyze_replay(self):
        """Анализ реплея"""
        replay_path = Path(self.replay_file.get())
        
        if not replay_path.exists():
            messagebox.showerror("Ошибка", "Файл не найден!")
            return
        
        self.status_text.set("Анализ реплея...")
        self.progress.start()
        
        # Запуск в отдельном потоке
        thread = threading.Thread(target=self._analyze_replay_thread, args=(replay_path,))
        thread.daemon = True
        thread.start()
    
    def _analyze_replay_thread(self, replay_path: Path):
        """Поток для анализа реплея"""
        try:
            # Парсинг реплея
            replay_data = self.replay_parser.parse_replay(replay_path)
            
            if not replay_data:
                self.root.after(0, lambda: messagebox.showerror(
                    "Ошибка", "Не удалось распарсить реплей!"
                ))
                return
            
            # Установка используемого скина
            replay_data.skin_used = self.skin_var.get()
            
            self.current_replay = replay_data
            
            # Получение атрибутов карты
            beatmap_attributes = None
            
            # Сначала ищем в базе данных
            if replay_data.beatmap_md5:
                beatmap_attributes = self.db_manager.get_beatmap_attributes(
                    beatmap_md5=replay_data.beatmap_md5
                )
            
            # Если не нашли в базе и есть API, ищем через API
            if not beatmap_attributes and self.api:
                # Попытка найти ID карты через API
                beatmap_id = self.api.get_beatmap_by_md5(replay_data.beatmap_md5)
                if beatmap_id:
                    beatmap_attributes = self.api.get_beatmap_attributes(beatmap_id)
                    
                    # Сохраняем в базу данных
                    if beatmap_attributes:
                        self.db_manager.save_beatmap_attributes(beatmap_attributes)
            
            self.current_beatmap_attributes = beatmap_attributes
            
            # Обновление интерфейса
            self.root.after(0, self._update_ui_with_replay_data, replay_data)
            
            self.root.after(0, lambda: self.status_text.set(
                f"Реплей проанализирован: {replay_data.player_name}"
            ))
            
        except Exception as e:
            logger.error(f"Ошибка анализа реплея: {e}")
            self.root.after(0, lambda: messagebox.showerror(
                "Ошибка", f"Ошибка анализа: {str(e)}"
            ))
        finally:
            self.root.after(0, self.progress.stop)
    
    def _update_ui_with_replay_data(self, replay_data):
        """Обновление интерфейса данными реплея"""
        self.hundreds_count.set(str(replay_data.count_100))
        self.fifties_count.set(str(replay_data.count_50))
        self.misses_count.set(str(replay_data.count_miss))
        self.max_combo_var.set(str(replay_data.max_combo))
        
        # Расчет точности
        accuracy = self.pp_calculator.calculate_accuracy(
            replay_data.count_300,
            replay_data.count_100,
            replay_data.count_50,
            replay_data.count_miss
        )
        self.accuracy_var.set(f"{accuracy*100:.2f}%")
        
        # Показ информации о моде
        mods_text = self._get_mods_text(replay_data.mods)
        if mods_text:
            self.status_text.set(f"Моды: {mods_text} | Скин: {replay_data.skin_used}")
    
    def calculate_pp(self):
        """Расчет PP на основе текущих данных"""
        if not self.current_replay:
            messagebox.showwarning("Внимание", "Сначала загрузите реплей!")
            return
        
        if not self.current_beatmap_attributes:
            messagebox.showwarning(
                "Внимание", 
                "Не найдены атрибуты карты. Расчет будет приблизительным."
            )
            # Используем стандартные значения
            self.current_beatmap_attributes = BeatmapAttributes(
                beatmap_id=0,
                aim=2.5,
                speed=2.5,
                od=8.0,
                ar=8.0,
                max_combo=1000,
                num_sliders=50,
                num_spinners=2,
                num_hit_circles=200,
                total_hits=252
            )
        
        # Расчет PP
        pp_result = self.pp_calculator.calculate_total_pp(
            self.current_beatmap_attributes,
            self.current_replay.mods,
            self.current_replay.max_combo,
            self.current_replay.count_300,
            self.current_replay.count_100,
            self.current_replay.count_50,
            self.current_replay.count_miss
        )
        
        # Обновление интерфейса
        self.pp_total.set(str(pp_result["total"]))
        self.pp_aim.set(str(pp_result["aim"]))
        self.pp_speed.set(str(pp_result["speed"]))
        self.pp_accuracy.set(str(pp_result["accuracy"]))
        self.pp_flashlight.set(str(pp_result["flashlight"]))
        
        # Сохранение в историю
        if self.current_beatmap_attributes.beatmap_id:
            accuracy = float(self.accuracy_var.get().replace('%', '')) / 100
            
            self.db_manager.add_replay_to_history(
                player_name=self.current_replay.player_name,
                beatmap_id=self.current_beatmap_attributes.beatmap_id,
                score=self.current_replay.score,
                pp=pp_result["total"],
                accuracy=accuracy,
                skin_used=self.current_replay.skin_used
            )
            
            # Обновление истории
            self.load_history()
        
        self.status_text.set(f"PP рассчитаны: {pp_result['total']}pp")
    
    def browse_render_output(self):
        """Выбор файла для вывода рендеринга"""
        filename = filedialog.asksaveasfilename(
            title="Сохранить видео как",
            defaultextension=".mp4",
            filetypes=[
                ("MP4 files", "*.mp4"),
                ("AVI files", "*.avi"),
                ("MOV files", "*.mov"),
                ("WebM files", "*.webm"),
                ("All files", "*.*")
            ]
        )
        
        if filename:
            self.render_output_path.set(filename)
    
    def save_render_settings(self):
        """Сохранение настроек рендеринга"""
        try:
            settings = {
                'default_skin': self.default_skin_var.get(),
                'output_format': self.output_format_var.get(),
                'resolution_width': int(self.res_width_var.get()),
                'resolution_height': int(self.res_height_var.get()),
                'fps': int(self.fps_var.get()),
                'bitrate': int(self.bitrate_var.get()),
                'show_hit_counter': self.show_hits_var.get(),
                'show_score': self.show_score_var.get(),
                'show_accuracy': self.show_accuracy_var.get(),
                'show_combo': self.show_combo_var.get()
            }
            
            self.renderer.update_render_settings(settings)
            messagebox.showinfo("Успех", "Настройки рендеринга сохранены")
            
        except ValueError as e:
            messagebox.showerror("Ошибка", f"Некорректные значения: {str(e)}")
    
    def reset_render_settings(self):
        """Сброс настроек рендеринга к значениям по умолчанию"""
        default_settings = {
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
        
        self.default_skin_var.set(default_settings['default_skin'])
        self.output_format_var.set(default_settings['output_format'])
        self.res_width_var.set(str(default_settings['resolution_width']))
        self.res_height_var.set(str(default_settings['resolution_height']))
        self.fps_var.set(str(default_settings['fps']))
        self.bitrate_var.set(str(default_settings['bitrate']))
        self.show_hits_var.set(default_settings['show_hit_counter'])
        self.show_score_var.set(default_settings['show_score'])
        self.show_accuracy_var.set(default_settings['show_accuracy'])
        self.show_combo_var.set(default_settings['show_combo'])
    
    def start_rendering(self, use_current_skin=False):
        """Запуск рендеринга реплея"""
        if not self.current_replay:
            messagebox.showwarning("Внимание", "Сначала загрузите реплей!")
            return
        
        if not self.current_beatmap_attributes:
            messagebox.showwarning("Внимание", "Не найдены атрибуты карты!")
            return
        
        output_path = Path(self.render_output_path.get())
        if not output_path:
            messagebox.showerror("Ошибка", "Укажите путь для сохранения видео!")
            return
        
        # Определение скина для рендеринга
        skin_name = None
        if use_current_skin:
            skin_name = self.skin_var.get()
        
        self.status_text.set("Начало рендеринга...")
        self.progress.start()
        
        # Запуск в отдельном потоке
        thread = threading.Thread(
            target=self._render_thread,
            args=(output_path, skin_name)
        )
        thread.daemon = True
        thread.start()
    
    def _render_thread(self, output_path: Path, skin_name: str = None):
        """Поток для рендеринга"""
        try:
            success = self.renderer.render_replay(
                self.current_replay,
                self.current_beatmap_attributes,
                output_path,
                skin_name
            )
            
            if success:
                self.root.after(0, lambda: messagebox.showinfo(
                    "Успех",
                    f"Рендеринг завершен!\nФайл сохранен: {output_path.name}"
                ))
                self.root.after(0, lambda: self.status_text.set(
                    f"Рендеринг завершен: {output_path.name}"
                ))
            else:
                self.root.after(0, lambda: messagebox.showerror(
                    "Ошибка", "Не удалось выполнить рендеринг"
                ))
                
        except Exception as e:
            logger.error(f"Ошибка рендеринга: {e}")
            self.root.after(0, lambda: messagebox.showerror(
                "Ошибка", f"Ошибка рендеринга: {str(e)}"
            ))
        finally:
            self.root.after(0, self.progress.stop)
    
    def load_history(self):
        """Загрузка истории из базы данных"""
        try:
            # Очистка текущей таблицы
            for item in self.history_tree.get_children():
                self.history_tree.delete(item)
            
            # Загрузка данных из базы
            with sqlite3.connect(DATABASE_FILE) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                SELECT rh.timestamp, rh.player_name, 
                       ba.beatmap_id, rh.score, rh.pp, rh.accuracy, rh.skin_used
                FROM replay_history rh
                LEFT JOIN beatmap_attributes ba ON rh.beatmap_id = ba.beatmap_id
                ORDER BY rh.timestamp DESC
                LIMIT 100
                ''')
                
                for row in cursor.fetchall():
                    # Форматирование данных для отображения
                    timestamp = datetime.fromisoformat(row[0]).strftime("%Y-%m-%d %H:%M")
                    player = row[1] or "Unknown"
                    beatmap = f"#{row[2]}" if row[2] else "Unknown"
                    score = f"{row[3]:,}"
                    pp = f"{row[4]:.2f}" if row[4] else "0.00"
                    accuracy = f"{row[5]*100:.2f}%" if row[5] else "0.00%"
                    skin = row[6] or "Default"
                    
                    self.history_tree.insert(
                        '', 'end',
                        values=(timestamp, player, beatmap, score, pp, accuracy, skin)
                    )
                    
        except Exception as e:
            logger.error(f"Ошибка загрузки истории: {e}")
    
    def clear_history(self):
        """Очистка истории"""
        if messagebox.askyesno("Подтверждение", "Очистить всю историю?"):
            try:
                with sqlite3.connect(DATABASE_FILE) as conn:
                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM replay_history")
                    conn.commit()
                
                self.load_history()
                messagebox.showinfo("Успех", "История очищена")
            except Exception as e:
                messagebox.showerror("Ошибка", f"Не удалось очистить историю: {e}")
    
    def export_data(self):
        """Экспорт текущих данных"""
        if not self.current_replay:
            messagebox.showwarning("Внимание", "Нет данных для экспорта!")
            return
        
        filename = filedialog.asksaveasfilename(
            title="Экспорт данных",
            defaultextension=".json",
            filetypes=[
                ("JSON files", "*.json"),
                ("Text files", "*.txt"),
                ("All files", "*.*")
            ]
        )
        
        if filename:
            data = {
                "player": self.current_replay.player_name,
                "score": self.current_replay.score,
                "max_combo": self.current_replay.max_combo,
                "accuracy": self.accuracy_var.get(),
                "skin_used": self.current_replay.skin_used,
                "counts": {
                    "300": self.current_replay.count_300,
                    "100": self.current_replay.count_100,
                    "50": self.current_replay.count_50,
                    "miss": self.current_replay.count_miss
                },
                "pp": {
                    "total": self.pp_total.get(),
                    "aim": self.pp_aim.get(),
                    "speed": self.pp_speed.get(),
                    "accuracy": self.pp_accuracy.get(),
                    "flashlight": self.pp_flashlight.get()
                },
                "mods": self._get_mods_text(self.current_replay.mods),
                "timestamp": datetime.now().isoformat()
            }
            
            try:
                with open(filename, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                messagebox.showinfo("Успех", f"Данные экспортированы в {filename}")
            except Exception as e:
                messagebox.showerror("Ошибка", f"Ошибка экспорта: {e}")
    
    def export_history(self):
        """Экспорт всей истории"""
        filename = filedialog.asksaveasfilename(
            title="Экспорт истории",
            defaultextension=".json",
            filetypes=[
                ("JSON files", "*.json"),
                ("CSV files", "*.csv"),
                ("All files", "*.*")
            ]
        )
        
        if filename:
            try:
                with sqlite3.connect(DATABASE_FILE) as conn:
                    cursor = conn.cursor()
                    cursor.execute('''
                    SELECT rh.timestamp, rh.player_name, 
                           ba.beatmap_id, rh.score, rh.pp, rh.accuracy, rh.skin_used
                    FROM replay_history rh
                    LEFT JOIN beatmap_attributes ba ON rh.beatmap_id = ba.beatmap_id
                    ORDER BY rh.timestamp DESC
                    ''')
                    
                    data = []
                    for row in cursor.fetchall():
                        data.append({
                            "timestamp": row[0],
                            "player": row[1],
                            "beatmap_id": row[2],
                            "score": row[3],
                            "pp": row[4],
                            "accuracy": row[5],
                            "skin_used": row[6]
                        })
                
                if filename.endswith('.csv'):
                    import csv
                    with open(filename, 'w', newline='', encoding='utf-8') as f:
                        writer = csv.writer(f)
                        writer.writerow(['Timestamp', 'Player', 'Beatmap ID', 'Score', 'PP', 'Accuracy', 'Skin Used'])
                        for item in data:
                            writer.writerow([
                                item['timestamp'],
                                item['player'],
                                item['beatmap_id'],
                                item['score'],
                                item['pp'],
                                item['accuracy'],
                                item['skin_used']
                            ])
                else:
                    with open(filename, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                
                messagebox.showinfo("Успех", f"История экспортирована в {filename}")
                
            except Exception as e:
                messagebox.showerror("Ошибка", f"Ошибка экспорта: {e}")
    
    def clear_data(self):
        """Очистка текущих данных"""
        self.current_replay = None
        self.current_beatmap_attributes = None
        
        self.hundreds_count.set("0")
        self.fifties_count.set("0")
        self.misses_count.set("0")
        self.max_combo_var.set("0")
        self.accuracy_var.set("0.00%")
        
        self.pp_total.set("0.00")
        self.pp_aim.set("0.00")
        self.pp_speed.set("0.00")
        self.pp_accuracy.set("0.00")
        self.pp_flashlight.set("0.00")
        
        self.status_text.set("Данные очищены")
    
    def clear_cache(self):
        """Очистка кеша карт"""
        if messagebox.askyesno("Подтверждение", 
                               "Очистить кеш атрибутов карт?\nЭто не затронет историю реплеев и скины."):
            try:
                with sqlite3.connect(DATABASE_FILE) as conn:
                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM beatmap_attributes")
                    conn.commit()
                
                messagebox.showinfo("Успех", "Кеш очищен")
            except Exception as e:
                messagebox.showerror("Ошибка", f"Ошибка очистки кеша: {e}")
    
    def save_api_settings(self):
        """Сохранение настроек API"""
        client_id = self.client_id_var.get().strip()
        client_secret = self.client_secret_var.get().strip()
        
        if not client_id or not client_secret:
            messagebox.showwarning("Внимание", "Заполните оба поля!")
            return
        
        self.config["client_id"] = client_id
        self.config["client_secret"] = client_secret
        
        # Сохранение конфигурации
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump(self.config, f, indent=2)
            
            # Переинициализация API
            try:
                self.api = OsuAPI(client_id, client_secret)
                messagebox.showinfo("Успех", "Настройки API сохранены и применены")
            except Exception as e:
                messagebox.showerror("Ошибка", f"Не удалось инициализировать API: {e}")
                
        except Exception as e:
            messagebox.showerror("Ошибка", f"Ошибка сохранения: {e}")
    
    def show_api_config_dialog(self):
        """Показ диалога настройки API"""
        dialog = tk.Toplevel(self.root)
        dialog.title("Настройка API osu!")
        dialog.geometry("500x300")
        dialog.transient(self.root)
        dialog.grab_set()
        
        ttk.Label(
            dialog,
            text="Для полной функциональности требуется настройка API osu!",
            font=('Arial', 10, 'bold')
        ).pack(pady=10)
        
        ttk.Label(
            dialog,
            text="Инструкция по получению ключей:",
            font=('Arial', 9)
        ).pack(pady=5)
        
        instructions = [
            "1. Перейдите на https://osu.ppy.sh/home/account/edit#oauth",
            "2. Нажмите 'New OAuth Application'",
            "3. Заполните форму (имя любое, callback: http://localhost:3914/)",
            "4. Скопируйте Client ID и Client Secret",
            "5. Введите их в настройках программы"
        ]
        
        for instruction in instructions:
            ttk.Label(dialog, text=instruction, justify=tk.LEFT).pack(anchor=tk.W, padx=20)
        
        ttk.Button(
            dialog,
            text="Перейти к настройкам",
            command=lambda: [dialog.destroy(), 
                           self.root.nametowidget(ttk.Notebook(self.root).winfo_children()[4])]
        ).pack(pady=20)
        
        ttk.Button(
            dialog,
            text="Продолжить без API",
            command=dialog.destroy
        ).pack(pady=5)
    
    def update_db_info(self, label_widget):
        """Обновление информации о базе данных"""
        try:
            with sqlite3.connect(DATABASE_FILE) as conn:
                cursor = conn.cursor()
                
                # Количество карт в кеше
                cursor.execute("SELECT COUNT(*) FROM beatmap_attributes")
                beatmaps_count = cursor.fetchone()[0]
                
                # Количество записей в истории
                cursor.execute("SELECT COUNT(*) FROM replay_history")
                history_count = cursor.fetchone()[0]
                
                label_widget.config(
                    text=f"Карт в кеше: {beatmaps_count} | "
                         f"Записей в истории: {history_count}"
                )
                
        except Exception as e:
            label_widget.config(text="Ошибка загрузки информации")
    
    def _get_mods_text(self, mods: int) -> str:
        """Преобразование битовой маски модов в текст"""
        mod_names = {
            1 << 0: "NF",   # NoFail
            1 << 1: "EZ",   # Easy
            1 << 2: "TD",   # TouchDevice
            1 << 3: "HD",   # Hidden
            1 << 4: "HR",   # HardRock
            1 << 5: "SD",   # SuddenDeath
            1 << 6: "DT",   # DoubleTime
            1 << 7: "RX",   # Relax
            1 << 8: "HT",   # HalfTime
            1 << 9: "NC",   # Nightcore (только с DT)
            1 << 10: "FL",  # Flashlight
            1 << 11: "AT",  # Autoplay
            1 << 12: "SO",  # SpunOut
            1 << 13: "AP",  # Autopilot (Relax2)
            1 << 14: "PF",  # Perfect (только с SD)
            1 << 15: "4K",  # Key4
            1 << 16: "5K",  # Key5
            1 << 17: "6K",  # Key6
            1 << 18: "7K",  # Key7
            1 << 19: "8K",  # Key8
            1 << 20: "FI",  # FadeIn
            1 << 21: "RD",  # Random
            1 << 22: "CN",  # Cinema
            1 << 23: "TP",  # Target
            1 << 24: "9K",  # Key9
            1 << 25: "CO",  # Coop
            1 << 26: "1K",  # Key1
            1 << 27: "3K",  # Key3
            1 << 28: "2K",  # Key2
            1 << 29: "V2",  # ScoreV2
            1 << 30: "MR",  # Mirror
        }
        
        active_mods = []
        for mod_bit, mod_name in mod_names.items():
            if mods & mod_bit:
                # Проверка специальных случаев
                if mod_name == "NC" and not (mods & (1 << 6)):  # NC требует DT
                    continue
                if mod_name == "PF" and not (mods & (1 << 5)):  # PF требует SD
                    continue
                active_mods.append(mod_name)
        
        return "+".join(active_mods) if active_mods else "None"
    
    def load_config(self) -> dict:
        """Загрузка конфигурации"""
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {}
    
    def run(self):
        """Запуск приложения"""
        self.root.mainloop()
