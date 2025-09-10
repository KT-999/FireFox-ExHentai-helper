// popup/modules/auth.js
import { getMessage, clearElement } from './ui.js';

const EXHENTAI_URL = "https://exhentai.org";
const LOGIN_URL = "https://forums.e-hentai.org/index.php?act=Login&CODE=00";

const authSection = document.getElementById('auth-section');
const authHr = document.getElementById('auth-hr');

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
        loginButton.addEventListener('click', () => browser.tabs.create({ url: LOGIN_URL }));
        authSection.appendChild(loginButton);
    }
};

const handleLogout = async () => {
    const statusMessage = document.getElementById('status-message');
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
