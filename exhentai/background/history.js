console.log("[BG] 載入背景腳本歷史紀錄模組。");

async function addToHistory(item) {
    const { HISTORY_STORAGE_KEY, settingsCache } = globalThis.exHentaiBackground;
    try {
        const settings = await browser.storage.local.get({
            [HISTORY_STORAGE_KEY]: [],
        });
        let history = settings[HISTORY_STORAGE_KEY];
        const maxHistoryCount = settingsCache.maxHistoryCount;

        history = history.filter(h => h.url !== item.url);
        history.unshift(item);

        if (history.length > maxHistoryCount) {
            history = history.slice(0, maxHistoryCount);
        }

        await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: history });
        return { success: true };
    } catch (error) {
        console.error('[BG] 新增歷史紀錄時發生錯誤:', error);
        return { success: false };
    }
}

async function getHistory() {
    const { HISTORY_STORAGE_KEY } = globalThis.exHentaiBackground;
    try {
        const data = await browser.storage.local.get({ [HISTORY_STORAGE_KEY]: [] });
        return { history: data[HISTORY_STORAGE_KEY] };
    } catch (error) {
        console.error('[BG] 讀取歷史紀錄時發生錯誤:', error);
        return { history: [] };
    }
}

async function clearHistory() {
    const { HISTORY_STORAGE_KEY } = globalThis.exHentaiBackground;
    try {
        await browser.storage.local.remove(HISTORY_STORAGE_KEY);
        console.log('[BG] 已清除所有歷史紀錄。');
        return { success: true };
    } catch (error) {
        console.error('[BG] 清除歷史紀錄時發生錯誤:', error);
        return { success: false };
    }
}

async function deleteHistoryItem(url) {
    const { HISTORY_STORAGE_KEY } = globalThis.exHentaiBackground;
    try {
        const data = await browser.storage.local.get({ [HISTORY_STORAGE_KEY]: [] });
        const history = data[HISTORY_STORAGE_KEY];
        const newHistory = history.filter(item => item.url !== url);
        await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: newHistory });
        return { success: true };
    } catch (error) {
        console.error(`[BG] 刪除歷史紀錄 (${url}) 時發生錯誤:`, error);
        return { success: false };
    }
}

globalThis.exHentaiBackground.addToHistory = addToHistory;
globalThis.exHentaiBackground.getHistory = getHistory;
globalThis.exHentaiBackground.clearHistory = clearHistory;
globalThis.exHentaiBackground.deleteHistoryItem = deleteHistoryItem;
