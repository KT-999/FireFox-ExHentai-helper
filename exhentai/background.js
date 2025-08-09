/**
 * ExHentai 小幫手 - 背景腳本 (v2.0)
 *
 * 功能：
 * - 新增 'clear_all_cache' 指令：提供手動清除所有圖庫快取的功能。
 * - 重構訊息監聽器：使用 async/await 全面非同步化，提高穩定性與可讀性。
 */

console.log("ExHentai 小幫手背景腳本 v7.8 已啟動。");

const galleryCache = new Map();

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

        case 'cache_image':
            await handleCacheImage(message);
            return { success: true };
        
        case 'clear_gallery_cache':
            if (galleryCache.has(galleryId)) {
                galleryCache.delete(galleryId);
                console.log(`[BG] 已清除圖庫 ${galleryId} 的快取。`);
            }
            return { success: true };
        
        // **新增點**: 手動清除所有快取
        case 'clear_all_cache':
            const count = galleryCache.size;
            galleryCache.clear();
            console.log(`[BG] 已手動清除所有快取，共 ${count} 個圖庫。`);
            return { success: true, clearedCount: count };
    }
});
