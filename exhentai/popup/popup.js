/**
 * 處理彈出視窗的邏輯 (v1.1.1)
 * - 新增主題套用功能，使介面能動態切換亮/暗模式。
 * - 整合頁籤、歷史紀錄、單筆刪除、數量上限等所有功能。
 */

document.addEventListener('DOMContentLoaded', () => {
    try {
        // --- 常數定義 ---
        const EXHENTAI_URL = "https://exhentai.org";
        const LOGIN_URL = "https://forums.e-hentai.org/index.php?act=Login&CODE=00";

        // --- UI 元素 ---
        const authSection = document.getElementById('auth-section');
        const authHr = document.getElementById('auth-hr');
        const statusMessage = document.getElementById('status-message');
        const enableGridViewCheckbox = document.getElementById('enable-grid-view');
        const gridColumnsSetting = document.getElementById('grid-columns-setting');
        const readerModeSelect = document.getElementById('reader-mode');
        const historyListContainer = document.getElementById('history-list');
        const themeModeSelect = document.getElementById('theme-mode');

        // --- 主題處理 ---
        const applyTheme = (theme) => {
            const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            document.documentElement.classList.toggle('dark-theme', isDark);
        };
        
        // 監聽系統主題變化
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (themeModeSelect.value === 'system') {
                applyTheme('system');
            }
        });

        // --- 核心功能函式 ---

        const updateAuthUI = (isLoggedIn) => {
            if (isLoggedIn) {
                authSection.innerHTML = `
                    <div class="auth-status-text">
                        登入狀態：<span class="auth-username">已登入</span>
                    </div>
                    <button id="logout-button" class="btn-danger">登出</button>
                `;
                document.getElementById('logout-button').addEventListener('click', handleLogout);
            } else {
                authSection.innerHTML = `
                    <div class="auth-status-text">
                        您似乎尚未登入。
                    </div>
                    <button id="login-button">前往登入頁面</button>
                `;
                document.getElementById('login-button').addEventListener('click', () => {
                    browser.tabs.create({ url: LOGIN_URL });
                });
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
            authSection.innerHTML = '<p class="auth-status-text">正在檢查登入狀態...</p>';
            try {
                const memberIdCookie = await browser.cookies.get({ url: EXHENTAI_URL, name: 'ipb_member_id' });
                const isLoggedIn = !!(memberIdCookie && memberIdCookie.value && memberIdCookie.value !== '0');
                updateAuthUI(isLoggedIn);
                authHr.style.display = 'block';
            } catch (error) {
                console.error("檢查登入狀態時出錯:", error);
                authSection.innerHTML = '<p class="auth-status-text" style="color: red;">無法檢查登入狀態，請確認擴充功能權限。</p>';
                authHr.style.display = 'block';
            }
        };

        const saveSettings = () => {
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
            };

            browser.storage.local.set(settings).then(() => {
                statusMessage.textContent = '✅ 設定已儲存！';
                statusMessage.style.color = '#28a745';
                setTimeout(() => { statusMessage.textContent = ''; }, 2000);
            }).catch(error => {
                console.error('儲存設定時發生錯誤:', error);
                statusMessage.textContent = '❌ 儲存失敗！';
                statusMessage.style.color = '#dc3545';
            });
        };

        const loadSettings = () => {
            browser.storage.local.get({ 
                enableGridView: false,
                gridColumns: 5,
                readerMode: 'horizontal',
                preloadCount: 3, 
                cacheSize: 50,
                maxHistoryCount: 200,
                fitToWindow: true,
                hidePreviewBar: false,
                themeMode: 'system',
            }).then(result => {
                enableGridViewCheckbox.checked = result.enableGridView;
                document.getElementById('grid-columns').value = result.gridColumns;
                readerModeSelect.value = result.readerMode;
                document.getElementById('preload-count').value = result.preloadCount;
                document.getElementById('cache-size').value = result.cacheSize;
                document.getElementById('max-history-count').value = result.maxHistoryCount;
                document.getElementById('fit-to-window').checked = result.fitToWindow;
                document.getElementById('hide-preview-bar').checked = result.hidePreviewBar;
                themeModeSelect.value = result.themeMode;
                
                gridColumnsSetting.style.display = result.enableGridView ? 'flex' : 'none';
                toggleReaderModeSettings(result.readerMode);

                // 載入設定後立即套用主題
                applyTheme(result.themeMode);
            }).catch(error => {
                console.error('讀取設定時發生錯誤:', error);
            });
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

        // --- 歷史紀錄功能 ---
        const renderHistory = async () => {
            const { history } = await browser.runtime.sendMessage({ type: 'get_history' });
            historyListContainer.innerHTML = '';

            if (!history || history.length === 0) {
                historyListContainer.innerHTML = '<p class="empty-message">還沒有任何瀏覽紀錄。</p>';
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
                deleteBtn.innerHTML = '&times;';
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
            statusMessage.textContent = '✅ 歷史紀錄已清除！';
            statusMessage.style.color = '#28a745';
            setTimeout(() => { statusMessage.textContent = ''; }, 2000);
        };

        const handleDeleteHistoryItem = async (e) => {
            if (e.target.classList.contains('history-item-delete-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                const urlToDelete = e.target.dataset.url;
                if (urlToDelete) {
                    await browser.runtime.sendMessage({ type: 'delete_history_item', url: urlToDelete });
                    e.target.closest('.history-item').remove();
                }
            }
        };

        // --- 頁籤切換邏輯 ---
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
                    }
                });
            });
        };

        // --- 初始化執行 ---
        checkLoginStatus();
        loadSettings();
        setupTabs();

        // --- 事件監聽器綁定 ---
        enableGridViewCheckbox.addEventListener('change', (event) => {
            gridColumnsSetting.style.display = event.target.checked ? 'flex' : 'none';
        });
        
        readerModeSelect.addEventListener('change', (event) => {
            toggleReaderModeSettings(event.target.value);
        });

        themeModeSelect.addEventListener('change', (event) => {
            applyTheme(event.target.value);
        });

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
            }).catch(error => {
                statusMessage.textContent = '❌ 清除快取失敗！';
                statusMessage.style.color = '#dc3545';
            });
        });
        document.getElementById('clear-history-button').addEventListener('click', clearHistory);
        historyListContainer.addEventListener('click', handleDeleteHistoryItem);

    } catch (e) {
        console.error("Popup 腳本發生嚴重錯誤:", e);
        document.body.innerHTML = `<div style="padding: 10px; color: red; font-family: sans-serif;">擴充功能腳本發生嚴重錯誤，請按 F12 查看瀏覽器擴充功能的控制台以獲取詳細資訊。</div>`;
    }
});
