// popup/modules/ui.js

let messages = {};
let fallbackMessages = {};

const VALID_UI_LANGUAGES = new Set(['auto', 'en', 'zh_TW', 'es', 'ja', 'ko', 'de', 'fr', 'pt_BR', 'ru']);

export const getMessage = (key, substitutions) => {
    let message = messages[key]?.message || fallbackMessages[key]?.message || key;
    if (substitutions) {
        for (const subKey in substitutions) {
            message = message.replace(`{${subKey}}`, substitutions[subKey]);
        }
    }
    return message;
};

export const localizePage = () => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            return;
        }
        const key = el.getAttribute('data-i18n');
        el.textContent = getMessage(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (el.tagName === 'TITLE') {
            document.title = getMessage(key);
        } else {
            el.title = getMessage(key);
        }
    });
    // For placeholders specifically
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = getMessage(key);
    });
};

export const loadLocaleMessages = async () => {
    const stored = await browser.storage.local.get('uiLanguage');
    let uiLanguage = stored.uiLanguage;
    if (!uiLanguage || !VALID_UI_LANGUAGES.has(uiLanguage)) {
        uiLanguage = 'auto';
        if (stored.uiLanguage !== undefined && stored.uiLanguage !== 'auto') {
            browser.storage.local.set({ uiLanguage: 'auto' }).catch(() => {});
        }
    }

    let lang = uiLanguage;
    if (lang === 'auto') {
        lang = browser.i18n.getUILanguage() || 'en';
    }
    const locale = lang.replace('-', '_');

    try {
        const enUrl = browser.runtime.getURL('_locales/en/messages.json');
        const enRes = await fetch(enUrl);
        if (enRes.ok) {
            fallbackMessages = await enRes.json();
        }
    } catch (e) {
        console.warn('[UI] Failed to load fallback en messages:', e);
    }

    try {
        const localeUrl = browser.runtime.getURL(`_locales/${locale}/messages.json`);
        const response = await fetch(localeUrl);
        if (!response.ok) throw new Error(`Locale ${locale} not found, falling back to base language or en`);
        messages = await response.json();
    } catch (e) {
        const baseLang = locale.split('_')[0];
        let loadedBase = false;
        if (baseLang && baseLang !== locale) {
            try {
                const baseUrl = browser.runtime.getURL(`_locales/${baseLang}/messages.json`);
                const baseRes = await fetch(baseUrl);
                if (baseRes.ok) {
                    messages = await baseRes.json();
                    loadedBase = true;
                }
            } catch (_) {}
        }
        if (!loadedBase) {
            messages = fallbackMessages;
        }
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
