/**
 * ExHentai 小幫手 - 內容腳本 (v1.3.6)
 * - 新增：在書籍詳情頁載入 tag_translator.js 模組，以顯示自訂標籤名稱。
 */

console.log("ExHentai 小幫手 v1.3.0 已啟動 (模組化)。");

const moduleInitState = window.exhentaiModuleInitState || {
    mainStarted: false,
    initializedModules: new Set(),
};
window.exhentaiModuleInitState = moduleInitState;

function initModuleOnce(moduleName, initFn) {
    if (moduleInitState.initializedModules.has(moduleName)) {
        console.warn(`[ExH] 模組 ${moduleName} 已初始化，跳過重複執行。`);
        return null;
    }
    moduleInitState.initializedModules.add(moduleName);
    return initFn();
}

async function importModuleWithRetry(moduleName, modulePath, { retries = 1, retryDelayMs = 300 } = {}) {
    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
        try {
            return await import(browser.runtime.getURL(modulePath));
        } catch (error) {
            const isLastAttempt = attempt > retries;
            console.error(`[ExH] 載入模組失敗: ${moduleName} (第 ${attempt} 次)`, error);
            if (isLastAttempt) {
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
    }
    return null;
}

// --- 全域變數 (供各模組使用) ---
window.navigationContext = window.navigationContext || {
    masterList: [],
    currentIndex: -1,
    isNavigating: false,
    backToGalleryUrl: null,
    galleryId: null,
    previewUpdateId: 0,
    currentGalleryPageIndex: 0,
    totalGalleryPages: 0,
    totalImageCount: 0,
    imagesPerIndexPage: 40,
    isIndexingPage: null,
};

window.scriptSettings = window.scriptSettings || {
    enableGridView: false,
    gridColumns: 5,
    readerMode: 'horizontal',
    fitToWindow: true,
    hidePreviewBar: false,
    preloadCount: 3,
    keyPrev: 'a',
    keyNext: 'd',
    keyFit: 's',
    keyHide: 'q',
    keyExit: 'e',
    keyClear: 'w',
};

let cachedPageContext = null;

function getPageContext() {
    if (cachedPageContext) return cachedPageContext;

    cachedPageContext = {
        isReaderPage: window.location.pathname.startsWith('/s/'),
        isSingleGalleryPage: window.location.pathname.match(/^\/g\/\d+\/[a-z0-9]+\/?$/),
        hasSearchBox: !!(document.getElementById('searchbox') || document.querySelector('input[name="f_search"]')),
        isGalleryListPage: !!document.querySelector('table.itg.gltc'),
    };

    return cachedPageContext;
}

// --- 路由器與初始化 ---
async function main() {
    if (moduleInitState.mainStarted) {
        console.warn('[ExH] 主程式已初始化，跳過重複執行。');
        return;
    }
    moduleInitState.mainStarted = true;

    // 1. 載入設定
    const settings = await browser.storage.local.get(window.scriptSettings);
    Object.assign(window.scriptSettings, settings);

    // 2. 判斷頁面類型
    const { isReaderPage, isSingleGalleryPage, hasSearchBox, isGalleryListPage } = getPageContext();

    // 3. 根據頁面類型，動態載入並執行對應的模組
    try {
        if (isReaderPage) {
            const readerModule = await importModuleWithRetry('reader', 'modules/reader.js', { retries: 1 });
            if (readerModule) {
                initModuleOnce('reader', () => readerModule.initReader());
            }
        } else if (isSingleGalleryPage) {
            // 在書籍詳情頁，同時啟用歷史紀錄和標籤翻譯功能␊
            const historyModule = await importModuleWithRetry('history', 'modules/history.js', { retries: 1 });
            if (historyModule) {
                initModuleOnce('history', () => historyModule.initHistoryRecording());
            }

            // *** 新增 ***: 載入並執行標籤翻譯模組␊
            const tagTranslatorModule = await importModuleWithRetry('tag_translator', 'modules/tag_translator.js', { retries: 1 });
            if (tagTranslatorModule) {
                initModuleOnce('tag_translator', () => tagTranslatorModule.initTagTranslator());
            }
        }

        if (isGalleryListPage && window.scriptSettings.enableGridView) {
            const gridViewModule = await importModuleWithRetry('grid_view', 'modules/grid_view.js', { retries: 1 });
            if (gridViewModule) {
                initModuleOnce('grid_view', () => gridViewModule.initGridView());
            }
        }

        // 在所有包含搜尋框，但不是單一圖庫頁面的地方，載入搜尋增強器
        if (hasSearchBox && !isSingleGalleryPage) {
            const searchModule = await importModuleWithRetry('search_enhancer', 'modules/search_enhancer.js', { retries: 1 });
            if (searchModule) {
                initModuleOnce('search_enhancer', () => searchModule.initSearchEnhancer());
            }
        }

    } catch (e) {
        console.error("[ExH] 載入模組時發生錯誤:", e);
    }
}

// 監聽設定變更
browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local') {
        const { isGalleryListPage, isReaderPage } = getPageContext();

        if ((changes.enableGridView || changes.gridColumns) && isGalleryListPage) {
            const newEnableGridView = changes.enableGridView?.newValue ?? window.scriptSettings.enableGridView;
            const newGridColumns = changes.gridColumns?.newValue ?? window.scriptSettings.gridColumns;
            window.scriptSettings.enableGridView = newEnableGridView;
            window.scriptSettings.gridColumns = newGridColumns;

            const gridViewModule = await importModuleWithRetry('grid_view', 'modules/grid_view.js', { retries: 1 });
            if (gridViewModule) {
                if (newEnableGridView) {
                    gridViewModule.updateGridColumns(newGridColumns);
                    gridViewModule.enableGridView();
                } else {
                    gridViewModule.disableGridView();
                }
            }
        }

        if (changes.readerMode && isReaderPage) {
            const newReaderMode = changes.readerMode.newValue ?? window.scriptSettings.readerMode;
            window.scriptSettings.readerMode = newReaderMode;
            const readerModule = await importModuleWithRetry('reader', 'modules/reader.js', { retries: 1 });
            if (readerModule) {
                readerModule.switchReaderMode(newReaderMode);
            }
        }
    }
});

// --- 啟動腳本 ---
function initialize() {
    main().catch(err => console.error("[ExH] 主程式執行時發生未處理的錯誤:", err));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
