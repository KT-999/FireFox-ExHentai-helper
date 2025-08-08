// ExHentai 小幫手 - 背景腳本 (v8.0 Chrome M3 適配版)
// - 重構儲存邏輯，以 browser.storage.local 取代記憶體 Map，以符合 Manifest V3 Service Worker 模型。
// - 引入 Polyfill 以相容 Chrome API。

try {
    importScripts('browser-polyfill.js');
} catch (e) {
    console.error("無法載入 polyfill:", e);
}

console.log("ExHentai 小幫手背景腳本 v8.0 已啟動。");

// --- Helper Functions ---

// 為了方便管理，所有圖庫資料在 storage 中都用 'gallery_' 作為前綴
const getGalleryStorageKey = (galleryId) => `gallery_${galleryId}`;

// 獲取或初始化一個圖庫的資料
async function getOrCreateGalleryData(galleryId) {
    const key = getGalleryStorageKey(galleryId);
    const result = await browser.storage.local.get(key);
    if (result && result[key]) {
        return result[key];
    }
    // 如果不存在，則建立新的結構
    const newGalleryData = {
        pages: {}, // 使用物件而非 Map
        preloadedPages: {}, // 使用物件而非 Map
        totalPages: null,
        totalImages: null,
    };
    await browser.storage.local.set({ [key]: newGalleryData });
    return newGalleryData;
}

// 處理圖片快取
async function handleCacheImage(message) {
    const { galleryId, pageUrl, imageUrl } = message;
    const galleryData = await getOrCreateGalleryData(galleryId);

    galleryData.preloadedPages[pageUrl] = imageUrl;
    
    const { cacheSize = 50 } = await browser.storage.local.get({ cacheSize: 50 });
    const preloadedKeys = Object.keys(galleryData.preloadedPages);

    while (preloadedKeys.length > cacheSize) {
        const oldestPageUrl = preloadedKeys.shift(); // 取得並移除最舊的 key
        delete galleryData.preloadedPages[oldestPageUrl];
    }
    
    const key = getGalleryStorageKey(galleryId);
    await browser.storage.local.set({ [key]: galleryData });
}


// --- Message Listener ---

browser.runtime.onMessage.addListener(async (message, sender) => {
    const { type, galleryId } = message;

    // 對於需要 galleryId 的操作，先獲取資料
    let galleryData;
    if (galleryId) {
        galleryData = await getOrCreateGalleryData(galleryId);
    }
    
    const storageKey = galleryId ? getGalleryStorageKey(galleryId) : null;

    switch (type) {
        case 'get_gallery_data':
            // 這裡的 galleryData 可能為 undefined，呼叫端需要處理
            return galleryData;

        case 'set_gallery_metadata':
            galleryData.totalPages = message.totalPages;
            galleryData.totalImages = message.totalImages;
            await browser.storage.local.set({ [storageKey]: galleryData });
            return { success: true };

        case 'check_indexed_pages':
            const indexedPages = Object.keys(galleryData.pages);
            const missingPages = message.pagesToCheck.filter(p => !indexedPages.includes(p.toString()));
            return { missingPages };

        case 'set_page_links':
            // 注意：pageIndex 來自 content script，是數字，但物件的 key 會是字串
            galleryData.pages[message.pageIndex] = message.links;
            await browser.storage.local.set({ [storageKey]: galleryData });
            return { success: true };
        
        case 'get_all_links': {
            let allLinks = [];
            // Object.keys 回傳的是字串，需要轉換為數字再排序
            const sortedPageKeys = Object.keys(galleryData.pages).map(Number).sort((a, b) => a - b);
            for (const pageIndex of sortedPageKeys) {
                allLinks.push(...galleryData.pages[pageIndex]);
            }
            return {
                masterList: allLinks,
                preloadedPages: galleryData.preloadedPages
            };
        }

        case 'cache_image':
            await handleCacheImage(message);
            return { success: true };
        
        case 'clear_gallery_cache':
            if (storageKey) {
                await browser.storage.local.remove(storageKey);
                console.log(`[BG] 已清除圖庫 ${galleryId} 的快取。`);
            }
            return { success: true };
        
        case 'clear_all_cache':
            const allItems = await browser.storage.local.get(null);
            const galleryKeysToRemove = Object.keys(allItems).filter(key => key.startsWith('gallery_'));
            if (galleryKeysToRemove.length > 0) {
                await browser.storage.local.remove(galleryKeysToRemove);
            }
            console.log(`[BG] 已手動清除所有快取，共 ${galleryKeysToRemove.length} 個圖庫。`);
            return { success: true, clearedCount: galleryKeysToRemove.length };
    }
});