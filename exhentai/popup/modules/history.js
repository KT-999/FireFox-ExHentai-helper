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

        const badgesWrapper = document.createElement('div');
        badgesWrapper.className = 'history-item-badges';

        if (item.lastReadPage) {
            const progBadge = document.createElement('span');
            progBadge.className = 'history-item-progress';
            const totalText = item.totalPages ? `/${item.totalPages}` : '';
            progBadge.textContent = `📖 ${item.lastReadPage}${totalText}p`;
            progBadge.title = getMessage('lastReadProgressSingle', { page: item.lastReadPage });
            badgesWrapper.appendChild(progBadge);
        }

        if (item.language) {
            const langDiv = document.createElement('div');
            langDiv.className = 'history-item-language';
            langDiv.textContent = item.language;
            badgesWrapper.appendChild(langDiv);
        }

        bottomRow.appendChild(badgesWrapper);

        infoDiv.appendChild(titleDiv);
        infoDiv.appendChild(bottomRow);

        a.appendChild(img);
        a.appendChild(infoDiv);

        itemWrapper.appendChild(a);

        if (item.lastPageUrl) {
            const resumeBtn = document.createElement('a');
            resumeBtn.className = 'history-item-resume-btn';
            resumeBtn.href = item.lastPageUrl;
            resumeBtn.target = '_blank';
            resumeBtn.textContent = getMessage('resumeReadingShort');
            resumeBtn.title = getMessage('resumeReadingTooltip', { page: item.lastReadPage || 1 });
            itemWrapper.appendChild(resumeBtn);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'history-item-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = getMessage('deleteHistoryItemTitle');
        deleteBtn.dataset.url = item.url;

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

