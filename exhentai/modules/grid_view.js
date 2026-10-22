/**
 * 網格視圖功能模組 (v1.3.2)
 * - 修正：擴大分頁列的搜尋範圍，以支援 .searchnav 結構，解決在首頁或搜尋頁面的無限滾動問題。
 * - 修正：無限滾動功能在標籤搜尋等頁面失效的問題，改用更可靠的方式尋找「下一頁」的連結。
 * - 新增：實現無限滾動功能，當使用者滾動到頁面底部時，會自動載入並附加下一頁的內容。
 * - 新增：在頁面底部增加載入狀態指示器。
 * - 重構：將單一項目從列表轉換為網格的邏輯提取到獨立函式中，以供重複使用。
 */
import { fetchAndParsePage, getI18nMessages } from './utils.js';

let i18n = {};
import { isUploaderBlocked, isTagBlocked } from './uploader_blocker.js';

let isLoadingNextPage = false;
let nextPageUrl = null;
let intersectionObserver = null;
const translationMap = new Map();
const savedTagSet = new Set();
const readingProgressMap = new Map();
let currentLoadedPageNumber = 1;
let hasInitializedGridView = false;
let isGridViewActive = false;

function buildGridViewCSS(columns) {
    const colCount = columns || window.scriptSettings.gridColumns || 5;
    return `
        .exh-grid-view {
            display: grid;
            grid-template-columns: repeat(${colCount}, 1fr);
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
            position: relative;
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
        .exh-grid-progress-badge {
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(20, 20, 20, 0.85);
            color: #ffd700;
            font-size: 11px;
            font-weight: bold;
            padding: 2px 7px;
            border-radius: 12px;
            border: 1px solid rgba(255, 215, 0, 0.45);
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            z-index: 2;
            pointer-events: none;
        }
        .exh-grid-progress-badge.exh-completed {
            color: #67c23a;
            border-color: rgba(103, 194, 58, 0.5);
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
        .exh-overlay-tags .gt.exh-saved-tag {
            background-color: #5c4b1b;
            border: 1px solid #ffd700;
            color: #fff8dc;
            font-weight: bold;
        }
        .ir {
            display: inline-block;
            width: 80px;
            height: 16px;
            vertical-align: middle;
            background: url(https://s.exhentai.org/img/ir.png) no-repeat;
        }
        .exh-grid-page-divider {
            grid-column: 1 / -1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin: 8px 0;
            color: #aaa;
            font-size: 13px;
            font-weight: bold;
        }
        .exh-grid-page-divider::before,
        .exh-grid-page-divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: rgba(255, 255, 255, 0.15);
        }
        .exh-grid-loader {
            grid-column: 1 / -1; /* Span all columns */
            text-align: center;
            padding: 20px;
            font-size: 16px;
            color: #888;
        }
    `;
}

function injectGridViewCSS() {
    const styleId = 'exh-grid-view-style';
    const css = buildGridViewCSS(window.scriptSettings.gridColumns);
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
        existingStyle.textContent = css;
        return;
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

function createGridItemFromRow(row) {
    try {
        // 如果這個 row 已經被 blocker 隱藏，直接略過
        if (row.style.display === 'none') {
            return null;
        }

        const uploaderLink = row.querySelector('a[href*="/uploader/"]');
        const uploaderName = uploaderLink ? uploaderLink.textContent.trim() : '';

        // 針對無窮下拉載入的新 row，需重新判斷是否封鎖上傳者
        if (uploaderName && isUploaderBlocked(uploaderName)) {
            return null;
        }

        const tagElements = row.querySelectorAll('.gt, .gtl');
        const rowTags = [];
        for (const tagNode of tagElements) {
            const tagTitle = tagNode.getAttribute('title');
            if (tagTitle) {
                rowTags.push(tagTitle);
                if (isTagBlocked(tagTitle)) {
                    return null;
                }
            }
        }

        // 相容 Compact (gl*c)、Minimal (gl*m)、Extended (gl*e) 與 Thumbnail (gl*t) 四種模式
        const categoryDiv = row.querySelector('.gl1c div, .gl1m div, .cn, .cs');
        const thumbImg = row.querySelector('.glthumb img, .gl1e img, .gl3t img');
        const titleDiv = row.querySelector('.glink');
        const linkA = (titleDiv && titleDiv.closest('a')) || row.querySelector('.gl3c a, .gl3m a, .gl2e a, .gl4t a, a[href*="/g/"]');
        const ratingDiv = row.querySelector('.ir');
        const pagesDiv = row.querySelector('.gl4c div:last-child') ||
            Array.from(row.querySelectorAll('.gl3e div, .gl5t div, .glhide div')).find(d => /\d+\s*pages/i.test(d.textContent));
        const dateDiv = row.querySelector('div[id^="posted_"]');
        const langTagDiv = row.querySelector('[title^="language:"]');

        if (!linkA || !titleDiv || !thumbImg) return null;

        const gridItem = document.createElement('a');
        gridItem.className = 'exh-grid-item';
        gridItem.href = linkA.href;
        if (uploaderName) {
            gridItem.dataset.uploader = uploaderName;
        }
        if (rowTags.length > 0) {
            gridItem.dataset.tags = JSON.stringify(rowTags);
        }

        const imgSrc = thumbImg.getAttribute('data-src') || thumbImg.src;
        const ratingStyleAttr = ratingDiv ? ratingDiv.getAttribute('style') : '';
        const pagesText = pagesDiv ? pagesDiv.textContent.trim() : '';
        const dateText = dateDiv ? dateDiv.textContent.trim() : '';
        const langText = langTagDiv ? langTagDiv.textContent.trim() : '';

        const thumbnailLink = document.createElement('div');
        thumbnailLink.className = 'exh-grid-thumbnail-link';
        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = titleDiv.textContent;
        img.loading = 'lazy';
        thumbnailLink.appendChild(img);

        // 若該畫廊有閱讀進度紀錄，於縮圖右上角顯示進度徽章
        const gidMatch = linkA.href.match(/\/g\/(\d+)\//);
        const galleryId = gidMatch ? gidMatch[1] : null;
        if (galleryId && readingProgressMap.has(galleryId)) {
            const prog = readingProgressMap.get(galleryId);
            if (prog && prog.lastReadPage) {
                const badge = document.createElement('div');
                badge.className = 'exh-grid-progress-badge';
                if (prog.totalPages > 0 && prog.lastReadPage >= prog.totalPages) {
                    badge.classList.add('exh-completed');
                    badge.textContent = i18n.readCompletedBadge
                        ? i18n.readCompletedBadge.replace('{total}', prog.totalPages)
                        : `✓ 已讀 (${prog.totalPages}p)`;
                } else {
                    badge.textContent = prog.totalPages
                        ? `📖 ${prog.lastReadPage}/${prog.totalPages}`
                        : `📖 P.${prog.lastReadPage}`;
                }
                thumbnailLink.appendChild(badge);
            }
        }

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
            const clonedCategory = categoryDiv.cloneNode(true);
            clonedCategory.classList.add('cn');
            categoryRow.appendChild(clonedCategory);
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

        if (pagesText) {
            const pagesSpan = document.createElement('span');
            pagesSpan.textContent = `${pagesText.replace(/\s*pages/i, '')}p`;
            footerDiv.appendChild(pagesSpan);
        }

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

        if (tagElements.length > 0) {
            const overlayTags = document.createElement('div');
            overlayTags.className = 'exh-overlay-tags';

            tagElements.forEach(tagNode => {
                const clonedTag = tagNode.cloneNode(true);
                clonedTag.classList.add('gt');
                const originalTag = clonedTag.getAttribute('title');

                if (originalTag && translationMap.has(originalTag)) {
                    const displayTag = translationMap.get(originalTag);
                    const displayValue = displayTag.substring(displayTag.indexOf(':') + 1).trim();
                    if (displayValue) {
                        clonedTag.textContent = displayValue;
                    }
                }
                if (originalTag && savedTagSet.has(originalTag)) {
                    clonedTag.classList.add('exh-saved-tag');
                    clonedTag.textContent = `★ ${clonedTag.textContent}`;
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
    if (loader) loader.textContent = i18n.gridLoadingNextPage || '正在載入下一頁...';

    try {
        const doc = await fetchAndParsePage(nextPageUrl);
        if (!doc) {
            throw new Error('無法抓取或解析下一頁的內容。');
        }

        const gridContainer = document.querySelector('.exh-grid-view');
        const newRows = doc.querySelectorAll('.itg tbody > tr, .itg > div[class^="gl1"]');
        if (newRows.length > 0 && gridContainer) {
            currentLoadedPageNumber += 1;
            const divider = document.createElement('div');
            divider.className = 'exh-grid-page-divider';
            divider.textContent = i18n.gridPageDivider
                ? i18n.gridPageDivider.replace('{page}', currentLoadedPageNumber)
                : `第 ${currentLoadedPageNumber} 頁`;
            gridContainer.appendChild(divider);
        }

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
            if (loader) loader.textContent = i18n.gridAllLoaded || '已載入所有內容。';
            if (intersectionObserver) intersectionObserver.disconnect();
        }

    } catch (error) {
        console.error('[ExH] 載入下一頁時發生錯誤:', error);
        if (loader) loader.textContent = i18n.gridLoadFailed || '載入失敗，請檢查主控台。';
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

/**
 * 取得底部分頁列元素（保留頂部分頁列方便跳頁）
 * @returns {HTMLElement|null}
 */
function getBottomPaginator() {
    const ptb = document.querySelector('.ptb');
    if (ptb) return ptb;
    const searchNavs = document.querySelectorAll('.searchnav');
    if (searchNavs.length > 1) {
        return searchNavs[searchNavs.length - 1];
    }
    return null;
}

async function transformToGridView() {
    const originalTable = document.querySelector('.itg');
    if (!originalTable || document.querySelector('.exh-grid-view')) return;

    console.log('[ExH] 啟用網格視圖並設定無限滾動...');
    injectGridViewCSS();

    translationMap.clear();
    savedTagSet.clear();
    readingProgressMap.clear();
    currentLoadedPageNumber = 1;

    const [savedTagsRes, progressRes] = await Promise.all([
        browser.runtime.sendMessage({ type: 'get_saved_tags' }).catch(() => ({ tags: [] })),
        browser.runtime.sendMessage({ type: 'get_reading_progress' }).catch(() => ({ progressMap: {} }))
    ]);

    const savedTags = savedTagsRes?.tags || [];
    for (const tag of savedTags) {
        savedTagSet.add(tag.original);
        if (tag.original !== tag.display) {
            translationMap.set(tag.original, tag.display);
        }
    }

    const progressObj = progressRes?.progressMap || {};
    for (const [gid, prog] of Object.entries(progressObj)) {
        readingProgressMap.set(gid, prog);
    }

    const gridContainer = document.createElement('div');
    gridContainer.className = 'exh-grid-view';

    const rows = originalTable.querySelectorAll('tbody > tr, div[class^="gl1"]');
    rows.forEach(row => {
        const gridItem = createGridItemFromRow(row);
        if (gridItem) {
            gridContainer.appendChild(gridItem);
        }
    });

    if (!originalTable.dataset.exhGridOriginalDisplay) {
        originalTable.dataset.exhGridOriginalDisplay = originalTable.style.display || '';
    }

    originalTable.style.display = 'none';

    const bottomPagenator = getBottomPaginator();
    if (bottomPagenator) {
        if (!bottomPagenator.dataset.exhGridOriginalDisplay) {
            bottomPagenator.dataset.exhGridOriginalDisplay = bottomPagenator.style.display || '';
        }
        bottomPagenator.style.display = 'none';
    }

    originalTable.parentElement.insertBefore(gridContainer, originalTable);

    setupInfiniteScroll();
    isGridViewActive = true;
}

export function updateGridColumns(columns) {
    window.scriptSettings.gridColumns = columns;
    if (isGridViewActive) {
        injectGridViewCSS();
    }
}

export async function enableGridView() {
    if (isGridViewActive) {
        injectGridViewCSS();
        return;
    }
    try {
        i18n = await getI18nMessages('all');
    } catch (_) {}
    await transformToGridView();
    if (document.querySelector('.exh-grid-view')) {
        isGridViewActive = true;
        hasInitializedGridView = true;
    }
}

export function disableGridView() {
    if (!isGridViewActive) return;
    const gridContainer = document.querySelector('.exh-grid-view');
    const loader = document.getElementById('exh-grid-loader');
    const originalTable = document.querySelector('.itg');
    const bottomPagenator = getBottomPaginator();

    if (intersectionObserver) {
        intersectionObserver.disconnect();
        intersectionObserver = null;
    }
    nextPageUrl = null;
    isLoadingNextPage = false;

    if (gridContainer) gridContainer.remove();
    if (loader) loader.remove();
    if (originalTable) {
        originalTable.style.display = originalTable.dataset.exhGridOriginalDisplay || '';
        delete originalTable.dataset.exhGridOriginalDisplay;
    }
    if (bottomPagenator) {
        bottomPagenator.style.display = bottomPagenator.dataset.exhGridOriginalDisplay || '';
        delete bottomPagenator.dataset.exhGridOriginalDisplay;
    }
    isGridViewActive = false;
}

export async function initGridView() {
    if (hasInitializedGridView) {
        console.warn('[ExH] 網格視圖模組已初始化，跳過重複執行。');
    }
    await enableGridView();
}

browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'uploader_blocked') {
        const uploaderName = message.uploader;
        if (!uploaderName) return;

        // 移除 grid view 中的項目（避免特殊字元造成 CSS 選擇器語法錯誤）
        const gridItems = document.querySelectorAll('.exh-grid-item[data-uploader]');
        gridItems.forEach(item => {
            if (item.dataset.uploader === uploaderName) {
                item.remove();
            }
        });
    } else if (message.type === 'tag_blocked') {
        const blockedTag = message.tag;
        if (!blockedTag) return;

        const gridItems = document.querySelectorAll('.exh-grid-item[data-tags]');
        gridItems.forEach(item => {
            try {
                const tags = JSON.parse(item.dataset.tags || '[]');
                if (tags.includes(blockedTag)) {
                    item.remove();
                }
            } catch (e) {
                // ignore JSON parse error
            }
        });
    }
});