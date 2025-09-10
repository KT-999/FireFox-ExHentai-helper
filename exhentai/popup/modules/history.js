// popup/modules/history.js
import { getMessage, clearElement, formatTimestamp24h, showConfirmationModal } from './ui.js';

const historyListContainer = document.getElementById('history-list');

export const renderHistory = async () => {
    const { history } = await browser.runtime.sendMessage({ type: 'get_history' });
    clearElement(historyListContainer);

    if (!history || history.length === 0) {
        const p = document.createElement('p');
        p.className = 'empty-message';
        p.textContent = getMessage("historyEmpty");
        historyListContainer.appendChild(p);
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of history) {
        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'history-item';

        const a = document.createElement('a');
        a.className = 'history-item-link';
        a.href = item.url;
        a.target = '_blank';
        a.title = item.title;

        const img = document.createElement('img');
        img.className = 'history-item-thumbnail';
        img.src = item.thumbnailSrc;
        img.alt = 'thumbnail';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'history-item-info';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'history-item-title';
        titleDiv.textContent = item.title;

        const bottomRow = document.createElement('div');
        bottomRow.className = 'history-item-bottom-row';

        const timeDiv = document.createElement('div');
        timeDiv.className = 'history-item-time';
        timeDiv.textContent = formatTimestamp24h(item.timestamp);
        bottomRow.appendChild(timeDiv);

        if (item.language) {
            const langDiv = document.createElement('div');
            langDiv.className = 'history-item-language';
            langDiv.textContent = item.language;
            bottomRow.appendChild(langDiv);
        }

        infoDiv.appendChild(titleDiv);
        infoDiv.appendChild(bottomRow);

        a.appendChild(img);
        a.appendChild(infoDiv);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'history-item-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = '刪除此筆紀錄';
        deleteBtn.dataset.url = item.url;

        itemWrapper.appendChild(a);
        itemWrapper.appendChild(deleteBtn);
        fragment.appendChild(itemWrapper);
    }
    historyListContainer.appendChild(fragment);
};

const handleClearHistory = async () => {
    const confirmed = await showConfirmationModal(
        getMessage('confirmClearHistoryTitle'),
        getMessage('confirmClearHistoryMessage')
    );
    if (confirmed) {
        await browser.runtime.sendMessage({ type: 'clear_history' });
        await renderHistory();
    }
};

const handleDeleteHistoryItem = async (deleteBtn) => {
    const urlToDelete = deleteBtn.dataset.url;
    if (urlToDelete) {
        await browser.runtime.sendMessage({ type: 'delete_history_item', url: urlToDelete });
        deleteBtn.closest('.history-item').remove();
        if (historyListContainer.children.length === 0) {
            renderHistory(); // 顯示空訊息
        }
    }
};

export const initHistory = () => {
    document.getElementById('clear-history-button').addEventListener('click', handleClearHistory);
    historyListContainer.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.history-item-delete-btn');
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            handleDeleteHistoryItem(deleteBtn);
        }
    });
};

