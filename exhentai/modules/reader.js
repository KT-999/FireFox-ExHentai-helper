/**
 * 閱讀器核心模組 (v1.3)
 * - 修正：使用 MutationObserver 來等待「返回目錄」連結出現，徹底解決因頁面載入延遲導致返回功能失效的競速條件問題。
 * - 新增：使用 sessionStorage 進行防禦性初始化，儲存「返回目錄」連結以應對因網站不穩定造成的頁面重整。
 */
import { fetchAndParsePage } from './utils.js';

const THEME_STYLE_ID = 'exh-helper-theme-style';
const SESSION_STORAGE_KEY_PREFIX = 'exh_backToGalleryUrl_';
let hasInitializedReader = false;

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

async function ensurePagesAreIndexed(galleryId, pagesToCheck, cleanBaseGalleryUrl) {
    const { missingPages } = await browser.runtime.sendMessage({ type: 'check_indexed_pages', galleryId, pagesToCheck });
    if (missingPages.length > 0) {
        const statusText = document.getElementById('exh-status-text');
        for (const pageIndex of missingPages) {
            if (statusText) statusText.textContent = `🔍 正在索引圖庫分頁 ${pageIndex + 1}...`;
            const galleryPageUrl = new URL(cleanBaseGalleryUrl);
            if (pageIndex > 0) galleryPageUrl.searchParams.set('p', pageIndex);
            const doc = await fetchAndParsePage(galleryPageUrl.href);
            if (doc) {
                const links = Array.from(doc.querySelectorAll('#gdt a, #gdc a')).map(a => a.href);
                if (links.length > 0) {
                    await browser.runtime.sendMessage({ type: 'set_page_links', galleryId, pageIndex, links });
                } else {
                    console.error(`[ExH] 診斷資訊：在圖庫分頁 ${pageIndex + 1} (${galleryPageUrl.href}) 上找不到任何圖片連結。`);
                }
            }
        }
    }
}

function applyTheme(theme) {
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
            #exh-status-bar { background-color: rgba(10, 10, 10, 0.9) !important; border-top-color: #333 !important; color: #e0e0e0 !important; }
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
        await waitForElement('#img', 5000);
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
        const currentGalleryPageIndex = parseInt(galleryUrl.searchParams.get('p') || '0', 10);
        window.navigationContext.currentGalleryPageIndex = currentGalleryPageIndex;
        const cleanBaseGalleryUrl = new URL(galleryUrl.href);
        cleanBaseGalleryUrl.searchParams.delete('p');

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

        const initialLinks = galleryPageDoc.querySelectorAll('#gdt a, #gdc a');
        window.navigationContext.imagesPerIndexPage = initialLinks.length > 0 ? initialLinks.length : 40;

        await ensurePagesAreIndexed(galleryId, [currentGalleryPageIndex], cleanBaseGalleryUrl.href);
        const { masterList } = await browser.runtime.sendMessage({ type: 'get_all_links', galleryId });
        window.navigationContext.masterList = masterList || [];

        window.addEventListener('beforeunload', () => {
            if (window.navigationContext.galleryId) {
                browser.runtime.sendMessage({ type: 'clear_gallery_cache', galleryId: window.navigationContext.galleryId });
            }
        });

        applyTheme(window.scriptSettings.themeMode);

        if (window.scriptSettings.readerMode === 'vertical') {
            console.log('[ExH] 啟用垂直捲動模式 (漸進式載入)。');
            const { initVerticalReader } = await import(browser.runtime.getURL('modules/reader_vertical.js'));
            initVerticalReader(ensurePagesAreIndexed);
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
            const { masterList: fullMasterList } = await browser.runtime.sendMessage({ type: 'get_all_links', galleryId });
            window.navigationContext.masterList = fullMasterList;
            const { initHorizontalReader } = await import(browser.runtime.getURL('modules/reader_horizontal.js'));
            initHorizontalReader(ensurePagesAreIndexed);
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

