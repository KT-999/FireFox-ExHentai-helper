/**
 * ExHentai 小幫手 - 內容腳本 (v1.3.6)
 * - 新增：在書籍詳情頁載入 tag_translator.js 模組，以顯示自訂標籤名稱。
 */

console.log("ExHentai 小幫手 v1.3.0 已啟動 (模組化)。");

// --- 全域變數 (供各模組使用) ---
window.navigationContext = {
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

window.scriptSettings = {
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

// --- 路由器與初始化 ---
async function main() {
    // 1. 載入設定
    const settings = await browser.storage.local.get(window.scriptSettings);
    Object.assign(window.scriptSettings, settings);

    // 2. 判斷頁面類型
    const isReaderPage = window.location.pathname.startsWith('/s/');
    const isSingleGalleryPage = window.location.pathname.match(/^\/g\/\d+\/[a-z0-9]+\/?$/);
    const hasSearchBox = !!(document.getElementById('searchbox') || document.querySelector('input[name="f_search"]'));
    const isGalleryListPage = !!document.querySelector('table.itg.gltc');

    // 3. 根據頁面類型，動態載入並執行對應的模組
    try {
        if (isReaderPage) {
            const { initReader } = await import(browser.runtime.getURL('modules/reader.js'));
            initReader();
        } else if (isSingleGalleryPage) {
            // 在書籍詳情頁，同時啟用歷史紀錄和標籤翻譯功能
            const { initHistoryRecording } = await import(browser.runtime.getURL('modules/history.js'));
            initHistoryRecording();

            // *** 新增 ***: 載入並執行標籤翻譯模組
            const { initTagTranslator } = await import(browser.runtime.getURL('modules/tag_translator.js'));
            initTagTranslator();
        }

        if (isGalleryListPage && window.scriptSettings.enableGridView) {
            const { initGridView } = await import(browser.runtime.getURL('modules/grid_view.js'));
            initGridView();
        }

        // 在所有包含搜尋框，但不是單一圖庫頁面的地方，載入搜尋增強器
        if (hasSearchBox && !isSingleGalleryPage) {
            const { initSearchEnhancer } = await import(browser.runtime.getURL('modules/search_enhancer.js'));
            initSearchEnhancer();
        }

    } catch (e) {
        console.error("[ExH] 載入模組時發生錯誤:", e);
    }
}

// 監聽設定變更
browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        const isGalleryListPage = !!document.querySelector('table.itg.gltc');
        const isReaderPage = window.location.pathname.startsWith('/s/');

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
