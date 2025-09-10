// popup/popup.js
import { loadLocaleMessages, applyTheme, getMessage } from './modules/ui.js';
import { initAuth } from './modules/auth.js';
import { initSettings } from './modules/settings.js';
import { initHistory, renderHistory } from './modules/history.js';
import { initBookmarks, renderSavedTags } from './modules/bookmarks.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadLocaleMessages();

        const { themeMode = 'system' } = await browser.storage.local.get('themeMode');
        applyTheme(themeMode);
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            document.getElementById('theme-mode').value === 'system' && applyTheme('system');
        });

        // 初始化所有模組
        initAuth();
        await initSettings();
        initHistory();
        initBookmarks();

        // 設定頁籤功能
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                tabPanes.forEach(pane => pane.classList.remove('active'));
                const targetPane = document.getElementById(button.dataset.tab);
                targetPane.classList.add('active');

                // 切換到頁籤時渲染內容
                if (button.dataset.tab === 'history') {
                    renderHistory();
                } else if (button.dataset.tab === 'bookmarks') {
                    // 更新可能尚未設定的提示文字
                    document.getElementById('tag-search-input').placeholder = getMessage('searchTagsPlaceholder');
                    renderSavedTags();
                }
            });
        });

        // 監聽語言變更以重新本地化頁面
        document.addEventListener('languageChanged', async () => {
            await loadLocaleMessages();
            // 如果不是設定頁籤，則重新渲染當前頁籤
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            if (activeTab === 'history') renderHistory();
            if (activeTab === 'bookmarks') {
                document.getElementById('tag-search-input').placeholder = getMessage('searchTagsPlaceholder');
                renderSavedTags();
            }
        });

    } catch (e) {
        console.error("Popup 腳本發生嚴重錯誤:", e);
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = "padding: 10px; color: red; font-family: sans-serif;";
        errorDiv.textContent = "擴充功能腳本發生嚴重錯誤，請按 F12 查看瀏覽器擴充功能的控制台以獲取詳細資訊。";
        document.body.innerHTML = ''; // 清空 body
        document.body.appendChild(errorDiv);
    }
});

