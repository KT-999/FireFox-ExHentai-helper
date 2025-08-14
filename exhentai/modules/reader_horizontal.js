/**
 * 水平翻頁閱讀器模組 (v1.1)
 */
import { fetchAndParsePage, reloadImageFromAPI } from './utils.js';

const FIT_STYLE_ID = 'exh-helper-fit-style';
const VIEWER_STYLE_ID = 'exh-helper-viewer-style';
let ensurePagesAreIndexed; // 由主模組傳入

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
    statusText.style.cssText = `padding: 0 20px; flex-shrink: 0; text-align: center;`;
    const nextPreviewArea = document.createElement('div');
    nextPreviewArea.id = 'exh-next-previews';
    nextPreviewArea.style.cssText = `display: flex; gap: 8px; align-items: center; overflow-x: auto; flex: 1; justify-content: flex-start;`;
    
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        #exh-prev-previews::-webkit-scrollbar, #exh-next-previews::-webkit-scrollbar { height: 4px; }
        #exh-prev-previews::-webkit-scrollbar-track, #exh-next-previews::-webkit-scrollbar-track { background: #333; }
        #exh-prev-previews::-webkit-scrollbar-thumb, #exh-next-previews::-webkit-scrollbar-thumb { background: #666; border-radius: 2px; }
        .exh-bar-hidden { display: none !important; }
    `;
    document.head.appendChild(styleSheet);
    
    statusBar.appendChild(prevPreviewArea);
    statusBar.appendChild(statusText);
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
    previewArea.appendChild(link);
}

function updateStatusText() {
    const statusText = document.getElementById('exh-status-text');
    if (!statusText) return;
    const currentPageMatch = (window.navigationContext.masterList[window.navigationContext.currentIndex] || '').match(/-(\d+)$/);
    const currentPage = currentPageMatch ? currentPageMatch[1] : '?';
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
    const prevLinks = masterList.slice(Math.max(0, currentIndex - window.scriptSettings.preloadCount), currentIndex).reverse();
    const nextLinks = masterList.slice(currentIndex + 1, currentIndex + 1 + window.scriptSettings.preloadCount);
    const linksToProcess = [...prevLinks.map(url => ({ url, direction: 'prev' })), ...nextLinks.map(url => ({ url, direction: 'next' }))];
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
    if (targetIndex < 0 || window.navigationContext.isNavigating) return;
    if (targetIndex >= window.navigationContext.masterList.length) {
        console.warn("[ExH] 觸發了邊界擴展，正常情況應由預測性索引處理。");
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
                window.navigationContext.isNavigating = false;
                return;
            }
        } else {
             return;
        }
    }
    window.navigationContext.isNavigating = true;
    window.navigationContext.currentIndex = targetIndex;
    proactiveIndexCheck(targetIndex);
    const slider = document.getElementById('exh-image-slider');
    slider.style.transform = `translateX(-${targetIndex * 100}vw)`;
    if (window.navigationContext.masterList[targetIndex]) {
        history.pushState(null, '', window.navigationContext.masterList[targetIndex]);
    }
    loadSlot(targetIndex - 1);
    loadSlot(targetIndex);
    loadSlot(targetIndex + 1);
    updatePreviewBar();
    setTimeout(() => { window.navigationContext.isNavigating = false; }, 300);
}

function handleHorizontalKeyDown(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
    const key = event.key.toLowerCase();
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
    if (window.navigationContext.isNavigating) return;
    if (key === 'arrowleft' || key === window.scriptSettings.keyPrev) navigateTo(window.navigationContext.currentIndex - 1);
    else if (key === 'arrowright' || key === window.scriptSettings.keyNext) navigateTo(window.navigationContext.currentIndex + 1);
}

function runHorizontalSliderReader() {
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('#exh-prev-previews a, #exh-next-previews a');
        if (link) {
            e.preventDefault();
            const targetUrl = link.href;
            const targetIndex = window.navigationContext.masterList.findIndex(url => url === targetUrl);
            if (targetIndex !== -1 && !window.navigationContext.isNavigating) navigateTo(targetIndex);
        }
    }, true);

    createStatusDisplay();
    setPreviewBarVisibility(window.scriptSettings.hidePreviewBar);
    
    const viewer = document.createElement('div');
    viewer.id = 'exh-viewer';
    const slider = document.createElement('div');
    slider.id = 'exh-image-slider';
    document.body.style.overflow = 'hidden';
    Array.from(document.body.children).forEach(child => {
        if (child.id !== 'exh-status-bar') child.style.display = 'none';
    });
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
    const currentIndex = window.navigationContext.masterList.findIndex(link => link.includes(currentPath));
    if (currentIndex === -1) {
        statusText.textContent = '❌ 錯誤：在當前索引範圍中找不到此頁面。';
        return;
    }
    window.navigationContext.currentIndex = currentIndex;
    rebuildSlider(window.navigationContext.masterList);
    slider.style.transition = 'none';
    navigateTo(currentIndex);
    setTimeout(() => { slider.style.transition = 'transform 0.3s ease-in-out;'; }, 50);
    applyFitStyle();
    document.addEventListener('keydown', handleHorizontalKeyDown);
}

export function initHorizontalReader(ensurePagesFunc) {
    ensurePagesAreIndexed = ensurePagesFunc;
    runHorizontalSliderReader();
}
