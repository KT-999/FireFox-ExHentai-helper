// popup/modules/bookmarks.js
import { getMessage, clearElement, showConfirmationModal } from './ui.js';

const tagListContainer = document.getElementById('tag-list');
const tagFilterSelect = document.getElementById('tag-filter-select');
const tagSearchInput = document.getElementById('tag-search-input');


export const renderSavedTags = async () => {
    const { tags } = await browser.runtime.sendMessage({ type: 'get_saved_tags' });

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

    const getTagValue = (tagString) => {
        const colonIndex = tagString.indexOf(':');
        return colonIndex > -1 ? tagString.substring(colonIndex + 1).trim() : tagString;
    };

    const categoryFilter = tagFilterSelect.value;
    const searchTerm = tagSearchInput.value.toLowerCase().trim();

    const categoryFilteredTags = categoryFilter === 'all'
        ? tags
        : tags.filter(t => t.original.startsWith(categoryFilter + ':'));

    const finalFilteredTags = searchTerm === ''
        ? categoryFilteredTags
        : categoryFilteredTags.filter(t => {
            const originalValue = getTagValue(t.original).toLowerCase();
            const displayValue = getTagValue(t.display).toLowerCase();
            return originalValue.includes(searchTerm) || displayValue.includes(searchTerm);
        });

    if (searchTerm === '') {
        const categories = [...new Set(tags.map(t => t.original.split(':')[0]))];
        categories.sort((a, b) => {
            const indexA = categoryOrder.indexOf(a);
            const indexB = categoryOrder.indexOf(b);
            const orderA = indexA === -1 ? categoryOrder.length : indexA;
            const orderB = indexB === -1 ? categoryOrder.length : indexB;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b);
        });

        const currentFilterValue = tagFilterSelect.value;
        clearElement(tagFilterSelect);

        const showAllOption = document.createElement('option');
        showAllOption.value = 'all';
        showAllOption.textContent = getMessage("filterShowAll");
        tagFilterSelect.appendChild(showAllOption);

        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            tagFilterSelect.appendChild(option);
        });
        tagFilterSelect.value = currentFilterValue;
    }

    clearElement(tagListContainer);
    if (!finalFilteredTags || finalFilteredTags.length === 0) {
        const p = document.createElement('p');
        p.className = 'empty-message';
        p.textContent = getMessage("bookmarksEmpty");
        tagListContainer.appendChild(p);
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const tag of finalFilteredTags) {
        const tagItem = document.createElement('div');
        const type = tag.original.split(':')[0];
        const validTypes = ['artist', 'group', 'parody', 'character', 'language', 'male', 'reclass'];
        const colorType = validTypes.includes(type) ? type : 'other';
        tagItem.className = `tag-item tag-item--${colorType}`;
        const namesWrapper = document.createElement('div');
        namesWrapper.className = 'tag-item-names';
        const originalLink = document.createElement('a');
        originalLink.className = 'tag-original-link';
        originalLink.href = `https://exhentai.org/tag/${encodeURIComponent(tag.original).replace(/%20/g, '+')}`;
        originalLink.target = '_blank';
        originalLink.title = `前往標籤頁面: ${tag.original}`;
        originalLink.textContent = tag.original;
        namesWrapper.appendChild(originalLink);
        const displayWrapper = document.createElement('div');
        displayWrapper.className = 'tag-display-wrapper';
        if (tag.original !== tag.display) {
            const displayText = document.createElement('span');
            displayText.className = 'tag-display-text';
            displayText.textContent = `(${tag.display.split(':').slice(1).join(':').trim()})`;
            displayWrapper.appendChild(displayText);
        }
        namesWrapper.appendChild(displayWrapper);
        tagItem.appendChild(namesWrapper);
        const actionsWrapper = document.createElement('div');
        actionsWrapper.className = 'tag-item-actions';
        const editBtn = document.createElement('button');
        editBtn.className = 'tag-item-btn';
        editBtn.innerHTML = '&#9998;';
        editBtn.title = '編輯顯示名稱';
        editBtn.dataset.originalTag = tag.original;
        editBtn.dataset.currentDisplay = tag.display;
        actionsWrapper.appendChild(editBtn);
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tag-item-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = '刪除此標籤';
        deleteBtn.dataset.originalTag = tag.original;
        actionsWrapper.appendChild(deleteBtn);
        tagItem.appendChild(actionsWrapper);
        fragment.appendChild(tagItem);
    }
    tagListContainer.appendChild(fragment);
};

const handleEditTag = (editBtn) => {
    const namesWrapper = editBtn.closest('.tag-item').querySelector('.tag-item-names');
    const displayWrapper = namesWrapper.querySelector('.tag-display-wrapper');
    const originalTag = editBtn.dataset.originalTag;
    const currentDisplay = editBtn.dataset.currentDisplay;

    const currentText = (originalTag === currentDisplay) ? '' : currentDisplay.split(':').slice(1).join(':').trim();

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.className = 'tag-edit-input';

    clearElement(displayWrapper);
    displayWrapper.appendChild(input);
    input.focus();
    input.select();

    const saveEdit = async () => {
        const newName = input.value.trim();
        let finalDisplayName = originalTag;
        if (newName) {
            const type = originalTag.split(':')[0];
            finalDisplayName = `${type}: ${newName}`;
        }

        if (finalDisplayName !== currentDisplay) {
            await browser.runtime.sendMessage({
                type: 'update_saved_tag',
                tag: { original: originalTag, display: finalDisplayName }
            });
        }
        await renderSavedTags();
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        }
        if (e.key === 'Escape') {
            renderSavedTags();
        }
    });
};

const handleDeleteTagItem = async (deleteBtn) => {
    const tagOriginalToDelete = deleteBtn.dataset.originalTag;
    if (tagOriginalToDelete) {
        await browser.runtime.sendMessage({ type: 'delete_saved_tag', tagOriginal: tagOriginalToDelete });
        await renderSavedTags();
    }
};

const handleClearTags = async () => {
    const confirmed = await showConfirmationModal(
        getMessage('confirmClearBookmarksTitle'),
        getMessage('confirmClearBookmarksMessage')
    );
    if (confirmed) {
        await browser.runtime.sendMessage({ type: 'clear_saved_tags' });
        await renderSavedTags();
    }
};

const openIoPage = async () => {
    try {
        const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
        browser.tabs.create({
            url: 'tags_io.html',
            index: currentTab ? currentTab.index + 1 : undefined
        });
    } catch (error) {
        console.error("開啟分頁時發生錯誤:", error);
        browser.tabs.create({ url: 'tags_io.html' });
    }
};

export const initBookmarks = () => {
    tagFilterSelect.addEventListener('change', renderSavedTags);
    tagSearchInput.addEventListener('input', renderSavedTags);

    document.getElementById('clear-tags-button').addEventListener('click', handleClearTags);
    tagListContainer.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.tag-item-btn[title="編輯顯示名稱"]');
        const deleteBtn = e.target.closest('.tag-item-btn[title="刪除此標籤"]');
        if (editBtn) {
            e.preventDefault(); e.stopPropagation();
            handleEditTag(editBtn);
        }
        if (deleteBtn) {
            e.preventDefault(); e.stopPropagation();
            handleDeleteTagItem(deleteBtn);
        }
    });

    document.getElementById('manage-io-button').addEventListener('click', openIoPage);
};

