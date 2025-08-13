/**
 * 處理彈出視窗的邏輯 (v1.0)：
 * - 將閱讀模式設定改為下拉選單三選一。
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
                readerMode: 'horizontal', // 預設為翻頁模式
                preloadCount: 3, 
                cacheSize: 50,
                fitToWindow: true,
                hidePreviewBar: false,
                themeMode: 'system',
            }).then(result => {
                enableGridViewCheckbox.checked = result.enableGridView;
                document.getElementById('grid-columns').value = result.gridColumns;
                readerModeSelect.value = result.readerMode;
                document.getElementById('preload-count').value = result.preloadCount;
                document.getElementById('cache-size').value = result.cacheSize;
                document.getElementById('fit-to-window').checked = result.fitToWindow;
                document.getElementById('hide-preview-bar').checked = result.hidePreviewBar;
                document.getElementById('theme-mode').value = result.themeMode;
                
                gridColumnsSetting.style.display = result.enableGridView ? 'flex' : 'none';
                toggleReaderModeSettings(result.readerMode);
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

        // --- 初始化執行 ---
        checkLoginStatus();
        loadSettings();

        // --- 事件監聽器綁定 ---
        enableGridViewCheckbox.addEventListener('change', (event) => {
            gridColumnsSetting.style.display = event.target.checked ? 'flex' : 'none';
        });
        
        readerModeSelect.addEventListener('change', (event) => {
            toggleReaderModeSettings(event.target.value);
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

    } catch (e) {
        console.error("Popup 腳本發生嚴重錯誤:", e);
        document.body.innerHTML = `<div style="padding: 10px; color: red; font-family: sans-serif;">擴充功能腳本發生嚴重錯誤，請按 F12 查看瀏覽器擴充功能的控制台以獲取詳細資訊。</div>`;
    }
});
