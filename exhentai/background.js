/**
 * ExHentai 小幫手 - 背景腳本 (v1.2.5 - 資料遷移)
 *
 * - 新增：在擴充功能更新時，自動將舊版書籤資料遷移至新格式。
 * - 修正：使內容腳本 (如搜尋增強器) 也能獲取正確的翻譯。
 * - 新增：將書籤儲存結構改為物件 {original, display}。
 * - 新增：增加更新書籤顯示文字的邏輯。
 */

console.log("ExHentai 小幫手背景腳本 v1.9 已啟動。");

const galleryCache = new Map();
const HISTORY_STORAGE_KEY = 'viewingHistory';
const SAVED_TAGS_KEY = 'savedTags';
const CONTEXT_MENU_ID = "save-exh-tag";
const MIGRATION_FLAG_KEY = 'tagsMigrated_v1_2_5'; // 用於標記新物件結構的遷移

// --- 資料遷移函式 ---
async function migrateTagsData() {
    try {
        const { [SAVED_TAGS_KEY]: savedTags, [MIGRATION_FLAG_KEY]: migrated } = await browser.storage.local.get([SAVED_TAGS_KEY, MIGRATION_FLAG_KEY]);

        // 如果已經遷移過，或沒有書籤資料，則不執行
        if (migrated || !savedTags || savedTags.length === 0) {
            return;
        }

        // 檢查第一筆資料是否為舊格式 (string)
        if (typeof savedTags[0] === 'string') {
            console.log('[BG] 偵測到舊版書籤資料，開始進行遷移...');
            const newTags = savedTags.map(tag => ({
                original: tag,
                display: tag
            }));
            
            // 儲存新格式的資料，並設定遷移完成旗標
            await browser.storage.local.set({
                [SAVED_TAGS_KEY]: newTags,
                [MIGRATION_FLAG_KEY]: true
            });
            console.log('[BG] 書籤資料已成功遷移至新格式。');
        } else if (typeof savedTags[0] === 'object' && savedTags[0].hasOwnProperty('original')) {
            // 資料已經是新格式，只需設定旗標，避免未來重複檢查
            await browser.storage.local.set({ [MIGRATION_FLAG_KEY]: true });
            console.log('[BG] 書籤資料已是新格式，無需遷移。');
        }
    } catch (error) {
        console.error('[BG] 遷移書籤資料時發生錯誤:', error);
    }
}


// --- 多語系處理 ---
let messageCache = null;

async function getLocalizedMessage(key) {
    if (!messageCache) {
        try {
            const { uiLanguage = 'auto' } = await browser.storage.local.get('uiLanguage');
            let lang = uiLanguage;
            if (lang === 'auto') {
                lang = browser.i18n.getUILanguage();
            }
            const locale = lang.replace('-', '_');
            const response = await fetch(`/_locales/${locale}/messages.json`);
            if (!response.ok) throw new Error(`找不到語言檔案: ${locale}`);
            messageCache = await response.json();
        } catch (e) {
            console.warn(`[BG] 無法載入指定的語言檔案，將使用預設英文。`, e);
            const response = await fetch('/_locales/en/messages.json');
            messageCache = await response.json();
        }
    }
    return messageCache[key]?.message || key;
}

async function updateContextMenuTitle() {
    const title = await getLocalizedMessage("contextMenuSaveTag");
    browser.contextMenus.update(CONTEXT_MENU_ID, { title: title });
}

// --- 事件監聽器 ---
browser.runtime.onInstalled.addListener(async (details) => {
    // 在安裝或更新後，首先執行資料遷移
    await migrateTagsData();

    browser.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: "Saving tag...", 
        contexts: ["link"],
        documentUrlPatterns: ["*://exhentai.org/g/*", "*://e-hentai.org/g/*"]
    }, () => {
        if (browser.runtime.lastError) console.log("右鍵選單已存在，將直接更新。");
        messageCache = null; 
        updateContextMenuTitle();
    });
});

browser.runtime.onStartup.addListener(async () => {
    // 瀏覽器啟動時也檢查一次，確保遷移成功
    await migrateTagsData();
    messageCache = null; 
    updateContextMenuTitle();
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.uiLanguage) {
        messageCache = null;
        updateContextMenuTitle();
    }
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === CONTEXT_MENU_ID && info.linkUrl) {
        const url = new URL(info.linkUrl);
        if (url.pathname.startsWith('/tag/')) {
            const tag = decodeURIComponent(url.pathname.substring(5)).replace(/\+/g, ' ');
            await addTag(tag);
        }
    }
});


async function handleCacheImage(message) {
    const { galleryId, pageUrl, imageUrl } = message;
    const galleryData = galleryCache.get(galleryId);
    if (!galleryData) return;

    galleryData.preloadedPages.set(pageUrl, imageUrl);
    
    const { cacheSize = 50 } = await browser.storage.local.get({ cacheSize: 50 });
    while (galleryData.preloadedPages.size > cacheSize) {
        const oldestPageUrl = galleryData.preloadedPages.keys().next().value;
        galleryData.preloadedPages.delete(oldestPageUrl);
    }
}

// --- 歷史紀錄處理函式 ---
async function addToHistory(item) {
    try {
        const settings = await browser.storage.local.get({ 
            [HISTORY_STORAGE_KEY]: [],
            maxHistoryCount: 200 
        });
        let history = settings[HISTORY_STORAGE_KEY];
        const maxHistoryCount = settings.maxHistoryCount;
        
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
    try {
        const data = await browser.storage.local.get({ [HISTORY_STORAGE_KEY]: [] });
        return { history: data[HISTORY_STORAGE_KEY] };
    } catch (error) {
        console.error('[BG] 讀取歷史紀錄時發生錯誤:', error);
        return { history: [] };
    }
}

async function clearHistory() {
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
    try {
        const data = await browser.storage.local.get({ [HISTORY_STORAGE_KEY]: [] });
        let history = data[HISTORY_STORAGE_KEY];
        const newHistory = history.filter(item => item.url !== url);
        await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: newHistory });
        return { success: true };
    } catch (error) {
        console.error(`[BG] 刪除歷史紀錄 (${url}) 時發生錯誤:`, error);
        return { success: false };
    }
}

// --- 書籤 (標籤) 處理函式 ---
async function addTag(tagString) {
    try {
        const data = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
        let savedTags = data[SAVED_TAGS_KEY];
        
        if (!savedTags.some(t => t.original === tagString)) {
            savedTags.push({ original: tagString, display: tagString });
            await browser.storage.local.set({ [SAVED_TAGS_KEY]: savedTags });
            console.log(`[BG] 已儲存標籤: ${tagString}`);
        } else {
            console.log(`[BG] 標籤 ${tagString} 已存在，無需儲存。`);
        }
        return { success: true };
    } catch (error) {
        console.error('[BG] 儲存標籤時發生錯誤:', error);
        return { success: false };
    }
}

// --- 訊息監聽器 ---
browser.runtime.onMessage.addListener(async (message) => {
    const { type, galleryId } = message;

    if (galleryId && !galleryCache.has(galleryId)) {
        galleryCache.set(galleryId, {
            pages: new Map(),
            preloadedPages: new Map(),
            totalPages: null,
            totalImages: null,
        });
    }
    const galleryData = galleryCache.get(galleryId);

    switch (type) {
        case 'get_gallery_data':
            return galleryData ? {
                pages: Object.fromEntries(galleryData.pages),
                preloadedPages: Object.fromEntries(galleryData.preloadedPages),
                totalPages: galleryData.totalPages,
                totalImages: galleryData.totalImages,
            } : null;

        case 'set_gallery_metadata':
            galleryData.totalPages = message.totalPages;
            galleryData.totalImages = message.totalImages;
            return { success: true };

        case 'check_indexed_pages':
            const indexedPages = Array.from(galleryData.pages.keys());
            const missingPages = message.pagesToCheck.filter(p => !indexedPages.includes(p));
            return { missingPages };

        case 'set_page_links':
            galleryData.pages.set(message.pageIndex, message.links);
            return { success: true };
        
        case 'get_all_links': {
            let allLinks = [];
            const sortedPageKeys = Array.from(galleryData.pages.keys()).sort((a, b) => a - b);
            for (const pageIndex of sortedPageKeys) {
                allLinks.push(...galleryData.pages.get(pageIndex));
            }
            return {
                masterList: allLinks,
                preloadedPages: Object.fromEntries(galleryData.preloadedPages)
            };
        }

        case 'get_specific_page_links': {
            if (galleryData && galleryData.pages.has(message.pageIndex)) {
                return { links: galleryData.pages.get(message.pageIndex) };
            }
            return { links: null };
        }

        case 'cache_image':
            await handleCacheImage(message);
            return { success: true };
        
        case 'clear_gallery_cache':
            if (galleryCache.has(galleryId)) {
                galleryCache.delete(galleryId);
                console.log(`[BG] 已清除圖庫 ${galleryId} 的快取。`);
            }
            return { success: true };
        
        case 'clear_all_cache':
            const count = galleryCache.size;
            galleryCache.clear();
            console.log(`[BG] 已手動清除所有快取，共 ${count} 個圖庫。`);
            return { success: true, clearedCount: count };
        
        case 'add_to_history':
            return await addToHistory(message.item);

        case 'get_history':
            return await getHistory();

        case 'clear_history':
            return await clearHistory();
            
        case 'delete_history_item':
            return await deleteHistoryItem(message.url);

        case 'get_saved_tags': {
            const tagsData = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
            return { tags: tagsData[SAVED_TAGS_KEY] };
        }
        case 'delete_saved_tag': {
            const tagData = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
            let tags = tagData[SAVED_TAGS_KEY];
            const newTags = tags.filter(t => t.original !== message.tagOriginal);
            await browser.storage.local.set({ [SAVED_TAGS_KEY]: newTags });
            return { success: true };
        }
        case 'update_saved_tag': {
            const { original, display } = message.tag;
            const tagData = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
            let tags = tagData[SAVED_TAGS_KEY];
            const tagIndex = tags.findIndex(t => t.original === original);
            if (tagIndex > -1) {
                tags[tagIndex].display = display;
                await browser.storage.local.set({ [SAVED_TAGS_KEY]: tags });
                return { success: true };
            }
            return { success: false, error: 'Tag not found' };
        }
        case 'clear_saved_tags': {
            await browser.storage.local.remove(SAVED_TAGS_KEY);
            return { success: true };
        }
        case 'get_i18n_messages': {
            const messages = {};
            messageCache = null; 
            for (const key of message.keys) {
                messages[key] = await getLocalizedMessage(key);
            }
            return { messages };
        }
    }
});
