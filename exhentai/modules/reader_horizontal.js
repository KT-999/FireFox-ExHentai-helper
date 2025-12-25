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
    centralContainer.appendChild(exitButtonLink);

    const styleSheet = document.createElement("style");
    styleSheet.id = STATUS_STYLE_ID;
    styleSheet.innerText = `
        #exh-prev-previews::-webkit-scrollbar, #exh-next-previews::-webkit-scrollbar { height: 4px; }
        #exh-prev-previews::-webkit-scrollbar-track, #exh-next-previews::-webkit-scrollbar-track { background: #333; }
        #exh-prev-previews::-webkit-scrollbar-thumb, #exh-next-previews::-webkit-scrollbar-thumb { background: #666; border-radius: 2px; }
        .exh-bar-hidden { display: none !important; }
        /* *** 新增：中央容器與按鈕的樣式 *** */
        #exh-central-container { display: flex; align-items: center; gap: 15px; flex-shrink: 0; }
        #exh-exit-btn { display: flex; align-items: center; justify-content: center; padding: 6px; border-radius: 5px; transition: background-color 0.2s; }
        #exh-exit-btn:hover { background-color: rgba(255, 255, 255, 0.1); }
    `;
    document.head.appendChild(styleSheet);

    statusBar.appendChild(prevPreviewArea);
    statusBar.appendChild(centralContainer);
    statusBar.appendChild(nextPreviewArea);
    document.body.appendChild(statusBar);
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

    // --- 修改：使用新的輔助函式 ---
    const currentUrl = window.navigationContext.masterList[window.navigationContext.currentIndex];
    const currentPage = getPageNumberFromUrl(currentUrl) || '?';

    const totalPages = window.navigationContext.totalImageCount || '?';
    const pageInfo = `${currentPage} / ${totalPages}`;
    const prevCount = document.getElementById('exh-prev-previews').children.length;
    const nextCount = document.getElementById('exh-next-previews').children.length;
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
            .exh-image-slot { align-items: flex-start !important; }`;
    } else {
        style.textContent = `
            #exh-viewer { height: 100vh !important; }
            .exh-image-slot { align-items: center !important; }`;
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

function rebuildSlider(list) {
    const slider = document.getElementById('exh-image-slider');
    if (!slider) return;
    slider.innerHTML = '';
    for (let i = 0; i < list.length; i++) {
        const slot = document.createElement('div');
        slot.className = 'exh-image-slot';
        slot.dataset.index = i;
        slider.appendChild(slot);
    }
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

async function loadSlot(index) {
    if (index < 0 || index >= window.navigationContext.masterList.length) return;
    const slider = document.getElementById('exh-image-slider');
    if (!slider || !slider.children[index]) return;
    const slot = slider.children[index];
    if (slot.dataset.loading === 'true' || slot.children.length > 0) return;
    slot.dataset.loading = 'true';
    const pageUrl = window.navigationContext.masterList[index];
    try {
        const doc = await fetchAndParsePage(pageUrl);
        if (!doc) throw new Error("無法解析頁面文檔。");
        let imgUrl = doc.getElementById('img')?.src;
        if (!imgUrl) {
            setSlotError(slot, '找不到圖片連結', pageUrl.split('/').pop());
            return;
        }
        while (slot.firstChild) slot.removeChild(slot.firstChild);
        const img = document.createElement('img');
        img.onerror = async () => {
            console.warn(`[ExH] 圖片 ${imgUrl} 載入失敗。正在嘗試 API 智慧重載...`);
            img.onerror = null;
            const success = await reloadImageFromAPI(pageUrl, img);
            if (!success) {
                setSlotError(slot, '圖片重載失敗', pageUrl.split('/').pop());
            }
        };
        img.src = imgUrl;
        slot.appendChild(img);
    } catch (error) {
        console.error(`[ExH] 載入 slot ${index} (${pageUrl}) 時發生嚴重錯誤:`, error);
        setSlotError(slot, '載入時發生錯誤', null);
    } finally {
        delete slot.dataset.loading;
    }
}

async function processLink(pageUrl, direction, preloadedPagesMap, galleryId, updateId) {
    if (window.navigationContext.previewUpdateId !== updateId) return;
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

    // *** 修改重點：產生由近到遠的交錯載入順序 ***
    const linksToProcess = [];
    const preloadCount = window.scriptSettings.preloadCount;
    for (let i = 1; i <= preloadCount; i++) {
        const nextIndex = currentIndex + i;
        const prevIndex = currentIndex - i;

        // 新增下一頁的連結 (如果存在)
        if (nextIndex < masterList.length) {
            linksToProcess.push({ url: masterList[nextIndex], direction: 'next' });
        }
        // 新增上一頁的連結 (如果存在)
        if (prevIndex >= 0) {
            linksToProcess.push({ url: masterList[prevIndex], direction: 'prev' });
        }
    }

    for (const item of linksToProcess) {
        if (window.navigationContext.previewUpdateId !== currentUpdateId) return;
        await processLink(item.url, item.direction, preloadedPagesMap, galleryId, currentUpdateId);
    }

    if (window.navigationContext.previewUpdateId === currentUpdateId) updateStatusText();
}

async function proactiveIndexCheck(currentIndex) {
    try {
        const { galleryId, totalGalleryPages, backToGalleryUrl, masterList } = window.navigationContext;
        const galleryData = await browser.runtime.sendMessage({ type: 'get_gallery_data', galleryId });
        if (!galleryData || !galleryData.pages) return;
        const indexedPageNumbers = Object.keys(galleryData.pages).map(Number);
        const lastIndexedPage = indexedPageNumbers.length > 0 ? Math.max(...indexedPageNumbers) : -1;
        const lastKnownImageIndex = masterList.length - 1;
        const triggerIndex = lastKnownImageIndex - window.scriptSettings.preloadCount;
        if (currentIndex >= triggerIndex && lastIndexedPage < totalGalleryPages - 1) {
            const nextPageIndex = lastIndexedPage + 1;
            if (window.navigationContext.isIndexingPage === nextPageIndex) return;
            window.navigationContext.isIndexingPage = nextPageIndex;
            console.log(`[ExH] 預測性觸發：已到達頁面 ${currentIndex + 1}，開始索引下一個圖庫分頁 (${nextPageIndex + 1})。`);
            await ensurePagesAreIndexed(galleryId, [nextPageIndex], backToGalleryUrl);
            const { masterList: newMasterList } = await browser.runtime.sendMessage({ type: 'get_all_links', galleryId });
            if (newMasterList.length > masterList.length) {
                console.log(`[ExH] 預測性更新 masterList：從 ${masterList.length} 到 ${newMasterList.length} 個項目。`);
                window.navigationContext.masterList = newMasterList;
                rebuildSlider(newMasterList);
                loadSlot(currentIndex - 1);
                loadSlot(currentIndex);
                loadSlot(currentIndex + 1);
                updatePreviewBar();
            }
            window.navigationContext.isIndexingPage = null;
        }
    } catch (error) {
        console.error("[ExH] 預測性索引檢查時發生錯誤:", error);
        window.navigationContext.isIndexingPage = null;
    }
}

async function navigateTo(targetIndex) {
    if (targetIndex < 0 || window.navigationContext.isNavigating) {
        return;
    }
    window.navigationContext.isNavigating = true;
    try {
        if (targetIndex >= window.navigationContext.masterList.length) {
            console.log(`[ExH] 觸發邊界擴展，目標索引: ${targetIndex}`);
            const { galleryId, totalGalleryPages, backToGalleryUrl } = window.navigationContext;
            let galleryData = await browser.runtime.sendMessage({ type: 'get_gallery_data', galleryId });

            const indexedPageNumbers = galleryData ? Object.keys(galleryData.pages).map(Number) : [];
            const lastIndexedPage = indexedPageNumbers.length > 0 ? Math.max(...indexedPageNumbers) : -1;

            if (lastIndexedPage < totalGalleryPages - 1) {
                const nextPageToIndex = lastIndexedPage + 1;
                await ensurePagesAreIndexed(galleryId, [nextPageToIndex], backToGalleryUrl);

                const { masterList: newMasterList } = await browser.runtime.sendMessage({ type: 'get_all_links', galleryId });
                if (newMasterList.length > window.navigationContext.masterList.length) {
                    window.navigationContext.masterList = newMasterList;
                    rebuildSlider(newMasterList);
                } else {
                    console.warn("[ExH] 索引完成後，沒有新的頁面可供導覽。");
                    return;
                }
            } else {
                console.log("[ExH] 已到達圖庫結尾，無法導覽至下一頁。");
                return;
            }
        }

        const targetUrl = window.navigationContext.masterList[targetIndex];
        if (targetUrl) {
            history.pushState(null, '', targetUrl);
            window.navigationContext.currentIndex = targetIndex;
            window.navigationContext.lastKnownUrlIndex = targetIndex;
            proactiveIndexCheck(targetIndex);
            const slider = document.getElementById('exh-image-slider');
            slider.style.transform = `translateX(-${targetIndex * 100}vw)`;
        } else {
            return;
        }
        loadSlot(targetIndex - 1);
        loadSlot(targetIndex);
        loadSlot(targetIndex + 1);
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
    const pageNumber = parseInt(getPageNumberFromUrl(window.location.href) || '', 10);
    const urlIndex = Number.isFinite(pageNumber) ? pageNumber - 1 : null;
    const lastKnownUrlIndex = window.navigationContext.lastKnownUrlIndex ?? null;
    const shouldUseUrlIndex = urlIndex !== null
        && (lastKnownUrlIndex === null || urlIndex >= lastKnownUrlIndex);
    const baseIndex = shouldUseUrlIndex ? urlIndex : window.navigationContext.currentIndex;
    if (shouldUseUrlIndex) {
        window.navigationContext.currentIndex = urlIndex;
    }
    if (key === window.scriptSettings.keyFit) { toggleFitToWindow(); return; }
    if (key === window.scriptSettings.keyHide) { togglePreviewBar(); return; }
    if (key === window.scriptSettings.keyExit) {
        if (window.navigationContext.backToGalleryUrl) window.location.href = window.navigationContext.backToGalleryUrl;
        return;
    }
    if (key === window.scriptSettings.keyClear) {
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
        if (key === 'arrowleft' || key === window.scriptSettings.keyPrev) {
            navigateTo(baseIndex - 1);
        } else {
            navigateTo(baseIndex + 1);
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
        .exh-image-slot img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }`;
    document.head.appendChild(viewerStyle);

    const statusText = document.getElementById('exh-status-text');
    statusText.textContent = `正在初始化水平閱讀模式...`;

    const currentPath = window.location.pathname;

    const currentUrl = window.location.href;

    const pageNumber = parseInt(getPageNumberFromUrl(currentUrl) || '', 10);
    let currentIndex = Number.isFinite(pageNumber) ? pageNumber - 1 : -1;

    if (currentIndex < 0 || currentIndex >= window.navigationContext.masterList.length) {
        // --- 修改：使用更精準的 Pathname 比對來取代 includes ---
        currentIndex = window.navigationContext.masterList.findIndex(link => {
            try {
                return new URL(link).pathname === currentPath;
            } catch (e) {
                // 如果 URL 格式錯誤，則退回舊方法
                return link.includes(currentPath);
            }
        });
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
    updatePreviewBar();

    setTimeout(() => { slider.style.transition = 'transform 0.3s ease-in-out;'; }, 50);
    applyFitStyle();
    document.addEventListener('keydown', handleHorizontalKeyDown, true);
}

function handlePreviewClick(e) {
    const link = e.target.closest('#exh-prev-previews a, #exh-next-previews a');
    if (link) {
        e.preventDefault();
        const targetUrl = link.href;
        const targetIndex = window.navigationContext.masterList.findIndex(url => url === targetUrl);
        if (targetIndex !== -1) navigateTo(targetIndex);
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

// *** 新增：監聽來自 popup 的即時設定變更 ***
function listenForSettingsChanges() {
    browser.storage.onChanged.addListener((changes, area) => {
        // 確保監聽器只在本地儲存區變更，且水平閱讀器處於啟用狀態時作用
        if (area !== 'local' || !document.getElementById('exh-viewer')) {
            return;
        }

        // 處理「圖片適應視窗」的變更
        if (changes.fitToWindow) {
            const newValue = changes.fitToWindow.newValue;
            // 更新全域設定物件，以確保與快捷鍵狀態同步
            window.scriptSettings.fitToWindow = newValue;
            // 即時套用視覺變更
            applyFitStyle();
            console.log(`[ExH] "圖片適應視窗" 設定已變更為: ${newValue}`);
        }

        // 處理「隱藏預覽列」的變更
        if (changes.hidePreviewBar) {
            const newValue = changes.hidePreviewBar.newValue;
            // 更新全域設定物件
            window.scriptSettings.hidePreviewBar = newValue;
            // 即時套用視覺變更
            setPreviewBarVisibility(newValue);
            console.log(`[ExH] "隱藏預覽列" 設定已變更為: ${newValue}`);
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

    document.removeEventListener('keydown', handleHorizontalKeyDown);
    if (hasBoundPreviewClick) {
        document.body.removeEventListener('click', handlePreviewClick, true);
        hasBoundPreviewClick = false;
    }

    restoreBodyState();
    hasInitializedHorizontalReader = false;
}