/**
 * 閱讀器核心模組 (v1.1)
 */
import { fetchAndParsePage } from './utils.js';

const THEME_STYLE_ID = 'exh-helper-theme-style';

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

    if (!document.getElementById('img')) return;

    applyTheme(window.scriptSettings.themeMode);

    const backToGalleryLink = document.querySelector('.sb a[href*="/g/"]');
    if (!backToGalleryLink) {
        console.error('❌ 錯誤：找不到「返回圖庫」的連結。');
        return;
    }
    window.navigationContext.backToGalleryUrl = backToGalleryLink.href;
    const galleryUrl = new URL(backToGalleryLink.href);
    const galleryId = galleryUrl.pathname.match(/\/g\/(\d+)\//)?.[1];
    if (!galleryId) {
        console.error('❌ 錯誤：無法識別圖庫 ID。');
        return;
    }
    window.navigationContext.galleryId = galleryId;
    const currentGalleryPageIndex = parseInt(galleryUrl.searchParams.get('p') || '0', 10);
    window.navigationContext.currentGalleryPageIndex = currentGalleryPageIndex;
    const cleanBaseGalleryUrl = new URL(galleryUrl.href);
    cleanBaseGalleryUrl.searchParams.delete('p');

    const galleryPageDoc = await fetchAndParsePage(galleryUrl.href);
    if (!galleryPageDoc) {
        console.error('❌ 錯誤：無法讀取圖庫頁面資訊。');
        return;
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
}

export function initReader() {
    runReader();
}
