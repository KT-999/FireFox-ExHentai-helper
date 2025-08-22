/**
 * 處理彈出視窗的邏輯 (v1.3.0 - 簡化書籤管理介面)
 * - 變更：將匯入與匯出按鈕合併為單一的「匯入/匯出」按鈕。
 * - 變更：匯入/匯出頁面現在會開啟在當前分頁的右側，而不是最末端。
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
        let messages = {};
        let initialLanguage;

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
        const tagSearchInput = document.getElementById('tag-search-input');

        const getMessage = (key) => messages[key]?.message || key;

        const clearElement = (el) => {
            while (el.firstChild) {
                el.removeChild(el.firstChild);
            }
        };

        const formatTimestamp24h = (timestamp) => {
            const date = new Date(timestamp);
            const YYYY = date.getFullYear();
            const MM = String(date.getMonth() + 1).padStart(2, '0');
            const DD = String(date.getDate()).padStart(2, '0');
            const HH = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            const ss = String(date.getSeconds()).padStart(2, '0');
            return `${YYYY}/${MM}/${DD} ${HH}:${mm}:${ss}`;
        };

        const applyTheme = (theme) => {
            const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            document.documentElement.classList.toggle('dark-theme', isDark);
        };
        
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (themeModeSelect.value === 'system') {
                applyTheme('system');
            }
        });

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

        const updateAuthUI = (isLoggedIn) => {
            clearElement(authSection);
            if (isLoggedIn) {
                const statusDiv = document.createElement('div');
                statusDiv.className = 'auth-status-text';
                statusDiv.textContent = getMessage('loginStatus');

                const usernameSpan = document.createElement('span');
                usernameSpan.className = 'auth-username';
                usernameSpan.textContent = ` ${getMessage('loggedInStatus')}`;
                statusDiv.appendChild(usernameSpan);

                const logoutButton = document.createElement('button');
                logoutButton.id = 'logout-button';
                logoutButton.className = 'btn-danger';
                logoutButton.textContent = getMessage('logoutButton');
                logoutButton.addEventListener('click', handleLogout);
                
                authSection.appendChild(statusDiv);
                authSection.appendChild(logoutButton);
            } else {
                const statusDiv = document.createElement('div');
                statusDiv.className = 'auth-status-text';
                statusDiv.textContent = getMessage('loggedOutStatus');
                
                const loginButton = document.createElement('button');
                loginButton.id = 'login-button';
                loginButton.textContent = getMessage('loginButton');
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
            p.textContent = getMessage('checkingLoginStatus');
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
                pError.textContent = getMessage('loginStatusError');
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
            await loadLocaleMessages();

            if (languageChanged) {
                statusMessage.textContent = getMessage("saveSettingsSuccessLang");
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
                const categoryOrder = ['language', 'parody', 'group', 'artist'];
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
                const validTypes = ['artist', 'group', 'parody', 'character', 'language'];
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
            await browser.runtime.sendMessage({ type: 'clear_saved_tags' });
            await renderSavedTags();
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

        const openIoPage = async () => {
            try {
                const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
                if (currentTab) {
                    browser.tabs.create({
                        url: 'tags_io.html',
                        index: currentTab.index + 1
                    });
                } else {
                    browser.tabs.create({ url: 'tags_io.html' });
                }
            } catch (error) {
                console.error("開啟分頁時發生錯誤:", error);
                browser.tabs.create({ url: 'tags_io.html' });
            }
        };

        const initialize = async () => {
            await loadLocaleMessages();
            await loadSettings();
            
            tagSearchInput.placeholder = getMessage('searchTagsPlaceholder');

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
            tagSearchInput.addEventListener('input', renderSavedTags);

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

            // *** 更新 ***: 監聽合併後的新按鈕
            document.getElementById('manage-io-button').addEventListener('click', openIoPage);
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
