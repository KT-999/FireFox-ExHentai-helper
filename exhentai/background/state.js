console.log("[BG] 載入背景腳本狀態模組。");

const exHentaiBackground = globalThis.exHentaiBackground || {};

exHentaiBackground.galleryCache = exHentaiBackground.galleryCache || new Map();
exHentaiBackground.HISTORY_STORAGE_KEY = 'viewingHistory';
exHentaiBackground.SAVED_TAGS_KEY = 'savedTags';
exHentaiBackground.CONTEXT_MENU_ID = 'save-exh-tag';
exHentaiBackground.MIGRATION_FLAG_KEY = 'tagsMigrated_v1_2_5';
exHentaiBackground.settingsCache = exHentaiBackground.settingsCache || {
    cacheSize: 50,
    maxHistoryCount: 200,
    uiLanguage: 'auto',
};
exHentaiBackground.messageCache = null;

globalThis.exHentaiBackground = exHentaiBackground;
