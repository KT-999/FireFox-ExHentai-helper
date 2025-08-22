/**
 * 搜尋增強器模組 (v1.2.9 - 新增標籤顏色)
 * - 新增：為 reclass, male 標籤類別增加配色。
 * - 更新：將標籤搜尋框移至獨立的一行，以解決擁擠問題。
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
            flex-wrap: wrap; /* 允許內部元素換行 */
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            gap: 10px; /* 調整間距 */
        }
        /* 讓連結樣式與網站原生連結一致 */
        #exh-tags-bar-toggle {
            font-size: 10pt;
            color: #999;
            cursor: pointer;
            text-decoration: none;
            flex-shrink: 0; /* 防止切換按鈕被壓縮 */
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
            flex-shrink: 0; /* 防止被壓縮 */
            margin-left: auto; /* 將篩選器推到右邊 */
        }
        /* --- 版面修正 --- */
        /* 讓搜尋框容器佔滿整行，從而實現換行 */
        .exh-tags-search-container {
            flex-basis: 100%; /* 佔滿父容器的整個寬度 */
            order: 3; /* 確保它顯示在最後 */
        }
        #exh-tags-search-input {
            width: 100%;
            padding: 3px 6px;
            font-size: 12px;
            border-radius: 4px;
            border: 1px solid #555;
            background-color: #3a3a3a;
            color: #e0e0e0;
            box-sizing: border-box;
        }
        #exh-tags-search-input:focus {
            outline: none;
            border-color: #777;
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
        /* --- 新增配色 --- */
        .exh-search-tag--male { background-color: #164e63; color: #67e8f9; }
        .exh-search-tag--reclass { background-color: #78350f; color: #fcd34d; }
    `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

function handleTagClick(event) {
    const tagText = event.currentTarget.dataset.tag; 
    const searchInput = document.getElementById('f_search');
    if (!tagText || !searchInput) return;

    const currentSearchValue = searchInput.value;
    const escapedTagText = tagText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tagRegex = new RegExp(`(^|\\s)("?${escapedTagText}"?\\$?)(\\s|$)`);

    if (tagRegex.test(currentSearchValue)) {
        console.log(`標籤 "${tagText}" 已存在於搜尋中，操作已取消。`);
        return;
    }

    let searchTerm;
    const colonIndex = tagText.indexOf(':');
    
    if (colonIndex > -1) {
        const type = tagText.substring(0, colonIndex);
        const value = tagText.substring(colonIndex + 1);

        if (value.includes(' ')) {
            searchTerm = `${type}:"${value}$"`;
        } else {
            searchTerm = `${tagText}$`;
        }
    } else {
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

function renderTags(allTags, filter, searchTerm, container) {
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    const getTagValue = (tagString) => {
        const colonIndex = tagString.indexOf(':');
        return colonIndex > -1 ? tagString.substring(colonIndex + 1).trim() : tagString;
    };

    const categoryFilteredTags = filter === 'all'
        ? allTags
        : allTags.filter(t => t.original.startsWith(filter + ':'));

    const finalFilteredTags = searchTerm === ''
        ? categoryFilteredTags
        : categoryFilteredTags.filter(t => {
            const originalValue = getTagValue(t.original).toLowerCase();
            const displayValue = getTagValue(t.display).toLowerCase();
            return originalValue.includes(searchTerm) || displayValue.includes(searchTerm);
          });

    if (finalFilteredTags.length === 0) return;

    finalFilteredTags.forEach(tag => {
        const parts = tag.original.split(':');
        const type = parts[0];
        const tagEl = document.createElement('span');
        tagEl.className = 'exh-search-tag';
        tagEl.textContent = tag.display;
        tagEl.dataset.tag = tag.original;
        const validTypes = ['artist', 'group', 'parody', 'character', 'language', 'male', 'reclass'];
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

    const { messages } = await browser.runtime.sendMessage({ 
        type: 'get_i18n_messages', 
        keys: ['toggleSavedTags', 'filterByCategory', 'filterShowAll', 'searchTagsPlaceholder'] 
    });

    const { tags } = await browser.runtime.sendMessage({ type: 'get_saved_tags' });
    if (!tags || tags.length === 0) return;

    const categoryOrder = ['language', 'parody', 'group', 'artist'];
    tags.sort((a, b) => {
        const typeA = a.original.split(':')[0];
        const typeB = b.original.split(':')[0];
        const indexA = categoryOrder.indexOf(typeA);
        const indexB = categoryOrder.indexOf(typeB);
        const orderA = indexA === -1 ? categoryOrder.length : indexA;
        const orderB = indexB === -1 ? categoryOrder.length : indexB;
        if (orderA !== orderB) return orderA - orderB;
        return a.original.localeCompare(b.original);
    });

    const bar = document.createElement('div');
    bar.id = 'exh-tags-bar';

    const header = document.createElement('div');
    header.className = 'exh-tags-bar-header';
    
    const toggle = document.createElement('a');
    toggle.id = 'exh-tags-bar-toggle';
    toggle.href = '#';
    toggle.textContent = messages.toggleSavedTags || '[Show/Hide Saved Tags]';

    const filterContainer = document.createElement('div');
    filterContainer.className = 'exh-tags-filter-container';
    
    const filterLabel = document.createElement('label');
    filterLabel.htmlFor = 'exh-tags-filter-select';
    filterLabel.textContent = messages.filterByCategory || 'Filter by category:';

    const filterSelect = document.createElement('select');
    filterSelect.id = 'exh-tags-filter-select';

    const searchContainer = document.createElement('div');
    searchContainer.className = 'exh-tags-search-container';
    const tagSearchInput = document.createElement('input');
    tagSearchInput.type = 'search';
    tagSearchInput.id = 'exh-tags-search-input';
    tagSearchInput.placeholder = messages.searchTagsPlaceholder || 'Search tags...';
    searchContainer.appendChild(tagSearchInput);

    const container = document.createElement('div');
    container.id = 'exh-tags-container';
    container.style.display = 'none';

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        container.style.display = container.style.display === 'none' ? 'flex' : 'none';
    });

    const categories = [...new Set(tags.map(t => t.original.split(':')[0]))];
    categories.sort((a, b) => {
        const indexA = categoryOrder.indexOf(a);
        const indexB = categoryOrder.indexOf(b);
        const orderA = indexA === -1 ? categoryOrder.length : indexA;
        const orderB = indexB === -1 ? categoryOrder.length : indexB;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
    });
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

    const updateRender = () => {
        const category = filterSelect.value;
        const term = tagSearchInput.value.toLowerCase().trim();
        renderTags(tags, category, term, container);
    };

    filterSelect.addEventListener('change', updateRender);
    tagSearchInput.addEventListener('input', updateRender);

    filterContainer.appendChild(filterLabel);
    filterContainer.appendChild(filterSelect);
    
    header.appendChild(toggle);
    header.appendChild(filterContainer);
    header.appendChild(searchContainer);

    bar.appendChild(header);
    bar.appendChild(container);
    
    searchInput.parentElement.insertAdjacentElement('afterend', bar);

    renderTags(tags, 'all', '', container);
}

export function initSearchEnhancer() {
    injectCSS();
    createUI();
}
