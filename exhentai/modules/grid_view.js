/**
 * 網格視圖功能模組 (v1.3.2)
 * - 修正：擴大分頁列的搜尋範圍，以支援 .searchnav 結構，解決在首頁或搜尋頁面的無限滾動問題。
 * - 修正：無限滾動功能在標籤搜尋等頁面失效的問題，改用更可靠的方式尋找「下一頁」的連結。
 * - 新增：實現無限滾動功能，當使用者滾動到頁面底部時，會自動載入並附加下一頁的內容。
 * - 新增：在頁面底部增加載入狀態指示器。
 * - 重構：將單一項目從列表轉換為網格的邏輯提取到獨立函式中，以供重複使用。
 */
import { fetchAndParsePage } from './utils.js';

let isLoadingNextPage = false;
let nextPageUrl = null;
let intersectionObserver = null;
const translationMap = new Map();
let hasInitializedGridView = false;

function injectGridViewCSS() {
    const styleId = 'exh-grid-view-style';
    if (document.getElementById(styleId)) return;

    const css = `
        .exh-grid-view {
            display: grid;
            grid-template-columns: repeat(${window.scriptSettings.gridColumns}, 1fr);
            gap: 24px 18px;
        }
        .exh-grid-item {
            position: relative;
            background-color: #3c3c3c;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            overflow: hidden;
            text-decoration: none !important;
            display: flex;
            flex-direction: column;
            transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
        }
        .exh-grid-item:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 16px rgba(0,0,0,0.4);
        }
        .exh-grid-thumbnail-link {
            display: block;
            aspect-ratio: 3 / 4;
            overflow: hidden;
            background-color: #222;
        }
        .exh-grid-thumbnail-link img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s ease;
        }
        .exh-grid-item:hover .exh-grid-thumbnail-link img {
            transform: scale(1.05);
        }
        .exh-grid-info {
            padding: 10px;
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .exh-grid-title {
            font-size: 13px;
            font-weight: 500;
            color: #eee;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.4;
            margin-bottom: 8px;
            height: 36px;
        }
        .exh-grid-category-row {
            margin-bottom: 8px;
        }
        .exh-grid-category-row .cn {
            display: block;
            width: 100%;
            padding: 3px 0;
            border-radius: 4px;
            font-size: 11px;
            color: #fff;
            font-weight: bold;
            border: 1px solid;
            text-align: center;
            box-sizing: border-box;
        }
        .exh-grid-info .ir {
            margin: 0 auto 8px;
        }
        .exh-grid-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #aaa;
            margin-top: auto;
        }
        .exh-grid-language {
            font-style: italic;
            opacity: 0.8;
            text-transform: capitalize;
        }
        .exh-grid-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            color: #fff;
            padding: 15px;
            display: flex;
            flex-direction: column;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
            box-sizing: border-box;
            pointer-events: none;
        }
        .exh-grid-item:hover .exh-grid-overlay {
            opacity: 1;
            visibility: visible;
        }
        .exh-overlay-title {
            font-size: 15px;
            font-weight: bold;
            color: #fff;
            margin-bottom: 10px;
            border-bottom: 1px solid #555;
            padding-bottom: 8px;
        }
        .exh-overlay-tags {
            font-size: 12px;
            line-height: 1.6;
            opacity: 0.9;
            overflow-y: auto;
            flex-grow: 1;
        }
        .exh-overlay-tags .gt {
            display: inline-block;
            background-color: #555;
            padding: 2px 6px;
            border-radius: 3px;
            margin: 2px;
        }
        .ir {
            display: inline-block;
            width: 80px;
            height: 16px;
            vertical-align: middle;
            background: url(https://s.exhentai.org/img/ir.png) no-repeat;
        }
        .exh-grid-loader {
            grid-column: 1 / -1; /* Span all columns */
            text-align: center;
            padding: 20px;
            font-size: 16px;
            color: #888;
        }
    `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

function createGridItemFromRow(row) {
    try {
        const categoryDiv = row.querySelector('.gl1c div');
        const thumbImg = row.querySelector('.glthumb img');
        const linkA = row.querySelector('.gl3c a');
        const titleDiv = row.querySelector('.glink');
        const ratingDiv = row.querySelector('.ir');
        const pagesDiv = row.querySelector('.gl4c div:last-child');
        const tagsContainer = row.querySelector('.gl3c > a > div:last-child');
        const dateDiv = row.querySelector('div[id^="posted_"]');
        const langTagDiv = row.querySelector('.gt[title^="language:"]');

        if (!linkA || !titleDiv || !thumbImg) return null;

        const gridItem = document.createElement('a');
        gridItem.className = 'exh-grid-item';
        gridItem.href = linkA.href;

        const imgSrc = thumbImg.getAttribute('data-src') || thumbImg.src;
        const ratingStyleAttr = ratingDiv ? ratingDiv.getAttribute('style') : '';
        const pagesText = pagesDiv ? pagesDiv.textContent : '';
        const dateText = dateDiv ? dateDiv.textContent : '';
        const langText = langTagDiv ? langTagDiv.textContent : '';

        const thumbnailLink = document.createElement('div');
        thumbnailLink.className = 'exh-grid-thumbnail-link';
        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = titleDiv.textContent;
        img.loading = 'lazy';
        thumbnailLink.appendChild(img);
        gridItem.appendChild(thumbnailLink);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'exh-grid-info';

        const infoTopDiv = document.createElement('div');
        const titleEl = document.createElement('div');
        titleEl.className = 'exh-grid-title';
        titleEl.textContent = titleDiv.textContent;
        infoTopDiv.appendChild(titleEl);

        const categoryRow = document.createElement('div');
        categoryRow.className = 'exh-grid-category-row';
        if (categoryDiv) {
            categoryRow.appendChild(categoryDiv.cloneNode(true));
        }
        infoTopDiv.appendChild(categoryRow);
        infoDiv.appendChild(infoTopDiv);

        if (ratingDiv) {
            const ratingEl = document.createElement('div');
            ratingEl.className = 'ir';
            ratingEl.style.cssText = ratingStyleAttr;
            infoDiv.appendChild(ratingEl);
        }

        const footerDiv = document.createElement('div');
        footerDiv.className = 'exh-grid-footer';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'exh-grid-date';
        dateSpan.textContent = dateText;
        footerDiv.appendChild(dateSpan);

        if (langText) {
            const langSpan = document.createElement('span');
            langSpan.className = 'exh-grid-language';
            langSpan.textContent = langText;
            footerDiv.appendChild(langSpan);
        }

        const pagesSpan = document.createElement('span');
        pagesSpan.textContent = `${pagesText.replace(' pages', '')}p`;
        footerDiv.appendChild(pagesSpan);

        infoDiv.appendChild(footerDiv);
        gridItem.appendChild(infoDiv);

        const overlayDiv = document.createElement('div');
        overlayDiv.className = 'exh-grid-overlay';

        if (titleDiv) {
            const overlayTitle = document.createElement('div');
            overlayTitle.className = 'exh-overlay-title';
            overlayTitle.textContent = titleDiv.textContent;
            overlayDiv.appendChild(overlayTitle);
        }

        if (tagsContainer) {
            const overlayTags = document.createElement('div');
            overlayTags.className = 'exh-overlay-tags';

            Array.from(tagsContainer.children).forEach(child => {
                const clonedTag = child.cloneNode(true);
                const originalTag = clonedTag.getAttribute('title');

                if (translationMap.has(originalTag)) {
                    const displayTag = translationMap.get(originalTag);
                    const displayValue = displayTag.substring(displayTag.indexOf(':') + 1).trim();
                    if (displayValue) {
                        clonedTag.textContent = displayValue;
                    }
                }
                overlayTags.appendChild(clonedTag);
            });
            overlayDiv.appendChild(overlayTags);
        }
        gridItem.appendChild(overlayDiv);
        return gridItem;
    } catch (e) {
        console.error('[ExH] 轉換單個項目到網格視圖時出錯:', e, row);
        return null;
    }
}

async function loadNextPage() {
    if (isLoadingNextPage || !nextPageUrl) return;

    isLoadingNextPage = true;
    const loader = document.getElementById('exh-grid-loader');
    if (loader) loader.textContent = '正在載入下一頁...';

    try {
        const doc = await fetchAndParsePage(nextPageUrl);
        if (!doc) {
            throw new Error('無法抓取或解析下一頁的內容。');
        }

        const gridContainer = document.querySelector('.exh-grid-view');
        const newRows = doc.querySelectorAll('table.itg.gltc tbody > tr');
        newRows.forEach(row => {
            const gridItem = createGridItemFromRow(row);
            if (gridItem) {
                gridContainer.appendChild(gridItem);
            }
        });

        const pagination = doc.querySelector('.ptb, .ptt, .searchnav');
        const nextLink = pagination ? Array.from(pagination.querySelectorAll('a')).find(a => a.textContent.trim() === 'Next >') : null;

        if (nextLink && nextLink.href) {
            nextPageUrl = nextLink.href;
        } else {
            nextPageUrl = null;
            if (loader) loader.textContent = '已載入所有內容。';
            if (intersectionObserver) intersectionObserver.disconnect();
        }

    } catch (error) {
        console.error('[ExH] 載入下一頁時發生錯誤:', error);
        if (loader) loader.textContent = '載入失敗，請檢查主控台。';
        if (intersectionObserver) intersectionObserver.disconnect();
    } finally {
        isLoadingNextPage = false;
    }
}

function setupInfiniteScroll() {
    const pagination = document.querySelector('.ptb, .ptt, .searchnav');
    if (!pagination) return;

    const nextLink = Array.from(pagination.querySelectorAll('a')).find(a => a.textContent.trim() === 'Next >');

    if (nextLink && nextLink.href) {
        nextPageUrl = nextLink.href;
    } else {
        return; // 沒有下一頁了
    }

    const gridContainer = document.querySelector('.exh-grid-view');
    const loader = document.createElement('div');
    loader.id = 'exh-grid-loader';
    loader.className = 'exh-grid-loader';
    gridContainer.insertAdjacentElement('afterend', loader);

    intersectionObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
            loadNextPage();
        }
    }, { rootMargin: '200px' });

    intersectionObserver.observe(loader);
}

async function transformToGridView() {
    const originalTable = document.querySelector('table.itg.gltc');
    if (!originalTable || document.querySelector('.exh-grid-view')) return;

    console.log('[ExH] 啟用網格視圖並設定無限滾動...');
    injectGridViewCSS();

    translationMap.clear();
    const { tags: savedTags } = await browser.runtime.sendMessage({ type: 'get_saved_tags' });
    if (savedTags && savedTags.length > 0) {
        for (const tag of savedTags) {
            if (tag.original !== tag.display) {
                translationMap.set(tag.original, tag.display);
            }
        }
    }

    const gridContainer = document.createElement('div');
    gridContainer.className = 'exh-grid-view';

    const rows = originalTable.querySelectorAll('tbody > tr');
    rows.forEach(row => {
        const gridItem = createGridItemFromRow(row);
        if (gridItem) {
            gridContainer.appendChild(gridItem);
        }
    });

    originalTable.style.display = 'none';

    const pagenator = document.querySelector('.ptt, .searchnav');
    if (pagenator) pagenator.style.display = 'none';

    originalTable.parentElement.insertBefore(gridContainer, originalTable);

    setupInfiniteScroll();
}

export async function initGridView() {
    if (hasInitializedGridView) {
        console.warn('[ExH] 網格視圖模組已初始化，跳過重複執行。');
        return;
    }
    hasInitializedGridView = true;
    await transformToGridView();
}