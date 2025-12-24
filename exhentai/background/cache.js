console.log("[BG] 載入背景腳本快取模組。");

function ensureGalleryData(galleryId) {
    const { galleryCache } = globalThis.exHentaiBackground;
    if (!galleryId) return null;
    if (!galleryCache.has(galleryId)) {
        galleryCache.set(galleryId, {
            pages: new Map(),
            preloadedPages: new Map(),
            totalPages: null,
            totalImages: null,
        });
    }
    return galleryCache.get(galleryId);
}

async function handleCacheImage(message) {
    const { galleryId, pageUrl, imageUrl } = message;
    const { settingsCache } = globalThis.exHentaiBackground;
    const galleryData = ensureGalleryData(galleryId);
    if (!galleryData) return;

    galleryData.preloadedPages.set(pageUrl, imageUrl);

    while (galleryData.preloadedPages.size > settingsCache.cacheSize) {
        const oldestPageUrl = galleryData.preloadedPages.keys().next().value;
        galleryData.preloadedPages.delete(oldestPageUrl);
    }
}

function clearGalleryCache(galleryId) {
    const { galleryCache } = globalThis.exHentaiBackground;
    if (galleryCache.has(galleryId)) {
        galleryCache.delete(galleryId);
        console.log(`[BG] 已清除圖庫 ${galleryId} 的快取。`);
    }
    return { success: true };
}

function clearAllCache() {
    const { galleryCache } = globalThis.exHentaiBackground;
    const count = galleryCache.size;
    galleryCache.clear();
    console.log(`[BG] 已手動清除所有快取，共 ${count} 個圖庫。`);
    return { success: true, clearedCount: count };
}

function getGalleryDataSnapshot(galleryData) {
    if (!galleryData) return null;
    return {
        pages: Object.fromEntries(galleryData.pages),
        preloadedPages: Object.fromEntries(galleryData.preloadedPages),
        totalPages: galleryData.totalPages,
        totalImages: galleryData.totalImages,
    };
}

globalThis.exHentaiBackground.ensureGalleryData = ensureGalleryData;
globalThis.exHentaiBackground.handleCacheImage = handleCacheImage;
globalThis.exHentaiBackground.clearGalleryCache = clearGalleryCache;
globalThis.exHentaiBackground.clearAllCache = clearAllCache;
globalThis.exHentaiBackground.getGalleryDataSnapshot = getGalleryDataSnapshot;
