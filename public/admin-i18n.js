(() => {
  const STORAGE_KEY = "osuReplaySiteLang";
  const SUPPORTED = new Set(["ru", "en"]);

  const dict = {
    ru: {
      "common.loading": "????????",
      "common.guest": "?????",
      "common.guestLower": "guest",
      "common.noSession": "??? ??????",
      "common.studio": "Studio",
      "common.logout": "?????",

      "nav.panel": "??????",
      "nav.replays": "??????",
      "nav.admins": "??????",
      "nav.settings": "?????????",

      "login.brandSub": "???? ??????????????",
      "login.syncCheck": "???????? ??????",
      "login.eyebrow": "?????? ??????????????",
      "login.title": "???? ??????????????",
      "login.desc": "?????????????, ????? ??????? ?????? ?????????? ?????????, ???????????????? ? ??????????? ?????.",
      "login.username": "?????",
      "login.usernamePh": "??????? ?????",
      "login.password": "??????",
      "login.passwordPh": "??????? ??????",
      "login.submit": "?????",
      "login.toStudio": "??????? ? Studio",
      "login.footnote": "?????? ?????? ??? ???????????????. ??? ???????? ? ?????? ?????????????.",

      "panel.brandSub": "????? ???????",
      "panel.heroEyebrow": "?????? ??????????",
      "panel.heroTitle": "????? ??????? ??????????????",
      "panel.heroDesc": "????????? ???????? ?????? ? ??????? ???????? ? ??????? ? ??????? ??????? ?? ???????.",
      "panel.user": "????????????",
      "panel.lastSync": "????????? sync",
      "panel.module.replays.title": "??????? ???????",
      "panel.module.replays.desc": "???????? ??????? ? ?????????? ? ??????? ? ????????? ?? ???????? ???????.",
      "panel.module.admins.title": "??????",
      "panel.module.admins.desc": "???????? ? ???????? ???????????????. ?????????? ????????? ??? super_admin.",
      "panel.module.settings.title": "????????? ?????",
      "panel.module.settings.desc": "????????? ????????? ?????, hero-????, ???????? ?? ????????? ? ????????? ????????.",
      "panel.module.studio.title": "??????",
      "panel.module.studio.desc": "??????? ??????? ?? ??????? ???????? ???????? ??????? ? ????????? ???????.",
      "panel.open": "???????",
      "panel.kpi.total": "????? ?????",
      "panel.kpi.active": "????????",
      "panel.kpi.done": "??????",
      "panel.kpi.failed": "??????",

      "replays.brandSub": "??????? ???????",
      "replays.headerEyebrow": "??????? ???????",
      "replays.headerTitle": "???????? ??????? ? ???????",
      "replays.headerDesc": "???????? ?????? ? ?? ?????????, ????? ????? ????????? ??????? ??? ?????????? ?????.",
      "replays.refresh": "????????",
      "replays.queueEyebrow": "???????",
      "replays.listTitle": "?????? ?????",
      "replays.loading": "????????...",
      "replays.totalLabel": "?????",
      "replays.visibleLabel": "???????",
      "replays.filter.all": "???",
      "replays.filter.active": "????????",
      "replays.filter.completed": "??????",
      "replays.filter.failed": "??????",

      "admins.brandSub": "??????",
      "admins.headerEyebrow": "??????",
      "admins.headerTitle": "?????????? ????????????????",
      "admins.headerDesc": "?????? ??? super_admin: ?????????? ? ???????? ???????????????.",
      "admins.refresh": "???????? ??????",
      "admins.lockedEyebrow": "??????",
      "admins.lockedTitle": "???????????? ????",
      "admins.lockedDesc": "???? ?????? ???????? ?????? ??? super_admin.",
      "admins.createEyebrow": "????????",
      "admins.createTitle": "???????? ??????????????",
      "admins.username": "?????",
      "admins.password": "??????",
      "admins.passwordPh": "??????? 8 ????????",
      "admins.role": "????",
      "admins.createBtn": "??????? ??????",
      "admins.dirEyebrow": "??????",
      "admins.dirTitle": "?????? ???????",
      "admins.totalLabel": "?????",

      "settings.brandSub": "????????? ?????",
      "settings.headerEyebrow": "????????? ?????",
      "settings.headerTitle": "????????? ?????",
      "settings.headerDesc": "?????? ???????? ????????? ??????? ???????? ? ??????? ?? ?????????.",
      "settings.reload": "?????????????",
      "settings.lockedEyebrow": "??????",
      "settings.lockedTitle": "???????????? ????",
      "settings.lockedDesc": "?????????????? ???????? ????? ???????? ?????? ??? super_admin.",
      "settings.publicEyebrow": "????????? ????????????",
      "settings.publicTitle": "??????? ???????? ? ????????? ?? ?????????",
      "settings.notLoaded": "?? ?????????",
      "settings.siteTitle": "???????? ?????",
      "settings.heroTitle": "????????? ?? ???????",
      "settings.heroDescription": "???????? ?? ???????",
      "settings.defaultQuality": "???????? ????? ?? ?????????",
      "settings.uploadsTitle": "????????? ????? ????????",
      "settings.uploadsDesc": "?????????, ???? ????? ???????? ?????????? ???????? ????? ????? ?? ?????.",
      "settings.save": "????????? ?????????",

      "dyn.status.queued": "? ???????",
      "dyn.status.processing": "?????????",
      "dyn.status.completed": "?????????",
      "dyn.status.failed": "??????",

      "dyn.sync.signInRequired": "????????? ????",
      "dyn.sync.signingIn": "????...",
      "dyn.sync.sessionActive": "?????? ???????",
      "dyn.sync.loginFailed": "?????? ?????",
      "dyn.sync.loadingQueue": "???????? ???????...",
      "dyn.sync.loadingAdmins": "???????? ???????...",
      "dyn.sync.loadingSettings": "???????? ????????...",
      "dyn.sync.autoRefresh": "?????????????? ????????",
      "dyn.sync.autoPaused": "?????????????? ?? ????? (???? ???????)",
      "dyn.sync.error": "??????: {error}",

      "dyn.auth.until": "?? {time}",
      "dyn.auth.active": "???????",
      "dyn.auth.panelGuest": "?????",

      "dyn.login.enterCreds": "??????? ????? ? ??????",
      "dyn.login.success": "???? ????????",

      "dyn.replays.signedAs": "????? ??? {name} ({role})",
      "dyn.replays.needAuth": "????????? ???? ??????????????.",
      "dyn.replays.emptyFiltered": "??? ????? ??? ?????????? ???????.",
      "dyn.replays.delete": "???????",
      "dyn.replays.logs": "Danser logs ({count})",
      "dyn.replays.replay": "??????",
      "dyn.replays.progress": "????????",
      "dyn.replays.result": "?????????",
      "dyn.replays.pending": "????????",
      "dyn.replays.current": "???????",
      "dyn.replays.signInDelete": "??????? ??????? ? ?????-???????.",
      "dyn.replays.confirmDelete": "??????? ?????? ? ??????????\n\n{label}",
      "dyn.replays.forceDelete": "{error}\n\n??????? force delete?",
      "dyn.replays.deleteFailed": "?????? ????????: {error}",

      "dyn.admins.empty": "?????? ??????? ????.",
      "dyn.admins.superRequired": "????? ?????? super_admin",
      "dyn.admins.creating": "????????...",
      "dyn.admins.created": "????? ????????",
      "dyn.admins.confirmDelete": "??????? ???????????????",

      "dyn.settings.updatedAt": "?????????: {time}",
      "dyn.settings.updatedUnknown": "?????????: ??????????",
      "dyn.settings.loading": "????????...",
      "dyn.settings.loaded": "????????? ?????????",
      "dyn.settings.saving": "??????????...",
      "dyn.settings.saved": "????????? ?????????",
    },
    en: {
      "common.loading": "Loading",
      "common.guest": "Guest",
      "common.guestLower": "guest",
      "common.noSession": "no session",
      "common.studio": "Studio",
      "common.logout": "Log out",

      "nav.panel": "Modules",
      "nav.replays": "Replays",
      "nav.admins": "Admins",
      "nav.settings": "Settings",

      "login.brandSub": "Admin Sign In",
      "login.syncCheck": "Session check",
      "login.eyebrow": "?????? ??????????????",
      "login.title": "Administrator Sign In",
      "login.desc": "Authorize to open the control panel for renders, administrators and site settings.",
      "login.username": "Username",
      "login.usernamePh": "Enter username",
      "login.password": "Password",
      "login.passwordPh": "Enter password",
      "login.submit": "Sign In",
      "login.toStudio": "Go to Studio",
      "login.footnote": "Administrator access only. All panel actions are logged.",

      "panel.brandSub": "Module Hub",
      "panel.heroEyebrow": "?????? ??????????",
      "panel.heroTitle": "Admin Module Hub",
      "panel.heroDesc": "Dedicated panel page with quick access to modules and a compact queue overview.",
      "panel.user": "User",
      "panel.lastSync": "Last sync",
      "panel.module.replays.title": "??????? ???????",
      "panel.module.replays.desc": "Delete replay jobs and artifacts from the server with queue status filters.",
      "panel.module.admins.title": "??????",
      "panel.module.admins.desc": "Create and delete administrators. Access control for super_admin.",
      "panel.module.settings.title": "????????? ?????",
      "panel.module.settings.desc": "Public site settings, hero block, default quality and upload availability.",
      "panel.module.studio.title": "??????",
      "panel.module.studio.desc": "Return to the main upload page and queue viewer.",
      "panel.open": "Open",
      "panel.kpi.total": "Total jobs",
      "panel.kpi.active": "Active",
      "panel.kpi.done": "Done",
      "panel.kpi.failed": "Failed",

      "replays.brandSub": "??????? ???????",
      "replays.headerEyebrow": "??????? ???????",
      "replays.headerTitle": "Replay Cleanup",
      "replays.headerDesc": "Delete jobs and artifacts when you need to clean up queue history or storage.",
      "replays.refresh": "Refresh",
      "replays.queueEyebrow": "???????",
      "replays.listTitle": "Jobs list",
      "replays.loading": "Loading...",
      "replays.totalLabel": "Total",
      "replays.visibleLabel": "Visible",
      "replays.filter.all": "All",
      "replays.filter.active": "Active",
      "replays.filter.completed": "Done",
      "replays.filter.failed": "Failed",

      "admins.brandSub": "??????",
      "admins.headerEyebrow": "??????",
      "admins.headerTitle": "Administrator Management",
      "admins.headerDesc": "Dedicated module for super_admin: create and delete admin accounts.",
      "admins.refresh": "Refresh list",
      "admins.lockedEyebrow": "??????",
      "admins.lockedTitle": "Access denied",
      "admins.lockedDesc": "This module is available only for super_admin.",
      "admins.createEyebrow": "????????",
      "admins.createTitle": "Add administrator",
      "admins.username": "Username",
      "admins.password": "Password",
      "admins.passwordPh": "Minimum 8 characters",
      "admins.role": "Role",
      "admins.createBtn": "Create admin",
      "admins.dirEyebrow": "??????",
      "admins.dirTitle": "Admins list",
      "admins.totalLabel": "Total",

      "settings.brandSub": "Site Settings",
      "settings.headerEyebrow": "????????? ?????",
      "settings.headerTitle": "Site Settings",
      "settings.headerDesc": "Only the most useful home page and default render parameters are kept here.",
      "settings.reload": "Reload",
      "settings.lockedEyebrow": "??????",
      "settings.lockedTitle": "Access denied",
      "settings.lockedDesc": "Editing site settings is available only for super_admin.",
      "settings.publicEyebrow": "????????? ????????????",
      "settings.publicTitle": "Home page and default parameters",
      "settings.notLoaded": "Not loaded",
      "settings.siteTitle": "Site title",
      "settings.heroTitle": "Home hero title",
      "settings.heroDescription": "Home hero description",
      "settings.defaultQuality": "Default video quality",
      "settings.uploadsTitle": "Allow new uploads",
      "settings.uploadsDesc": "Disable this to temporarily stop creation of new jobs on the site.",
      "settings.save": "Save settings",

      "dyn.status.queued": "Queued",
      "dyn.status.processing": "Rendering",
      "dyn.status.completed": "Completed",
      "dyn.status.failed": "Failed",

      "dyn.sync.signInRequired": "Sign in required",
      "dyn.sync.signingIn": "Signing in...",
      "dyn.sync.sessionActive": "Session active",
      "dyn.sync.loginFailed": "Login failed",
      "dyn.sync.loadingQueue": "Loading queue...",
      "dyn.sync.loadingAdmins": "Loading admins...",
      "dyn.sync.loadingSettings": "Loading settings...",
      "dyn.sync.autoRefresh": "Auto refresh on",
      "dyn.sync.autoPaused": "Auto refresh paused (logs open)",
      "dyn.sync.error": "Error: {error}",

      "dyn.auth.until": "until {time}",
      "dyn.auth.active": "active",
      "dyn.auth.panelGuest": "Guest",

      "dyn.login.enterCreds": "Enter username and password",
      "dyn.login.success": "Signed in",

      "dyn.replays.signedAs": "Signed in as {name} ({role})",
      "dyn.replays.needAuth": "Admin sign-in required.",
      "dyn.replays.emptyFiltered": "No jobs for the selected filter.",
      "dyn.replays.delete": "Delete",
      "dyn.replays.logs": "Danser logs ({count})",
      "dyn.replays.replay": "??????",
      "dyn.replays.progress": "????????",
      "dyn.replays.result": "?????????",
      "dyn.replays.pending": "Pending",
      "dyn.replays.current": "Current",
      "dyn.replays.signInDelete": "Sign in to an admin account first.",
      "dyn.replays.confirmDelete": "Delete replay and artifacts?\n\n{label}",
      "dyn.replays.forceDelete": "{error}\n\nPerform force delete?",
      "dyn.replays.deleteFailed": "?????? ????????: {error}",

      "dyn.admins.empty": "Admin list is empty.",
      "dyn.admins.superRequired": "Super admin access required",
      "dyn.admins.creating": "Creating...",
      "dyn.admins.created": "Admin created",
      "dyn.admins.confirmDelete": "Delete administrator?",

      "dyn.settings.updatedAt": "Updated: {time}",
      "dyn.settings.updatedUnknown": "Updated: unknown",
      "dyn.settings.loading": "Loading...",
      "dyn.settings.loaded": "Settings loaded",
      "dyn.settings.saving": "Saving...",
      "dyn.settings.saved": "Settings saved",
    },
  };

  const EN_FIX = {
    "login.eyebrow": "Admin Access",
    "panel.heroEyebrow": "Control Center",
    "panel.module.replays.title": "Replay Cleanup",
    "panel.module.admins.title": "Admins",
    "panel.module.settings.title": "Site Settings",
    "panel.module.studio.title": "Studio",
    "replays.brandSub": "Replay Cleanup",
    "replays.headerEyebrow": "Replay Cleanup",
    "replays.queueEyebrow": "Queue",
    "admins.brandSub": "Admins",
    "admins.headerEyebrow": "Admins",
    "admins.lockedEyebrow": "Access",
    "admins.createEyebrow": "Create",
    "admins.dirEyebrow": "Directory",
    "settings.headerEyebrow": "Site Settings",
    "settings.lockedEyebrow": "Access",
    "settings.publicEyebrow": "Public Config",
    "dyn.replays.replay": "Replay",
    "dyn.replays.progress": "Progress",
    "dyn.replays.result": "Result",
    "dyn.replays.deleteFailed": "Delete failed: {error}",
  };
  Object.assign(dict.en, EN_FIX);

  function looksCorruptedText(value) {
    const text = String(value ?? "");
    if (!text) return false;
    return /\?{3,}/.test(text);
  }

  if (Object.values(dict.ru).filter(looksCorruptedText).length > 20) {
    dict.ru = { ...dict.en };
  }

  function getLang() {
    const raw = String(localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
    return SUPPORTED.has(raw) ? raw : "ru";
  }

  function locale() {
    return getLang() === "en" ? "en-US" : "ru-RU";
  }

  function interpolate(value, vars) {
    return String(value ?? "").replace(/\{(\w+)\}/g, (_, key) => String(vars?.[key] ?? ""));
  }

  function t(key, vars) {
    const lang = getLang();
    const preferred = (dict[lang] || dict.ru)?.[key];
    const fallbackEn = dict.en?.[key];
    const fallbackRu = dict.ru?.[key];
    const chosen = [preferred, fallbackEn, fallbackRu, key].find((value) => !looksCorruptedText(value)) ?? key;
    return interpolate(chosen, vars);
  }

  function setText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  function setAttr(selector, name, value) {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(name, value);
  }

  function setWrappedLabelText(inputId, text) {
    const input = document.getElementById(inputId);
    const label = input?.closest("label");
    if (!label) return;
    const title = label.querySelector(":scope > span");
    if (title) title.textContent = text;
  }

  function setCountLabel(strongId, label) {
    const strong = document.getElementById(strongId);
    if (!strong || !strong.parentElement) return;
    const parent = strong.parentElement;
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) node.textContent = "";
    }
    parent.insertBefore(document.createTextNode(`${label}: `), strong);
  }

  function setCurrentPageTitle(page) {
    const en = {
      login: "Replay Control Center - Login",
      panel: "Replay Control Center - Modules",
      replays: "Replay Control Center - Replay Cleanup",
      admins: "Replay Control Center - Admins",
      settings: "Replay Control Center - Site Settings",
    };
    const ru = {
      login: "Replay Control Center - Вход",
      panel: "Replay Control Center - Модули",
      replays: "Replay Control Center - Очистка реплеев",
      admins: "Replay Control Center - Админы",
      settings: "Replay Control Center - Настройки сайта",
    };
    document.title = getLang() === "en" ? (en[page] || "Replay Control Center") : (ru[page] || "Replay Control Center");
  }

  function applySharedTopbar(page) {
    setText('.topbar-link[href="/"]', t("common.studio"));
    setText('#adminLogoutBtn', t("common.logout"));
    setText('#adminIdentity', t("common.guest"));
    setText('#adminRoleBadge', t("common.guestLower"));
    setText('#adminSessionCompact', t("common.noSession"));
    setText('#adminSyncBadge', page === "login" ? t("login.syncCheck") : t("common.loading"));

    setText('[data-admin-nav="panel"]', t("nav.panel"));
    setText('[data-admin-nav="replays"]', t("nav.replays"));
    setText('[data-admin-nav="admins"]', t("nav.admins"));
    setText('[data-admin-nav="settings"]', t("nav.settings"));
  }

  function applyLoginPage() {
    setText('.icloud-brand-sub', t("login.brandSub"));
    setText('.apple-login-header .eyebrow', t("login.eyebrow"));
    setText('.apple-login-header h1', t("login.title"));
    setText('.apple-login-header .muted', t("login.desc"));
    setWrappedLabelText('adminUsernameInput', t("login.username"));
    setWrappedLabelText('adminPasswordInput', t("login.password"));
    setAttr('#adminUsernameInput', 'placeholder', t("login.usernamePh"));
    setAttr('#adminPasswordInput', 'placeholder', t("login.passwordPh"));
    setText('.apple-login-submit', t("login.submit"));
    setText('.apple-login-secondary', t("login.toStudio"));
    setText('.apple-login-footnote', t("login.footnote"));
  }

  function applyPanelPage() {
    setText('.icloud-brand-sub', t("panel.brandSub"));
    setText('.hero-panel-copy .eyebrow', t("panel.heroEyebrow"));
    setText('.hero-panel-copy h1', t("panel.heroTitle"));
    setText('.hero-panel-copy .muted', t("panel.heroDesc"));
    setText('.hero-panel-side .pill-metric:nth-child(1) span', t("panel.user"));
    setText('.hero-panel-side .pill-metric:nth-child(2) span', t("panel.lastSync"));

    const cards = Array.from(document.querySelectorAll('.module-grid .module-card'));
    const defs = [
      ["panel.module.replays.title", "panel.module.replays.desc"],
      ["panel.module.admins.title", "panel.module.admins.desc"],
      ["panel.module.settings.title", "panel.module.settings.desc"],
      ["panel.module.studio.title", "panel.module.studio.desc"],
    ];
    cards.forEach((card, index) => {
      const [titleKey, descKey] = defs[index] || [];
      if (!titleKey) return;
      const title = card.querySelector('.module-copy h2');
      const desc = card.querySelector('.module-copy p');
      const open = card.querySelector('.module-link');
      if (title) title.textContent = t(titleKey);
      if (desc) desc.textContent = t(descKey);
      if (open) open.textContent = t("panel.open");
    });

    const kpis = Array.from(document.querySelectorAll('.kpi-grid .kpi-card > span'));
    const keys = ["panel.kpi.total", "panel.kpi.active", "panel.kpi.done", "panel.kpi.failed"];
    kpis.forEach((el, i) => { if (keys[i]) el.textContent = t(keys[i]); });
  }

  function applyReplaysPage() {
    setText('.icloud-brand-sub', t("replays.brandSub"));
    setText('.module-header .eyebrow', t("replays.headerEyebrow"));
    setText('.module-header h1', t("replays.headerTitle"));
    setText('.module-header .muted', t("replays.headerDesc"));
    setText('#replaysRefreshBtn', t("replays.refresh"));
    setText('.panel-toolbar .toolbar-copy .eyebrow', t("replays.queueEyebrow"));
    setText('.panel-toolbar .toolbar-copy h2', t("replays.listTitle"));
    setText('#replaysStatusText', t("replays.loading"));
    setText('[data-replay-filter="all"]', t("replays.filter.all"));
    setText('[data-replay-filter="active"]', t("replays.filter.active"));
    setText('[data-replay-filter="completed"]', t("replays.filter.completed"));
    setText('[data-replay-filter="failed"]', t("replays.filter.failed"));
    setCountLabel('replaysTotalCount', t("replays.totalLabel"));
    setCountLabel('replaysVisibleCount', t("replays.visibleLabel"));
  }

  function applyAdminsPage() {
    setText('.icloud-brand-sub', t("admins.brandSub"));
    setText('.module-header .eyebrow', t("admins.headerEyebrow"));
    setText('.module-header h1', t("admins.headerTitle"));
    setText('.module-header .muted', t("admins.headerDesc"));
    setText('#refreshAdminsBtn', t("admins.refresh"));

    setText('#adminsLockedPanel .eyebrow', t("admins.lockedEyebrow"));
    setText('#adminsLockedPanel h2', t("admins.lockedTitle"));
    setText('#adminsLockedPanel .muted', t("admins.lockedDesc"));

    const panels = Array.from(document.querySelectorAll('#adminsContent .panel-toolbar .toolbar-copy'));
    if (panels[0]) {
      panels[0].querySelector('.eyebrow')?.replaceChildren(t("admins.createEyebrow"));
      panels[0].querySelector('h2')?.replaceChildren(t("admins.createTitle"));
    }
    if (panels[1]) {
      panels[1].querySelector('.eyebrow')?.replaceChildren(t("admins.dirEyebrow"));
      panels[1].querySelector('h2')?.replaceChildren(t("admins.dirTitle"));
      setCountLabel('adminsCount', t("admins.totalLabel"));
    }

    setWrappedLabelText('newAdminUsernameInput', t("admins.username"));
    setWrappedLabelText('newAdminPasswordInput', t("admins.password"));
    setWrappedLabelText('newAdminRoleSelect', t("admins.role"));
    setAttr('#newAdminPasswordInput', 'placeholder', t("admins.passwordPh"));
    setText('#createAdminForm button[type="submit"]', t("admins.createBtn"));
  }

  function applySettingsPage() {
    setText('.icloud-brand-sub', t("settings.brandSub"));
    setText('.module-header .eyebrow', t("settings.headerEyebrow"));
    setText('.module-header h1', t("settings.headerTitle"));
    setText('.module-header .muted', t("settings.headerDesc"));
    setText('#reloadSiteSettingsBtn', t("settings.reload"));

    setText('#siteSettingsLockedPanel .eyebrow', t("settings.lockedEyebrow"));
    setText('#siteSettingsLockedPanel h2', t("settings.lockedTitle"));
    setText('#siteSettingsLockedPanel .muted', t("settings.lockedDesc"));

    setText('#siteSettingsContent .panel-toolbar .eyebrow', t("settings.publicEyebrow"));
    setText('#siteSettingsContent .panel-toolbar h2', t("settings.publicTitle"));
    if (document.getElementById('siteSettingsUpdatedMeta')?.textContent?.trim() === 'Not loaded') {
      setText('#siteSettingsUpdatedMeta', t("settings.notLoaded"));
    }

    setWrappedLabelText('siteTitleInput', t("settings.siteTitle"));
    setWrappedLabelText('heroTitleInput', t("settings.heroTitle"));
    setWrappedLabelText('heroDescriptionInput', t("settings.heroDescription"));
    setWrappedLabelText('siteDefaultQualitySelect', t("settings.defaultQuality"));

    const uploadsLabel = document.getElementById('uploadsEnabledInput')?.closest('label');
    const uploadsTitle = uploadsLabel?.querySelector('.switch-copy strong');
    const uploadsDesc = uploadsLabel?.querySelector('.switch-copy small');
    if (uploadsTitle) uploadsTitle.textContent = t("settings.uploadsTitle");
    if (uploadsDesc) uploadsDesc.textContent = t("settings.uploadsDesc");

    setText('#siteSettingsForm button[type="submit"]', t("settings.save"));
  }

  function updateLangButtons() {
    const lang = getLang();
    for (const btn of document.querySelectorAll('.lang-btn[data-admin-lang-option]')) {
      btn.classList.toggle('is-active', btn.dataset.adminLangOption === lang);
    }
  }

  function apply() {
    const page = document.body?.dataset?.adminPage || 'unknown';
    document.documentElement.lang = getLang();
    setCurrentPageTitle(page);
    updateLangButtons();
    applySharedTopbar(page);
    if (page === 'login') applyLoginPage();
    if (page === 'panel') applyPanelPage();
    if (page === 'replays') applyReplaysPage();
    if (page === 'admins') applyAdminsPage();
    if (page === 'settings') applySettingsPage();
  }

  function setLang(lang) {
    const next = SUPPORTED.has(String(lang || '').toLowerCase()) ? String(lang).toLowerCase() : 'ru';
    localStorage.setItem(STORAGE_KEY, next);
    apply();
    window.dispatchEvent(new CustomEvent('admin-language-changed', { detail: { lang: next } }));
  }

  function bind() {
    for (const btn of document.querySelectorAll('.lang-btn[data-admin-lang-option]')) {
      btn.addEventListener('click', () => setLang(btn.dataset.adminLangOption));
    }
  }

  window.osuAdminI18n = { t, getLang, setLang, locale, apply };
  bind();
  apply();
})();
