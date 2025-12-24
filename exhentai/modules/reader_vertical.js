/**
 * 垂直捲動閱讀器模組 (v1.1)
 */
import { fetchAndParsePage, reloadImageFromAPI } from './utils.js';

let verticalObserver;
let ensurePagesAreIndexed;
let hasInitializedVerticalReader = false;

async function loadVerticalImage(placeholder) {
    if (placeholder.dataset.loading === 'true' || placeholder.querySelector('img')) return;
    placeholder.dataset.loading = 'true';
    placeholder.textContent = '正在載入...';

    const pageUrl = placeholder.dataset.pageUrl;
    const index = parseInt(placeholder.dataset.index, 10);

    try {
        const doc = await fetchAndParsePage(pageUrl);
        if (!doc) throw new Error("無法解析頁面文檔。");

        let imgUrl = doc.getElementById('img')?.src;
        if (!imgUrl) {
            placeholder.textContent = `找不到圖片連結 (頁 ${index + 1})`;
            placeholder.classList.add('error');
            return;
        }

        const img = document.createElement('img');
        img.dataset.index = index;
        img.style.cssText = `
            max-width: 100%;
            height: auto;
            display: block;
        `;
        img.onerror = async () => {
            console.warn(`[ExH] 圖片 ${imgUrl} 載入失敗。正在嘗試 API 智慧重載...`);
            img.onerror = null;
            placeholder.textContent = '正在重載...';
            const success = await reloadImageFromAPI(pageUrl, img);
            if (!success) {
                placeholder.textContent = `圖片重載失敗 (頁 ${index + 1})`;
                placeholder.classList.add('error');
            } else {
                 placeholder.replaceWith(img);
            }
        };
        img.onload = () => {
            placeholder.replaceWith(img);
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
    
    if (key === window.scriptSettings.keyExit) {
        if (window.navigationContext.backToGalleryUrl) window.location.href = window.navigationContext.backToGalleryUrl;
        return;
    }
    if (key === window.scriptSettings.keyClear) {
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
    document.body.style.overflow = 'auto';
    Array.from(document.body.children).forEach(child => child.style.display = 'none');
    const container = document.createElement('div');
    container.id = 'exh-vertical-viewer';
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 20px 0;
    `;
    document.body.appendChild(container);

    for (let i = 0; i < window.navigationContext.totalImageCount; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'exh-vertical-placeholder';
        placeholder.dataset.index = i;
        placeholder.textContent = `頁 ${i + 1}`;
        placeholder.style.cssText = `
            width: 80vw;
            min-height: 120vh;
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

    const observerCallback = async (entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            const placeholder = entry.target;
            verticalObserver.unobserve(placeholder);

            const imageIndex = parseInt(placeholder.dataset.index, 10);
            const neededPageIndex = Math.floor(imageIndex / window.navigationContext.imagesPerIndexPage);
            const indexOnPage = imageIndex % window.navigationContext.imagesPerIndexPage;

            await ensurePagesAreIndexed(
                window.navigationContext.galleryId,
                [neededPageIndex],
                window.navigationContext.backToGalleryUrl
            );

            const pageData = await browser.runtime.sendMessage({
                type: 'get_specific_page_links',
                galleryId: window.navigationContext.galleryId,
                pageIndex: neededPageIndex
            });

            if (pageData && pageData.links && pageData.links[indexOnPage]) {
                const pageUrl = pageData.links[indexOnPage];
                placeholder.dataset.pageUrl = pageUrl;
                loadVerticalImage(placeholder);
            } else {
                placeholder.textContent = `無法獲取連結 (頁 ${imageIndex + 1})`;
                placeholder.classList.add('error');
                console.error(`[ExH] 索引完成後，依然找不到索引為 ${imageIndex} 的圖片連結。`);
            }
        }
    };

    verticalObserver = new IntersectionObserver(observerCallback, {
        rootMargin: '200% 0px',
    });

    document.querySelectorAll('.exh-vertical-placeholder').forEach(el => {
        verticalObserver.observe(el);
    });

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
