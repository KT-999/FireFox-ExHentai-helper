/**
 * ExHentai 小幫手 - 背景腳本 (v1.2 - 完整多語系修正)
 *
 * 功能：
 * - 建立右鍵選單以儲存標籤 (支援多語系)。
 * - 處理標籤的儲存、讀取、清除邏輯。
 * - 處理快取與歷史紀錄功能。
 * - 提供 i18n 訊息給內容腳本。
 * - 修正：使右鍵選單能根據使用者設定的語言即時更新。
 * - 修正：使內容腳本 (如搜尋增強器) 也能獲取正確的翻譯。
 */

console.log("ExHentai 小幫手背景腳本 v1.5 已啟動。");

const galleryCache = new Map();
const HISTORY_STORAGE_KEY = 'viewingHistory';
const SAVED_TAGS_KEY = 'savedTags';
const CONTEXT_MENU_ID = "save-exh-tag";

// --- 右鍵選單與多語系處理 ---

// 由於背景腳本的 i18n API 只會跟隨瀏覽器語言，
// 我們需要手動載入對應的語言檔案來符合使用者的設定。
let messageCache = null;

async function getLocalizedMessage(key) {
    // 如果快取不存在，則重新載入語言檔案
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

// 更新右鍵選單標題的函式
async function updateContextMenuTitle() {
    const title = await getLocalizedMessage("contextMenuSaveTag");
    browser.contextMenus.update(CONTEXT_MENU_ID, {
        title: title
    });
}

// --- 事件監聽器 ---

// 附加元件安裝或更新時
browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: "Saving tag...", 
        contexts: ["link"],
        documentUrlPatterns: ["*://exhentai.org/g/*", "*://e-hentai.org/g/*"]
    }, () => {
        if (browser.runtime.lastError) {
            console.log("右鍵選單已存在，將直接更新。");
        }
        messageCache = null; 
        updateContextMenuTitle();
    });
});

// 瀏覽器啟動時
browser.runtime.onStartup.addListener(() => {
    messageCache = null; 
    updateContextMenuTitle();
});

// 當使用者在 popup 中更改語言設定時
browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.uiLanguage) {
        messageCache = null; // 使快取失效，下次將重新載入
        updateContextMenuTitle();
    }
});


// --- 右鍵選單點擊事件監聽 ---
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

// --- 標籤處理函式 ---
async function addTag(tagString) {
    try {
        const data = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
        let savedTags = data[SAVED_TAGS_KEY];
        
        if (!savedTags.includes(tagString)) {
            savedTags.push(tagString);
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

        case 'get_saved_tags':
            const tagsData = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
            return { tags: tagsData[SAVED_TAGS_KEY] };

        case 'delete_saved_tag':
            const tagData = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
            let tags = tagData[SAVED_TAGS_KEY];
            const newTags = tags.filter(t => t !== message.tag);
            await browser.storage.local.set({ [SAVED_TAGS_KEY]: newTags });
            return { success: true };

        case 'clear_saved_tags':
            await browser.storage.local.remove(SAVED_TAGS_KEY);
            return { success: true };
        
        case 'get_i18n_messages': {
            const messages = {};
            // 每次都清除快取，以確保內容腳本在語言變更後能拿到最新的翻譯
            messageCache = null; 
            for (const key of message.keys) {
                messages[key] = await getLocalizedMessage(key);
            }
            return { messages };
        }
    }
});
