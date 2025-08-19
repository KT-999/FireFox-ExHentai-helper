/**
 * 處理彈出視窗的邏輯 (v1.2.1 - 版本更新)
 * - 修正多語系功能，使其能根據儲存設定即時切換。
 * - 登入狀態也套用多語系。
 * - 修正：移除所有 innerHTML 的使用，改為安全的 DOM 操作以符合上架規範。
 * - 修正：補上遺失的 getMessage 函式，修復書籤頁籤無法顯示的問題。
 */

// --- 多語系處理 ---
const localizePage = (messages) => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const message = messages[key]?.message || key;
        if (message) el.textContent = message;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const message = messages[key]?.message || key;
        if (message) el.title = message;
    });
};


document.addEventListener('DOMContentLoaded', () => {
    try {
        // --- 常數定義 ---
        const EXHENTAI_URL = "https://exhentai.org";
        const LOGIN_URL = "https://forums.e-hentai.org/index.php?act=Login&CODE=00";
        let messages = {}; // 用於儲存當前語言的文字
        let initialLanguage; // 用於追蹤語言是否變更

        // --- UI 元素 ---
        const authSection = document.getElementById('auth-section');
        const authHr = document.getElementById('auth-hr');
        const statusMessage = document.getElementById('status-message');
        const enableGridViewCheckbox = document.getElementById('enable-grid-view');
        const gridColumnsSetting = document.getElementById('grid-columns-setting');
        const readerModeSelect = document.getElementById('reader-mode');
        const historyListContainer = document.getElementById('history-list');
        const tagListContainer = document.getElementById('tag-list');
        const themeModeSelect = document.getElementById('theme-mode');
        const tagFilterSelect = document.getElementById('tag-filter-select');
        const uiLanguageSelect = document.getElementById('ui-language');

        // --- [修正] 補上遺失的 getMessage 函式 ---
        const getMessage = (key) => messages[key]?.message || key;

        // --- 安全的 DOM 清理函式 ---
        const clearElement = (el) => {
            while (el.firstChild) {
                el.removeChild(el.firstChild);
            }
        };

        // --- 主題處理 ---
        const applyTheme = (theme) => {
            const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            document.documentElement.classList.toggle('dark-theme', isDark);
        };
        
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (themeModeSelect.value === 'system') {
                applyTheme('system');
            }
        });

        // --- 多語系載入 ---
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
            localizePage(messages);
        };

        // --- 核心功能函式 ---

        const updateAuthUI = (isLoggedIn) => {
            clearElement(authSection); // 安全地清空
            if (isLoggedIn) {
                const statusDiv = document.createElement('div');
                statusDiv.className = 'auth-status-text';
                statusDiv.textContent = messages['loginStatus']?.message || 'Login Status:';

                const usernameSpan = document.createElement('span');
                usernameSpan.className = 'auth-username';
                usernameSpan.textContent = ` ${messages['loggedInStatus']?.message || 'Logged In'}`;
                statusDiv.appendChild(usernameSpan);

                const logoutButton = document.createElement('button');
                logoutButton.id = 'logout-button';
                logoutButton.className = 'btn-danger';
                logoutButton.textContent = messages['logoutButton']?.message || 'Log Out';
                logoutButton.addEventListener('click', handleLogout);
                
                authSection.appendChild(statusDiv);
                authSection.appendChild(logoutButton);
            } else {
                const statusDiv = document.createElement('div');
                statusDiv.className = 'auth-status-text';
                statusDiv.textContent = messages['loggedOutStatus']?.message || 'You are not logged in.';
                
                const loginButton = document.createElement('button');
                loginButton.id = 'login-button';
                loginButton.textContent = messages['loginButton']?.message || 'Go to Login Page';
                loginButton.addEventListener('click', () => {
                    browser.tabs.create({ url: LOGIN_URL });
                });

                authSection.appendChild(statusDiv);
                authSection.appendChild(loginButton);
            }
        };
        
        const handleLogout = async () => {
            statusMessage.textContent = '正在登出...';
            statusMessage.style.color = '#6c757d';
            try {
                const domains = ["e-hentai.org", "exhentai.org", "forums.e-hentai.org"];
                const cookieNames = ['ipb_member_id', 'ipb_pass_hash', 'sk', 'yay', 'ipb_session_id', 'igneous'];
                for (const domain of domains) {
                    const cookies = await browser.cookies.getAll({ domain });
                    if (!cookies) continue;
                    for (const cookie of cookies) {
                        if (cookieNames.includes(cookie.name)) {
                            const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
                            await browser.cookies.remove({ url, name: cookie.name });
                        }
                    }
                }
                statusMessage.textContent = '✅ 登出成功！';
                statusMessage.style.color = '#28a745';
                setTimeout(() => { statusMessage.textContent = ''; }, 2000);
                updateAuthUI(false);
            } catch (error) {
                console.error("登出時發生錯誤:", error);
                statusMessage.textContent = '❌ 登出失敗！';
                statusMessage.style.color = '#dc3545';
            }
        };

        const checkLoginStatus = async () => {
            clearElement(authSection);
            const p = document.createElement('p');
            p.className = 'auth-status-text';
            p.textContent = messages['checkingLoginStatus']?.message || 'Checking login status...';
            authSection.appendChild(p);

            try {
                const memberIdCookie = await browser.cookies.get({ url: EXHENTAI_URL, name: 'ipb_member_id' });
                const isLoggedIn = !!(memberIdCookie && memberIdCookie.value && memberIdCookie.value !== '0');
                updateAuthUI(isLoggedIn);
                authHr.style.display = 'block';
            } catch (error) {
                console.error("檢查登入狀態時出錯:", error);
                clearElement(authSection);
                const pError = document.createElement('p');
                pError.className = 'auth-status-text';
                pError.style.color = 'red';
                pError.textContent = messages['loginStatusError']?.message || 'Could not check status.';
                authSection.appendChild(pError);
                authHr.style.display = 'block';
            }
        };

        const saveSettings = async () => {
            const settings = {
                enableGridView: document.getElementById('enable-grid-view').checked,
                gridColumns: parseInt(document.getElementById('grid-columns').value, 10) || 5,
                readerMode: readerModeSelect.value,
                preloadCount: parseInt(document.getElementById('preload-count').value, 10) || 3,
                cacheSize: parseInt(document.getElementById('cache-size').value, 10) || 50,
                maxHistoryCount: parseInt(document.getElementById('max-history-count').value, 10) || 200,
                fitToWindow: document.getElementById('fit-to-window').checked,
                hidePreviewBar: document.getElementById('hide-preview-bar').checked,
                themeMode: document.getElementById('theme-mode').value,
                uiLanguage: uiLanguageSelect.value
            };

            await browser.storage.local.set(settings);
            
            const languageChanged = initialLanguage !== settings.uiLanguage;
            await loadLocaleMessages(); // 儲存後立即重新載入語言並更新UI

            if (languageChanged) {
                statusMessage.textContent = messages["saveSettingsSuccessLang"]?.message;
            } else {
                statusMessage.textContent = messages["saveSettingsSuccess"]?.message;
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
            enableGridViewCheckbox.checked = result.enableGridView;
            document.getElementById('grid-columns').value = result.gridColumns;
            readerModeSelect.value = result.readerMode;
            document.getElementById('preload-count').value = result.preloadCount;
            document.getElementById('cache-size').value = result.cacheSize;
            document.getElementById('max-history-count').value = result.maxHistoryCount;
            document.getElementById('fit-to-window').checked = result.fitToWindow;
            document.getElementById('hide-preview-bar').checked = result.hidePreviewBar;
            themeModeSelect.value = result.themeMode;
            uiLanguageSelect.value = result.uiLanguage;
            
            initialLanguage = result.uiLanguage;
            
            gridColumnsSetting.style.display = result.enableGridView ? 'flex' : 'none';
            toggleReaderModeSettings(result.readerMode);
            applyTheme(result.themeMode);
        };
        
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

        const renderHistory = async () => {
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
                timeDiv.textContent = new Date(item.timestamp).toLocaleString();
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

        const clearHistory = async () => {
            await browser.runtime.sendMessage({ type: 'clear_history' });
            await renderHistory();
        };

        const handleDeleteHistoryItem = async (deleteBtn) => {
            const urlToDelete = deleteBtn.dataset.url;
            if (urlToDelete) {
                await browser.runtime.sendMessage({ type: 'delete_history_item', url: urlToDelete });
                deleteBtn.closest('.history-item').remove();
            }
        };

        const renderSavedTags = async () => {
            const { tags } = await browser.runtime.sendMessage({ type: 'get_saved_tags' });
            
            const categoryOrder = ['language', 'parody', 'group', 'artist'];
            tags.sort((a, b) => {
                const typeA = a.split(':')[0];
                const typeB = b.split(':')[0];
                const indexA = categoryOrder.indexOf(typeA);
                const indexB = categoryOrder.indexOf(b);
        
                const orderA = indexA === -1 ? categoryOrder.length : indexA;
                const orderB = indexB === -1 ? categoryOrder.length : indexB;
        
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                return a.localeCompare(b);
            });

            const categories = [...new Set(tags.map(t => t.split(':')[0]))];
            categories.sort((a, b) => {
                const indexA = categoryOrder.indexOf(a);
                const indexB = categoryOrder.indexOf(b);
                const orderA = indexA === -1 ? categoryOrder.length : indexA;
                const orderB = indexB === -1 ? categoryOrder.length : indexB;
                if (orderA !== orderB) return orderA - orderB;
                return a.localeCompare(b);
            });

            const currentFilter = tagFilterSelect.value;
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
            tagFilterSelect.value = categories.includes(currentFilter) ? currentFilter : 'all';

            const newFilter = tagFilterSelect.value;
            const filteredTags = newFilter === 'all'
                ? tags
                : tags.filter(t => t.startsWith(newFilter + ':'));

            clearElement(tagListContainer);
            if (!filteredTags || filteredTags.length === 0) {
                const p = document.createElement('p');
                p.className = 'empty-message';
                p.textContent = getMessage("bookmarksEmpty");
                tagListContainer.appendChild(p);
                return;
            }

            const fragment = document.createDocumentFragment();
            for (const tag of filteredTags) {
                const parts = tag.split(':');
                const type = parts[0];
                const name = parts.slice(1).join(':');

                const a = document.createElement('a');
                a.className = 'tag-badge';
                a.href = `https://exhentai.org/tag/${encodeURIComponent(tag).replace(/%20/g, '+')}`;
                a.target = '_blank';
                a.title = tag;

                const validTypes = ['artist', 'group', 'parody', 'character', 'language'];
                const colorType = validTypes.includes(type) ? type : 'other';
                a.classList.add(`tag-badge--${colorType}`);

                const typeSpan = document.createElement('span');
                typeSpan.className = 'tag-badge-type';
                typeSpan.textContent = type + ':';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'tag-badge-name';
                nameSpan.textContent = name;

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'tag-badge-delete-btn';
                deleteBtn.textContent = '×';
                deleteBtn.title = '刪除此標籤';
                deleteBtn.dataset.tag = tag;

                a.appendChild(typeSpan);
                a.appendChild(nameSpan);
                a.appendChild(deleteBtn);
                fragment.appendChild(a);
            }
            tagListContainer.appendChild(fragment);
        };
        
        const handleClearTags = async () => {
            await browser.runtime.sendMessage({ type: 'clear_saved_tags' });
            await renderSavedTags();
        };

        const handleDeleteTagItem = async (deleteBtn) => {
            const tagToDelete = deleteBtn.dataset.tag;
            if (tagToDelete) {
                await browser.runtime.sendMessage({ type: 'delete_saved_tag', tag: tagToDelete });
                await renderSavedTags();
            }
        };

        const setupTabs = () => {
            const tabButtons = document.querySelectorAll('.tab-btn');
            const tabPanes = document.querySelectorAll('.tab-pane');

            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');

                    tabPanes.forEach(pane => pane.classList.remove('active'));
                    const targetPane = document.getElementById(button.dataset.tab);
                    targetPane.classList.add('active');

                    if (button.dataset.tab === 'history') {
                        renderHistory();
                    } else if (button.dataset.tab === 'bookmarks') {
                        renderSavedTags();
                    }
                });
            });
        };

        const initialize = async () => {
            await loadLocaleMessages();
            await loadSettings();
            
            checkLoginStatus();
            setupTabs();

            enableGridViewCheckbox.addEventListener('change', (event) => {
                gridColumnsSetting.style.display = event.target.checked ? 'flex' : 'none';
            });
            
            readerModeSelect.addEventListener('change', (event) => {
                toggleReaderModeSettings(event.target.value);
            });

            themeModeSelect.addEventListener('change', (event) => {
                applyTheme(event.target.value);
            });

            uiLanguageSelect.addEventListener('change', saveSettings);

            tagFilterSelect.addEventListener('change', renderSavedTags);

            document.getElementById('save-button').addEventListener('click', saveSettings);
            document.getElementById('open-options-button').addEventListener('click', () => {
                browser.runtime.openOptionsPage();
            });
            document.getElementById('clear-cache-button').addEventListener('click', () => {
                browser.runtime.sendMessage({ type: 'clear_all_cache' }).then(response => {
                    if (response && response.success) {
                        statusMessage.textContent = `✅ 已清除 ${response.clearedCount} 個圖庫的快取！`;
                        statusMessage.style.color = '#28a745';
                        setTimeout(() => { statusMessage.textContent = ''; }, 3000);
                    }
                });
            });

            document.getElementById('clear-history-button').addEventListener('click', clearHistory);
            historyListContainer.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.history-item-delete-btn');
                if (deleteBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteHistoryItem(deleteBtn);
                }
            });

            document.getElementById('clear-tags-button').addEventListener('click', handleClearTags);
            tagListContainer.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.tag-badge-delete-btn');
                if (deleteBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteTagItem(deleteBtn);
                }
            });
        };

        initialize();

    } catch (e) {
        console.error("Popup 腳本發生嚴重錯誤:", e);
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = "padding: 10px; color: red; font-family: sans-serif;";
        errorDiv.textContent = "擴充功能腳本發生嚴重錯誤，請按 F12 查看瀏覽器擴充功能的控制台以獲取詳細資訊。";
        clearElement(document.body);
        document.body.appendChild(errorDiv);
    }
});
