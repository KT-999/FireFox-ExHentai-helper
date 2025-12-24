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

export async function reloadImageFromAPI(pageUrl, imgElement) {
    try {
        const doc = await fetchAndParsePage(pageUrl);
        if (!doc) throw new Error("無法重新抓取頁面文檔。");
        const scriptContent = Array.from(doc.scripts).map(s => s.textContent).join('\n');
        const gid = getFirstMatch(scriptContent, /var gid = (\d+);/);
        const imgkey = getFirstMatch(scriptContent, /var imgkey = "([a-z0-9]+)";/);
        const nlLink = doc.querySelector('a#loadfail[onclick^="nl"]');
        const nl = nlLink ? getFirstMatch(nlLink.getAttribute('onclick') || '', /nl\('([^']+)'\)/) : null;
        const page = getFirstMatch(pageUrl, /-(\d+)$/);
        if (!gid || !imgkey || !nl || !page) throw new Error("找不到 API 重載所需的所有參數。");
        const apiRequestBody = `method=showpage&gid=${gid}&page=${page}&imgkey=${imgkey}&nl=${nl}`;
        const response = await fetch('/api.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: apiRequestBody });
        if (!response.ok) throw new Error(`API 請求失敗，狀態碼: ${response.status}`);
        const data = await response.json();
        if (data && data.i) {
            imgElement.src = data.i;
            return true;
        } else {
            throw new Error("API 回應中未包含有效的圖片連結。");
        }
    } catch (error) {
        console.error(`[ExH] API 圖片重載失敗:`, error);
        return false;
    }
}

export function parseImageUrlFromStyle(styleString) {
    const match = styleString.match(/url\("?(.+?)"?\)/);
    return match ? match[1] : null;
}
