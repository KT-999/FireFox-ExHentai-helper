/**
 * 閱讀器核心模組 (v1.3)
 * - 修正：使用 MutationObserver 來等待「返回目錄」連結出現，徹底解決因頁面載入延遲導致返回功能失效的競速條件問題。
 * - 新增：使用 sessionStorage 進行防禦性初始化，儲存「返回目錄」連結以應對因網站不穩定造成的頁面重整。
 */
import { fetchAndParsePage } from './utils.js';

const THEME_STYLE_ID = 'exh-helper-theme-style';
const SESSION_STORAGE_KEY_PREFIX = 'exh_backToGalleryUrl_';
let hasInitializedReader = false;
let currentReaderMode = null;

async function importReaderModuleWithRetry(moduleName, modulePath, { retries = 1, retryDelayMs = 300 } = {}) {
    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
        try {
            return await import(browser.runtime.getURL(modulePath));
        } catch (error) {
            const isLastAttempt = attempt > retries;
            console.error(`[ExH] 載入閱讀器模組失敗: ${moduleName} (第 ${attempt} 次)`, error);
            if (isLastAttempt) {
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
    }
    return null;
}

/**
 * 等待指定的 DOM 元素出現。
 * @param {string} selector - CSS 選擇器。
 * @param {number} timeout - 等待的毫秒數。
 * @returns {Promise<Element>} 當元素出現時，解析為該元素。
 */
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }
        const observer = new MutationObserver((mutations, obs) => {
            const foundElement = document.querySelector(selector);
            if (foundElement) {
                obs.disconnect();
                resolve(foundElement);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`等待元素 "${selector}" 超時 (${timeout}ms)。`));
        }, timeout);
    });
}

let indexingQueuePromise = Promise.resolve();

/**
 * 從本地與背景快取重建按頁碼排序且不重複的 masterList
 * @returns {string[]}
 */
export function buildOrderedMasterList() {
    const indexedPages = window.navigationContext.indexedPages;
    if (!indexedPages || indexedPages.size === 0) {
        return window.navigationContext.masterList || [];
    }

    const sortedPageKeys = Array.from(indexedPages.keys()).sort((a, b) => a - b);
    const seen = new Set();
    const allLinks = [];

    for (const pageIdx of sortedPageKeys) {
        const links = indexedPages.get(pageIdx) || [];
        for (const link of links) {
            if (!seen.has(link)) {
                seen.add(link);
                allLinks.push(link);
            }
        }
    }

    // 依網址末尾的實際圖片頁碼 (-1, -2, ...) 進行排序，確保絕對不會錯位
    allLinks.sort((a, b) => {
        const matchA = a.match(/-(\d+)$/);
        const matchB = b.match(/-(\d+)$/);
        const numA = matchA ? parseInt(matchA[1], 10) : 0;
        const numB = matchB ? parseInt(matchB[1], 10) : 0;
        return numA - numB;
    });

    return allLinks;
}

/**
 * 確保指定的圖庫分頁已建立索引（具備佇列鎖定與本地快取備援，防止 MV3 背景休眠或競爭條件導致跳頁）
 * @param {string} galleryId - 圖庫 ID
 * @param {number[]} pagesToCheck - 要檢查並索引的分頁編號陣列 (0-based)
 * @param {string} baseGalleryUrl - 圖庫目錄網址
 */
async function ensurePagesAreIndexed(galleryId, pagesToCheck, baseGalleryUrl) {
    const task = async () => {
        if (!window.navigationContext.indexedPages) {
            window.navigationContext.indexedPages = new Map();
        }
        if (!window.navigationContext.preloadedPages) {
            window.navigationContext.preloadedPages = new Map();
        }
        const localIndexed = window.navigationContext.indexedPages;
        const localPreloaded = window.navigationContext.preloadedPages;

        // 1. 先向背景腳本同步已知的分頁資料与圖片快取（防止背景腳本休眠重啟後遺失已索引分頁）
        const bgData = await browser.runtime.sendMessage({ type: 'get_gallery_data', galleryId }).catch(() => null);
        if (bgData) {
            if (bgData.pages) {
                for (const [k, v] of Object.entries(bgData.pages)) {
                    const pageNum = Number(k);
                    if (!localIndexed.has(pageNum) && Array.isArray(v) && v.length > 0) {
                        localIndexed.set(pageNum, v);
                    }
                }
                // 若背景腳本因為 MV3 休眠遺失了部分本地已有的分頁，補寫回背景腳本
                for (const [pageNum, links] of localIndexed.entries()) {
                    if (!bgData.pages[pageNum]) {
                        await browser.runtime.sendMessage({ type: 'set_page_links', galleryId, pageIndex: pageNum, links }).catch(() => {});
                    }
                }
            }
            if (bgData.preloadedPages) {
                for (const [pageUrl, imgUrl] of Object.entries(bgData.preloadedPages)) {
                    if (!localPreloaded.has(pageUrl) && imgUrl) {
                        localPreloaded.set(pageUrl, imgUrl);
                    }
                }
            }
        }

        const missingPages = (pagesToCheck || []).filter(p => !localIndexed.has(p));
        if (missingPages.length === 0) return;

        const statusText = document.getElementById('exh-status-text');
        for (const pageIndex of missingPages) {
            if (localIndexed.has(pageIndex)) continue;
            if (statusText) statusText.textContent = `🔍 正在索引圖庫分頁 ${pageIndex + 1}...`;

            const galleryPageUrl = new URL(baseGalleryUrl);
            if (pageIndex > 0) {
                galleryPageUrl.searchParams.set('p', pageIndex);
            } else {
                galleryPageUrl.searchParams.delete('p');
            }

            const doc = await fetchAndParsePage(galleryPageUrl.href);
            if (doc) {
                const links = Array.from(doc.querySelectorAll('#gdt a, #gdc a')).map(a => a.href);
                if (links.length > 0) {
                    localIndexed.set(pageIndex, links);
                    await browser.runtime.sendMessage({ type: 'set_page_links', galleryId, pageIndex, links }).catch(() => {});
                } else {
                    console.error(`[ExH] 診斷資訊：在圖庫分頁 ${pageIndex + 1} (${galleryPageUrl.href}) 上找不到任何圖片連結。`);
                }
            }
        }

        window.navigationContext.masterList = buildOrderedMasterList();
    };

    indexingQueuePromise = indexingQueuePromise.then(task, task);
    return indexingQueuePromise;
}

let hasBoundUnloadListener = false;

export function applyTheme(theme) {
    const existingStyle = document.getElementById(THEME_STYLE_ID);
    if (existingStyle) existingStyle.remove();
    if (theme === 'light') return;
    let isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
        const style = document.createElement('style');
        style.id = THEME_STYLE_ID;
        style.textContent = `
            html, body { background-color: #1a1a1a !important; color: #e0e0e0 !important; }
            #exh-viewer { background-color: #1a1a1a !important; }
            #exh-status-bar, #exh-vertical-bar { background-color: rgba(10, 10, 10, 0.9) !important; border-color: #333 !important; color: #e0e0e0 !important; }
            #exh-status-previews img { border-color: #555 !important; }
            a { color: #8cb4ff !important; }
            .exh-vertical-placeholder { background-color: #2a2a2a; border: 1px dashed #444; color: #888; }
            .exh-vertical-placeholder.error { color: #ff8a8a; border-color: #ff8a8a; }
        `;
        document.head.appendChild(style);
    }
}

async function runReader() {
    if (window.scriptSettings.readerMode === 'default') {
        console.log('[ExH] 閱讀模式設定為「網頁預設」，腳本將不作用。');
        currentReaderMode = 'default';
        return;
    }

    try {
        // *** 修改重點 1：防禦性讀取 ***
        // 嘗試從當前 URL 解析圖庫 ID，並從 sessionStorage 恢復返回連結，以應對頁面意外重整。
        const pathMatch = window.location.pathname.match(/\/(\d+)-\d+$/);
        const galleryIdFromPath = pathMatch ? pathMatch[1] : null;
        if (galleryIdFromPath) {
            const sessionKey = `${SESSION_STORAGE_KEY_PREFIX}${galleryIdFromPath}`;
            const storedUrl = sessionStorage.getItem(sessionKey);
            if (storedUrl) {
                console.log(`[ExH] 防禦性初始化：從 sessionStorage 恢復返回連結: ${storedUrl}`);
                window.navigationContext.backToGalleryUrl = storedUrl;
            }
        }

        // 等待關鍵元素載入
        const initialImgEl = await waitForElement('#img', 5000);
        const backToGalleryLink = await waitForElement('.sb a[href*="/g/"]', 10000);

        // *** 修改重點 2：權威性寫入 ***
        // 從頁面元素獲取最準確的連結，並更新記憶體和 sessionStorage
        window.navigationContext.backToGalleryUrl = backToGalleryLink.href;
        const galleryUrl = new URL(backToGalleryLink.href);
        const galleryId = galleryUrl.pathname.match(/\/g\/(\d+)\//)?.[1];

        if (!galleryId) {
            throw new Error('無法從返回連結中識別圖庫 ID。');
        }

        // 將最正確的連結儲存到 sessionStorage
        const sessionKey = `${SESSION_STORAGE_KEY_PREFIX}${galleryId}`;
        sessionStorage.setItem(sessionKey, backToGalleryLink.href);

        window.navigationContext.galleryId = galleryId;
        if (!window.navigationContext.indexedPages) {
            window.navigationContext.indexedPages = new Map();
        }
        if (!window.navigationContext.preloadedPages) {
            window.navigationContext.preloadedPages = new Map();
        }

        // 將當前頁面已載入的 #img 直接寫入本地與背景快取，省去第一次載入當前頁的重抓請求
        if (initialImgEl && initialImgEl.src) {
            const cleanCurrentUrl = window.location.origin + window.location.pathname;
            window.navigationContext.preloadedPages.set(cleanCurrentUrl, initialImgEl.src);
            browser.runtime.sendMessage({
                type: 'cache_image',
                galleryId,
                pageUrl: cleanCurrentUrl,
                imageUrl: initialImgEl.src
            }).catch(() => {});
        }

        const currentGalleryPageIndex = parseInt(galleryUrl.searchParams.get('p') || '0', 10);
        window.navigationContext.currentGalleryPageIndex = currentGalleryPageIndex;
        const cleanBaseGalleryUrl = new URL(galleryUrl.href);
        cleanBaseGalleryUrl.searchParams.delete('p');
        window.navigationContext.cleanBaseGalleryUrl = cleanBaseGalleryUrl.href;

        const galleryPageDoc = await fetchAndParsePage(galleryUrl.href);
        if (!galleryPageDoc) {
            throw new Error('無法讀取圖庫頁面資訊。');
        }

        let galleryData = await browser.runtime.sendMessage({ type: 'get_gallery_data', galleryId });
        if (!galleryData || galleryData.totalPages === null) {
            const gpcText = galleryPageDoc.querySelector('p.gpc')?.textContent || '';
            const totalImagesMatch = gpcText.match(/of ([\d,]+)/);
            const totalImages = totalImagesMatch ? parseInt(totalImagesMatch[1].replace(/,/g, ''), 10) : 0;
            const paginationTable = galleryPageDoc.querySelector('.ptb');
            const pageLinks = paginationTable ? paginationTable.querySelectorAll('td a') : [];
            const pageNumbers = Array.from(pageLinks).map(a => parseInt(a.textContent, 10)).filter(n => !isNaN(n));
            const totalPages = pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
            await browser.runtime.sendMessage({ type: 'set_gallery_metadata', galleryId, totalPages, totalImages });
            galleryData = { ...galleryData, totalPages, totalImages, pages: {} };
        }
        window.navigationContext.totalGalleryPages = galleryData.totalPages;
        window.navigationContext.totalImageCount = galleryData.totalImages;

        const initialLinks = Array.from(galleryPageDoc.querySelectorAll('#gdt a, #gdc a')).map(a => a.href);
        window.navigationContext.imagesPerIndexPage = initialLinks.length > 0 ? initialLinks.length : 40;

        // 直接寫入當前已抓取的圖庫分頁，避免重複網路請求
        if (initialLinks.length > 0) {
            window.navigationContext.indexedPages.set(currentGalleryPageIndex, initialLinks);
            await browser.runtime.sendMessage({
                type: 'set_page_links',
                galleryId,
                pageIndex: currentGalleryPageIndex,
                links: initialLinks
            }).catch(() => {});
        }

        await ensurePagesAreIndexed(galleryId, [currentGalleryPageIndex], cleanBaseGalleryUrl.href);
        window.navigationContext.masterList = buildOrderedMasterList();

        if (!hasBoundUnloadListener) {
            window.addEventListener('beforeunload', () => {
                if (window.navigationContext.galleryId) {
                    browser.runtime.sendMessage({ type: 'clear_gallery_cache', galleryId: window.navigationContext.galleryId });
                }
            });
            hasBoundUnloadListener = true;
        }

        applyTheme(window.scriptSettings.themeMode);

        if (window.scriptSettings.readerMode === 'vertical') {
            console.log('[ExH] 啟用垂直捲動模式 (漸進式載入)。');
            const verticalModule = await importReaderModuleWithRetry('reader_vertical', 'modules/reader_vertical.js', { retries: 1 });
            if (verticalModule) {
                verticalModule.initVerticalReader(ensurePagesAreIndexed);
                currentReaderMode = 'vertical';
            }
        } else if (window.scriptSettings.readerMode === 'horizontal') {
            console.log('[ExH] 啟用水平滑動模式。');
            const indexWindowRadius = 1;
            const pagesToIndex = [];
            for (let i = -indexWindowRadius; i <= indexWindowRadius; i++) {
                const pageIndex = currentGalleryPageIndex + i;
                if (pageIndex >= 0 && pageIndex < galleryData.totalPages && !pagesToIndex.includes(pageIndex)) {
                    pagesToIndex.push(pageIndex);
                }
            }
            await ensurePagesAreIndexed(galleryId, pagesToIndex, cleanBaseGalleryUrl.href);
            window.navigationContext.masterList = buildOrderedMasterList();
            const horizontalModule = await importReaderModuleWithRetry('reader_horizontal', 'modules/reader_horizontal.js', { retries: 1 });
            if (horizontalModule) {
                horizontalModule.initHorizontalReader(ensurePagesAreIndexed);
                currentReaderMode = 'horizontal';
            }
        }

    } catch (error) {
        console.error('❌ [ExH] 閱讀器初始化失敗:', error.message);
    }
}

export function initReader() {
    if (hasInitializedReader) {
        console.warn('[ExH] 閱讀器模組已初始化，跳過重複執行。');
        return;
    }
    hasInitializedReader = true;
    runReader();
}

export async function switchReaderMode(newMode) {
    if (!hasInitializedReader) {
        window.scriptSettings.readerMode = newMode;
        return runReader();
    }

    if (newMode === currentReaderMode) return;

    if (currentReaderMode === 'horizontal') {
        const horizontalModule = await importReaderModuleWithRetry('reader_horizontal', 'modules/reader_horizontal.js', { retries: 1 });
        if (horizontalModule) {
            horizontalModule.teardownHorizontalReader();
        }
    } else if (currentReaderMode === 'vertical') {
        const verticalModule = await importReaderModuleWithRetry('reader_vertical', 'modules/reader_vertical.js', { retries: 1 });
        if (verticalModule) {
            verticalModule.teardownVerticalReader();
        }
    }

    if (newMode === 'default') {
        applyTheme('light');
        currentReaderMode = 'default';
        return;
    }

    window.scriptSettings.readerMode = newMode;
    await runReader();
}

