/**
 * ExHentai 小幫手 - 內容腳本
 *
 * v10.1 功能：
 * - 新增清除快取快捷鍵：可在閱讀時按下指定按鍵（預設 W）來手動清除所有快取。
 * - 新增 API 級別圖片重載，從根本上解決 403 Forbidden 錯誤。
 */

console.log("ExHentai 小幫手 v10.1 已成功載入！");

// --- 全域變數 ---
const navigationContext = {
    masterList: [],
    currentIndex: -1,
    isNavigating: false,
    backToGalleryUrl: null,
    galleryId: null,
    previewUpdateId: 0,
    currentGalleryPageIndex: 0,
    totalGalleryPages: 0,
    totalImageCount: 0,
    isIndexingPage: null,
};
const scriptSettings = {
    fitToWindow: true,
    hidePreviewBar: false,
    preloadCount: 3,
    keyPrev: 'a',
    keyNext: 'd',
    keyFit: 's',
    keyHide: 'q',
    keyExit: 'e',
    keyClear: 'w', // 新增快捷鍵
};
const FIT_STYLE_ID = 'exh-helper-fit-style';
const THEME_STYLE_ID = 'exh-helper-theme-style';
const VIEWER_STYLE_ID = 'exh-helper-viewer-style';

// --- UI 函式 ---
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
    if (navigationContext.previewUpdateId !== updateId) return;
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
    const currentPageMatch = (navigationContext.masterList[navigationContext.currentIndex] || '').match(/-(\d+)$/);
    const currentPage = currentPageMatch ? currentPageMatch[1] : '?';
    const totalPages = navigationContext.totalImageCount || '?';
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
    if (scriptSettings.fitToWindow) {
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

function applyTheme(theme) {
    const existingStyle = document.getElementById(THEME_STYLE_ID);
    if (existingStyle) existingStyle.remove();
    if (theme === 'light') return;
    let isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
        const style = document.createElement('style');
        style.id = THEME_STYLE_ID;
        style.textContent = `
            html, body, #exh-viewer { background-color: #1a1a1a !important; color: #e0e0e0 !important; }
            #exh-status-bar { background-color: rgba(10, 10, 10, 0.9) !important; border-top-color: #333 !important; color: #e0e0e0 !important; }
            #exh-status-previews img { border-color: #555 !important; }
            a { color: #8cb4ff !important; }`;
        document.head.appendChild(style);
    }
}

function setPreviewBarVisibility(shouldHide) {
    const statusBar = document.getElementById('exh-status-bar');
    if (statusBar) {
        statusBar.classList.toggle('exh-bar-hidden', shouldHide);
        applyFitStyle();
    }
}

async function toggleFitToWindow() {
    scriptSettings.fitToWindow = !scriptSettings.fitToWindow;
    await browser.storage.local.set({ fitToWindow: scriptSettings.fitToWindow });
    applyFitStyle();
}

async function togglePreviewBar() {
    scriptSettings.hidePreviewBar = !scriptSettings.hidePreviewBar;
    await browser.storage.local.set({ hidePreviewBar: scriptSettings.hidePreviewBar });
    setPreviewBarVisibility(scriptSettings.hidePreviewBar);
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

// --- 鍵盤導覽邏輯 ---
function handleKeyDown(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
    const key = event.key.toLowerCase();

    if (key === scriptSettings.keyFit) { toggleFitToWindow(); return; }
    if (key === scriptSettings.keyHide) { togglePreviewBar(); return; }
    if (key === scriptSettings.keyExit) {
        if (navigationContext.backToGalleryUrl) window.location.href = navigationContext.backToGalleryUrl;
        return;
    }
    
    // **新增點**: 清除快取快捷鍵
    if (key === scriptSettings.keyClear) {
        browser.runtime.sendMessage({ type: 'clear_all_cache' }).then(response => {
            if (response && response.success) {
                const statusText = document.getElementById('exh-status-text');
                if (statusText) {
                    const originalText = statusText.textContent;
                    statusText.textContent = `✅ 已清除 ${response.clearedCount} 個圖庫的快取！`;
                    setTimeout(() => {
                        // 2秒後恢復原狀或更新狀態
                        updateStatusText(); 
                    }, 2000);
                }
            }
        });
        return;
    }

    if (navigationContext.isNavigating) return;
    if (key === 'arrowleft' || key === scriptSettings.keyPrev) navigateTo(navigationContext.currentIndex - 1);
    else if (key === 'arrowright' || key === scriptSettings.keyNext) navigateTo(navigationContext.currentIndex + 1);
}

// --- 核心邏輯 ---
const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchAndParsePage(pageUrl, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(pageUrl, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP 請求失敗: ${response.status}`);
            const htmlText = await response.text();
            return new DOMParser().parseFromString(htmlText, 'text/html');
        } catch (error) {
            console.warn(`[ExH] 讀取頁面失敗 (${pageUrl}), 第 ${i + 1} 次嘗試...`, error.message);
            if (i < maxRetries - 1) await delay(1000 * (i + 1));
            else {
                console.error(`[ExH] 讀取或解析頁面時發生嚴重錯誤 (${pageUrl}):`, error);
                return null;
            }
        }
    }
}

async function ensurePagesAreIndexed(galleryId, pagesToCheck, cleanBaseGalleryUrl) {
    const { missingPages } = await browser.runtime.sendMessage({ type: 'check_indexed_pages', galleryId, pagesToCheck });
    if (missingPages.length > 0) {
        const statusText = document.getElementById('exh-status-text');
        for (const pageIndex of missingPages) {
            if(statusText) statusText.textContent = `🔍 正在索引圖庫分頁 ${pageIndex + 1}...`;
            const galleryPageUrl = new URL(cleanBaseGalleryUrl);
            if (pageIndex > 0) galleryPageUrl.searchParams.set('p', pageIndex);
            const doc = await fetchAndParsePage(galleryPageUrl.href);
            if (doc) {
                const links = Array.from(doc.querySelectorAll('#gdt a, #gdc a')).map(a => a.href);
                if (links.length > 0) {
                    await browser.runtime.sendMessage({ type: 'set_page_links', galleryId, pageIndex, links });
                } else {
                    console.error(`[ExH] 診斷資訊：在圖庫分頁 ${pageIndex + 1} (${galleryPageUrl.href}) 上找不到任何圖片連結。頁面內容可能已變更、載入失敗或需要驗證。`);
                    const errorElement = doc.querySelector('.d p');
                    if (errorElement) console.error(`[ExH] 偵測到頁面上的可能錯誤訊息: "${errorElement.textContent.trim()}"`);
                }
            }
        }
    }
}

async function processLink(pageUrl, direction, preloadedPagesMap, galleryId, updateId) {
    if (navigationContext.previewUpdateId !== updateId) return;
    if (preloadedPagesMap.has(pageUrl)) {
        addPreviewImageToStatus(preloadedPagesMap.get(pageUrl), pageUrl, direction, updateId);
    } else {
        const doc = await fetchAndParsePage(pageUrl);
        if (navigationContext.previewUpdateId !== updateId) return;
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

async function reloadImageFromAPI(pageUrl, imgElement) {
    try {
        const doc = await fetchAndParsePage(pageUrl);
        if (!doc) throw new Error("無法重新抓取頁面文檔。");
        const scriptContent = Array.from(doc.scripts).map(s => s.textContent).join('\n');
        const gidMatch = scriptContent.match(/var gid = (\d+);/);
        const imgkeyMatch = scriptContent.match(/var imgkey = "([a-z0-9]+)";/);
        const nlLink = doc.querySelector('a#loadfail[onclick^="nl"]');
        const nlMatch = nlLink ? nlLink.getAttribute('onclick').match(/nl\('([^']+)'\)/) : null;
        const pageMatch = pageUrl.match(/-(\d+)$/);
        if (!gidMatch || !imgkeyMatch || !nlMatch || !pageMatch) throw new Error("找不到 API 重載所需的所有參數。");
        const apiRequestBody = `method=showpage&gid=${gidMatch[1]}&page=${pageMatch[1]}&imgkey=${imgkeyMatch[1]}&nl=${nlMatch[1]}`;
        const response = await fetch('/api.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: apiRequestBody });
        if (!response.ok) throw new Error(`API 請求失敗，狀態碼: ${response.status}`);
        const data = await response.json();
        if (data && data.i) {
            imgElement.src = data.i;
            return true;
        } else {
            throw new Error("API 回應中未包含有效的圖片連結。");
        }
    } catch (error) {
        console.error(`[ExH] API 圖片重載失敗:`, error);
        return false;
    }
}

async function loadSlot(index) {
    if (index < 0 || index >= navigationContext.masterList.length) return;
    const slider = document.getElementById('exh-image-slider');
    if (!slider || !slider.children[index]) return;
    const slot = slider.children[index];
    if (slot.dataset.loading === 'true' || slot.children.length > 0) return;
    slot.dataset.loading = 'true';
    const pageUrl = navigationContext.masterList[index];
    try {
        const doc = await fetchAndParsePage(pageUrl);
        if (!doc) throw new Error("無法解析頁面文檔。");
        let imgUrl = doc.getElementById('img')?.src;
        if (!imgUrl) {
            slot.innerHTML = `<div style="color: #ff8a8a; text-align: center;">找不到圖片連結<br>${pageUrl.split('/').pop()}</div>`;
            return;
        }
        while (slot.firstChild) slot.removeChild(slot.firstChild);
        const img = document.createElement('img');
        img.onerror = async () => {
            console.warn(`[ExH] 圖片 ${imgUrl} 載入失敗。正在嘗試 API 智慧重載...`);
            img.onerror = null;
            const success = await reloadImageFromAPI(pageUrl, img);
            if (!success) {
                slot.innerHTML = `<div style="color: #ff8a8a; text-align: center;">圖片重載失敗<br>${pageUrl.split('/').pop()}</div>`;
            }
        };
        img.src = imgUrl;
        slot.appendChild(img);
    } catch (error) {
        console.error(`[ExH] 載入 slot ${index} (${pageUrl}) 時發生嚴重錯誤:`, error);
        slot.innerHTML = `<div style="color: #ff8a8a; text-align: center;">載入時發生錯誤</div>`;
    } finally {
        delete slot.dataset.loading;
    }
}

async function updatePreviewBar() {
    const { masterList, currentIndex, galleryId } = navigationContext;
    if (!masterList || currentIndex === -1 || !galleryId) return;
    const currentUpdateId = ++navigationContext.previewUpdateId;
    document.getElementById('exh-prev-previews').innerHTML = '';
    document.getElementById('exh-next-previews').innerHTML = '';
    updateStatusText();
    const { preloadedPages } = await browser.runtime.sendMessage({ type: 'get_all_links', galleryId });
    const preloadedPagesMap = new Map(Object.entries(preloadedPages || {}));
    const prevLinks = masterList.slice(Math.max(0, currentIndex - scriptSettings.preloadCount), currentIndex).reverse();
    const nextLinks = masterList.slice(currentIndex + 1, currentIndex + 1 + scriptSettings.preloadCount);
    const linksToProcess = [...prevLinks.map(url => ({ url, direction: 'prev' })), ...nextLinks.map(url => ({ url, direction: 'next' }))];
    for (const item of linksToProcess) {
        if (navigationContext.previewUpdateId !== currentUpdateId) return;
        await processLink(item.url, item.direction, preloadedPagesMap, galleryId, currentUpdateId);
    }
    if (navigationContext.previewUpdateId === currentUpdateId) updateStatusText();
}

async function proactiveIndexCheck(currentIndex) {
    try {
        const { galleryId, totalGalleryPages, backToGalleryUrl, masterList } = navigationContext;
        const galleryData = await browser.runtime.sendMessage({ type: 'get_gallery_data', galleryId });
        if (!galleryData || !galleryData.pages) return;
        const indexedPageNumbers = Object.keys(galleryData.pages).map(Number);
        const lastIndexedPage = indexedPageNumbers.length > 0 ? Math.max(...indexedPageNumbers) : -1;
        const lastKnownImageIndex = masterList.length - 1;
        const triggerIndex = lastKnownImageIndex - scriptSettings.preloadCount;
        if (currentIndex >= triggerIndex && lastIndexedPage < totalGalleryPages - 1) {
            const nextPageIndex = lastIndexedPage + 1;
            if (navigationContext.isIndexingPage === nextPageIndex) return;
            navigationContext.isIndexingPage = nextPageIndex;
            console.log(`[ExH] 預測性觸發：已到達頁面 ${currentIndex + 1}，開始索引下一個圖庫分頁 (${nextPageIndex + 1})。`);
            await ensurePagesAreIndexed(galleryId, [nextPageIndex], backToGalleryUrl);
            const { masterList: newMasterList } = await browser.runtime.sendMessage({ type: 'get_all_links', galleryId });
            if (newMasterList.length > masterList.length) {
                console.log(`[ExH] 預測性更新 masterList：從 ${masterList.length} 到 ${newMasterList.length} 個項目。`);
                navigationContext.masterList = newMasterList;
                rebuildSlider(newMasterList);
                loadSlot(currentIndex - 1);
                loadSlot(currentIndex);
                loadSlot(currentIndex + 1);
                updatePreviewBar();
            }
            navigationContext.isIndexingPage = null;
        }
    } catch (error) {
        console.error("[ExH] 預測性索引檢查時發生錯誤:", error);
        navigationContext.isIndexingPage = null;
    }
}

async function navigateTo(targetIndex) {
    if (targetIndex < 0 || navigationContext.isNavigating) return;
    if (targetIndex >= navigationContext.masterList.length) {
        console.warn("[ExH] 觸發了邊界擴展，正常情況應由預測性索引處理。");
        const { galleryId, totalGalleryPages, backToGalleryUrl } = navigationContext;
        let galleryData = await browser.runtime.sendMessage({ type: 'get_gallery_data', galleryId });
        const indexedPageNumbers = galleryData ? Object.keys(galleryData.pages).map(Number) : [];
        const lastIndexedPage = indexedPageNumbers.length > 0 ? Math.max(...indexedPageNumbers) : -1;
        if (lastIndexedPage < totalGalleryPages - 1) {
            const nextPageToIndex = lastIndexedPage + 1;
            await ensurePagesAreIndexed(galleryId, [nextPageToIndex], backToGalleryUrl);
            const { masterList: newMasterList } = await browser.runtime.sendMessage({ type: 'get_all_links', galleryId });
            if (newMasterList.length > navigationContext.masterList.length) {
                navigationContext.masterList = newMasterList;
                rebuildSlider(newMasterList);
            } else {
                navigationContext.isNavigating = false;
                return;
            }
        } else {
             return;
        }
    }
    navigationContext.isNavigating = true;
    navigationContext.currentIndex = targetIndex;
    proactiveIndexCheck(targetIndex);
    const slider = document.getElementById('exh-image-slider');
    slider.style.transform = `translateX(-${targetIndex * 100}vw)`;
    if (navigationContext.masterList[targetIndex]) {
        history.pushState(null, '', navigationContext.masterList[targetIndex]);
    }
    loadSlot(targetIndex - 1);
    loadSlot(targetIndex);
    loadSlot(targetIndex + 1);
    updatePreviewBar();
    setTimeout(() => { navigationContext.isNavigating = false; }, 300);
}

// --- 主執行入口 ---
async function main() {
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('#exh-prev-previews a, #exh-next-previews a');
        if (link) {
            e.preventDefault();
            const targetUrl = link.href;
            const targetIndex = navigationContext.masterList.findIndex(url => url === targetUrl);
            if (targetIndex !== -1 && !navigationContext.isNavigating) navigateTo(targetIndex);
        }
    }, true);

    if (!window.location.pathname.startsWith('/s/')) return;
    const settings = await browser.storage.local.get({ 
        preloadCount: 3, fitToWindow: true, hidePreviewBar: false, themeMode: 'system',
        keyPrev: 'a', keyNext: 'd', keyFit: 's', keyHide: 'q', keyExit: 'e', keyClear: 'w',
    });
    Object.assign(scriptSettings, settings);
    createStatusDisplay();
    setPreviewBarVisibility(scriptSettings.hidePreviewBar);
    applyTheme(settings.themeMode);
    if (!document.getElementById('img')) return;
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
    const backToGalleryLink = document.querySelector('.sb a[href*="/g/"]');
    if (!backToGalleryLink) {
        statusText.textContent = '❌ 錯誤：找不到「返回圖庫」的連結。';
        return;
    }
    navigationContext.backToGalleryUrl = backToGalleryLink.href;
    const galleryUrl = new URL(backToGalleryLink.href);
    const galleryId = galleryUrl.pathname.match(/\/g\/(\d+)\//)?.[1];
    if (!galleryId) {
        statusText.textContent = '❌ 錯誤：無法識別圖庫 ID。';
        return;
    }
    navigationContext.galleryId = galleryId;
    const currentGalleryPageIndex = parseInt(galleryUrl.searchParams.get('p') || '0', 10);
    navigationContext.currentGalleryPageIndex = currentGalleryPageIndex;
    const cleanBaseGalleryUrl = new URL(galleryUrl.href);
    cleanBaseGalleryUrl.searchParams.delete('p');
    let galleryData = await browser.runtime.sendMessage({ type: 'get_gallery_data', galleryId });
    if (!galleryData || galleryData.totalPages === null) {
        statusText.textContent = `🔍 正在獲取圖庫資訊...`;
        const galleryPageDoc = await fetchAndParsePage(galleryUrl.href);
        if (!galleryPageDoc) {
            statusText.textContent = '❌ 錯誤：無法讀取圖庫頁面資訊。';
            return;
        }
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
    navigationContext.totalGalleryPages = galleryData.totalPages;
    navigationContext.totalImageCount = galleryData.totalImages;
    const indexWindowRadius = 1;
    const pagesToIndex = [];
    for (let i = -indexWindowRadius; i <= indexWindowRadius; i++) {
        const pageIndex = currentGalleryPageIndex + i;
        if (pageIndex >= 0 && pageIndex < galleryData.totalPages) pagesToIndex.push(pageIndex);
    }
    await ensurePagesAreIndexed(galleryId, pagesToIndex, cleanBaseGalleryUrl.href);
    const { masterList } = await browser.runtime.sendMessage({ type: 'get_all_links', galleryId });
    if (!masterList || masterList.length === 0) {
        statusText.textContent = '❌ 錯誤：無法從背景獲取索引資料。';
        return;
    }
    const currentPath = window.location.pathname;
    const currentIndex = masterList.findIndex(link => link.includes(currentPath));
    if (currentIndex === -1) {
        statusText.textContent = '❌ 錯誤：在當前索引範圍中找不到此頁面。';
        return;
    }
    navigationContext.masterList = masterList;
    navigationContext.currentIndex = currentIndex;
    rebuildSlider(masterList);
    slider.style.transition = 'none';
    navigateTo(currentIndex);
    setTimeout(() => { slider.style.transition = 'transform 0.3s ease-in-out;'; }, 50);
    applyFitStyle();
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', () => {
        if (navigationContext.galleryId) browser.runtime.sendMessage({ type: 'clear_gallery_cache', galleryId: navigationContext.galleryId });
    });
}

main().catch(err => console.error("[ExH] 主程式執行時發生未處理的錯誤:", err));

browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        Object.keys(changes).forEach(key => {
            const change = changes[key];
            if (change && scriptSettings.hasOwnProperty(key)) scriptSettings[key] = change.newValue;
        });
        if (changes.fitToWindow) applyFitStyle();
        if (changes.hidePreviewBar) setPreviewBarVisibility(scriptSettings.hidePreviewBar);
        if (changes.themeMode) applyTheme(scriptSettings.themeMode);
    }
});
