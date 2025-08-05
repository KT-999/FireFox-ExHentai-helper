/**
 * 處理彈出視窗的邏輯：
 * - 檢查與處理登入/登出 (v11.2 偵錯版)。
 * - 儲存和讀取一般設定。
 * - 提供開啟選項頁面與手動清除快取的功能。
 */

// 為了偵錯，將日誌函式放在最外層
const log = (message) => console.log(`[ExH Popup] ${new Date().toISOString()}: ${message}`);
const logError = (message, error) => console.error(`[ExH Popup] ${new Date().toISOString()}: ${message}`, error);

document.addEventListener('DOMContentLoaded', () => {
    log("DOM 已載入，開始執行腳本。");

    try {
        // --- 常數定義 ---
        const EXHENTAI_URL = "https://exhentai.org";
        const LOGIN_URL = "https://forums.e-hentai.org/index.php?act=Login&CODE=00";

        // --- UI 元素 ---
        const authSection = document.getElementById('auth-section');
        const authHr = document.getElementById('auth-hr');
        const statusMessage = document.getElementById('status-message');

        if (!authSection || !authHr || !statusMessage) {
            logError("一個或多個必要的 UI 元素未找到，HTML 可能不完整。");
            return;
        }
        log("所有 UI 元素已成功獲取。");

        // --- 核心功能函式 ---

        const updateAuthUI = (isLoggedIn) => {
            log(`更新 UI，登入狀態: ${isLoggedIn}`);
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
            log("UI 更新完畢。");
        };
        
        const handleLogout = async () => {
            log("開始執行登出程序...");
            statusMessage.textContent = '正在登出...';
            statusMessage.style.color = '#6c757d';

            try {
                const domains = ["e-hentai.org", "exhentai.org", "forums.e-hentai.org"];
                const cookieNames = ['ipb_member_id', 'ipb_pass_hash', 'sk', 'yay', 'ipb_session_id', 'igneous'];
                let removedCount = 0;

                for (const domain of domains) {
                    log(`正在檢查網域 ${domain} 的 cookie...`);
                    const cookies = await browser.cookies.getAll({ domain });
                    if (!cookies || cookies.length === 0) {
                        log(`網域 ${domain} 沒有找到 cookie。`);
                        continue;
                    }
                    
                    for (const cookie of cookies) {
                        if (cookieNames.includes(cookie.name)) {
                            const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
                            log(`正在移除 cookie: ${cookie.name} from ${url}`);
                            await browser.cookies.remove({ url, name: cookie.name });
                            removedCount++;
                        }
                    }
                }
                
                log(`登出操作：共移除了 ${removedCount} 個相關 Cookie。`);
                statusMessage.textContent = '✅ 登出成功！';
                statusMessage.style.color = '#28a745';
                setTimeout(() => { statusMessage.textContent = ''; }, 2000);
                
                updateAuthUI(false);

            } catch (error) {
                logError("登出時發生錯誤:", error);
                statusMessage.textContent = '❌ 登出失敗！';
                statusMessage.style.color = '#dc3545';
            }
        };

        const checkLoginStatus = async () => {
            log("開始檢查登入狀態...");
            authSection.innerHTML = '<p class="auth-status-text">正在檢查登入狀態...</p>';
            try {
                log(`正在從 ${EXHENTAI_URL} 獲取 'ipb_member_id' cookie...`);
                const memberIdCookie = await browser.cookies.get({
                    url: EXHENTAI_URL,
                    name: 'ipb_member_id'
                });
                log(`獲取到的 cookie: ${JSON.stringify(memberIdCookie)}`);

                const isLoggedIn = !!(memberIdCookie && memberIdCookie.value && memberIdCookie.value !== '0');
                log(`判斷登入狀態為: ${isLoggedIn}`);
                
                updateAuthUI(isLoggedIn);
                authHr.style.display = 'block';
            } catch (error) {
                logError("檢查登入狀態時出錯:", error);
                authSection.innerHTML = '<p class="auth-status-text" style="color: red;">無法檢查登入狀態，請按 F12 查看擴充功能主控台。</p>';
                authHr.style.display = 'block';
            }
        };

        const saveSettings = () => {
            log("正在儲存設定...");
            const settings = {
                preloadCount: parseInt(document.getElementById('preload-count').value, 10) || 3,
                cacheSize: parseInt(document.getElementById('cache-size').value, 10) || 50,
                fitToWindow: document.getElementById('fit-to-window').checked,
                hidePreviewBar: document.getElementById('hide-preview-bar').checked,
                themeMode: document.getElementById('theme-mode').value,
            };

            browser.storage.local.set(settings).then(() => {
                log("設定儲存成功。");
                statusMessage.textContent = '✅ 設定已儲存！';
                statusMessage.style.color = '#28a745';
                setTimeout(() => { statusMessage.textContent = ''; }, 2000);
            }).catch(error => {
                logError('儲存設定時發生錯誤:', error);
                statusMessage.textContent = '❌ 儲存失敗！';
                statusMessage.style.color = '#dc3545';
            });
        };

        const loadSettings = () => {
            log("正在載入設定...");
            browser.storage.local.get({ 
                preloadCount: 3, 
                cacheSize: 50,
                fitToWindow: true,
                hidePreviewBar: false,
                themeMode: 'system',
            }).then(result => {
                document.getElementById('preload-count').value = result.preloadCount;
                document.getElementById('cache-size').value = result.cacheSize;
                document.getElementById('fit-to-window').checked = result.fitToWindow;
                document.getElementById('hide-preview-bar').checked = result.hidePreviewBar;
                document.getElementById('theme-mode').value = result.themeMode;
                log("設定載入成功。");
            }).catch(error => {
                logError('讀取設定時發生錯誤:', error);
            });
        };

        // --- 初始化執行 ---
        log("開始執行初始化函式...");
        checkLoginStatus();
        loadSettings();
        log("初始化函式呼叫完畢。");

        // --- 事件監聽器綁定 ---
        log("開始綁定事件監聽器...");
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
                logError('清除快取時發生錯誤:', error);
                statusMessage.textContent = '❌ 清除快取失敗！';
                statusMessage.style.color = '#dc3545';
            });
        });
        log("所有事件監聽器已綁定。腳本初始化完成。");

    } catch (e) {
        logError("Popup 腳本發生最上層的嚴重錯誤:", e);
        document.body.innerHTML = `<div style="padding: 10px; color: red; font-family: sans-serif;">擴充功能腳本發生嚴重錯誤，請按 F12 查看瀏覽器擴充功能的控制台以獲取詳細資訊。</div>`;
    }
});
