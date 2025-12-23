/**
 * 搜尋增強器模組 (v1.3.6 - 最終修正重複選取與語法問題)
 * - 修正：重寫正規化函式，確保在任何情況下都能正確防止標籤被重複選取。
 * - 修正：確保為含空格標籤添加 '$' 時，該符號被正確放置在引號內部。
 * - 更新：[顯示/隱藏] 連結現在會同時控制搜尋框與標籤列表的可見性。
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
        .exh-search-tag--male { background-color: #164e63; color: #67e8f9; }
        .exh-search-tag--reclass { background-color: #78350f; color: #fcd34d; }
    `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

// *** 修正 ***: 使用更可靠的字串方法重寫正規化函式
function normalizeTag(tagString) {
    let cleaned = tagString.trim();
    // 移除所有的引號
    cleaned = cleaned.replace(/"/g, '');
    // 移除結尾的 '$'
    if (cleaned.endsWith('$')) {
        cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
}

const __exh_orig_handleTagClick = handleTagClick;
function handleTagClick(event) {
    const tagText = event?.currentTarget?.dataset?.tag;
    const searchInput =
        document.getElementById('f_search') ||
        document.querySelector('input[name="f_search"]');

    if (!tagText || !searchInput) return;

    const currentSearchValue = (searchInput.value || '').trim();

    // 1) 正規化要被加入的標籤（用你既有的 normalizeTag）
    const normalizedTagToAdd = normalizeTag(tagText);

    // 2) 解析現有 f_search（支援：type:"xxx$"、"xxx$"、一般 token）
    const terms =
        currentSearchValue.match(/[a-zA-Z0-9_]+:"[^"]+"\$?|"[^"]+"\$?|[^\s"]+\$?/g) || [];

    // 3) 防止重複加入（用 normalizeTag 比對）
    const exists = terms.some(t => normalizeTag(t) === normalizedTagToAdd);
    if (exists) return;

    // 4) 組出要加入的搜尋片段（確保 $ 在引號內/字尾）
    const colonIndex = tagText.indexOf(':');
    const type = colonIndex > -1 ? tagText.slice(0, colonIndex).trim() : null;
    const value = colonIndex > -1 ? tagText.slice(colonIndex + 1).trim() : tagText.trim();

    let searchTermToAdd;
    if (/\s/.test(value)) {
        // 有空白：用引號包住，$ 放在引號內最後
        searchTermToAdd = type ? `${type}:"${value}$"` : `"${value}$"`;
    } else {
        // 無空白：直接加 $ 在字尾
        searchTermToAdd = type ? `${type}:${value}$` : `${value}$`;
    }

    // 5) 寫回 f_search
    searchInput.value = currentSearchValue ? `${currentSearchValue} ${searchTermToAdd}` : searchTermToAdd;

    // 6) 觸發事件，讓頁面原生行為/其他監聽器同步
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
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

const selectedSearchTags = new Set();

// 與現有書籤排序規則一致：language → parody → group → artist → 其他(字母序)
const BOOKMARK_CATEGORY_ORDER = ['language', 'parody', 'group', 'artist'];

function compareTagKeys(aKey, bKey) {
    const typeA = (aKey || '').split(':')[0];
    const typeB = (bKey || '').split(':')[0];

    const indexA = BOOKMARK_CATEGORY_ORDER.indexOf(typeA);
    const indexB = BOOKMARK_CATEGORY_ORDER.indexOf(typeB);

    const orderA = indexA === -1 ? BOOKMARK_CATEGORY_ORDER.length : indexA;
    const orderB = indexB === -1 ? BOOKMARK_CATEGORY_ORDER.length : indexB;

    if (orderA !== orderB) return orderA - orderB;
    return (aKey || '').localeCompare(bKey || '');
}

function sortSelectedTagChips(selectedContainer) {
    if (!selectedContainer) return;

    const chips = Array.from(selectedContainer.querySelectorAll('.exh-selected-tag'));
    chips.sort((a, b) => compareTagKeys(a.dataset.tag, b.dataset.tag));

    for (const chip of chips) selectedContainer.appendChild(chip);
}

function injectSelectedTagCSS() {
    const styleId = 'exh-selected-tags-style';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        /* 讓拼圖區 + 搜尋框在同一欄，且靠左 */
        .exh-tags-search-container {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 6px; /* 拼圖區與 input 的距離 */
        }

        /* 拼圖容器 */
        .exh-selected-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            justify-content: flex-start;
            width: 100%;
            padding-top: 2px;
        }

        /* 拼圖本體（顏色由你在 JS 內 inline 套用） */
        .exh-selected-tag {
            position: relative;
            display: inline-flex;
            align-items: center;
            padding: 3px 10px 3px 12px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            user-select: none;
            line-height: 1.5;

            /* 不指定主色，避免蓋掉你套用的 background/color */
            border: 1px solid rgba(0, 0, 0, 0.25);
            box-shadow: 0 1px 0 rgba(0,0,0,0.25);
            transition: transform 120ms ease, filter 120ms ease, box-shadow 120ms ease;
            will-change: transform;
        }

        /* 拼圖凹凸：左側小凸點（像拼圖扣件） */
        .exh-selected-tag::before {
            content: '';
            position: absolute;
            left: -6px;
            top: 50%;
            transform: translateY(-50%);
            width: 12px;
            height: 12px;
            border-radius: 999px;
            background: inherit; /* 跟拼圖同色 */
            box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
        }

        /* 右側顯示 ✕（你仍然點整塊即可移除） */
        .exh-selected-tag::after {
            content: '✕';
            margin-left: 6px;
            font-size: 11px;
            opacity: 0.75;
        }

        .exh-selected-tag:hover {
            transform: translateY(-1px);
            filter: brightness(1.05);
            box-shadow: 0 6px 16px rgba(0,0,0,0.28);
        }

        .exh-selected-tag:hover::after {
            opacity: 1;
        }

        .exh-selected-tag:active {
            transform: translateY(0px) scale(0.99);
            filter: brightness(1.0);
            box-shadow: 0 2px 6px rgba(0,0,0,0.22);
        }
    `;
    document.head.appendChild(style);
}


function getFSearchInput() {
    return document.getElementById('f_search') || document.querySelector('input[name="f_search"]');
}

function getSearchEnhancerContainer() {
    return document.querySelector('.exh-tags-search-container');
}

function isSavedTagsPanelExpanded() {
    const c = getSearchEnhancerContainer();
    if (!c) return false;
    return getComputedStyle(c).display !== 'none';
}

function parseSearchTerms(value) {
    const v = (value || '').trim();
    if (!v) return [];
    return v.match(/[a-zA-Z0-9_]+:"[^"]+"\$?|"[^"]+"\$?|[^\s"]+\$?/g) || [];
}

function cssEscapeSafe(v) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(v);
    return String(v).replace(/["\\]/g, '\\$&');
}

// 將 f_search 的 token 轉回 tagKey（例如 language:"chinese$" -> language:chinese）
function termToTagKey(term) {
    if (!term) return null;
    let t = term.trim();

    // 分離 type 與 value
    const colonIndex = t.indexOf(':');
    let type = null;
    let value = t;

    if (colonIndex > -1) {
        type = t.slice(0, colonIndex).trim();
        value = t.slice(colonIndex + 1).trim();
    }

    // 去掉引號
    if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
    }

    // 去掉尾端 $
    if (value.endsWith('$')) value = value.slice(0, -1);

    // 再次清理殘留引號（保險）
    value = value.replace(/"/g, '').trim();

    if (!value) return null;
    return type ? `${type}:${value}` : value;
}

// 依 f_search 還原拼圖（只還原「已儲存標籤」中存在的 tag）
function restoreSelectedChipsFromFSearch(savedTags) {
    const input =
        document.getElementById('f_search') ||
        document.querySelector('input[name="f_search"]');

    if (!input) return;

    const terms = parseSearchTerms(input.value);
    if (!terms.length) return;

    const savedSet = new Set(savedTags.map(t => normalizeTag(t.original)));

    const selectedContainer = ensureSelectedTagsContainer();
    if (!selectedContainer) return;

    for (const term of terms) {
        const key = termToTagKey(term);
        if (!key) continue;

        const normKey = normalizeTag(key);
        if (!savedSet.has(normKey)) continue;                // 只顯示「已儲存」的
        if (selectedSearchTags.has(normKey)) continue;       // 防重複（你已有 Set）

        // 找到下方對應的 tag 元素，拿它的顏色
        const source = document.querySelector(
            `.exh-search-tag[data-tag="${cssEscapeSafe(key)}"]`
        );

        const chip = document.createElement('span');
        chip.className = `exh-selected-tag${source ? ' ' + [...source.classList].join(' ') : ''}`;
        chip.dataset.tag = key;
        chip.textContent = source ? source.textContent : key;

        // 套用顏色（如果找得到 source 就完全一致）
        if (source) {
            try {
                const cs = getComputedStyle(source);
                chip.style.backgroundColor = cs.backgroundColor;
                chip.style.color = cs.color;
            } catch (_) {}
        }

        // 點擊拼圖 → 移除 + 同步移除 f_search
        chip.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const parent = chip.parentElement;
            selectedSearchTags.delete(normKey);
            chip.remove();
            removeTagFromFSearch(key);
            sortSelectedTagChips(parent);
        });

        selectedSearchTags.add(normKey);
        selectedContainer.appendChild(chip);
    }

    sortSelectedTagChips(selectedContainer);
}

function setFSearchValue(terms) {
    const input = getFSearchInput();
    if (!input) return;

    input.value = terms.join(' ').trim();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function addTagToFSearch(tagText) {
    const input = getFSearchInput();
    if (!input || !tagText) return;

    const currentSearchValue = input.value.trim();
    const normalizedTagToAdd = normalizeTag(tagText);
    const searchTerms = parseSearchTerms(currentSearchValue);

    const exists = searchTerms.some(term => normalizeTag(term) === normalizedTagToAdd);
    if (exists) return;

    const colonIndex = tagText.indexOf(':');
    const type = colonIndex > -1 ? tagText.substring(0, colonIndex).trim() : null;
    const value = colonIndex > -1 ? tagText.substring(colonIndex + 1).trim() : tagText.trim();

    let searchTermToAdd;
    if (value.includes(' ')) {
        // $ 必須在引號內
        searchTermToAdd = type ? `${type}:"${value}$"` : `"${value}$"`;
    } else {
        searchTermToAdd = type ? `${type}:${value}$` : `${value}$`;
    }

    const nextTerms = currentSearchValue ? [...searchTerms, searchTermToAdd] : [searchTermToAdd];
    setFSearchValue(nextTerms);
}

function removeTagFromFSearch(tagText) {
    const input = getFSearchInput();
    if (!input || !tagText) return;

    const current = input.value.trim();
    const terms = parseSearchTerms(current);
    if (terms.length === 0) return;

    const normalizedToRemove = normalizeTag(tagText);
    const nextTerms = terms.filter(t => normalizeTag(t) !== normalizedToRemove);
    setFSearchValue(nextTerms);
}

function applyTagColorsFromSource(sourceEl, targetEl) {
    try {
        const cs = getComputedStyle(sourceEl);
        targetEl.style.backgroundColor = cs.backgroundColor;
        targetEl.style.color = cs.color;
        targetEl.style.borderColor = cs.borderColor;
        if (cs.borderStyle && cs.borderStyle !== 'none') {
            targetEl.style.borderStyle = cs.borderStyle;
            targetEl.style.borderWidth = cs.borderWidth;
        }
    } catch (_) {}
}

function addSelectedTagChip(sourceTagEl) {
    if (!sourceTagEl) return;
    if (!isSavedTagsPanelExpanded()) return;

    const tagKey = sourceTagEl.dataset.tag;
    if (!tagKey) return;

    const normKey = normalizeTag(tagKey);
    if (selectedSearchTags.has(normKey)) return;

    const selectedContainer = ensureSelectedTagsContainer();
    if (!selectedContainer) return;

    const chip = document.createElement('span');
    chip.className = 'exh-selected-tag';
    chip.dataset.tag = tagKey;
    chip.textContent = sourceTagEl.textContent;

    applyTagColorsFromSource(sourceTagEl, chip);

    chip.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedSearchTags.delete(normKey);
        chip.remove();
        removeTagFromFSearch(tagKey);
        sortSelectedTagChips(selectedContainer);
    });

    selectedSearchTags.add(normKey);
    selectedContainer.appendChild(chip);
    sortSelectedTagChips(selectedContainer);
}

async function createUI() {
    const searchInput = document.getElementById('f_search') || document.querySelector('input[name="f_search"]');
    if (!searchInput || document.getElementById('exh-tags-bar')) return;

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
    searchContainer.style.display = 'none';

    const container = document.createElement('div');
    container.id = 'exh-tags-container';
    container.style.display = 'none';

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const isHidden = container.style.display === 'none';
        searchContainer.style.display = isHidden ? 'block' : 'none';
        container.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
            restoreSelectedChipsFromFSearch(tags);
        }
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
    restoreSelectedChipsFromFSearch(tags);
    
}

export function initSearchEnhancer() {
    injectCSS();
    createUI();
    injectSelectedTagCSS();
}


(function injectSelectedTagStyle() {
    if (document.getElementById('exh-selected-tags-style')) return;

    const style = document.createElement('style');
    style.id = 'exh-selected-tags-style';
    style.textContent += `
        .exh-tags-search-container {
            display: flex;
            flex-direction: column;
            align-items: flex-start; /* ← 關鍵：整個搜尋區塊靠左 */
        }

        .exh-selected-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            justify-content: flex-start; /* ← 拼圖列靠左 */
            width: 100%;
        }
    `;
        document.head.appendChild(style);
    })();

function ensureSelectedTagsContainer() {
    const searchContainer = document.querySelector('.exh-tags-search-container');
    if (!searchContainer) return null;

    let selectedTags = searchContainer.querySelector('.exh-selected-tags');
    if (selectedTags) return selectedTags;

    selectedTags = document.createElement('div');
    selectedTags.className = 'exh-selected-tags';

    // 插在 input 前面，避免影響外層結構
    searchContainer.prepend(selectedTags);

    return selectedTags;
}

function handleSearchTagClick(e) {
    const tagEl = e.target.closest('.exh-search-tag');
    if (!tagEl) return;

    const searchContainer = document.querySelector('.exh-tags-search-container');
    if (!searchContainer || searchContainer.style.display === 'none') return;

    const selectedTagsContainer = ensureSelectedTagsContainer();
    if (!selectedTagsContainer) return;

    const tagKey = tagEl.dataset.tag;
    if (!tagKey) return;

    const normKey = normalizeTag(tagKey);           // ✅ (A) 在這裡算出 normKey

    // 防重複：如果拼圖已存在或 Set 已記錄，就不做
    if (
        selectedTagsContainer.querySelector(`[data-tag="${tagKey}"]`) ||
        selectedSearchTags.has(normKey)
    ) {
        return;
    }

    addTagToFSearch(tagKey);

    const selectedTag = document.createElement('span');
    selectedTag.className = 'exh-selected-tag';
    selectedTag.dataset.tag = tagKey;
    selectedTag.textContent = tagEl.textContent;

    // 套用顏色（略）
    try {
        const cs = getComputedStyle(tagEl);
        selectedTag.style.backgroundColor = cs.backgroundColor;
        selectedTag.style.color = cs.color;
    } catch (_) {}

    // ✅ (B) 新增拼圖成功時：寫入 Set
    selectedSearchTags.add(normKey);

    // 點擊拼圖 → 移除
    selectedTag.addEventListener('click', (ev) => {
        ev.stopPropagation();

        // ✅ (C) 移除拼圖成功時：從 Set 移除
        selectedSearchTags.delete(normKey);

        selectedTag.remove();
        removeTagFromFSearch(tagKey);

        sortSelectedTagChips(selectedTagsContainer);
    });

    selectedTagsContainer.appendChild(selectedTag);
    sortSelectedTagChips(selectedTagsContainer);
}

document.addEventListener('click', handleSearchTagClick);




