/**
 * 搜尋增強器模組 (v1.2.7 - 改善搜尋邏輯)
 * - 更新：搜尋功能現在會排除標籤種類 (如 "artist:")，僅搜尋標籤名稱。
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
            gap: 15px; /* 新增間距 */
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
            flex-shrink: 0; /* 防止被壓縮 */
        }
        /* 新增搜尋框樣式 */
        .exh-tags-search-container {
            flex-grow: 1; /* 佔滿剩餘空間 */
            max-width: 250px; /* 可選：限制最大寬度 */
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
    `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

function handleTagClick(event) {
    const tagText = event.currentTarget.dataset.tag; // 使用 currentTarget 以確保點到的是父元素
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

    // 輔助函式，用於提取標籤字串中的值部分
    const getTagValue = (tagString) => {
        const colonIndex = tagString.indexOf(':');
        return colonIndex > -1 ? tagString.substring(colonIndex + 1).trim() : tagString;
    };

    // 1. 類別篩選
    const categoryFilteredTags = filter === 'all'
        ? allTags
        : allTags.filter(t => t.original.startsWith(filter + ':'));

    // 2. 關鍵字搜尋 (僅搜尋標籤值，排除種類)
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

    const controlsWrapper = document.createElement('div');
    controlsWrapper.style.cssText = 'display: flex; align-items: center; gap: 15px; flex-grow: 1; justify-content: flex-end;';

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
    
    controlsWrapper.appendChild(searchContainer);
    controlsWrapper.appendChild(filterContainer);

    header.appendChild(toggle);
    header.appendChild(controlsWrapper);

    bar.appendChild(header);
    bar.appendChild(container);
    
    searchInput.parentElement.insertAdjacentElement('afterend', bar);

    renderTags(tags, 'all', '', container);
}

export function initSearchEnhancer() {
    injectCSS();
    createUI();
}
