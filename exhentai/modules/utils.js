/**
 * 通用工具函式模組 (v1.1)
 */

export const delay = ms => new Promise(res => setTimeout(res, ms));

const domParser = new DOMParser();

function getFirstMatch(content, regex) {
    const match = content.match(regex);
    return match ? match[1] : null;
}

export async function fetchAndParsePage(pageUrl, maxRetries = 3) {
    const retries = Number.isInteger(maxRetries) && maxRetries > 0 ? maxRetries : 1;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(pageUrl, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP 請求失敗: ${response.status}`);
            const htmlText = await response.text();
            return domParser.parseFromString(htmlText, 'text/html');
        } catch (error) {
            console.warn(`[ExH] 讀取頁面失敗 (${pageUrl}), 第 ${i + 1} 次嘗試...`, error.message);
            if (i < retries - 1) await delay(1000 * (i + 1));
            else {
                console.error(`[ExH] 讀取或解析頁面時發生嚴重錯誤 (${pageUrl}):`, error);
                return null;
            }
        }
    }
}

/**
 * 當圖片載入失敗時，透過 E-Hentai/ExHentai 的 nl 參數或 JSON API 取得備用圖片伺服器連結
 * @param {string} pageUrl - 圖片所在的閱讀頁網址
 * @param {HTMLImageElement} imgElement - 要更新 src 的圖片 DOM 元素
 * @returns {Promise<boolean>} 是否成功取得新圖片網址
 */
export async function reloadImageFromAPI(pageUrl, imgElement) {
    try {
        const doc = await fetchAndParsePage(pageUrl, 2);
        if (!doc) throw new Error("無法重新抓取頁面文檔。");

        const nlLink = doc.querySelector('#loadfail, a[onclick*="nl("]');
        const nl = nlLink ? getFirstMatch(nlLink.getAttribute('onclick') || '', /nl\(\s*['"]([^'"]+)['"]\s*\)/) : null;

        // 策略 1：使用原廠 ?nl= 參數重新請求頁面，讓伺服器分配新的 H@H 節點圖片
        if (nl) {
            const reloadUrl = new URL(pageUrl, window.location.origin);
            reloadUrl.searchParams.set('nl', nl);
            const reloadDoc = await fetchAndParsePage(reloadUrl.href, 2);
            const reloadedImgSrc = reloadDoc?.getElementById('img')?.src;
            if (reloadedImgSrc) {
                imgElement.src = reloadedImgSrc;
                return true;
            }
        }

        // 策略 2：使用 JSON 格式呼叫 /api.php (需附帶 showkey，並從 i3 欄位解析 img src)
        const scriptContent = Array.from(doc.scripts).map(s => s.textContent).join('\n');
        const gid = getFirstMatch(scriptContent, /var\s+gid\s*=\s*(\d+)/);
        const imgkey = getFirstMatch(scriptContent, /var\s+imgkey\s*=\s*["']([a-z0-9]+)["']/i);
        const showkey = getFirstMatch(scriptContent, /var\s+showkey\s*=\s*["']([^"']+)["']/i);
        const page = getFirstMatch(pageUrl, /-(\d+)(?:[/?#]|$)/);

        if (gid && imgkey && showkey && page) {
            const payload = {
                method: 'showpage',
                gid: Number(gid),
                page: Number(page),
                imgkey,
                showkey
            };
            if (nl) payload.nl = nl;

            const response = await fetch('/api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                const data = await response.json();
                const i3Html = data?.i3 || '';
                const apiImgSrc = getFirstMatch(i3Html, /src=["']([^"']+)["']/i) || (typeof data?.i === 'string' && data.i.startsWith('http') ? data.i : null);
                if (apiImgSrc) {
                    imgElement.src = apiImgSrc;
                    return true;
                }
            }
        }

        // 策略 3：若上述皆未取得，但重新抓取的頁面 #img 網址已更新，則直接採用
        const fallbackSrc = doc.getElementById('img')?.src;
        if (fallbackSrc && fallbackSrc !== imgElement.src) {
            imgElement.src = fallbackSrc;
            return true;
        }

        throw new Error("找不到可用的備用圖片連結。");
    } catch (error) {
        console.error(`[ExH] 圖片智慧重載失敗:`, error);
        return false;
    }
}

export function parseImageUrlFromStyle(styleString) {
    const match = styleString.match(/url\("?(.+?)"?\)/);
    return match ? match[1] : null;
}

let cachedI18nMessages = null;

/**
 * 從背景腳本取得多語系字串
 * @param {string[]|string} [keys='all'] - 要取得的鍵值清單，傳入 'all' 則取得全部
 * @returns {Promise<Object<string, string>>}
 */
export async function getI18nMessages(keys = 'all') {
    if (cachedI18nMessages && (keys === 'all' || !keys)) {
        return cachedI18nMessages;
    }
    try {
        const response = await browser.runtime.sendMessage({
            type: 'get_i18n_messages',
            keys: keys === 'all' ? 'all' : (Array.isArray(keys) ? keys : [keys])
        });
        if (response && response.messages) {
            if (keys === 'all' || !keys) {
                cachedI18nMessages = response.messages;
            }
            return response.messages;
        }
    } catch (e) {
        console.warn('[ExH] 讀取 i18n 訊息失敗。', e);
    }
    return cachedI18nMessages || {};
}

let cachedI18nMessages = null;

/**
 * 從背景腳本取得多語系字串
 * @param {string[]|string} [keys='all'] - 要取得的鍵值清單，傳入 'all' 則取得全部
 * @returns {Promise<Object<string, string>>}
 */
export async function getI18nMessages(keys = 'all') {
    if (cachedI18nMessages && (keys === 'all' || !keys)) {
        return cachedI18nMessages;
    }
    try {
        const response = await browser.runtime.sendMessage({
            type: 'get_i18n_messages',
            keys: keys === 'all' ? 'all' : (Array.isArray(keys) ? keys : [keys])
        });
        if (response && response.messages) {
            if (keys === 'all' || !keys) {
                cachedI18nMessages = response.messages;
            }
            return response.messages;
        }
    } catch (e) {
        console.warn('[ExH] 讀取 i18n 訊息失敗。', e);
    }
    return cachedI18nMessages || {};
}

let cachedI18nMessages = null;

/**
 * 從背景腳本取得多語系字串
 * @param {string[]|string} [keys='all'] - 要取得的鍵值清單，傳入 'all' 則取得全部
 * @returns {Promise<Object<string, string>>}
 */
export async function getI18nMessages(keys = 'all') {
    if (cachedI18nMessages && (keys === 'all' || !keys)) {
        return cachedI18nMessages;
    }
    try {
        const response = await browser.runtime.sendMessage({
            type: 'get_i18n_messages',
            keys: keys === 'all' ? 'all' : (Array.isArray(keys) ? keys : [keys])
        });
        if (response && response.messages) {
            if (keys === 'all' || !keys) {
                cachedI18nMessages = response.messages;
            }
            return response.messages;
        }
    } catch (e) {
        console.warn('[ExH] 讀取 i18n 訊息失敗。', e);
    }
    return cachedI18nMessages || {};
}

let cachedI18nMessages = null;

/**
 * 從背景腳本取得多語系字串
 * @param {string[]|string} [keys='all'] - 要取得的鍵值清單，傳入 'all' 則取得全部
 * @returns {Promise<Object<string, string>>}
 */
export async function getI18nMessages(keys = 'all') {
    if (cachedI18nMessages && (keys === 'all' || !keys)) {
        return cachedI18nMessages;
    }
    try {
        const response = await browser.runtime.sendMessage({
            type: 'get_i18n_messages',
            keys: keys === 'all' ? 'all' : (Array.isArray(keys) ? keys : [keys])
        });
        if (response && response.messages) {
            if (keys === 'all' || !keys) {
                cachedI18nMessages = response.messages;
            }
            return response.messages;
        }
    } catch (e) {
        console.warn('[ExH] 讀取 i18n 訊息失敗。', e);
    }
    return cachedI18nMessages || {};
}

let cachedI18nMessages = null;

/**
 * 從背景腳本取得多語系字串
 * @param {string[]|string} [keys='all'] - 要取得的鍵值清單，傳入 'all' 則取得全部
 * @returns {Promise<Object<string, string>>}
 */
export async function getI18nMessages(keys = 'all') {
    if (cachedI18nMessages && (keys === 'all' || !keys)) {
        return cachedI18nMessages;
    }
    try {
        const response = await browser.runtime.sendMessage({
            type: 'get_i18n_messages',
            keys: keys === 'all' ? 'all' : (Array.isArray(keys) ? keys : [keys])
        });
        if (response && response.messages) {
            if (keys === 'all' || !keys) {
                cachedI18nMessages = response.messages;
            }
            return response.messages;
        }
    } catch (e) {
        console.warn('[ExH] 讀取 i18n 訊息失敗。', e);
    }
    return cachedI18nMessages || {};
}

let cachedI18nMessages = null;

/**
 * 從背景腳本取得多語系字串
 * @param {string[]|string} [keys='all'] - 要取得的鍵值清單，傳入 'all' 則取得全部
 * @returns {Promise<Object<string, string>>}
 */
export async function getI18nMessages(keys = 'all') {
    if (cachedI18nMessages && (keys === 'all' || !keys)) {
        return cachedI18nMessages;
    }
    try {
        const response = await browser.runtime.sendMessage({
            type: 'get_i18n_messages',
            keys: keys === 'all' ? 'all' : (Array.isArray(keys) ? keys : [keys])
        });
        if (response && response.messages) {
            if (keys === 'all' || !keys) {
                cachedI18nMessages = response.messages;
            }
            return response.messages;
        }
    } catch (e) {
        console.warn('[ExH] 讀取 i18n 訊息失敗。', e);
    }
    return cachedI18nMessages || {};
}
