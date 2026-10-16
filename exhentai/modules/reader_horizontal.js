/**
 * 水平翻頁閱讀器模組 (v1.3.2)
 * - 新增：在下方的狀態列中，增加一個「返回目錄」的圖示按鈕，提供快捷鍵以外的退出方式。
 * - 修正：重構 navigateTo 函式以解決競爭條件問題，防止在快速翻頁時跳轉到錯誤的頁面。
 * - 更新：使用 try...finally 結構確保導覽鎖的可靠釋放。
 * - 移除：廢除不穩定的 setTimeout 延遲來釋放導覽鎖。
 * - 修正：替換了 `findIndex` 中不可靠的 `.includes()` 檢查，改用精準的 URL Pathname 比對，解決初始化時可能跳轉到錯誤頁面的問題。
 * - 新增：新增 `getPageNumberFromUrl` 輔助函式，統一頁碼解析邏輯。
 * - 新增：加入設定變更監聽器，讓 popup 中的選項可以即時生效，無需重整頁面。
 * - 優化：將預先載入的順序從線性改為由近到遠的交錯順序，以提升體驗。
 */
import { fetchAndParsePage, reloadImageFromAPI } from './utils.js';

const FIT_STYLE_ID = 'exh-helper-fit-style';
const VIEWER_STYLE_ID = 'exh-helper-viewer-style';
const STATUS_STYLE_ID = 'exh-helper-status-style';
let ensurePagesAreIndexed; // 由主模組傳入
let exitTooltipText = 'Back to Gallery (E)'; // 預設提示文字
let hasInitializedHorizontalReader = false;
let hiddenElements = [];
let originalBodyOverflow = '';
let hasBoundPreviewClick = false;

// --- 新增：統一的頁碼解析函式 ---
function getPageNumberFromUrl(url) {
    if (!url) return null;
    try {
        // 優先使用正規表示式從字串末尾解析，最為可靠
        const match = url.match(/-(\d+)$/);
        if (match) return match[1];

        // 備用方法：如果正規表示式失敗，再嘗試 URL 解析
        const path = new URL(url).pathname;
        const parts = path.split('-');
        const lastPart = parts[parts.length - 1];
        if (!isNaN(parseInt(lastPart, 10))) {
            return lastPart;
        }
        return null;
    } catch (e) {
        console.error(`[ExH] 從 URL 解析頁碼失敗: ${url}`, e);
        return null;
    }
}

// --- 新增：精準的網址比對函式 ---
function findIndexInMasterList(masterList, urlToFind) {
    if (!urlToFind) return -1;
    try {
        const path = new URL(urlToFind).pathname; // e.g. /s/hash/123-1
        const match = path.match(/\/s\/[^\/]+\/(\d+-\d+)/);
        const identifier = match ? match[1] : null;

        return masterList.findIndex(link => {
            if (identifier) {
                const linkMatch = new URL(link).pathname.match(/\/s\/[^\/]+\/(\d+-\d+)/);
                if (linkMatch && linkMatch[1] === identifier) return true;
            }
            // 備用比對
            return new URL(link).pathname === path;
        });
    } catch (e) {
        return masterList.findIndex(link => link.includes(urlToFind));
    }
}


/**
 * 判斷指定索引在雙頁模式下是否應以單頁顯示（例如首頁封面或最後一頁落單）
 * @param {number} index - 目標槽位索引
 * @returns {boolean}
 */
function isSinglePageSlot(index) {
    if (!window.scriptSettings.doublePageMode) return true;
    if (window.scriptSettings.doublePageCoverSingle && index === 0) return true;
    if (index >= window.navigationContext.masterList.length - 1) return true;
    return false;
}

/**
 * 從本地或背景快取取得指定頁面的圖片網址，若未快取則抓取並寫入快取
 * @param {string} galleryId - 圖庫 ID
 * @param {string} pageUrl - 頁面網址
 * @returns {Promise<string|null>}
 */
async function resolvePageImageUrl(galleryId, pageUrl) {
    if (!pageUrl) return null;
    if (!window.navigationContext.preloadedPages) {
        window.navigationContext.preloadedPages = new Map();
    }
    if (window.navigationContext.preloadedPages.has(pageUrl)) {
        return window.navigationContext.preloadedPages.get(pageUrl);
    }

    const bgResp = await browser.runtime.sendMessage({ type: 'get_all_links', galleryId }).catch(() => null);
    if (bgResp?.preloadedPages) {
        for (const [k, v] of Object.entries(bgResp.preloadedPages)) {
            window.navigationContext.preloadedPages.set(k, v);
        }
        if (bgResp.preloadedPages[pageUrl]) {
            return bgResp.preloadedPages[pageUrl];
        }
    }

    const doc = await fetchAndParsePage(pageUrl);
    const imgUrl = doc?.getElementById('img')?.src || null;
    if (imgUrl) {
        window.navigationContext.preloadedPages.set(pageUrl, imgUrl);
        browser.runtime.sendMessage({ type: 'cache_image', galleryId, pageUrl, imageUrl: imgUrl }).catch(() => {});
    }
    return imgUrl;
}

/**
 * 將當前閱讀頁碼記錄至背景儲存區，供歷史紀錄與繼續閱讀功能使用
 * @param {number} index - 當前圖片索引
 */
function recordCurrentProgress(index) {
    const { masterList, galleryId, totalImageCount, cleanBaseGalleryUrl, backToGalleryUrl } = window.navigationContext;
    if (!galleryId || !masterList || index < 0 || index >= masterList.length) return;
    let effectiveIndex = index;
    if (window.scriptSettings.doublePageMode && !isSinglePageSlot(index) && index + 1 < masterList.length) {
        effectiveIndex = index + 1;
    }
    const pageUrl = masterList[effectiveIndex] || masterList[index];
    const pageNum = parseInt(getPageNumberFromUrl(pageUrl) || '', 10);
    if (!Number.isFinite(pageNum)) return;
    browser.runtime.sendMessage({
        type: 'update_reading_progress',
        galleryId,
        currentPage: pageNum,
        totalPages: totalImageCount || masterList.length,
        lastPageUrl: masterList[index],
        galleryUrl: cleanBaseGalleryUrl || backToGalleryUrl,
    }).catch(() => {});
}

/**
 * 同步狀態列上的雙頁模式與閱讀方向切換按鈕狀態
 */
function updateControlButtonsUI() {
    const doubleBtn = document.getElementById('exh-double-page-btn');
    const coverBtn = document.getElementById('exh-cover-single-btn');
    const dirBtn = document.getElementById('exh-direction-btn');

    const isDouble = Boolean(window.scriptSettings.doublePageMode);
    const isCoverSingle = Boolean(window.scriptSettings.doublePageCoverSingle);
    const isRtl = Boolean(window.scriptSettings.reverseReadingDirection);

    if (doubleBtn) {
        doubleBtn.textContent = isDouble ? '2P 雙頁' : '1P 單頁';
        doubleBtn.classList.toggle('active', isDouble);
    }
    if (coverBtn) {
        coverBtn.style.display = isDouble ? 'inline-flex' : 'none';
        coverBtn.textContent = isCoverSingle ? '封面單頁:開' : '封面單頁:關';
        coverBtn.classList.toggle('active', isCoverSingle);
    }
    if (dirBtn) {
        dirBtn.textContent = isRtl ? '⬅ 右開 (RTL)' : '左開 (LTR) ➡';
        dirBtn.classList.toggle('active', isRtl);
    }
}

/**
 * 當雙頁模式或閱讀方向變更時，重新渲染目前與鄰近槽位
 */
function refreshCurrentSlotsLayout() {
    updateControlButtonsUI();
    const { currentIndex, masterList } = window.navigationContext;
    if (currentIndex < 0 || !masterList.length) return;

    const slider = document.getElementById('exh-image-slider');
    if (slider) {
        const indicesToRefresh = [currentIndex - 2, currentIndex - 1, currentIndex, currentIndex + 1, currentIndex + 2];
        for (const idx of indicesToRefresh) {
            if (idx >= 0 && idx < slider.children.length) {
                const slot = slider.children[idx];
                delete slot.dataset.loading;
                delete slot.dataset.renderedMode;
                slot.innerHTML = '';
            }
        }
    }
    loadSlot(currentIndex - 1);
    loadSlot(currentIndex);
    loadSlot(currentIndex + 1);
    updateStatusText();
}

function createStatusDisplay() {
    if (document.getElementById('exh-status-bar')) return;
    const statusBar = document.createElement('div');
    statusBar.id = 'exh-status-bar';
    statusBar.style.cssText = `
        position: fixed; bottom: 0; left: 0; width: 100%;
        background-color: rgba(20, 20, 20, 0.9); color: #e0e0e0;
        display: flex; justify-content: space-between; align-items: center;
        padding: 5px 15px; font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        z-index: 10001; border-top: 1px solid #444; box-sizing: border-box; height: 55px;
    `;
    const prevPreviewArea = document.createElement('div');
    prevPreviewArea.id = 'exh-prev-previews';
    prevPreviewArea.style.cssText = `display: flex; flex-direction: row-reverse; gap: 8px; align-items: center; overflow-x: auto; flex: 1; justify-content: flex-start;`;

    const statusText = document.createElement('span');
    statusText.id = 'exh-status-text';
    statusText.textContent = 'ExHentai 小幫手：正在初始化...';

    const nextPreviewArea = document.createElement('div');
    nextPreviewArea.id = 'exh-next-previews';
    nextPreviewArea.style.cssText = `display: flex; gap: 8px; align-items: center; overflow-x: auto; flex: 1; justify-content: flex-start;`;

    // 雙頁併排切換按鈕
    const doublePageBtn = document.createElement('button');
    doublePageBtn.id = 'exh-double-page-btn';
    doublePageBtn.className = 'exh-status-ctrl-btn';
    doublePageBtn.title = '切換單頁 / 雙頁併排模式';
    doublePageBtn.addEventListener('click', async () => {
        window.scriptSettings.doublePageMode = !window.scriptSettings.doublePageMode;
        await browser.storage.local.set({ doublePageMode: window.scriptSettings.doublePageMode });
        refreshCurrentSlotsLayout();
    });

    // 首頁封面單頁切換按鈕
    const coverSingleBtn = document.createElement('button');
    coverSingleBtn.id = 'exh-cover-single-btn';
    coverSingleBtn.className = 'exh-status-ctrl-btn';
    coverSingleBtn.title = '切換雙頁模式下第 1 頁是否單獨顯示為封面';
    coverSingleBtn.addEventListener('click', async () => {
        window.scriptSettings.doublePageCoverSingle = !window.scriptSettings.doublePageCoverSingle;
        await browser.storage.local.set({ doublePageCoverSingle: window.scriptSettings.doublePageCoverSingle });
        refreshCurrentSlotsLayout();
    });

    // 閱讀方向 (LTR / RTL) 切換按鈕
    const directionBtn = document.createElement('button');
    directionBtn.id = 'exh-direction-btn';
    directionBtn.className = 'exh-status-ctrl-btn';
    directionBtn.title = '切換翻頁與雙頁排列方向（左開 LTR / 日漫右開 RTL）';
    directionBtn.addEventListener('click', async () => {
        window.scriptSettings.reverseReadingDirection = !window.scriptSettings.reverseReadingDirection;
        await browser.storage.local.set({ reverseReadingDirection: window.scriptSettings.reverseReadingDirection });
        refreshCurrentSlotsLayout();
    });

    // *** 新增：建立返回目錄按鈕 ***
    const exitButtonLink = document.createElement('a');
    exitButtonLink.id = 'exh-exit-btn';
    exitButtonLink.href = window.navigationContext.backToGalleryUrl || '#';
    exitButtonLink.title = exitTooltipText;
    exitButtonLink.innerHTML = `<img src="https://exhentai.org/img/b.png" style="height: 18px; display: block;" referrerpolicy="no-referrer">`;
    exitButtonLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.navigationContext.backToGalleryUrl) {
            window.location.href = window.navigationContext.backToGalleryUrl;
        }
    });

    // *** 新增：建立中央容器 ***
    const centralContainer = document.createElement('div');
    centralContainer.id = 'exh-central-container';
    centralContainer.appendChild(statusText);
    centralContainer.appendChild(doublePageBtn);
    centralContainer.appendChild(coverSingleBtn);
    centralContainer.appendChild(directionBtn);
    centralContainer.appendChild(exitButtonLink);

    const styleSheet = document.createElement("style");
    styleSheet.id = STATUS_STYLE_ID;
    styleSheet.innerText = `
        #exh-prev-previews::-webkit-scrollbar, #exh-next-previews::-webkit-scrollbar { height: 4px; }
        #exh-prev-previews::-webkit-scrollbar-track, #exh-next-previews::-webkit-scrollbar-track { background: #333; }
        #exh-prev-previews::-webkit-scrollbar-thumb, #exh-next-previews::-webkit-scrollbar-thumb { background: #666; border-radius: 2px; }
        .exh-bar-hidden { display: none !important; }
        /* *** 新增：中央容器與按鈕的樣式 *** */
        #exh-central-container { display: flex; align-items: center; gap: 8px; flex-shrink: 0; padding: 0 10px; }
        .exh-status-ctrl-btn {
            background: rgba(255, 255, 255, 0.08);
            color: #ccc;
            border: 1px solid #555;
            border-radius: 4px;
            padding: 3px 8px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
        }
        .exh-status-ctrl-btn:hover { background: rgba(255, 255, 255, 0.18); color: #fff; }
        .exh-status-ctrl-btn.active { background: #2563eb; border-color: #3b82f6; color: #fff; }
        #exh-exit-btn { display: flex; align-items: center; justify-content: center; padding: 6px; border-radius: 5px; transition: background-color 0.2s; }
        #exh-exit-btn:hover { background-color: rgba(255, 255, 255, 0.1); }
    `;
    document.head.appendChild(styleSheet);

    statusBar.appendChild(prevPreviewArea);
    statusBar.appendChild(centralContainer);
    statusBar.appendChild(nextPreviewArea);
    document.body.appendChild(statusBar);
    updateControlButtonsUI();
}

function addPreviewImageToStatus(imageUrl, pageUrl, direction, updateId) {
    if (window.navigationContext.previewUpdateId !== updateId) return;
    const containerId = direction === 'prev' ? 'exh-prev-previews' : 'exh-next-previews';
    const previewArea = document.getElementById(containerId);
    if (!previewArea) return;
    const existingLink = previewArea.querySelector(`a[href="${pageUrl}"]`);
    if (existingLink) return;
    const link = document.createElement('a');
    link.href = pageUrl;
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `height: 40px; width: 40px; border-radius: 3px; border: 1px solid #555; object-fit: cover; display: block;`;
    link.appendChild(img);

    if (direction === 'prev') {
        previewArea.appendChild(link); // For reverse-flex, append works as intended
    } else {
        previewArea.appendChild(link);
    }
}

function updateStatusText() {
    const statusText = document.getElementById('exh-status-text');
    if (!statusText) return;

    const { masterList, currentIndex, totalImageCount } = window.navigationContext;
    const currentUrl = masterList[currentIndex];
    const currentPage = getPageNumberFromUrl(currentUrl) || '?';

    let pageLabel = `${currentPage}`;
    if (window.scriptSettings.doublePageMode && !isSinglePageSlot(currentIndex) && currentIndex + 1 < masterList.length) {
        const secondPage = getPageNumberFromUrl(masterList[currentIndex + 1]);
        if (secondPage) {
            pageLabel = `${currentPage}-${secondPage}`;
        }
    }

    const totalPages = totalImageCount || '?';
    const pageInfo = `${pageLabel} / ${totalPages}`;
    const prevCount = document.getElementById('exh-prev-previews')?.children.length || 0;
    const nextCount = document.getElementById('exh-next-previews')?.children.length || 0;
    let preloadInfo = '';
    if (prevCount > 0 || nextCount > 0) {
        const loadedParts = [];
        if (prevCount > 0) loadedParts.push(`前 ${prevCount}`);
        if (nextCount > 0) loadedParts.push(`後 ${nextCount}`);
        preloadInfo = `| ✅ ${loadedParts.join(' / ')}`;
    }
    statusText.textContent = `${pageInfo} ${preloadInfo}`;
}

function applyFitStyle() {
    const existingStyle = document.getElementById(FIT_STYLE_ID);
    if (existingStyle) existingStyle.remove();
    const statusBar = document.getElementById('exh-status-bar');
    const isBarHidden = statusBar && statusBar.classList.contains('exh-bar-hidden');
    const barHeight = (!isBarHidden && statusBar) ? statusBar.offsetHeight : 0;
    const style = document.createElement('style');
    style.id = FIT_STYLE_ID;
    if (window.scriptSettings.fitToWindow) {
        style.textContent = `
            #exh-viewer { height: calc(100vh - ${barHeight}px) !important; }
            .exh-image-slot { align-items: center !important; }`;
    } else {
        style.textContent = `
            #exh-viewer { height: 100vh !important; overflow-y: auto !important; }
            .exh-image-slot { align-items: flex-start !important; }
            .exh-image-slot img { max-height: none !important; }`;
    }
    document.head.appendChild(style);
}

function setPreviewBarVisibility(shouldHide) {
    const statusBar = document.getElementById('exh-status-bar');
    if (statusBar) {
        statusBar.classList.toggle('exh-bar-hidden', shouldHide);
        applyFitStyle();
    }
}

async function toggleFitToWindow() {
    window.scriptSettings.fitToWindow = !window.scriptSettings.fitToWindow;
    await browser.storage.local.set({ fitToWindow: window.scriptSettings.fitToWindow });
    applyFitStyle();
}

async function togglePreviewBar() {
    window.scriptSettings.hidePreviewBar = !window.scriptSettings.hidePreviewBar;
    await browser.storage.local.set({ hidePreviewBar: window.scriptSettings.hidePreviewBar });
    setPreviewBarVisibility(window.scriptSettings.hidePreviewBar);
}

/**
 * 同步更新滑動槽位，保留已載入圖片的 DOM 節點，避免重建時畫面閃爍或跳動
 * @param {string[]} list - 完整的圖片頁面網址陣列
 */
function rebuildSlider(list) {
    const slider = document.getElementById('exh-image-slider');
    if (!slider) return;

    const existingSlotsByUrl = new Map();
    Array.from(slider.children).forEach(child => {
        if (child.dataset.pageUrl) {
            existingSlotsByUrl.set(child.dataset.pageUrl, child);
        }
    });

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < list.length; i++) {
        const pageUrl = list[i];
        let slot = existingSlotsByUrl.get(pageUrl);
        if (!slot) {
            slot = document.createElement('div');
            slot.className = 'exh-image-slot';
            slot.dataset.pageUrl = pageUrl;
        }
        slot.dataset.index = i;
        fragment.appendChild(slot);
    }

    slider.innerHTML = '';
    slider.appendChild(fragment);
}

/**
 * 在不觸發滑動動畫的情況下，將 slider 定位到指定索引
 * @param {number} index - 目標索引
 */
function syncSliderPositionInstant(index) {
    const slider = document.getElementById('exh-image-slider');
    if (!slider || index < 0) return;
    const prevTransition = slider.style.transition;
    slider.style.transition = 'none';
    slider.style.transform = `translateX(-${index * 100}vw)`;
    // 強制瀏覽器同步計算排版，確保無動畫瞬移生效
    void slider.offsetHeight;
    slider.style.transition = prevTransition;
}

function setSlotError(slot, message, pageIdentifier) {
    while (slot.firstChild) {
        slot.removeChild(slot.firstChild);
    }
    const errorDiv = document.createElement('div');
    errorDiv.style.color = '#ff8a8a';
    errorDiv.style.textAlign = 'center';
    const text1 = document.createTextNode(message);
    errorDiv.appendChild(text1);
    if (pageIdentifier) {
        const br = document.createElement('br');
        const text2 = document.createTextNode(pageIdentifier);
        errorDiv.appendChild(br);
        errorDiv.appendChild(text2);
    }
    slot.appendChild(errorDiv);
}

/**
 * 建立具備破圖智慧重載能力的圖片元素
 * @param {string} galleryId - 圖庫 ID
 * @param {string} pageUrl - 圖片頁面網址
 * @param {string} imgUrl - 圖片網址
 * @param {HTMLElement} slot - 所屬槽位
 * @returns {HTMLImageElement}
 */
function createReaderImageElement(galleryId, pageUrl, imgUrl, slot) {
    const img = document.createElement('img');
    img.onerror = async () => {
        console.warn(`[ExH] 圖片 ${imgUrl} 載入失敗。正在嘗試智慧重載...`);
        img.onerror = null;
        const success = await reloadImageFromAPI(pageUrl, img);
        if (!success) {
            if (slot.children.length <= 1) {
                setSlotError(slot, '圖片重載失敗', pageUrl.split('/').pop());
            }
        } else {
            window.navigationContext.preloadedPages?.set(pageUrl, img.src);
            await browser.runtime.sendMessage({ type: 'cache_image', galleryId, pageUrl, imageUrl: img.src }).catch(() => {});
        }
    };
    img.src = imgUrl;
    return img;
}

async function loadSlot(index) {
    const { masterList, galleryId } = window.navigationContext;
    if (index < 0 || index >= masterList.length) return;
    const slider = document.getElementById('exh-image-slider');
    if (!slider || !slider.children[index]) return;
    const slot = slider.children[index];
    const pageUrl = masterList[index];
    slot.dataset.pageUrl = pageUrl;

    const shouldDouble = window.scriptSettings.doublePageMode && !isSinglePageSlot(index) && (index + 1 < masterList.length);
    const isRtl = Boolean(window.scriptSettings.reverseReadingDirection);
    const targetModeKey = `${shouldDouble ? '2P' : '1P'}_${isRtl ? 'RTL' : 'LTR'}`;

    slot.classList.toggle('exh-double-slot', shouldDouble);
    slot.classList.toggle('exh-rtl-slot', shouldDouble && isRtl);

    if (slot.dataset.loading === 'true' || (slot.children.length > 0 && slot.dataset.renderedMode === targetModeKey)) {
        return;
    }
    slot.dataset.loading = 'true';

    try {
        const primaryUrlPromise = resolvePageImageUrl(galleryId, pageUrl);
        const secondaryPageUrl = shouldDouble ? masterList[index + 1] : null;
        const secondaryUrlPromise = secondaryPageUrl ? resolvePageImageUrl(galleryId, secondaryPageUrl) : Promise.resolve(null);

        const [imgUrl, secondImgUrl] = await Promise.all([primaryUrlPromise, secondaryUrlPromise]);

        if (!imgUrl) {
            setSlotError(slot, '找不到圖片連結', pageUrl.split('/').pop());
            return;
        }

        while (slot.firstChild) slot.removeChild(slot.firstChild);

        const primaryImg = createReaderImageElement(galleryId, pageUrl, imgUrl, slot);
        slot.appendChild(primaryImg);

        if (shouldDouble && secondImgUrl && secondaryPageUrl) {
            const secondaryImg = createReaderImageElement(galleryId, secondaryPageUrl, secondImgUrl, slot);
            slot.appendChild(secondaryImg);
        }

        slot.dataset.renderedMode = targetModeKey;
    } catch (error) {
        console.error(`[ExH] 載入 slot ${index} (${pageUrl}) 時發生嚴重錯誤:`, error);
        setSlotError(slot, '載入時發生錯誤', null);
    } finally {
        delete slot.dataset.loading;
    }
}

async function processLink(pageUrl, direction, preloadedPagesMap, galleryId, updateId) {
    if (window.navigationContext.previewUpdateId !== updateId) return;
    if (window.navigationContext.preloadedPages?.has(pageUrl)) {
        preloadedPagesMap.set(pageUrl, window.navigationContext.preloadedPages.get(pageUrl));
    }
    if (preloadedPagesMap.has(pageUrl)) {
        addPreviewImageToStatus(preloadedPagesMap.get(pageUrl), pageUrl, direction, updateId);
    } else {
        const doc = await fetchAndParsePage(pageUrl);
        if (window.navigationContext.previewUpdateId !== updateId) return;
        if (doc) {
            const imageElement = doc.getElementById('img');
            if (imageElement && imageElement.src) {
                const imageUrl = imageElement.src;
                new Image().src = imageUrl;
                addPreviewImageToStatus(imageUrl, pageUrl, direction, updateId);
                window.navigationContext.preloadedPages?.set(pageUrl, imageUrl);
                await browser.runtime.sendMessage({ type: 'cache_image', galleryId, pageUrl, imageUrl });
            }
        }
    }
}

async function updatePreviewBar() {
    const { masterList, currentIndex, galleryId } = window.navigationContext;
    if (!masterList || currentIndex === -1 || !galleryId) return;

    const currentUpdateId = ++window.navigationContext.previewUpdateId;
    document.getElementById('exh-prev-previews').innerHTML = '';
    document.getElementById('exh-next-previews').innerHTML = '';
    updateStatusText();

    const { preloadedPages } = await browser.runtime.sendMessage({ type: 'get_all_links', galleryId });
    const preloadedPagesMap = new Map(Object.entries(preloadedPages || {}));

    // *** 修改重點：產生由近到遠的交錯載入順序，並將同一距離的頁面並行載入以提升速度 ***
    const preloadCount = window.scriptSettings.preloadCount;
    for (let i = 1; i <= preloadCount; i++) {
        if (window.navigationContext.previewUpdateId !== currentUpdateId) return;
        
        const nextIndex = currentIndex + i;
        const prevIndex = currentIndex - i;
        const batch = [];

        // 新增下一頁的連結 (如果存在)
        if (nextIndex < masterList.length) {
            batch.push({ url: masterList[nextIndex], direction: 'next' });
        }
        // 新增上一頁的連結 (如果存在)
        if (prevIndex >= 0) {
            batch.push({ url: masterList[prevIndex], direction: 'prev' });
        }

        // 並行處理同一個距離的 next 和 prev 頁面，大幅加快整體載入速度
        if (batch.length > 0) {
            await Promise.all(batch.map(item => 
                processLink(item.url, item.direction, preloadedPagesMap, galleryId, currentUpdateId)
            ));
        }
    }

    if (window.navigationContext.previewUpdateId === currentUpdateId) updateStatusText();
}

/**
 * 取得目前已索引的圖庫分頁編號陣列（優先使用本地 Map，防止 MV3 背景腳本休眠遺失）
 * @returns {Promise<number[]>}
 */
async function getIndexedPageNumbers() {
    const { galleryId, indexedPages } = window.navigationContext;
    if (indexedPages && indexedPages.size > 0) {
        return Array.from(indexedPages.keys()).map(Number);
    }
    const galleryData = await browser.runtime.sendMessage({ type: 'get_gallery_data', galleryId }).catch(() => null);
    return galleryData && galleryData.pages ? Object.keys(galleryData.pages).map(Number) : [];
}

async function proactiveIndexCheck(currentIndex) {
    try {
        const { galleryId, totalGalleryPages, cleanBaseGalleryUrl, backToGalleryUrl } = window.navigationContext;
        const baseUrl = cleanBaseGalleryUrl || backToGalleryUrl;
        const indexedPageNumbers = await getIndexedPageNumbers();
        const lastIndexedPage = indexedPageNumbers.length > 0 ? Math.max(...indexedPageNumbers) : -1;
        const lastKnownImageIndex = window.navigationContext.masterList.length - 1;
        const triggerIndex = lastKnownImageIndex - window.scriptSettings.preloadCount;

        if (currentIndex >= triggerIndex && lastIndexedPage < totalGalleryPages - 1) {
            const nextPageIndex = lastIndexedPage + 1;
            if (window.navigationContext.isIndexingPage === nextPageIndex) return;
            window.navigationContext.isIndexingPage = nextPageIndex;

            const previousLength = window.navigationContext.masterList.length;
            console.log(`[ExH] 預測性觸發：已到達頁面 ${currentIndex + 1}，開始索引下一個圖庫分頁 (${nextPageIndex + 1})。`);
            await ensurePagesAreIndexed(galleryId, [nextPageIndex], baseUrl);

            const newMasterList = window.navigationContext.masterList;
            if (newMasterList.length > previousLength) {
                console.log(`[ExH] 預測性更新 masterList：從 ${previousLength} 到 ${newMasterList.length} 個項目。`);
                rebuildSlider(newMasterList);

                // 若目前不在翻頁動畫中，根據當前網址重新校準索引與位置
                if (!window.navigationContext.isNavigating) {
                    const resolvedIdx = findIndexInMasterList(newMasterList, window.location.href);
                    if (resolvedIdx !== -1 && resolvedIdx !== window.navigationContext.currentIndex) {
                        window.navigationContext.currentIndex = resolvedIdx;
                        syncSliderPositionInstant(resolvedIdx);
                    }
                    const actualCurrentIndex = window.navigationContext.currentIndex;
                    loadSlot(actualCurrentIndex - 1);
                    loadSlot(actualCurrentIndex);
                    loadSlot(actualCurrentIndex + 1);
                    updatePreviewBar();
                }
            }
            window.navigationContext.isIndexingPage = null;
        }
    } catch (error) {
        console.error("[ExH] 預測性索引檢查時發生錯誤:", error);
        window.navigationContext.isIndexingPage = null;
    }
}

async function navigateTo(targetIndex, targetUrlOverride = null) {
    if (window.navigationContext.isNavigating) {
        return;
    }
    window.navigationContext.isNavigating = true;
    try {
        const { galleryId, totalGalleryPages, cleanBaseGalleryUrl, backToGalleryUrl } = window.navigationContext;
        const baseUrl = cleanBaseGalleryUrl || backToGalleryUrl;
        const currentUrlBeforeWait = window.navigationContext.masterList[window.navigationContext.currentIndex] || window.location.href;
        const relativeStep = targetIndex - window.navigationContext.currentIndex;

        // 若預測性索引 (proactiveIndexCheck) 正在進行中，先等待佇列完成，避免重複抓頁或跳頁
        if (window.navigationContext.isIndexingPage !== null) {
            await ensurePagesAreIndexed(galleryId, [], baseUrl);
            rebuildSlider(window.navigationContext.masterList);
            const anchoredIdx = findIndexInMasterList(window.navigationContext.masterList, currentUrlBeforeWait);
            if (anchoredIdx !== -1) {
                window.navigationContext.currentIndex = anchoredIdx;
                syncSliderPositionInstant(anchoredIdx);
                targetIndex = targetUrlOverride
                    ? findIndexInMasterList(window.navigationContext.masterList, targetUrlOverride)
                    : anchoredIdx + relativeStep;
            }
        }

        if (targetIndex < 0) {
            const indexedPageNumbers = await getIndexedPageNumbers();
            const firstIndexedPage = indexedPageNumbers.length > 0 ? Math.min(...indexedPageNumbers) : -1;
            if (firstIndexedPage > 0) {
                const prevPageToIndex = firstIndexedPage - 1;
                const previousMasterListLength = window.navigationContext.masterList.length;
                await ensurePagesAreIndexed(galleryId, [prevPageToIndex], baseUrl);
                const newMasterList = window.navigationContext.masterList;
                if (newMasterList.length > previousMasterListLength) {
                    rebuildSlider(newMasterList);
                    const newCurrentIdx = findIndexInMasterList(newMasterList, currentUrlBeforeWait);
                    if (newCurrentIdx !== -1) {
                        window.navigationContext.currentIndex = newCurrentIdx;
                        syncSliderPositionInstant(newCurrentIdx);
                        targetIndex = newCurrentIdx + relativeStep;
                    } else {
                        const addedCount = newMasterList.length - previousMasterListLength;
                        window.navigationContext.currentIndex += addedCount;
                        syncSliderPositionInstant(window.navigationContext.currentIndex);
                        targetIndex = window.navigationContext.currentIndex - 1;
                    }
                } else {
                    return;
                }
            } else {
                return;
            }
        }

        if (targetIndex >= window.navigationContext.masterList.length) {
            const indexedPageNumbers = await getIndexedPageNumbers();
            const lastIndexedPage = indexedPageNumbers.length > 0 ? Math.max(...indexedPageNumbers) : -1;

            if (lastIndexedPage < totalGalleryPages - 1) {
                const nextPageToIndex = lastIndexedPage + 1;
                const previousMasterListLength = window.navigationContext.masterList.length;
                await ensurePagesAreIndexed(galleryId, [nextPageToIndex], baseUrl);

                const newMasterList = window.navigationContext.masterList;
                if (newMasterList.length > previousMasterListLength) {
                    rebuildSlider(newMasterList);
                    const newCurrentIdx = findIndexInMasterList(newMasterList, currentUrlBeforeWait);
                    if (newCurrentIdx !== -1) {
                        window.navigationContext.currentIndex = newCurrentIdx;
                        syncSliderPositionInstant(newCurrentIdx);
                        targetIndex = targetUrlOverride
                            ? findIndexInMasterList(newMasterList, targetUrlOverride)
                            : newCurrentIdx + relativeStep;
                    }
                } else {
                    return;
                }
            } else {
                return;
            }
        }

        const targetUrl = window.navigationContext.masterList[targetIndex];
        if (targetUrl) {
            history.pushState(null, '', targetUrl);
            window.navigationContext.currentIndex = targetIndex;
            window.navigationContext.lastKnownUrlIndex = targetIndex;
            const slider = document.getElementById('exh-image-slider');
            slider.style.transform = `translateX(-${targetIndex * 100}vw)`;
            proactiveIndexCheck(targetIndex);
            recordCurrentProgress(targetIndex);
        } else {
            return;
        }
        loadSlot(targetIndex - 1);
        loadSlot(targetIndex);
        loadSlot(targetIndex + 1);
        if (window.scriptSettings.doublePageMode) {
            loadSlot(targetIndex + 2);
        }
        updatePreviewBar();

    } catch (error) {
        console.error(`[ExH] 導覽至索引 ${targetIndex} 時發生錯誤:`, error);
    } finally {
        window.navigationContext.isNavigating = false;
    }
}

function handleHorizontalKeyDown(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
    const key = event.key.toLowerCase();
    
    const currentUrl = window.location.href;
    const resolvedIndexFromPath = findIndexInMasterList(window.navigationContext.masterList, currentUrl);
    const baseIndex = resolvedIndexFromPath !== -1 ? resolvedIndexFromPath : window.navigationContext.currentIndex;
    
    if (resolvedIndexFromPath !== -1 && resolvedIndexFromPath !== window.navigationContext.currentIndex) {
        window.navigationContext.currentIndex = resolvedIndexFromPath;
    }
    if (key === window.scriptSettings.keyFit) { toggleFitToWindow(); return; }
    if (key === window.scriptSettings.keyHide) { togglePreviewBar(); return; }
    if (key === window.scriptSettings.keyExit) {
        if (window.navigationContext.backToGalleryUrl) window.location.href = window.navigationContext.backToGalleryUrl;
        return;
    }
    if (key === window.scriptSettings.keyClear) {
        if (window.navigationContext.preloadedPages) {
            window.navigationContext.preloadedPages.clear();
        }
        browser.runtime.sendMessage({ type: 'clear_all_cache' }).then(response => {
            if (response && response.success) {
                const statusText = document.getElementById('exh-status-text');
                if (statusText) {
                    statusText.textContent = `✅ 已清除 ${response.clearedCount} 個圖庫的快取！`;
                    setTimeout(() => { updateStatusText(); }, 2000);
                }
            }
        });
        return;
    }
    if (key === 'arrowleft' || key === window.scriptSettings.keyPrev || key === 'arrowright' || key === window.scriptSettings.keyNext) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const isLeftAction = (key === 'arrowleft' || key === window.scriptSettings.keyPrev);
        const isRtl = Boolean(window.scriptSettings.reverseReadingDirection);
        const shouldGoForward = isRtl ? isLeftAction : !isLeftAction;

        if (shouldGoForward) {
            const forwardStep = (window.scriptSettings.doublePageMode && !isSinglePageSlot(baseIndex)) ? 2 : 1;
            const nextTarget = Math.min(window.navigationContext.masterList.length, baseIndex + forwardStep);
            // 若在目前已索引的尾端剛好只剩 1 頁但後面還有未索引分頁，則維持 +forwardStep 觸發跨頁索引
            const effectiveTarget = (baseIndex + forwardStep < window.navigationContext.totalImageCount)
                ? baseIndex + forwardStep
                : Math.min(window.navigationContext.masterList.length - 1, nextTarget);
            navigateTo(effectiveTarget);
        } else {
            let backwardStep = 1;
            if (window.scriptSettings.doublePageMode) {
                if (baseIndex === 1 && window.scriptSettings.doublePageCoverSingle) {
                    backwardStep = 1;
                } else {
                    backwardStep = 2;
                }
            }
            navigateTo(baseIndex - backwardStep);
        }
    }
}

function runHorizontalSliderReader() {
    if (!hasBoundPreviewClick) {
        document.body.addEventListener('click', handlePreviewClick, true);
        hasBoundPreviewClick = true;
    }

    createStatusDisplay();
    setPreviewBarVisibility(window.scriptSettings.hidePreviewBar);

    const viewer = document.createElement('div');
    viewer.id = 'exh-viewer';
    const slider = document.createElement('div');
    slider.id = 'exh-image-slider';
    originalBodyOverflow = document.body.style.overflow || '';
    hiddenElements = [];
    Array.from(document.body.children).forEach(child => {
        if (child.id !== 'exh-status-bar') {
            hiddenElements.push({ element: child, display: child.style.display || '' });
            child.style.display = 'none';
        }
    });
    document.body.style.overflow = 'hidden';
    document.body.appendChild(viewer);
    viewer.appendChild(slider);
    const viewerStyle = document.createElement('style');
    viewerStyle.id = VIEWER_STYLE_ID;
    viewerStyle.textContent = `
        #exh-viewer { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; overflow: hidden; z-index: 10000; }
        #exh-image-slider { display: flex; height: 100%; transition: transform 0.3s ease-in-out; }
        .exh-image-slot { width: 100vw; height: 100%; flex-shrink: 0; display: flex; justify-content: center; align-items: center; }
        .exh-image-slot img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
        .exh-image-slot.exh-double-slot { gap: 4px; }
        .exh-image-slot.exh-double-slot img { max-width: calc(50% - 2px); max-height: 100%; }
        .exh-image-slot.exh-rtl-slot { flex-direction: row-reverse; }`;
    document.head.appendChild(viewerStyle);

    const statusText = document.getElementById('exh-status-text');
    statusText.textContent = `正在初始化水平閱讀模式...`;

    const currentUrl = window.location.href;

    // --- 修改：完全廢除 pageNumber - 1，使用精準網址比對 ---
    let currentIndex = findIndexInMasterList(window.navigationContext.masterList, currentUrl);

    if (currentIndex === -1) {
        // 如果連精準比對都失敗，再使用原先的 pageNumber - 1 當作最後手段
        const pageNumber = parseInt(getPageNumberFromUrl(currentUrl) || '', 10);
        const fallbackIndex = Number.isFinite(pageNumber) ? pageNumber - 1 : -1;
        currentIndex = (fallbackIndex >= 0 && fallbackIndex < window.navigationContext.masterList.length) ? fallbackIndex : 0;
        console.warn(`[ExH] 無法在 masterList 找到網址，退回備用索引: ${currentIndex}`);
    }

    if (currentIndex === -1) {
        statusText.textContent = '❌ 錯誤：在當前索引範圍中找不到此頁面。';
        return;
    }

    rebuildSlider(window.navigationContext.masterList);
    slider.style.transition = 'none';

    window.navigationContext.currentIndex = currentIndex;
    slider.style.transform = `translateX(-${currentIndex * 100}vw)`;
    loadSlot(currentIndex - 1);
    loadSlot(currentIndex);
    loadSlot(currentIndex + 1);
    if (window.scriptSettings.doublePageMode) {
        loadSlot(currentIndex + 2);
    }
    updatePreviewBar();
    recordCurrentProgress(currentIndex);

    setTimeout(() => { slider.style.transition = ''; }, 50);
    applyFitStyle();
    document.addEventListener('keydown', handleHorizontalKeyDown, true);
}

function handlePreviewClick(e) {
    const link = e.target.closest('#exh-prev-previews a, #exh-next-previews a');
    if (link) {
        e.preventDefault();
        const targetUrl = link.href;
        const targetIndex = findIndexInMasterList(window.navigationContext.masterList, targetUrl);
        if (targetIndex !== -1) navigateTo(targetIndex, targetUrl);
    }
}

function restoreBodyState() {
    hiddenElements.forEach(({ element, display }) => {
        if (element && element.style) {
            element.style.display = display || '';
        }
    });
    hiddenElements = [];
    document.body.style.overflow = originalBodyOverflow;
}

let hasBoundStorageListener = false;

// *** 新增：監聽來自 popup 的即時設定變更 ***
function listenForSettingsChanges() {
    if (hasBoundStorageListener) return;
    hasBoundStorageListener = true;

    browser.storage.onChanged.addListener((changes, area) => {
        // 確保監聽器只在本地儲存區變更，且水平閱讀器處於啟用狀態時作用
        if (area !== 'local' || !document.getElementById('exh-viewer')) {
            return;
        }

        // 處理「圖片適應視窗」的變更
        if (changes.fitToWindow) {
            const newValue = changes.fitToWindow.newValue;
            window.scriptSettings.fitToWindow = newValue;
            applyFitStyle();
        }

        // 處理「隱藏預覽列」的變更
        if (changes.hidePreviewBar) {
            const newValue = changes.hidePreviewBar.newValue;
            window.scriptSettings.hidePreviewBar = newValue;
            setPreviewBarVisibility(newValue);
        }

        // 處理「雙頁模式 / 封面單頁 / 閱讀方向」的變更
        if (changes.doublePageMode || changes.doublePageCoverSingle || changes.reverseReadingDirection) {
            if (changes.doublePageMode !== undefined) {
                window.scriptSettings.doublePageMode = changes.doublePageMode.newValue;
            }
            if (changes.doublePageCoverSingle !== undefined) {
                window.scriptSettings.doublePageCoverSingle = changes.doublePageCoverSingle.newValue;
            }
            if (changes.reverseReadingDirection !== undefined) {
                window.scriptSettings.reverseReadingDirection = changes.reverseReadingDirection.newValue;
            }
            refreshCurrentSlotsLayout();
        }

        // 處理「預先載入數量」的變更
        if (changes.preloadCount) {
            window.scriptSettings.preloadCount = changes.preloadCount.newValue;
            updatePreviewBar();
        }
    });
}


// *** 新增：非同步啟動函式 ***
async function setupAndRunReader() {
    try {
        const { messages } = await browser.runtime.sendMessage({
            type: 'get_i18n_messages',
            keys: ['keyExitWithShortcut']
        });
        if (messages && messages.keyExitWithShortcut) {
            const key = window.scriptSettings.keyExit || 'E';
            exitTooltipText = messages.keyExitWithShortcut.replace('{key}', key.toUpperCase());
        }
    } catch (e) {
        console.warn('[ExH] 讀取閱讀器 i18n 訊息時失敗。', e);
    }
    runHorizontalSliderReader();
}

export function initHorizontalReader(ensurePagesFunc) {
    if (hasInitializedHorizontalReader) {
        console.warn('[ExH] 水平閱讀器模組已初始化，跳過重複執行。');
        return;
    }
    hasInitializedHorizontalReader = true;
    ensurePagesAreIndexed = ensurePagesFunc;
    setupAndRunReader();
    listenForSettingsChanges(); // <<< 在此處呼叫新的監聽器
}

export function teardownHorizontalReader() {
    const viewer = document.getElementById('exh-viewer');
    if (viewer) viewer.remove();

    const statusBar = document.getElementById('exh-status-bar');
    if (statusBar) statusBar.remove();

    const viewerStyle = document.getElementById(VIEWER_STYLE_ID);
    if (viewerStyle) viewerStyle.remove();

    const fitStyle = document.getElementById(FIT_STYLE_ID);
    if (fitStyle) fitStyle.remove();

    const statusStyle = document.getElementById(STATUS_STYLE_ID);
    if (statusStyle) statusStyle.remove();

    document.removeEventListener('keydown', handleHorizontalKeyDown, true);
    if (hasBoundPreviewClick) {
        document.body.removeEventListener('click', handlePreviewClick, true);
        hasBoundPreviewClick = false;
    }

    restoreBodyState();
    hasInitializedHorizontalReader = false;
}