// popup/modules/settings.js
import { applyTheme, getMessage } from './ui.js';

let statusTimeout;

const toggleReaderModeSettings = (mode) => {
    const horizontalSettings = [
        document.getElementById('preload-count').parentElement,
        document.getElementById('fit-to-window').parentElement,
        document.getElementById('hide-preview-bar').parentElement,
    ];
    if (mode === 'horizontal') {
        horizontalSettings.forEach(el => el.style.display = 'flex');
    } else {
        horizontalSettings.forEach(el => el.style.display = 'none');
    }
};

// 顯示儲存成功的回饋訊息
const showSaveFeedback = (isLanguageChange = false) => {
    const statusMessage = document.getElementById('status-message');
    clearTimeout(statusTimeout);

    const messageKey = isLanguageChange ? "saveSettingsSuccessLang" : "saveSettingsSuccess";
    statusMessage.textContent = `✓ ${getMessage(messageKey)}`;
    statusMessage.style.color = '#28a745';

    statusTimeout = setTimeout(() => {
        statusMessage.textContent = '';
    }, 2500);
};

// 處理單一設定項的變更並立即儲存
const handleSettingChange = async (event) => {
    const element = event.target;
    const key = element.dataset.settingKey;
    if (!key) return;

    let value;
    switch (element.type) {
        case 'checkbox':
            value = element.checked;
            break;
        case 'number':
            value = parseInt(element.value, 10);
            break;
        default:
            value = element.value;
            break;
    }

    // 處理有連動關係的 UI
    if (key === 'enableGridView') {
        document.getElementById('grid-columns-setting').style.display = value ? 'flex' : 'none';
    }
    if (key === 'readerMode') {
        toggleReaderModeSettings(value);
    }
    if (key === 'themeMode') {
        applyTheme(value);
    }

    try {
        await browser.storage.local.set({ [key]: value });
        const isLanguageChange = key === 'uiLanguage';
        showSaveFeedback(isLanguageChange);

        if (isLanguageChange) {
            // 觸發事件，讓主腳本 popup.js 重新載入多語系檔案
            document.dispatchEvent(new CustomEvent('languageChanged'));
        }
    } catch (error) {
        console.error(`儲存設定 ${key} 時發生錯誤:`, error);
        const statusMessage = document.getElementById('status-message');
        statusMessage.textContent = `✗ ${getMessage("saveSettingsError")}`;
        statusMessage.style.color = '#dc3545';
    }
};

const loadSettings = async () => {
    const result = await browser.storage.local.get({
        enableGridView: false,
        gridColumns: 5,
        readerMode: 'horizontal',
        preloadCount: 3,
        cacheSize: 50,
        maxHistoryCount: 200,
        fitToWindow: true,
        hidePreviewBar: false,
        themeMode: 'system',
        uiLanguage: 'auto'
    });

    // 遍歷所有設定並填入 UI
    for (const key in result) {
        const element = document.querySelector(`[data-setting-key="${key}"]`);
        if (element) {
            switch (element.type) {
                case 'checkbox':
                    element.checked = result[key];
                    break;
                default:
                    element.value = result[key];
                    break;
            }
        }
    }

    // 初始化有連動關係的 UI 狀態
    document.getElementById('grid-columns-setting').style.display = result.enableGridView ? 'flex' : 'none';
    toggleReaderModeSettings(result.readerMode);
    applyTheme(result.themeMode);
};

export const initSettings = async () => {
    await loadSettings();

    // 為所有具備 data-setting-key 的元素綁定事件監聽器
    document.querySelectorAll('[data-setting-key]').forEach(element => {
        element.addEventListener('change', handleSettingChange);
    });

    document.getElementById('open-options-button').addEventListener('click', () => {
        browser.runtime.openOptionsPage();
    });

    document.getElementById('clear-cache-button').addEventListener('click', () => {
        browser.runtime.sendMessage({ type: 'clear_all_cache' }).then(response => {
            if (response && response.success) {
                const statusMessage = document.getElementById('status-message');
                clearTimeout(statusTimeout);
                statusMessage.textContent = `✓ 已清除 ${response.clearedCount} 個圖庫的快取！`;
                statusMessage.style.color = '#28a745';
                statusTimeout = setTimeout(() => { statusMessage.textContent = ''; }, 3000);
            }
        });
    });
};
