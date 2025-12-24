/**
 * ExHentai 小幫手 - 背景腳本 (v1.2.6)
 */

console.log("ExHentai 小幫手背景腳本 v1.2.6 已啟動。");

importScripts(
    'background/state.js',
    'background/settings.js',
    'background/migration.js',
    'background/i18n.js',
    'background/history.js',
    'background/tags.js',
    'background/cache.js',
    'background/listeners.js'
);

const { refreshSettingsCache, registerListeners } = globalThis.exHentaiBackground;

refreshSettingsCache().catch(error => {
    console.warn('[BG] 初始化設定快取失敗。', error);
});

registerListeners();
