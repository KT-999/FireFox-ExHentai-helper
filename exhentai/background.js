/**
 * ExHentai 小幫手 - 背景腳本 (v1.2.6)
 */

console.log("ExHentai 小幫手背景腳本 v1.2.6 已啟動。");

const galleryCache = new Map();
const GALLERY_CACHE_TTL_MS = 120 * 60 * 1000;
const GALLERY_CACHE_MAX = 1000;
const HISTORY_STORAGE_KEY = 'viewingHistory';
const SAVED_TAGS_KEY = 'savedTags';
const CONTEXT_MENU_ID = "save-exh-tag";
const MIGRATION_FLAG_KEY = 'tagsMigrated_v1_2_5'; // 用於標記新物件結構的遷移
const settingsCache = {
    cacheSize: 50,
    maxHistoryCount: 200,
    uiLanguage: 'auto',
};

async function refreshSettingsCache() {
    try {
        const data = await browser.storage.local.get(settingsCache);
        Object.assign(settingsCache, data);
    } catch (error) {
        console.warn('[BG] 無法載入設定快取，將使用預設值。', error);
    }
}

refreshSettingsCache().catch(error => {
    console.warn('[BG] 初始化設定快取失敗。', error);
});

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
            let lang = settingsCache.uiLanguage;
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

async function createOrUpdateContextMenu() {
    try {
        await browser.contextMenus.remove(CONTEXT_MENU_ID);
    } catch (error) {
        if (!error?.message?.includes("not found")) {
            console.warn("[BG] 無法移除既有右鍵選單。", error);
        }
    }

    browser.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: "Saving tag...",
        contexts: ["link"],
        documentUrlPatterns: ["https://exhentai.org/*", "https://e-hentai.org/*"],
        targetUrlPatterns: ["https://exhentai.org/tag/*", "https://e-hentai.org/tag/*"]
    }, () => {
        if (browser.runtime.lastError) console.log("右鍵選單已存在，將直接更新。");
        messageCache = null;
        updateContextMenuTitle();
    });
}

// --- 事件監聽器 ---
browser.runtime.onInstalled.addListener(async (details) => {
    // 在安裝或更新後，首先執行資料遷移
    await migrateTagsData();
    await refreshSettingsCache();

    await createOrUpdateContextMenu();
});

browser.runtime.onStartup.addListener(async () => {
    // 瀏覽器啟動時也檢查一次，確保遷移成功
    await migrateTagsData();
    await refreshSettingsCache();
    messageCache = null;
    updateContextMenuTitle();
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.uiLanguage) {
        settingsCache.uiLanguage = changes.uiLanguage.newValue ?? 'auto';
        messageCache = null;
        updateContextMenuTitle();
    }
    if (area === 'local' && changes.cacheSize) {
        settingsCache.cacheSize = changes.cacheSize.newValue ?? settingsCache.cacheSize;
    }
    if (area === 'local' && changes.maxHistoryCount) {
        settingsCache.maxHistoryCount = changes.maxHistoryCount.newValue ?? settingsCache.maxHistoryCount;
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
    galleryData.lastAccess = Date.now();

    while (galleryData.preloadedPages.size > settingsCache.cacheSize) {
        const oldestPageUrl = galleryData.preloadedPages.keys().next().value;
        galleryData.preloadedPages.delete(oldestPageUrl);
    }
}

function cleanupGalleryCache() {
    const now = Date.now();
    for (const [id, data] of galleryCache.entries()) {
        if (data.lastAccess && now - data.lastAccess > GALLERY_CACHE_TTL_MS) {
            galleryCache.delete(id);
        }
    }

    if (galleryCache.size > GALLERY_CACHE_MAX) {
        const sorted = Array.from(galleryCache.entries())
            .sort((a, b) => (a[1].lastAccess ?? 0) - (b[1].lastAccess ?? 0));
        const overflow = galleryCache.size - GALLERY_CACHE_MAX;
        for (let i = 0; i < overflow; i += 1) {
            galleryCache.delete(sorted[i][0]);
        }
    }
}

setInterval(cleanupGalleryCache, 5 * 60 * 1000);

// --- 歷史紀錄處理函式 ---
async function addToHistory(item) {
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

    const requiresGalleryId = new Set([
        'get_gallery_data',
        'set_gallery_metadata',
        'check_indexed_pages',
        'set_page_links',
        'get_all_links',
        'get_specific_page_links',
        'cache_image',
        'clear_gallery_cache',
    ]);

    if (requiresGalleryId.has(type) && !galleryId) {
        console.warn(`[BG] 缺少 galleryId，無法處理訊息類型: ${type}`);
        return { success: false, error: 'Missing galleryId' };
    }

    if (galleryId && !galleryCache.has(galleryId)) {
        galleryCache.set(galleryId, {
            pages: new Map(),
            preloadedPages: new Map(),
            totalPages: null,
            totalImages: null,
            lastAccess: Date.now(),
        });
    }
    const galleryData = galleryCache.get(galleryId);
    if (galleryData) {
        galleryData.lastAccess = Date.now();
    }

    switch (type) {
         case 'get_gallery_data':
            if (!galleryData) return null;
            return galleryData ? {
                pages: Object.fromEntries(galleryData.pages),
                preloadedPages: Object.fromEntries(galleryData.preloadedPages),
                totalPages: galleryData.totalPages,
                totalImages: galleryData.totalImages,
            } : null;

        case 'set_gallery_metadata':
            if (!galleryData) return { success: false, error: 'Gallery cache missing' };
            galleryData.totalPages = message.totalPages;
            galleryData.totalImages = message.totalImages;
            return { success: true };

        case 'check_indexed_pages':
            if (!galleryData) return { missingPages: message.pagesToCheck || [] };
            const indexedPages = Array.from(galleryData.pages.keys());
            const missingPages = message.pagesToCheck.filter(p => !indexedPages.includes(p));
            return { missingPages };

        case 'set_page_links':
            if (!galleryData) return { success: false, error: 'Gallery cache missing' };
            galleryData.pages.set(message.pageIndex, message.links);
            return { success: true };
        
        case 'get_all_links': {
            if (!galleryData) return { masterList: [], preloadedPages: {} };
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
        case 'batch_update_tags': {
            const { tagsToAdd, tagsToUpdate } = message;
            const data = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
            let savedTags = data[SAVED_TAGS_KEY];
            const savedTagsMap = new Map(savedTags.map(t => [t.original, t]));

            // 應用更新
            for (const tag of tagsToUpdate) {
                if (savedTagsMap.has(tag.original)) {
                    savedTagsMap.get(tag.original).display = tag.display;
                }
            }

            // 應用新增
            for (const tag of tagsToAdd) {
                if (!savedTagsMap.has(tag.original)) {
                    savedTagsMap.set(tag.original, tag);
                }
            }

            // 將 map 轉回陣列並儲存
            const newTagsArray = Array.from(savedTagsMap.values());
            await browser.storage.local.set({ [SAVED_TAGS_KEY]: newTagsArray });
            console.log(`[BG] 批次更新完成。新增: ${tagsToAdd.length}, 更新: ${tagsToUpdate.length}.`);
            return { success: true };
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
