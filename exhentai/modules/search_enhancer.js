/**
 * 搜尋增強器模組 (v1.7 - 查詢邏輯修正)
 * - 在搜尋框下方新增一個可顯示/隱藏的已儲存標籤列。
 * - 點擊標籤可將其加入搜尋框，並防止重複添加。
 * - 新增標籤分類篩選與排序功能。
 * - 重新設計UI以匹配網站主題。
 * - 新增多語系支援。
 * - 修正：移除 innerHTML 的使用，改為安全的 DOM 操作以符合上架規範。
 * - 修正：正確處理帶有空格的標籤查詢語法 (例如 artist:"fujisaki hikari$")。
 */

function injectCSS() {
    const styleId = 'exh-search-enhancer-style';
    if (document.getElementById(styleId)) return;

    const css = `
        /* 主容器，移入搜尋框內 */
        #exh-tags-bar {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #555;
        }
        .exh-tags-bar-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        /* 讓連結樣式與網站原生連結一致 */
        #exh-tags-bar-toggle {
            font-size: 10pt;
            color: #999;
            cursor: pointer;
            text-decoration: none;
        }
        #exh-tags-bar-toggle:hover {
            text-decoration: underline;
            color: #ccc;
        }
        .exh-tags-filter-container {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 10pt;
            color: #999;
        }
        #exh-tags-filter-select {
            font-size: 12px;
            border-radius: 4px;
            border: 1px solid #555;
            background-color: #3a3a3a;
            color: #e0e0e0;
        }
        #exh-tags-container {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .exh-search-tag {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: transform 0.1s ease-out;
        }
        .exh-search-tag:hover {
            transform: translateY(-1px);
        }
        /* 使用深色模式的標籤顏色 */
        .exh-search-tag--artist { background-color: #4c2a7e; color: #c084fc; }
        .exh-search-tag--group { background-color: #14532d; color: #86efac; }
        .exh-search-tag--parody { background-color: #7f1d1d; color: #fda4af; }
        .exh-search-tag--character { background-color: #1e3a8a; color: #93c5fd; }
        .exh-search-tag--language { background-color: #0c4a6e; color: #7dd3fc; }
        .exh-search-tag--other { background-color: #374151; color: #d1d5db; }
    `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

function handleTagClick(event) {
    const tagText = event.target.dataset.tag;
    const searchInput = document.getElementById('f_search');
    if (!tagText || !searchInput) return;

    const currentSearchValue = searchInput.value;
    // 檢查標籤是否已存在於搜尋框中
    const escapedTagText = tagText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tagRegex = new RegExp(`(^|\\s)("?${escapedTagText}"?\\$?)(\\s|$)`);

    if (tagRegex.test(currentSearchValue)) {
        console.log(`標籤 "${tagText}" 已存在於搜尋中，操作已取消。`);
        return;
    }

    // --- [修正] 正確處理帶有空格的標籤 ---
    let searchTerm;
    const colonIndex = tagText.indexOf(':');
    
    // 確保標籤格式正確 (包含一個冒號)
    if (colonIndex > -1) {
        const type = tagText.substring(0, colonIndex);
        const value = tagText.substring(colonIndex + 1);

        if (value.includes(' ')) {
            // 如果值包含空格，則將值用引號括起來，並將 $ 放在引號內
            searchTerm = `${type}:"${value}$"`;
        } else {
            // 如果值不含空格，則正常添加 $
            searchTerm = `${tagText}$`;
        }
    } else {
        // 對於沒有分類的標籤 (雖然不常見，但做個保護)
        if (tagText.includes(' ')) {
            searchTerm = `"${tagText}$"`;
        } else {
            searchTerm = `${tagText}$`;
        }
    }

    if (searchInput.value.trim() === '') {
        searchInput.value = searchTerm;
    } else {
        searchInput.value += ' ' + searchTerm;
    }
}

function renderTags(allTags, filter, container) {
    // 安全地清空容器
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    const filteredTags = filter === 'all'
        ? allTags
        : allTags.filter(t => t.startsWith(filter + ':'));

    if (filteredTags.length === 0) {
        return;
    }

    filteredTags.forEach(tag => {
        const parts = tag.split(':');
        const type = parts[0];

        const tagEl = document.createElement('span');
        tagEl.className = 'exh-search-tag';
        tagEl.textContent = tag;
        tagEl.dataset.tag = tag;

        const validTypes = ['artist', 'group', 'parody', 'character', 'language'];
        const colorType = validTypes.includes(type) ? type : 'other';
        tagEl.classList.add(`exh-search-tag--${colorType}`);

        tagEl.addEventListener('click', handleTagClick);
        container.appendChild(tagEl);
    });
}

async function createUI() {
    const searchBox = document.getElementById('searchbox');
    const searchInput = document.getElementById('f_search');
    if (!searchBox || !searchInput || document.getElementById('exh-tags-bar')) return;

    // 1. 從背景腳本獲取翻譯
    const { messages } = await browser.runtime.sendMessage({ 
        type: 'get_i18n_messages', 
        keys: ['toggleSavedTags', 'filterByCategory', 'filterShowAll'] 
    });

    const { tags } = await browser.runtime.sendMessage({ type: 'get_saved_tags' });
    if (!tags || tags.length === 0) return;

    const categoryOrder = ['language', 'parody', 'group', 'artist'];
    tags.sort((a, b) => {
        const typeA = a.split(':')[0];
        const typeB = b.split(':')[0];
        const indexA = categoryOrder.indexOf(typeA);
        const indexB = categoryOrder.indexOf(typeB);

        const orderA = indexA === -1 ? categoryOrder.length : indexA;
        const orderB = indexB === -1 ? categoryOrder.length : indexB;

        if (orderA !== orderB) {
            return orderA - orderB;
        }
        return a.localeCompare(b);
    });

    const bar = document.createElement('div');
    bar.id = 'exh-tags-bar';

    const header = document.createElement('div');
    header.className = 'exh-tags-bar-header';
    
    const toggle = document.createElement('a');
    toggle.id = 'exh-tags-bar-toggle';
    toggle.textContent = messages.toggleSavedTags || '[Show/Hide Saved Tags]';

    const filterContainer = document.createElement('div');
    filterContainer.className = 'exh-tags-filter-container';
    
    const filterLabel = document.createElement('label');
    filterLabel.htmlFor = 'exh-tags-filter-select';
    filterLabel.textContent = messages.filterByCategory || 'Filter by category:';

    const filterSelect = document.createElement('select');
    filterSelect.id = 'exh-tags-filter-select';

    const container = document.createElement('div');
    container.id = 'exh-tags-container';
    container.style.display = 'none';

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        container.style.display = container.style.display === 'none' ? 'flex' : 'none';
    });

    const categories = [...new Set(tags.map(t => t.split(':')[0]))];
    categories.sort((a, b) => {
        const indexA = categoryOrder.indexOf(a);
        const indexB = categoryOrder.indexOf(b);
        const orderA = indexA === -1 ? categoryOrder.length : indexA;
        const orderB = indexB === -1 ? categoryOrder.length : indexB;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
    });

    // 安全地建立 <select> 選項
    const showAllOption = document.createElement('option');
    showAllOption.value = 'all';
    showAllOption.textContent = messages.filterShowAll || 'Show All';
    filterSelect.appendChild(showAllOption);

    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        filterSelect.appendChild(option);
    });

    filterSelect.addEventListener('change', () => {
        renderTags(tags, filterSelect.value, container);
    });

    filterContainer.appendChild(filterLabel);
    filterContainer.appendChild(filterSelect);
    header.appendChild(toggle);
    header.appendChild(filterContainer);
    bar.appendChild(header);
    bar.appendChild(container);
    
    searchInput.parentElement.insertAdjacentElement('afterend', bar);

    renderTags(tags, 'all', container);
}

export function initSearchEnhancer() {
    injectCSS();
    createUI();
}
