# osu! Replay Render Site

Веб-сайт для загрузки реплеев osu! (`.osr`) и постановки задач на рендер в видео с поддержкой пользовательского скина (`.zip`).

Важно: сам рендер выполняется внешним инструментом (например, `danser` + `ffmpeg`). Этот проект дает сайт, очередь, загрузку файлов, статусы, логи и скачивание результата.

## Что умеет

- Загрузка `replay (.osr)` и опционально `skin (.zip)`
- Опциональная загрузка `beatmap (.osz/.osu/.zip)`
- Очередь задач (по одной задаче за раз)
- Статус, прогресс и логи
- Скачивание/предпросмотр результата
- `mock` режим для проверки интерфейса без реального рендера

## Быстрый старт

1. Установить зависимости:

```powershell
npm install
```

2. Скопировать `.env.example` в `.env` и настроить.

3. Запустить:

```powershell
npm start
```

4. Открыть:

`http://localhost:3000`

## Режимы рендера

### `RENDERER_MODE=native`

Реальный встроенный рендер без `danser`: приложение декодирует данные курсора из `.osr`,
генерирует анимированный overlay и собирает `mp4` через `ffmpeg`.

Что нужно:

- `ffmpeg` в `PATH`
- `Python 3` в `PATH` (используется для LZMA-декодирования replay data)

Важно: это не полный игровой рендер карты (без hitobjects/audio beatmap), а визуализация
таймлайна реплея (курсор + нажатия + HUD). Для полноценного рендера карты по-прежнему
используйте `RENDERER_MODE=template` и внешний рендерер (`danser` и т.п.).

### `RENDERER_MODE=mock`

Для теста интерфейса. Пытается создать тестовый `mp4` через `ffmpeg`, а если `ffmpeg` не установлен, сохраняет текстовый placeholder.

### `RENDERER_MODE=template`

Запускает указанную команду `RENDER_COMMAND_TEMPLATE`. Это основной режим для реального рендера через `danser`/собственный скрипт.

Доступные placeholders:

- `{{jobId}}`
- `{{title}}`, `{{title_q}}`
- `{{replay}}`, `{{replay_q}}`
- `{{skinZip}}`, `{{skinZip_q}}`
- `{{skinDir}}`, `{{skinDir_q}}` (распакованный скин)
- `{{beatmap}}`, `{{beatmap_q}}`
- `{{outputDir}}`, `{{outputDir_q}}`
- `{{outputVideo}}`, `{{outputVideo_q}}`

Суффикс `_q` = значение в кавычках (для путей с пробелами).

## Пример подключения своего скрипта (Windows / PowerShell)

`.env`:

```env
RENDERER_MODE=template
RENDER_COMMAND_TEMPLATE=powershell -ExecutionPolicy Bypass -File scripts\\render-danser.ps1 -Replay {{replay_q}} -SkinDir {{skinDir_q}} -Beatmap {{beatmap_q}} -Output {{outputVideo_q}} -VideoWidth {{videoWidth}} -VideoHeight {{videoHeight}} -VideoFps {{videoFps}} -MusicVolume {{musicVolume}} -HitsoundVolume {{hitsoundVolume}} -JobSPatchB64 {{danserJobSPatchB64_q}} -SkipIntro {{danserSkipIntro}}
DANSER_CLI_PATH=C:\\tools\\danser\\danser-cli.exe
DANSER_SETTINGS_PROFILE=default
```

`scripts/render-danser.ps1` теперь является рабочим wrapper-ом (поиск `danser-cli`, подготовка beatmap/skin, `-sPatch`, нормализация output в `mp4`), но при необходимости подправь его под свою сборку `danser`/схему настроек.

## Что нужно для настоящего рендера osu!

- `danser` (или другой рендерер)
- Часто `ffmpeg`
- Доступ к beatmap/песне (локально через osu! Songs или отдельным файлом)

Почему это важно: одного `.osr` недостаточно для полноценного видео, т.к. реплей не содержит все визуальные ресурсы карты/аудио.

## Структура данных

- `uploads/<jobId>/` — загруженные исходники
- `temp/<jobId>/` — временные файлы (включая распакованный скин)
- `output/<jobId>/` — результат рендера
- `data/jobs.json` — состояние задач

## Дальше можно улучшить

- Параллельный рендер (несколько воркеров)
- WebSocket вместо polling
- Аутентификация/личный кабинет
- Очистка старых задач по cron
- Парсинг `.osr` и автоподстановка метаданных карты
# Osu-replay
