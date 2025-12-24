console.log("[BG] 載入背景腳本設定模組。");

async function refreshSettingsCache() {
    const { settingsCache } = globalThis.exHentaiBackground;
    try {
        const data = await browser.storage.local.get(settingsCache);
        Object.assign(settingsCache, data);
    } catch (error) {
        console.warn('[BG] 無法載入設定快取，將使用預設值。', error);
    }
}

globalThis.exHentaiBackground.refreshSettingsCache = refreshSettingsCache;
