/**
 * ExHentai 小幫手 - 背景腳本 (v1.1)
 *
 * 功能：
 * - 支援內容腳本的圖片與頁面索引快取。
 * - 提供手動清除所有圖庫快取的功能。
 * - 歷史紀錄功能：儲存、讀取、清除、限制數量、單筆刪除。
 * - 使用 async/await 全面非同步化，提高穩定性與可讀性。
 */

console.log("ExHentai 小幫手背景腳本 v1.1 已啟動。");

const galleryCache = new Map();
const HISTORY_STORAGE_KEY = 'viewingHistory';

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
        
        // 移除已存在的相同項目，避免重複
        history = history.filter(h => h.url !== item.url);
        
        // 從最前面加入新項目
        history.unshift(item);
        
        // 維持最大數量限制
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

// 新增：單筆刪除函式
async function deleteHistoryItem(url) {
    try {
        const data = await browser.storage.local.get({ [HISTORY_STORAGE_KEY]: [] });
        let history = data[HISTORY_STORAGE_KEY];
        
        // 過濾掉要刪除的項目
        const newHistory = history.filter(item => item.url !== url);
        
        await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: newHistory });
        return { success: true };
    } catch (error) {
        console.error(`[BG] 刪除歷史紀錄 (${url}) 時發生錯誤:`, error);
        return { success: false };
    }
}


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
        
        // --- 歷史紀錄訊息處理 ---
        case 'add_to_history':
            return await addToHistory(message.item);

        case 'get_history':
            return await getHistory();

        case 'clear_history':
            return await clearHistory();
            
        case 'delete_history_item': // 新增
            return await deleteHistoryItem(message.url);
    }
});
