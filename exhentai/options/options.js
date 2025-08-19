/**
 * 處理選項頁面的邏輯 (v1.2)
 * - 修正多語系功能，使其能根據儲存設定載入正確語言。
 */

let messages = {};

const getMessage = (key) => messages[key]?.message || key;

const localizePage = () => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = getMessage(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = getMessage(key);
    });
};

const loadLocaleMessages = async () => {
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
};

const defaultKeys = {
    keyPrev: 'a',
    keyNext: 'd',
    keyFit: 's',
    keyHide: 'q',
    keyExit: 'e',
    keyClear: 'w',
};

const applyTheme = (theme) => {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark-theme', isDark);
};

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    browser.storage.local.get({ themeMode: 'system' }).then(result => {
        if (result.themeMode === 'system') {
            applyTheme('system');
        }
    });
});

function formatKeyForDisplay(key) {
    if (key === ' ') return 'Space';
    if (key === 'escape') return 'Esc';
    return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
}

function saveKeySettings() {
    const settings = {
        keyPrev: document.getElementById('key-btn-prev').dataset.key || defaultKeys.keyPrev,
        keyNext: document.getElementById('key-btn-next').dataset.key || defaultKeys.keyNext,
        keyFit: document.getElementById('key-btn-fit').dataset.key || defaultKeys.keyFit,
        keyHide: document.getElementById('key-btn-hide').dataset.key || defaultKeys.keyHide,
        keyExit: document.getElementById('key-btn-exit').dataset.key || defaultKeys.keyExit,
        keyClear: document.getElementById('key-btn-clear').dataset.key || defaultKeys.keyClear,
    };

    browser.storage.local.set(settings).then(() => {
        const status = document.getElementById('status-message');
        status.textContent = getMessage("saveSettingsSuccess");
        setTimeout(() => { status.textContent = ''; }, 2000);
    }).catch(error => {
        console.error('儲存快捷鍵設定時發生錯誤:', error);
        const status = document.getElementById('status-message');
        status.textContent = getMessage("saveSettingsError");
    });
}

function loadSettings() {
    browser.storage.local.get({ ...defaultKeys, themeMode: 'system' }).then(result => {
        applyTheme(result.themeMode);
        const keyButtons = [ 'prev', 'next', 'fit', 'hide', 'exit', 'clear' ];
        keyButtons.forEach(key => {
            const btn = document.getElementById(`key-btn-${key}`);
            const storedKey = result[`key${key.charAt(0).toUpperCase() + key.slice(1)}`];
            btn.dataset.key = storedKey;
            btn.textContent = formatKeyForDisplay(storedKey);
        });
    }).catch(error => {
        console.error('讀取設定時發生錯誤:', error);
    });
}

function initKeyListeners() {
    const keyButtons = document.querySelectorAll('.key-input-btn');
    let listeningButton = null;

    function stopListening() {
        if (listeningButton) {
            listeningButton.classList.remove('listening');
            listeningButton.textContent = formatKeyForDisplay(listeningButton.dataset.key);
            listeningButton = null;
        }
    }

    const handleGlobalKeyDown = (event) => {
        if (listeningButton) {
            event.preventDefault();
            event.stopPropagation();
            const newKey = event.key.toLowerCase();
            listeningButton.dataset.key = newKey;
            stopListening();
        }
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown, true);

    keyButtons.forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            if (listeningButton && listeningButton !== btn) {
                stopListening();
            }
            listeningButton = btn;
            btn.classList.add('listening');
            btn.textContent = '...';
        });
    });

    document.body.addEventListener('click', () => {
        if (listeningButton) {
            stopListening();
        }
    }, false);
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadLocaleMessages();
    loadSettings(); 
    initKeyListeners();
});
document.getElementById('save-button').addEventListener('click', saveKeySettings);
