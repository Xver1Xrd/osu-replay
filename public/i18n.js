(() => {
  const STORAGE_KEY = "osuReplaySiteLang";
  const SUPPORTED = new Set(["ru", "en"]);

  const dict = {
    ru: {
      "nav.studio": "Studio",
      "nav.skins": "Библиотека",
      "nav.admin": "Admin",
      "common.refresh": "Обновить",
      "common.download": "Скачать",
      "common.openPreview": "Открыть превью",
      "common.logs": "Логи",
      "common.optional": "Опционально",
      "common.none": "Нет",
      "common.replay": "Replay",
      "common.skin": "Skin",
      "common.beatmap": "Beatmap",
      "common.quality": "Качество",
      "common.unknown": "Unknown",
      "common.score": "Score",
      "common.accuracy": "Accuracy",
      "common.created": "создано",
      "file.choose": "Выбрать файл",
      "status.queued": "В очереди",
      "status.processing": "Рендеринг",
      "status.completed": "Завершено",
      "status.failed": "Ошибка",
      "audio.musicShort": "Музыка",
      "audio.hitsoundsShort": "Хитсаунды",
      "audio.musicVolume": "Громкость музыки",
      "audio.hitsoundVolume": "Громкость хитсаундов",
      "library.none": "Без библиотечного скина",
      "library.previewBadge": "превью",
      "hint.librarySkin.default": "Выбери сохранённый скин или загрузи ZIP выше.",
      "hint.librarySkin.localOverrides": "Используется загруженный ZIP (локальный скин имеет приоритет над библиотечным).",
      "hint.librarySkin.localOnly": "Используется загруженный ZIP. Библиотечный выбор временно не нужен.",
      "hint.librarySkin.selected": "Выбран библиотечный скин: {name}",
      "draft.notSelected": "Не выбран",
      "draft.local": "локальный",
      "draft.library": "библиотека",
      "draft.skinTag.local": "Локальный скин",
      "draft.skinTag.library": "Библиотечный скин",
      "draft.skinTag.none": "Без скина",
      "draft.skinSource.localZip": "Локальный ZIP",
      "draft.skinSource.library": "Библиотечный скин",
      "draft.skinPreview.default": "Реальное превью скина появится здесь сразу после выбора ZIP или из библиотеки.",
      "draft.skinPreview.extracting": "Извлекаю превью скина из ZIP...",
      "draft.skinPreview.extractFailed": "Не удалось извлечь превью: {error}",
      "draft.skinPreview.notFoundInArchive": "Подходящая картинка не найдена в архиве скина.",
      "draft.skinPreview.libraryError": "Библиотечный скин без превью: {error}",
      "draft.skinPreview.libraryNoAsset": "У библиотечного скина \"{name}\" нет найденного preview asset.",
      "draft.skinPreview.sourceUnavailable": "{source}: preview unavailable",
      "draft.skinPreview.requestFailed": "Ошибка запроса превью",
      "upload.disabledByAdmin": "Загрузки временно отключены администратором сайта",
      "upload.selectReplay": "Выбери replay (.osr)",
      "upload.creatingJob": "Загрузка файлов и создание задачи...",
      "upload.jobQueued": "Задача поставлена в очередь: {id}",
      "queue.waitingRenderer": "Ожидание рендера",
      "queue.lastLog.queued": "В очереди на рендер",
      "queue.lastLog.processing": "Идет рендеринг",
      "queue.lastLog.completed": "Рендер завершен",
      "queue.lastLog.failed": "Рендер завершился ошибкой",
      "queue.emptyFiltered": "Нет задач для выбранного фильтра.",
      "queue.status.active": "{count} активн.",
      "queue.status.waitingCount": "{count} ждут",
      "queue.status.idle": "Ожидание",
      "queue.status.empty": "Очередь пуста",
      "queue.replayInfo.title": "Replay info",
      "queue.replayInfo.unavailable": "Не удалось извлечь краткую информацию из .osr (или формат нестандартный).",
      "queue.skinPreview.afterExtraction": "Превью появится после извлечения",
      "queue.rendererError": "Ошибка рендера",
      "queue.renderOutput": "Результат рендера",
      "spotlight.noneTitle": "Реплей еще не загружен",
      "spotlight.noneText": "Загрузи реплей, чтобы увидеть краткую информацию о игроке, модах, счете и точности.",
      "sync.refreshing": "Обновление...",
      "sync.autoRefresh": "Автообновление включено",
      "sync.error": "Ошибка синхронизации: {error}",
      "site.brandTitle": "osu! Replay Studio",
      "site.brandSubtitle": "Загрузка реплеев и очередь рендера",
      "site.heroTitle": "Рендер реплеев osu! в видео через danser",
      "site.heroDescription": "Загрузи реплей, скин и карту, настрой параметры danser и получи готовое видео в очереди результатов.",
      "studio.topEyebrow": "Upload + Queue",
      "studio.composerEyebrow": "Composer",
      "studio.newRender": "Новый рендер",
      "studio.queueEyebrow": "Queue",
      "studio.queueTitle": "Очередь и результаты",
      "studio.titleLabel": "Название (необязательно)",
      "studio.titlePlaceholder": "Tournament clip / DT practice",
      "studio.replayMeta": "Обязательно",
      "studio.skinMeta": "Опционально, будет извлечено превью",
      "studio.beatmapMeta": "Опционально, но желательно",
      "studio.libraryLabel": "Библиотека скинов",
      "studio.libraryOpen": "Открыть",
      "studio.quick.draft.title": "Статус черновика",
      "studio.quick.draft.desc": "Текущий выбор файлов и итоговых параметров перед отправкой.",
      "studio.quick.skin.title": "Skin Preview",
      "studio.quick.skin.desc": "Draft attachment state и мгновенное превью выбранного скина.",
      "studio.quick.quality.title": "Качество видео",
      "studio.quick.quality.desc": "Быстрый выбор профиля записи.",
      "studio.quick.music.title": "Громкость музыки",
      "studio.quick.music.desc": "Уровень музыки в финальном видео.",
      "studio.quick.hitsounds.title": "Громкость хитсаундов",
      "studio.quick.hitsounds.desc": "Уровень hit sounds в финальном видео.",
      "studio.quick.quality.label": "Качество видео",
      "studio.quick.music.label": "Громкость музыки",
      "studio.quick.hitsounds.label": "Громкость хитсаундов",
      "studio.cursorSize": "Размер курсора",
      "studio.submit": "Поставить рендер в очередь",
      "filter.all": "Все",
      "filter.active": "Активные",
      "filter.done": "Готово",
      "filter.failed": "Ошибка",
      "skins.page.uploadEyebrow": "Library Upload",
      "skins.page.uploadTitle": "Добавить скин",
      "skins.page.collectionEyebrow": "Collection",
      "skins.page.collectionTitle": "Библиотека скинов",
      "skins.page.nameLabel": "Название скина (необязательно)",
      "skins.page.namePlaceholder": "My Tournament Skin",
      "skins.page.fileMeta": "Архив будет сохранён в библиотеку и получит превью",
      "skins.page.saveBtn": "Сохранить в библиотеку",
      "skins.count": "{count} skins",
      "skins.empty": "Библиотека пока пустая. Загрузите первый скин ZIP/OSK.",
      "skins.previewError": "Ошибка превью",
      "skins.noPreview": "Нет превью",
      "skins.useInStudio": "Открыть в Studio",
      "sync.loadingSkins": "Загрузка скинов...",
      "sync.libraryReady": "Библиотека готова",
      "skins.selectZip": "Выберите ZIP/OSK скин",
      "skins.uploading": "Загрузка скина...",
      "skins.saved": "Скин сохранён: {name}",
    },
    en: {
      "nav.studio": "Studio",
      "nav.skins": "Library",
      "nav.admin": "Admin",
      "common.refresh": "Refresh",
      "common.download": "Download",
      "common.openPreview": "Open preview",
      "common.logs": "Logs",
      "common.optional": "Optional",
      "common.none": "None",
      "common.replay": "Replay",
      "common.skin": "Skin",
      "common.beatmap": "Beatmap",
      "common.quality": "Quality",
      "common.unknown": "Unknown",
      "common.score": "Score",
      "common.accuracy": "Accuracy",
      "common.created": "created",
      "file.choose": "Choose file",
      "status.queued": "Queued",
      "status.processing": "Rendering",
      "status.completed": "Completed",
      "status.failed": "Failed",
      "audio.musicShort": "Music",
      "audio.hitsoundsShort": "Hitsounds",
      "audio.musicVolume": "Music volume",
      "audio.hitsoundVolume": "Hitsound volume",
      "library.none": "No library skin",
      "library.previewBadge": "preview",
      "hint.librarySkin.default": "Choose a saved skin or upload ZIP above.",
      "hint.librarySkin.localOverrides": "Using uploaded ZIP (local skin takes priority over library skin).",
      "hint.librarySkin.localOnly": "Using uploaded ZIP. Library selection is not needed right now.",
      "hint.librarySkin.selected": "Selected library skin: {name}",
      "draft.notSelected": "Not selected",
      "draft.local": "local",
      "draft.library": "library",
      "draft.skinTag.local": "Local skin",
      "draft.skinTag.library": "Library skin",
      "draft.skinTag.none": "No skin",
      "draft.skinSource.localZip": "Local ZIP",
      "draft.skinSource.library": "Library skin",
      "draft.skinPreview.default": "Skin preview will appear here right after selecting a ZIP or library skin.",
      "draft.skinPreview.extracting": "Extracting skin preview from ZIP...",
      "draft.skinPreview.extractFailed": "Failed to extract preview: {error}",
      "draft.skinPreview.notFoundInArchive": "No suitable image found in the skin archive.",
      "draft.skinPreview.libraryError": "Library skin has no preview: {error}",
      "draft.skinPreview.libraryNoAsset": "Library skin \"{name}\" has no detected preview asset.",
      "draft.skinPreview.sourceUnavailable": "{source}: preview unavailable",
      "draft.skinPreview.requestFailed": "Preview request failed",
      "upload.disabledByAdmin": "Uploads are temporarily disabled by the administrator",
      "upload.selectReplay": "Select replay (.osr)",
      "upload.creatingJob": "Uploading files and creating job...",
      "upload.jobQueued": "Job queued: {id}",
      "queue.waitingRenderer": "Waiting for renderer",
      "queue.lastLog.queued": "Queued for rendering",
      "queue.lastLog.processing": "Rendering in progress",
      "queue.lastLog.completed": "Render completed",
      "queue.lastLog.failed": "Render failed",
      "queue.emptyFiltered": "No jobs for the selected filter.",
      "queue.status.active": "{count} active",
      "queue.status.waitingCount": "{count} waiting",
      "queue.status.idle": "Idle",
      "queue.status.empty": "Queue empty",
      "queue.replayInfo.title": "Replay info",
      "queue.replayInfo.unavailable": "Could not extract replay summary from .osr (or format is non-standard).",
      "queue.skinPreview.afterExtraction": "Preview will appear after extraction",
      "queue.rendererError": "Renderer error",
      "queue.renderOutput": "Render output",
      "spotlight.noneTitle": "No replay yet",
      "spotlight.noneText": "Upload a replay to see parsed player/mods/score/accuracy summary here.",
      "sync.refreshing": "Refreshing...",
      "sync.autoRefresh": "Auto refresh on",
      "sync.error": "Sync error: {error}",
      "site.brandTitle": "osu! Replay Studio",
      "site.brandSubtitle": "Replay upload and render queue",
      "site.heroTitle": "Render osu! replays into video with danser",
      "site.heroDescription": "Upload a replay, skin and beatmap, tune danser settings, and get the final video in the results queue.",
      "studio.topEyebrow": "Upload + Queue",
      "studio.composerEyebrow": "Composer",
      "studio.newRender": "New render",
      "studio.queueEyebrow": "Queue",
      "studio.queueTitle": "Queue and results",
      "studio.titleLabel": "Title (optional)",
      "studio.titlePlaceholder": "Tournament clip / DT practice",
      "studio.replayMeta": "Required",
      "studio.skinMeta": "Optional, preview will be extracted",
      "studio.beatmapMeta": "Optional, but recommended",
      "studio.libraryLabel": "Skin library",
      "studio.libraryOpen": "Open",
      "studio.quick.draft.title": "Draft summary",
      "studio.quick.draft.desc": "Current file selection and final parameters before submit.",
      "studio.quick.skin.title": "Skin Preview",
      "studio.quick.skin.desc": "Draft attachment state and instant preview of selected skin.",
      "studio.quick.quality.title": "Video quality",
      "studio.quick.quality.desc": "Quick recording preset selection.",
      "studio.quick.music.title": "Music volume",
      "studio.quick.music.desc": "Music level in the final video.",
      "studio.quick.hitsounds.title": "Hitsound volume",
      "studio.quick.hitsounds.desc": "Hitsound level in the final video.",
      "studio.quick.quality.label": "Video quality",
      "studio.quick.music.label": "Music volume",
      "studio.quick.hitsounds.label": "Hitsound volume",
      "studio.cursorSize": "Cursor size",
      "studio.submit": "Queue Replay Render",
      "filter.all": "All",
      "filter.active": "Active",
      "filter.done": "Done",
      "filter.failed": "Failed",
      "skins.page.uploadEyebrow": "Library Upload",
      "skins.page.uploadTitle": "Add skin",
      "skins.page.collectionEyebrow": "Collection",
      "skins.page.collectionTitle": "Skin library",
      "skins.page.nameLabel": "Skin name (optional)",
      "skins.page.namePlaceholder": "My Tournament Skin",
      "skins.page.fileMeta": "Archive will be saved in the library and get a preview",
      "skins.page.saveBtn": "Save To Library",
      "skins.count": "{count} skins",
      "skins.empty": "Library is empty. Upload your first ZIP/OSK skin.",
      "skins.previewError": "Preview error",
      "skins.noPreview": "No preview",
      "skins.useInStudio": "Use In Studio",
      "sync.loadingSkins": "Loading skins...",
      "sync.libraryReady": "Library ready",
      "skins.selectZip": "Select a ZIP/OSK skin",
      "skins.uploading": "Uploading skin...",
      "skins.saved": "Skin saved: {name}",
    },
  };

  function getLang() {
    const saved = String(localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
    if (SUPPORTED.has(saved)) return saved;
    return "ru";
  }

  function locale() {
    return getLang() === "en" ? "en-US" : "ru-RU";
  }

  function interpolate(template, vars) {
    if (!vars) return template;
    return String(template).replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
  }

  function t(key, vars) {
    const lang = getLang();
    const source = dict[lang] || dict.ru;
    const fallback = dict.ru[key] ?? key;
    return interpolate(source[key] ?? fallback, vars);
  }

  function setText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  function setAttr(selector, attr, value) {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  }

  function applyStudioStatic() {
    setText('.nav-link[href="/"]', t("nav.studio"));
    setText('.nav-link[href="/library"]', t("nav.skins"));
    setText('.nav-link[href="/admin"]', t("nav.admin"));
    setText("#brandTitle", t("site.brandTitle"));
    setText("#brandSubtitle", t("site.brandSubtitle"));
    setText("#heroTitle", t("site.heroTitle"));
    setText("#heroDescription", t("site.heroDescription"));
    setText("#refreshBtn", t("common.refresh"));
    setText(".studio-header .header-copy .eyebrow", t("studio.topEyebrow"));
    setText(".composer-pane .pane-head .eyebrow", t("studio.composerEyebrow"));
    setText("#uploadTitle", t("studio.newRender"));
    setText(".queue-pane .pane-head .eyebrow", t("studio.queueEyebrow"));
    setText("#queueTitle", t("studio.queueTitle"));
    setText('#uploadForm .composer-title-field > span', t("studio.titleLabel"));
    setAttr("#titleInput", "placeholder", t("studio.titlePlaceholder"));
    setText('#replayInput + .file-row-kind', "Replay (.osr)");
    setText('#replayInput ~ .file-row-meta', t("studio.replayMeta"));
    setText('#skinInput + .file-row-kind', "Skin (.zip / .osk)");
    setText('#skinInput ~ .file-row-meta', t("studio.skinMeta"));
    setText('#beatmapInput + .file-row-kind', "Beatmap (.osz / .osu / .zip)");
    setText('#beatmapInput ~ .file-row-meta', t("studio.beatmapMeta"));
    setText(".library-skin-label", t("studio.libraryLabel"));
    setText(".library-skin-link", t("studio.libraryOpen"));
    setText("#libraryBeatmapLabel", getLang() === "en" ? "Beatmap library" : "Библиотека карт");
    setText("#libraryBeatmapOpenLink", t("studio.libraryOpen"));
    setText("#libraryBeatmapHint", getLang() === "en" ? "Choose a saved beatmap or upload .osz above." : "Выбери сохранённую карту или загрузи .osz выше.");
    setText("#submitBtn", t("studio.submit"));

    const queueFilter = document.querySelectorAll(".queue-pane [data-filter]");
    if (queueFilter[0]) queueFilter[0].textContent = t("filter.all");
    if (queueFilter[1]) queueFilter[1].textContent = t("filter.active");
    if (queueFilter[2]) queueFilter[2].textContent = t("filter.done");
    if (queueFilter[3]) queueFilter[3].textContent = t("filter.failed");

    const quickFolds = document.querySelectorAll(".quick-settings-grid .settings-fold");
    const keys = [
      ["studio.quick.draft.title", "studio.quick.draft.desc"],
      ["studio.quick.skin.title", "studio.quick.skin.desc"],
      ["studio.quick.quality.title", "studio.quick.quality.desc"],
      ["studio.quick.music.title", "studio.quick.music.desc"],
      ["studio.quick.hitsounds.title", "studio.quick.hitsounds.desc"],
    ];
    quickFolds.forEach((fold, index) => {
      const title = fold.querySelector(".settings-fold-title h4");
      const desc = fold.querySelector(".settings-fold-title p");
      const pair = keys[index];
      if (!pair) return;
      if (title) title.textContent = t(pair[0]);
      if (desc) desc.textContent = t(pair[1]);
    });

    const qualityLabel = document.querySelector('#videoQualitySelect')?.closest("label.field-block")?.querySelector("span");
    if (qualityLabel) qualityLabel.textContent = t("studio.quick.quality.label");
    const musicLabel = document.querySelector('label[for="musicVolumeInput"]');
    if (musicLabel) musicLabel.textContent = t("studio.quick.music.label");
    const hitsLabel = document.querySelector('label[for="hitsoundVolumeInput"]');
    if (hitsLabel) hitsLabel.textContent = t("studio.quick.hitsounds.label");
    const cursorLabel = document.querySelector(".settings-range-head > span");
    if (cursorLabel) cursorLabel.textContent = t("studio.cursorSize");
  }

  function applySkinsStatic() {
    setText('.nav-link[href="/"]', t("nav.studio"));
    setText('.nav-link[href="/library"]', t("nav.skins"));
    setText('.nav-link[href="/admin"]', t("nav.admin"));
    setText("#skinsRefreshBtn", t("common.refresh"));
    setText(".skin-upload-panel .pane-head .eyebrow", t("skins.page.uploadEyebrow"));
    setText(".skin-upload-panel .pane-head h2", t("skins.page.uploadTitle"));
    setText(".skin-library-panel .pane-head .eyebrow", t("skins.page.collectionEyebrow"));
    setText(".skin-library-panel .pane-head h2", t("skins.page.collectionTitle"));
    setText('#skinLibraryForm .field-block > span', t("skins.page.nameLabel"));
    setAttr("#skinLibraryNameInput", "placeholder", t("skins.page.namePlaceholder"));
    setText('#skinLibraryFileInput + .file-row-kind', "Skin (.zip / .osk)");
    setText('#skinLibraryFileInput ~ .file-row-meta', t("skins.page.fileMeta"));
    setText("#skinLibrarySubmitBtn", t("skins.page.saveBtn"));
  }

  function applyLibraryStatic() {
    setText('.nav-link[href="/"]', t("nav.studio"));
    setText('.nav-link[href="/library"]', t("nav.skins"));
    setText('.nav-link[href="/admin"]', t("nav.admin"));
    setText("#libraryRefreshBtn", t("common.refresh"));

    const isEn = getLang() === "en";
    setText("#libraryPageTitle", isEn ? "Asset Library" : "Библиотека ресурсов");
    setText("#libraryBrandSubtitle", isEn ? "Asset library" : "Библиотека ресурсов");
    setText("#libraryTabSkinsBtn", "Skins");
    setText("#libraryTabBeatmapsBtn", "Beatmaps");
    setText("#librarySkinsUploadTitle", isEn ? "Add skin" : "Добавить скин");
    setText("#librarySkinsCollectionTitle", isEn ? "Skin library" : "Библиотека скинов");
    setText("#skinLibraryNameLabel", t("skins.page.nameLabel"));
    setAttr("#skinLibraryNameInput", "placeholder", t("skins.page.namePlaceholder"));
    setText("#skinLibraryFileMeta", t("skins.page.fileMeta"));
    setText("#skinLibrarySubmitBtn", t("skins.page.saveBtn"));

    setText("#libraryBeatmapsUploadTitle", isEn ? "Add beatmap" : "Добавить beatmap");
    setText("#libraryBeatmapsCollectionTitle", isEn ? "Beatmap library" : "Библиотека карт");
    setText("#beatmapLibraryNameLabel", isEn ? "Beatmap name (optional)" : "Название карты (необязательно)");
    setAttr("#beatmapLibraryNameInput", "placeholder", isEn ? "Street - Hestia (Mapset)" : "Street - Hestia (Mapset)");
    setText("#beatmapLibraryFileMeta", isEn ? "Beatmap will be saved to cache and reused for future renders" : "Карта будет сохранена в кэш и доступна для повторного рендера");
    setText("#beatmapLibrarySubmitBtn", isEn ? "Save To Library" : "Сохранить в библиотеку");
  }

  function updateLanguageButtons() {
    const lang = getLang();
    for (const btn of document.querySelectorAll(".lang-btn[data-lang-option]")) {
      btn.classList.toggle("is-active", btn.dataset.langOption === lang);
    }
  }

  function apply() {
    document.documentElement.lang = getLang();
    updateLanguageButtons();
    if (document.getElementById("uploadForm")) applyStudioStatic();
    if (document.getElementById("skinLibraryForm")) applySkinsStatic();
    if (document.getElementById("libraryTabSkinsBtn")) applyLibraryStatic();
  }

  function setLang(lang) {
    const next = SUPPORTED.has(String(lang || "").toLowerCase()) ? String(lang).toLowerCase() : "ru";
    localStorage.setItem(STORAGE_KEY, next);
    apply();
    window.dispatchEvent(new CustomEvent("site-language-changed", { detail: { lang: next } }));
  }

  function bindSwitches() {
    for (const btn of document.querySelectorAll(".lang-btn[data-lang-option]")) {
      btn.addEventListener("click", () => setLang(btn.dataset.langOption));
    }
  }

  window.osuSiteI18n = { t, getLang, setLang, locale, apply };
  bindSwitches();
  apply();
})();
