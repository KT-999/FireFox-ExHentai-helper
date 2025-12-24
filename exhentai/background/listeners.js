console.log("[BG] 載入背景腳本事件監聽模組。");

async function handleMessage(message) {
    const state = globalThis.exHentaiBackground;
    const { type, galleryId } = message;
    const galleryData = state.ensureGalleryData(galleryId);

    switch (type) {
        case 'get_gallery_data':
            return state.getGalleryDataSnapshot(galleryData);

        case 'set_gallery_metadata':
            if (galleryData) {
                galleryData.totalPages = message.totalPages;
                galleryData.totalImages = message.totalImages;
            }
            return { success: true };

        case 'check_indexed_pages': {
            const indexedPages = Array.from(galleryData.pages.keys());
            const missingPages = message.pagesToCheck.filter(p => !indexedPages.includes(p));
            return { missingPages };
        }

        case 'set_page_links':
            galleryData.pages.set(message.pageIndex, message.links);
            return { success: true };

        case 'get_all_links': {
            const allLinks = [];
            const sortedPageKeys = Array.from(galleryData.pages.keys()).sort((a, b) => a - b);
            for (const pageIndex of sortedPageKeys) {
                allLinks.push(...galleryData.pages.get(pageIndex));
            }
            return {
                masterList: allLinks,
                preloadedPages: Object.fromEntries(galleryData.preloadedPages),
            };
        }

        case 'get_specific_page_links': {
            if (galleryData && galleryData.pages.has(message.pageIndex)) {
                return { links: galleryData.pages.get(message.pageIndex) };
            }
            return { links: null };
        }

        case 'cache_image':
            await state.handleCacheImage(message);
            return { success: true };

        case 'clear_gallery_cache':
            return state.clearGalleryCache(galleryId);

        case 'clear_all_cache':
            return state.clearAllCache();

        case 'add_to_history':
            return state.addToHistory(message.item);

        case 'get_history':
            return state.getHistory();

        case 'clear_history':
            return state.clearHistory();

        case 'delete_history_item':
            return state.deleteHistoryItem(message.url);

        case 'get_saved_tags':
            return state.getSavedTags();

        case 'delete_saved_tag':
            return state.deleteSavedTag(message.tagOriginal);

        case 'update_saved_tag':
            return state.updateSavedTag(message.tag);

        case 'batch_update_tags':
            return state.batchUpdateTags(message.tagsToAdd, message.tagsToUpdate);

        case 'clear_saved_tags':
            return state.clearSavedTags();

        case 'get_i18n_messages': {
            const messages = {};
            state.messageCache = null;
            for (const key of message.keys) {
                messages[key] = await state.getLocalizedMessage(key);
            }
            return { messages };
        }
    }

    return undefined;
}

function registerListeners() {
    const state = globalThis.exHentaiBackground;

    browser.runtime.onInstalled.addListener(async () => {
        await state.migrateTagsData();
        await state.refreshSettingsCache();

        browser.contextMenus.create({
            id: state.CONTEXT_MENU_ID,
            title: 'Saving tag...',
            contexts: ['link'],
            documentUrlPatterns: ['*://exhentai.org/g/*', '*://e-hentai.org/g/*'],
        }, () => {
            if (browser.runtime.lastError) console.log('右鍵選單已存在，將直接更新。');
            state.messageCache = null;
            state.updateContextMenuTitle();
        });
    });

    browser.runtime.onStartup.addListener(async () => {
        await state.migrateTagsData();
        await state.refreshSettingsCache();
        state.messageCache = null;
        state.updateContextMenuTitle();
    });

    browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.uiLanguage) {
            state.settingsCache.uiLanguage = changes.uiLanguage.newValue ?? 'auto';
            state.messageCache = null;
            state.updateContextMenuTitle();
        }
        if (area === 'local' && changes.cacheSize) {
            state.settingsCache.cacheSize = changes.cacheSize.newValue ?? state.settingsCache.cacheSize;
        }
        if (area === 'local' && changes.maxHistoryCount) {
            state.settingsCache.maxHistoryCount = changes.maxHistoryCount.newValue ?? state.settingsCache.maxHistoryCount;
        }
    });

    browser.contextMenus.onClicked.addListener(async (info) => {
        if (info.menuItemId === state.CONTEXT_MENU_ID && info.linkUrl) {
            const url = new URL(info.linkUrl);
            if (url.pathname.startsWith('/tag/')) {
                const tag = decodeURIComponent(url.pathname.substring(5)).replace(/\+/g, ' ');
                await state.addTag(tag);
            }
        }
    });

    browser.runtime.onMessage.addListener(message => handleMessage(message));
}

globalThis.exHentaiBackground.registerListeners = registerListeners;
