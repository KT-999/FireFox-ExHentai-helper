// popup/modules/auth.js
import { getMessage, clearElement } from './ui.js';

const EXHENTAI_URL = "https://exhentai.org/";
const LOGIN_URL = "https://forums.e-hentai.org/index.php?act=Login&CODE=00";
const SYNC_COOKIE_NAMES = ['ipb_member_id', 'ipb_pass_hash', 'igneous', 'sk'];
const LOGOUT_COOKIE_NAMES = ['ipb_member_id', 'ipb_pass_hash', 'sk', 'yay', 'ipb_session_id', 'igneous'];

const authSection = document.getElementById('auth-section');
const authHr = document.getElementById('auth-hr');

/**
 * 取得目前作用中分頁的 cookieStoreId（支援 Firefox 容器分頁與無痕視窗）
 * @returns {Promise<string|null>}
 */
const getActiveCookieStoreId = async () => {
    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        return tabs?.[0]?.cookieStoreId || null;
    } catch (_) {
        return null;
    }
};

/**
 * 安全讀取 Cookie 清單（相容 Firefox First-Party Isolation 設定）
 * @param {object} details - browser.cookies.getAll 查詢條件
 * @returns {Promise<browser.cookies.Cookie[]>}
 */
const getCookiesSafe = async (details) => {
    try {
        return (await browser.cookies.getAll(details)) || [];
    } catch (err) {
        try {
            return (await browser.cookies.getAll({ ...details, firstPartyDomain: null })) || [];
        } catch (_) {
            return [];
        }
    }
};

/**
 * 安全移除單一 Cookie（保留對應的 storeId 與 firstPartyDomain）
 * @param {browser.cookies.Cookie} cookie - 要移除的 Cookie 物件
 */
const removeCookieSafe = async (cookie) => {
    const cleanDomain = cookie.domain.replace(/^\./, '');
    const url = `http${cookie.secure ? 's' : ''}://${cleanDomain}${cookie.path || '/'}`;
    const removeDetails = {
        url,
        name: cookie.name,
        storeId: cookie.storeId,
    };
    if (cookie.firstPartyDomain !== undefined) {
        removeDetails.firstPartyDomain = cookie.firstPartyDomain;
    }
    try {
        await browser.cookies.remove(removeDetails);
    } catch (_) {}
};

/**
 * 判斷 Cookie 值是否為有效的認證資訊（排除空值、'0' 與 'mystery'）
 * @param {string} name - Cookie 名稱
 * @param {string} value - Cookie 值
 * @returns {boolean}
 */
const isValidAuthCookieValue = (name, value) => {
    if (!value || value === '0' || value === 'deleted') return false;
    if (name === 'igneous' && value === 'mystery') return false;
    return true;
};

/**
 * 檢查指定 cookieStoreId 的登入狀態，並委派背景腳本將 e-hentai.org 的登入憑證同步至 exhentai.org
 * @param {string|null} storeId - Cookie 儲存區 ID
 * @returns {Promise<boolean>} 是否已登入
 */
const checkAndSyncStoreAuth = async (storeId) => {
    try {
        const res = await browser.runtime.sendMessage({
            type: 'sync_auth_cookies',
            storeId: storeId || undefined
        });
        if (res && typeof res.isLoggedIn === 'boolean') {
            return res.isLoggedIn;
        }
    } catch (_) {
        // 背景訊息失敗時退回本地檢查
    }

    const queryBase = storeId ? { storeId } : {};
    const ehCookies = await getCookiesSafe({ ...queryBase, domain: 'e-hentai.org' });
    const exhCookies = await getCookiesSafe({ ...queryBase, domain: 'exhentai.org' });

    const validEhMap = new Map();
    for (const c of ehCookies) {
        if (SYNC_COOKIE_NAMES.includes(c.name) && isValidAuthCookieValue(c.name, c.value)) {
            validEhMap.set(c.name, c);
        }
    }

    const validExhMap = new Map();
    for (const c of exhCookies) {
        if (SYNC_COOKIE_NAMES.includes(c.name) && isValidAuthCookieValue(c.name, c.value)) {
            validExhMap.set(c.name, c);
        }
    }

    const hasEhLogin = validEhMap.has('ipb_member_id') && validEhMap.has('ipb_pass_hash');
    const hasExhLogin = validExhMap.has('ipb_member_id') && validExhMap.has('ipb_pass_hash');
    return hasExhLogin || hasEhLogin;
};

const updateAuthUI = (isLoggedIn, statusTextContent) => {
    clearElement(authSection);
    const version = browser.runtime.getManifest().version;

    const topRow = document.createElement('div');
    topRow.className = 'auth-top-row';

    const statusDiv = document.createElement('div');
    statusDiv.className = 'auth-status-text';

    if (statusTextContent) {
        statusDiv.textContent = statusTextContent;
        if (statusTextContent === getMessage('loginStatusError')) {
            statusDiv.style.color = '#dc3545';
        }
    } else if (isLoggedIn) {
        statusDiv.textContent = getMessage('loginStatus');
        const usernameSpan = document.createElement('span');
        usernameSpan.className = 'auth-username';
        usernameSpan.textContent = ` ${getMessage('loggedInStatus')}`;
        statusDiv.appendChild(usernameSpan);
    } else {
        statusDiv.textContent = getMessage('loggedOutStatus');
    }

    const versionSpan = document.createElement('span');
    versionSpan.className = 'extension-version';
    versionSpan.textContent = `v${version}`;

    topRow.appendChild(statusDiv);
    topRow.appendChild(versionSpan);
    authSection.appendChild(topRow);

    if (isLoggedIn) {
        const logoutButton = document.createElement('button');
        logoutButton.id = 'logout-button';
        logoutButton.className = 'btn-danger';
        logoutButton.textContent = getMessage('logoutButton');
        logoutButton.addEventListener('click', handleLogout);
        authSection.appendChild(logoutButton);
    } else if (statusTextContent !== getMessage('loginStatusError')) {
        const loginButton = document.createElement('button');
        loginButton.id = 'login-button';
        loginButton.textContent = getMessage('loginButton');
        loginButton.addEventListener('click', async () => {
            if (browser.permissions && browser.permissions.request) {
                await browser.permissions.request({
                    origins: ["https://exhentai.org/*", "https://e-hentai.org/*"]
                }).catch(() => {});
            }
            const storeId = await getActiveCookieStoreId();
            const createProps = { url: LOGIN_URL };
            if (storeId) createProps.cookieStoreId = storeId;
            browser.tabs.create(createProps).catch(() => browser.tabs.create({ url: LOGIN_URL }));
        });
        authSection.appendChild(loginButton);
    }
};

const handleLogout = async () => {
    const statusMessage = document.getElementById('status-message');
    statusMessage.textContent = '正在登出...';
    statusMessage.style.color = '#6c757d';
    try {
        const domains = ["e-hentai.org", "exhentai.org"];
        const activeStoreId = await getActiveCookieStoreId();
        const storesToClear = new Set([activeStoreId, undefined]);

        try {
            const allStores = await browser.cookies.getAllCookieStores();
            allStores.forEach(s => storesToClear.add(s.id));
        } catch (_) {}

        for (const storeId of storesToClear) {
            for (const domain of domains) {
                const query = storeId ? { domain, storeId } : { domain };
                const cookies = await getCookiesSafe(query);
                for (const cookie of cookies) {
                    if (LOGOUT_COOKIE_NAMES.includes(cookie.name)) {
                        await removeCookieSafe(cookie);
                    }
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
        // 1. 優先檢查並同步目前作用中分頁所屬的 Cookie Store（支援 Firefox 容器分頁與無痕模式）
        const activeStoreId = await getActiveCookieStoreId();
        let isLoggedIn = await checkAndSyncStoreAuth(activeStoreId);

        // 2. 若當前分頁並非登入所在的容器（例如使用者在空白預設分頁點開 Popup），遍歷其他容器檢查並同步
        if (!isLoggedIn) {
            const stores = await browser.cookies.getAllCookieStores().catch(() => []);
            for (const store of stores) {
                if (store.id === activeStoreId) continue;
                const storeLoggedIn = await checkAndSyncStoreAuth(store.id);
                if (storeLoggedIn) {
                    isLoggedIn = true;
                }
            }
        }

        updateAuthUI(isLoggedIn, null);
        authHr.style.display = 'block';
    } catch (error) {
        console.error("檢查登入狀態時出錯:", error);
        updateAuthUI(false, getMessage('loginStatusError'));
        authHr.style.display = 'block';
    }
};

export const initAuth = () => {
    checkLoginStatus();
};
