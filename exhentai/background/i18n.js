console.log("[BG] 載入背景腳本多語系模組。");

async function getLocalizedMessage(key) {
    const state = globalThis.exHentaiBackground;
    if (!state.messageCache) {
        try {
            let lang = state.settingsCache.uiLanguage;
            if (lang === 'auto') {
                lang = browser.i18n.getUILanguage();
            }
            const locale = lang.replace('-', '_');
            const response = await fetch(`/_locales/${locale}/messages.json`);
            if (!response.ok) throw new Error(`找不到語言檔案: ${locale}`);
            state.messageCache = await response.json();
        } catch (e) {
            console.warn('[BG] 無法載入指定的語言檔案，將使用預設英文。', e);
            const response = await fetch('/_locales/en/messages.json');
            state.messageCache = await response.json();
        }
    }
    return state.messageCache[key]?.message || key;
}

async function updateContextMenuTitle() {
    const title = await getLocalizedMessage('contextMenuSaveTag');
    browser.contextMenus.update(globalThis.exHentaiBackground.CONTEXT_MENU_ID, { title });
}

globalThis.exHentaiBackground.getLocalizedMessage = getLocalizedMessage;
globalThis.exHentaiBackground.updateContextMenuTitle = updateContextMenuTitle;
