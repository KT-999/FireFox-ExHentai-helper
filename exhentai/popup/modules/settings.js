// popup/modules/settings.js
import { applyTheme, getMessage } from './ui.js';

let initialLanguage;

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

const saveSettings = async () => {
    const statusMessage = document.getElementById('status-message');
    const settings = {
        enableGridView: document.getElementById('enable-grid-view').checked,
        gridColumns: parseInt(document.getElementById('grid-columns').value, 10) || 5,
        readerMode: document.getElementById('reader-mode').value,
        preloadCount: parseInt(document.getElementById('preload-count').value, 10) || 3,
        cacheSize: parseInt(document.getElementById('cache-size').value, 10) || 50,
        maxHistoryCount: parseInt(document.getElementById('max-history-count').value, 10) || 200,
        fitToWindow: document.getElementById('fit-to-window').checked,
        hidePreviewBar: document.getElementById('hide-preview-bar').checked,
        themeMode: document.getElementById('theme-mode').value,
        uiLanguage: document.getElementById('ui-language').value
    };

    await browser.storage.local.set(settings);

    const languageChanged = initialLanguage !== settings.uiLanguage;

    // 如果語言變更，我們需要重新載入訊息，這將在主腳本中處理
    if (languageChanged) {
        statusMessage.textContent = getMessage("saveSettingsSuccessLang");
        // 主腳本應監聽此事件並重新載入 i18n
        document.dispatchEvent(new CustomEvent('languageChanged'));
    } else {
        statusMessage.textContent = getMessage("saveSettingsSuccess");
    }
    statusMessage.style.color = '#28a745';
    setTimeout(() => { statusMessage.textContent = ''; }, 3000);
    initialLanguage = settings.uiLanguage;
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
    document.getElementById('enable-grid-view').checked = result.enableGridView;
    document.getElementById('grid-columns').value = result.gridColumns;
    document.getElementById('reader-mode').value = result.readerMode;
    document.getElementById('preload-count').value = result.preloadCount;
    document.getElementById('cache-size').value = result.cacheSize;
    document.getElementById('max-history-count').value = result.maxHistoryCount;
    document.getElementById('fit-to-window').checked = result.fitToWindow;
    document.getElementById('hide-preview-bar').checked = result.hidePreviewBar;
    document.getElementById('theme-mode').value = result.themeMode;
    document.getElementById('ui-language').value = result.uiLanguage;

    initialLanguage = result.uiLanguage;

    document.getElementById('grid-columns-setting').style.display = result.enableGridView ? 'flex' : 'none';
    toggleReaderModeSettings(result.readerMode);
    applyTheme(result.themeMode);
};

export const initSettings = async () => {
    await loadSettings();

    document.getElementById('enable-grid-view').addEventListener('change', (event) => {
        document.getElementById('grid-columns-setting').style.display = event.target.checked ? 'flex' : 'none';
    });

    document.getElementById('reader-mode').addEventListener('change', (event) => {
        toggleReaderModeSettings(event.target.value);
    });

    document.getElementById('theme-mode').addEventListener('change', (event) => {
        applyTheme(event.target.value);
    });

    // 語言變更會立即儲存以觸發重載
    document.getElementById('ui-language').addEventListener('change', saveSettings);

    document.getElementById('save-button').addEventListener('click', saveSettings);
    document.getElementById('open-options-button').addEventListener('click', () => {
        browser.runtime.openOptionsPage();
    });

    document.getElementById('clear-cache-button').addEventListener('click', () => {
        browser.runtime.sendMessage({ type: 'clear_all_cache' }).then(response => {
            const statusMessage = document.getElementById('status-message');
            if (response && response.success) {
                statusMessage.textContent = `✅ 已清除 ${response.clearedCount} 個圖庫的快取！`;
                statusMessage.style.color = '#28a745';
                setTimeout(() => { statusMessage.textContent = ''; }, 3000);
            }
        });
    });
};
