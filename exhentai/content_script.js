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
            const { initReader } = await import(browser.runtime.getURL('modules/reader.js'));
            initModuleOnce('reader', () => initReader());
        } else if (isSingleGalleryPage) {
            // 在書籍詳情頁，同時啟用歷史紀錄和標籤翻譯功能␊
            const { initHistoryRecording } = await import(browser.runtime.getURL('modules/history.js'));
            initModuleOnce('history', () => initHistoryRecording());

            // *** 新增 ***: 載入並執行標籤翻譯模組␊
            const { initTagTranslator } = await import(browser.runtime.getURL('modules/tag_translator.js'));
            initModuleOnce('tag_translator', () => initTagTranslator());
        }

        if (isGalleryListPage && window.scriptSettings.enableGridView) {
            const { initGridView } = await import(browser.runtime.getURL('modules/grid_view.js'));
            initModuleOnce('grid_view', () => initGridView());
        }

        // 在所有包含搜尋框，但不是單一圖庫頁面的地方，載入搜尋增強器
        if (hasSearchBox && !isSingleGalleryPage) {
            const { initSearchEnhancer } = await import(browser.runtime.getURL('modules/search_enhancer.js'));
            initModuleOnce('search_enhancer', () => initSearchEnhancer());
        }

    } catch (e) {
        console.error("[ExH] 載入模組時發生錯誤:", e);
    }
}

// 監聽設定變更
browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        const { isGalleryListPage, isReaderPage } = getPageContext();

        if ((changes.enableGridView || changes.gridColumns) && isGalleryListPage) {
            window.location.reload();
        }
        if (changes.readerMode && isReaderPage) {
            window.location.reload();
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
