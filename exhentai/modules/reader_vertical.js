/**
 * 垂直捲動閱讀器模組 (v1.2)
 * - 新增：圖片載入併發佇列控制（最多同時 3 個請求，並優先載入最接近目前可視區域的頁面）。
 * - 新增：自動定位至進入閱讀器時的當前頁碼，不再強制回到第 1 頁。
 * - 新增：右下角懸浮狀態列（顯示目前頁碼、切換適應視窗、返回目錄按鈕）。
 * - 新增：捲動時即時更新網址列與記錄閱讀進度。
 */
import { fetchAndParsePage, reloadImageFromAPI } from './utils.js';

let verticalObserver = null;
let progressObserver = null;
let ensurePagesAreIndexed;
let hasInitializedVerticalReader = false;
let hiddenElements = [];
let originalBodyOverflow = '';

const MAX_CONCURRENT_LOADS = 3;
let activeLoadCount = 0;
const pendingLoadQueue = [];
let currentVisibleIndex = 0;

/**
 * 從閱讀頁網址解析 1-based 頁碼
 * @param {string} url - 閱讀頁網址
 * @returns {number|null}
 */
function parsePageNumFromUrl(url) {
    if (!url) return null;
    const match = String(url).match(/-(\d+)(?:[/?#]|$)/);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * 將圖片載入任務排入併發佇列，並優先處理距離當前可視頁碼最近的項目
 * @param {number} index - 圖片索引 (0-based)
 * @param {Function} taskFn - 非同步載入函式
 */
function enqueueVerticalLoad(index, taskFn) {
    pendingLoadQueue.push({ index, taskFn });
    processVerticalLoadQueue();
}

/**
 * 執行佇列中的下一個垂直圖片載入任務
 */
function processVerticalLoadQueue() {
    while (activeLoadCount < MAX_CONCURRENT_LOADS && pendingLoadQueue.length > 0) {
        pendingLoadQueue.sort((a, b) => Math.abs(a.index - currentVisibleIndex) - Math.abs(b.index - currentVisibleIndex));
        const nextTask = pendingLoadQueue.shift();
        if (!nextTask) break;
        activeLoadCount += 1;
        Promise.resolve()
            .then(() => nextTask.taskFn())
            .catch(err => console.error('[ExH] 垂直佇列任務錯誤:', err))
            .finally(() => {
                activeLoadCount = Math.max(0, activeLoadCount - 1);
                processVerticalLoadQueue();
            });
    }
}

/**
 * 更新右下角懸浮狀態列文字與記錄閱讀進度
 * @param {number} index - 當前可視圖片索引 (0-based)
 * @param {string} [pageUrl] - 對應的閱讀頁網址
 */
function updateVerticalActivePage(index, pageUrl) {
    currentVisibleIndex = index;
    const total = window.navigationContext.totalImageCount || '?';
    const pageNum = index + 1;

    const statusText = document.getElementById('exh-vertical-status-text');
    if (statusText) {
        statusText.textContent = `${pageNum} / ${total}`;
    }

    if (pageUrl) {
        try {
            if (window.location.href !== pageUrl) {
                history.replaceState(null, '', pageUrl);
            }
        } catch (_) {}

        if (window.navigationContext.galleryId) {
            browser.runtime.sendMessage({
                type: 'update_reading_progress',
                galleryId: window.navigationContext.galleryId,
                currentPage: pageNum,
                totalPages: window.navigationContext.totalImageCount,
                lastPageUrl: pageUrl,
                galleryUrl: window.navigationContext.cleanBaseGalleryUrl || window.navigationContext.backToGalleryUrl,
            }).catch(() => {});
        }
    }
}

/**
 * 套用垂直閱讀器的圖片尺寸限制樣式
 */
function applyVerticalFitStyle() {
    const styleId = 'exh-vertical-fit-style';
    let style = document.getElementById(styleId);
    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }
    const fitBtn = document.getElementById('exh-vertical-fit-btn');
    if (window.scriptSettings.fitToWindow) {
        style.textContent = `
            #exh-vertical-viewer img.exh-vertical-img {
                max-width: 96vw !important;
                max-height: 98vh !important;
                width: auto !important;
                height: auto !important;
                object-fit: contain;
            }
        `;
        if (fitBtn) fitBtn.textContent = '適應視窗:開';
    } else {
        style.textContent = `
            #exh-vertical-viewer img.exh-vertical-img {
                max-width: 100% !important;
                max-height: none !important;
                width: auto !important;
                height: auto !important;
            }
        `;
        if (fitBtn) fitBtn.textContent = '原始尺寸';
    }
}

/**
 * 建立垂直閱讀模式的右下角懸浮控制列
 */
function createVerticalFloatingBar() {
    if (document.getElementById('exh-vertical-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'exh-vertical-bar';
    bar.style.cssText = `
        position: fixed;
        bottom: 16px;
        right: 20px;
        background-color: rgba(20, 20, 20, 0.88);
        color: #e0e0e0;
        border: 1px solid #444;
        border-radius: 999px;
        padding: 6px 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    const statusText = document.createElement('span');
    statusText.id = 'exh-vertical-status-text';
    statusText.textContent = `1 / ${window.navigationContext.totalImageCount || '?'}`;

    const fitBtn = document.createElement('button');
    fitBtn.id = 'exh-vertical-fit-btn';
    fitBtn.title = `切換圖片縮放 (${(window.scriptSettings.keyFit || 'S').toUpperCase()})`;
    fitBtn.style.cssText = `
        background: rgba(255, 255, 255, 0.1);
        color: #ddd;
        border: 1px solid #555;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 12px;
        cursor: pointer;
    `;
    fitBtn.addEventListener('click', async () => {
        window.scriptSettings.fitToWindow = !window.scriptSettings.fitToWindow;
        await browser.storage.local.set({ fitToWindow: window.scriptSettings.fitToWindow });
        applyVerticalFitStyle();
    });

    const exitBtn = document.createElement('a');
    exitBtn.href = window.navigationContext.backToGalleryUrl || '#';
    exitBtn.title = `返回目錄 (${(window.scriptSettings.keyExit || 'E').toUpperCase()})`;
    exitBtn.innerHTML = `<img src="https://exhentai.org/img/b.png" style="height: 16px; display: block;" referrerpolicy="no-referrer">`;
    exitBtn.style.cssText = `display: flex; align-items: center; padding: 3px; border-radius: 4px;`;
    exitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.navigationContext.backToGalleryUrl) {
            window.location.href = window.navigationContext.backToGalleryUrl;
        }
    });

    bar.appendChild(statusText);
    bar.appendChild(fitBtn);
    bar.appendChild(exitBtn);
    document.body.appendChild(bar);
    applyVerticalFitStyle();
}

async function loadVerticalImage(placeholder) {
    if (!placeholder.isConnected || placeholder.dataset.loading === 'true' || placeholder.querySelector('img')) return;
    placeholder.dataset.loading = 'true';
    placeholder.textContent = '正在載入...';

    const pageUrl = placeholder.dataset.pageUrl;
    const index = parseInt(placeholder.dataset.index, 10);
    const galleryId = window.navigationContext.galleryId;

    try {
        if (!window.navigationContext.preloadedPages) {
            window.navigationContext.preloadedPages = new Map();
        }
        let imgUrl = window.navigationContext.preloadedPages.get(pageUrl) || null;

        if (!imgUrl) {
            const { preloadedPages } = await browser.runtime.sendMessage({ type: 'get_all_links', galleryId }).catch(() => ({}));
            if (preloadedPages && preloadedPages[pageUrl]) {
                imgUrl = preloadedPages[pageUrl];
                window.navigationContext.preloadedPages.set(pageUrl, imgUrl);
            }
        }

        if (!imgUrl) {
            const doc = await fetchAndParsePage(pageUrl);
            if (!doc) throw new Error("無法解析頁面文檔。");

            imgUrl = doc.getElementById('img')?.src;
            if (imgUrl) {
                window.navigationContext.preloadedPages.set(pageUrl, imgUrl);
                await browser.runtime.sendMessage({ type: 'cache_image', galleryId, pageUrl, imageUrl: imgUrl }).catch(() => {});
            }
        }

        if (!imgUrl) {
            placeholder.textContent = `找不到圖片連結 (頁 ${index + 1})`;
            placeholder.classList.add('error');
            return;
        }

        const img = document.createElement('img');
        img.className = 'exh-vertical-img';
        img.dataset.index = index;
        img.dataset.pageUrl = pageUrl;
        img.style.cssText = `
            max-width: 100%;
            height: auto;
            display: block;
        `;
        img.onerror = async () => {
            console.warn(`[ExH] 圖片 ${imgUrl} 載入失敗。正在嘗試智慧重載...`);
            img.onerror = null;
            placeholder.textContent = '正在重載...';
            const success = await reloadImageFromAPI(pageUrl, img);
            if (!success) {
                placeholder.textContent = `圖片重載失敗 (頁 ${index + 1})`;
                placeholder.classList.add('error');
            } else {
                window.navigationContext.preloadedPages.set(pageUrl, img.src);
                await browser.runtime.sendMessage({ type: 'cache_image', galleryId, pageUrl, imageUrl: img.src }).catch(() => {});
            }
        };
        img.onload = () => {
            if (placeholder.isConnected) {
                placeholder.replaceWith(img);
                if (progressObserver) {
                    progressObserver.observe(img);
                }
            }
        };
        img.src = imgUrl;

    } catch (error) {
        console.error(`[ExH] 載入垂直圖片 ${index} (${pageUrl}) 時發生嚴重錯誤:`, error);
        placeholder.textContent = `載入時發生錯誤 (頁 ${index + 1})`;
        placeholder.classList.add('error');
    }
}

function handleVerticalKeyDown(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
    const key = event.key.toLowerCase();

    if (key === window.scriptSettings.keyFit) {
        window.scriptSettings.fitToWindow = !window.scriptSettings.fitToWindow;
        browser.storage.local.set({ fitToWindow: window.scriptSettings.fitToWindow });
        applyVerticalFitStyle();
        return;
    }
    if (key === window.scriptSettings.keyHide) {
        const bar = document.getElementById('exh-vertical-bar');
        if (bar) {
            bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
        }
        return;
    }
    if (key === window.scriptSettings.keyExit) {
        if (window.navigationContext.backToGalleryUrl) window.location.href = window.navigationContext.backToGalleryUrl;
        return;
    }
    if (key === window.scriptSettings.keyClear) {
        window.navigationContext.preloadedPages?.clear();
        browser.runtime.sendMessage({ type: 'clear_all_cache' }).then(response => {
            if (response && response.success) {
                const msgDiv = document.createElement('div');
                msgDiv.textContent = `✅ 已清除 ${response.clearedCount} 個圖庫的快取！`;
                msgDiv.style.cssText = `position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: #28a745; color: white; padding: 10px 20px; border-radius: 5px; z-index: 99999;`;
                document.body.appendChild(msgDiv);
                setTimeout(() => msgDiv.remove(), 3000);
            }
        });
        return;
    }
}

async function runVerticalReader() {
    originalBodyOverflow = document.body.style.overflow || '';
    hiddenElements = [];
    Array.from(document.body.children).forEach(child => {
        if (child.id !== 'exh-vertical-bar') {
            hiddenElements.push({ element: child, display: child.style.display || '' });
            child.style.display = 'none';
        }
    });
    document.body.style.overflow = 'auto';

    createVerticalFloatingBar();

    const container = document.createElement('div');
    container.id = 'exh-vertical-viewer';
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 20px 0 60px;
    `;
    document.body.appendChild(container);

    const totalCount = window.navigationContext.totalImageCount || window.navigationContext.masterList.length || 1;
    for (let i = 0; i < totalCount; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'exh-vertical-placeholder';
        placeholder.dataset.index = i;
        placeholder.textContent = `頁 ${i + 1}`;
        placeholder.style.cssText = `
            width: 80vw;
            min-height: 95vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            color: #666;
            border: 2px dashed #555;
            border-radius: 8px;
            box-sizing: border-box;
        `;
        container.appendChild(placeholder);
    }

    // 追蹤當前位於畫面中央的頁碼
    progressObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                const idx = parseInt(entry.target.dataset.index, 10);
                if (Number.isFinite(idx)) {
                    updateVerticalActivePage(idx, entry.target.dataset.pageUrl);
                }
            }
        }
    }, {
        rootMargin: '-40% 0px -40% 0px',
        threshold: 0,
    });

    const observerCallback = (entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            const placeholder = entry.target;
            verticalObserver.unobserve(placeholder);

            const imageIndex = parseInt(placeholder.dataset.index, 10);
            enqueueVerticalLoad(imageIndex, async () => {
                const neededPageIndex = Math.floor(imageIndex / window.navigationContext.imagesPerIndexPage);
                const indexOnPage = imageIndex % window.navigationContext.imagesPerIndexPage;

                await ensurePagesAreIndexed(
                    window.navigationContext.galleryId,
                    [neededPageIndex],
                    window.navigationContext.cleanBaseGalleryUrl || window.navigationContext.backToGalleryUrl
                );

                let links = window.navigationContext.indexedPages?.get(neededPageIndex) || null;
                if (!links) {
                    const pageData = await browser.runtime.sendMessage({
                        type: 'get_specific_page_links',
                        galleryId: window.navigationContext.galleryId,
                        pageIndex: neededPageIndex
                    }).catch(() => null);
                    links = pageData?.links || null;
                }

                if (links && links[indexOnPage]) {
                    const pageUrl = links[indexOnPage];
                    placeholder.dataset.pageUrl = pageUrl;
                    await loadVerticalImage(placeholder);
                } else {
                    placeholder.textContent = `無法獲取連結 (頁 ${imageIndex + 1})`;
                    placeholder.classList.add('error');
                    console.error(`[ExH] 索引完成後，依然找不到索引為 ${imageIndex} 的圖片連結。`);
                }
            });
        }
    };

    verticalObserver = new IntersectionObserver(observerCallback, {
        rootMargin: '150% 0px',
    });

    const placeholders = document.querySelectorAll('.exh-vertical-placeholder');
    placeholders.forEach(el => {
        verticalObserver.observe(el);
        progressObserver.observe(el);
    });

    // 若進入時並非第 1 頁，自動捲動定位至目標頁碼
    const initialPageNum = parsePageNumFromUrl(window.location.href);
    if (initialPageNum && initialPageNum > 1 && initialPageNum <= placeholders.length) {
        const targetIndex = initialPageNum - 1;
        currentVisibleIndex = targetIndex;
        const targetEl = placeholders[targetIndex];
        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'instant', block: 'start' });
            updateVerticalActivePage(targetIndex, window.location.href);
        }
    } else {
        updateVerticalActivePage(0, window.location.href);
    }

    document.addEventListener('keydown', handleVerticalKeyDown);
}

export function initVerticalReader(ensurePagesFunc) {
    if (hasInitializedVerticalReader) {
        console.warn('[ExH] 垂直閱讀器模組已初始化，跳過重複執行。');
        return;
    }
    hasInitializedVerticalReader = true;
    ensurePagesAreIndexed = ensurePagesFunc;
    runVerticalReader();
}

export function teardownVerticalReader() {
    pendingLoadQueue.length = 0;
    if (verticalObserver) {
        verticalObserver.disconnect();
        verticalObserver = null;
    }
    if (progressObserver) {
        progressObserver.disconnect();
        progressObserver = null;
    }
    document.removeEventListener('keydown', handleVerticalKeyDown);

    const container = document.getElementById('exh-vertical-viewer');
    if (container) container.remove();

    const bar = document.getElementById('exh-vertical-bar');
    if (bar) bar.remove();

    const fitStyle = document.getElementById('exh-vertical-fit-style');
    if (fitStyle) fitStyle.remove();

    hiddenElements.forEach(({ element, display }) => {
        if (element && element.style) {
            element.style.display = display || '';
        }
    });
    hiddenElements = [];
    document.body.style.overflow = originalBodyOverflow;
    hasInitializedVerticalReader = false;
}