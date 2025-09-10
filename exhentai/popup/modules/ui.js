// popup/modules/ui.js

let messages = {};

export const getMessage = (key, substitutions) => {
    let message = messages[key]?.message || key;
    if (substitutions) {
        for (const subKey in substitutions) {
            message = message.replace(`{${subKey}}`, substitutions[subKey]);
        }
    }
    return message;
};

export const localizePage = () => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = getMessage(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = getMessage(key);
    });
    // For placeholders specifically
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = getMessage(key);
    });
};

export const loadLocaleMessages = async () => {
    const { uiLanguage = 'auto' } = await browser.storage.local.get('uiLanguage');
    let lang = uiLanguage;
    if (lang === 'auto') {
        lang = browser.i18n.getUILanguage();
    }
    const locale = lang.replace('-', '_');

    try {
        const response = await fetch(`/_locales/${locale}/messages.json`);
        if (!response.ok) throw new Error('Locale not found, falling back to en');
        messages = await response.json();
    } catch (e) {
        console.warn(e);
        const response = await fetch('/_locales/en/messages.json');
        messages = await response.json();
    }
    localizePage();
    return messages;
};

export const applyTheme = (theme) => {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark-theme', isDark);
};

export const clearElement = (el) => {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
};

export const formatTimestamp24h = (timestamp) => {
    const date = new Date(timestamp);
    const YYYY = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const DD = String(date.getDate()).padStart(2, '0');
    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${YYYY}/${MM}/${DD} ${HH}:${mm}:${ss}`;
};

export const showConfirmationModal = (title, message) => {
    return new Promise((resolve) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';

        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'confirm-modal-dialog';

        const titleEl = document.createElement('h4');
        titleEl.textContent = title;

        const messageEl = document.createElement('p');
        messageEl.textContent = message;

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'confirm-modal-buttons';

        const cancelBtn = document.createElement('button');
        // *** 修正 ***: 使用正確的 i18n 鍵名
        cancelBtn.textContent = getMessage('cancelButton');
        cancelBtn.className = 'confirm-modal-cancel-btn';

        const confirmBtn = document.createElement('button');
        // *** 修正 ***: 使用正確的 i18n 鍵名
        confirmBtn.textContent = getMessage('confirmButton');
        confirmBtn.className = 'confirm-modal-confirm-btn';

        buttonGroup.appendChild(cancelBtn);
        buttonGroup.appendChild(confirmBtn);

        dialog.appendChild(titleEl);
        dialog.appendChild(messageEl);
        dialog.appendChild(buttonGroup);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const closeModal = (result) => {
            document.body.removeChild(overlay);
            resolve(result);
        };

        confirmBtn.onclick = () => closeModal(true);
        cancelBtn.onclick = () => closeModal(false);
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                closeModal(false);
            }
        };
    });
};
