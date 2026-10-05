/**
 * 獨立的上傳者封鎖模組
 * - 在所有的列表視圖 (Compact, Extended, Minimal, Thumbnail) 中生效
 * - 透過 `a[href*="/uploader/"]` 尋找上傳者並隱藏該項目
 */

let currentBlockedUploaders = [];
let hasInitializedBlocker = false;

/**
 * 根據封鎖清單隱藏或還原列表項目
 * @param {string[]} uploaders - 完整封鎖上傳者名單
 */
function syncBlockingState(uploaders) {
    if (!uploaders || !Array.isArray(uploaders)) return;
    const blockedSet = new Set(uploaders);

    const uploaderLinks = document.querySelectorAll('.itg a[href*="/uploader/"]');
    uploaderLinks.forEach(link => {
        const uploaderName = link.textContent.trim();
        if (!uploaderName) return;

        const itemContainer = link.closest('tr') || link.closest('div[class^="gl1"]');
        if (!itemContainer) return;

        if (blockedSet.has(uploaderName)) {
            if (itemContainer.dataset.exhBlockerOriginalDisplay === undefined) {
                itemContainer.dataset.exhBlockerOriginalDisplay = itemContainer.style.display || '';
            }
            itemContainer.style.display = 'none';
        } else if (itemContainer.dataset.exhBlockerOriginalDisplay !== undefined) {
            itemContainer.style.display = itemContainer.dataset.exhBlockerOriginalDisplay;
            delete itemContainer.dataset.exhBlockerOriginalDisplay;
        }
    });
}

function applyBlocking(uploaders) {
    if (!uploaders || !Array.isArray(uploaders)) return;
    const blockedSet = new Set(uploaders);

    // 尋找所有的列表項目，.itg 是最外層的表格或容器
    const uploaderLinks = document.querySelectorAll('.itg a[href*="/uploader/"]');
    uploaderLinks.forEach(link => {
        const uploaderName = link.textContent.trim();
        if (uploaderName && blockedSet.has(uploaderName)) {
            // 找出最接近的項目容器 (如果是表格則為 tr，如果是縮圖則可能是 div.gl1t 或其他包含 gl1 的 div)
            const itemContainer = link.closest('tr') || link.closest('div[class^="gl1"]');
            if (itemContainer) {
                if (itemContainer.dataset.exhBlockerOriginalDisplay === undefined) {
                    itemContainer.dataset.exhBlockerOriginalDisplay = itemContainer.style.display || '';
                }
                itemContainer.style.display = 'none';
            }
        }
    });
}

/**
 * 標準化路徑字串（移除結尾斜線以便比對）
 * @param {string} pathname - URL pathname
 * @returns {string}
 */
function normalizePathname(pathname) {
    return (pathname || '').replace(/\/+$/, '');
}

function handleUploaderBlockedMessage(message) {
    if (message.type === 'uploader_blocked') {
        const uploaderName = message.uploader;
        if (!uploaderName) return;

        if (!currentBlockedUploaders.includes(uploaderName)) {
            currentBlockedUploaders.push(uploaderName);
        }

        // 即時隱藏
        applyBlocking([uploaderName]);
    } else if (message.type === 'get_uploader_by_url') {
        let link = null;
        try {
            const urlObj = new URL(message.url, window.location.origin);
            const targetPath = normalizePathname(urlObj.pathname); // 例如 /g/3958849/152bda590b 或 /uploader/kenny

            // 策略 0: 若直接對著 /uploader/* 連結點擊右鍵，直接從路徑解析名稱
            if (targetPath.startsWith('/uploader/')) {
                const directUploader = decodeURIComponent(targetPath.substring('/uploader/'.length)).trim();
                if (directUploader) {
                    return Promise.resolve({ uploader: directUploader });
                }
            }

            // 策略 1: 尋找是否為網格視圖的項目 (解決無限滾動載入的項目不在 .itg 內的問題)
            const gridItems = document.querySelectorAll('.exh-grid-item[href]');
            for (const item of gridItems) {
                try {
                    const itemPath = normalizePathname(new URL(item.href, window.location.origin).pathname);
                    if (itemPath === targetPath && item.dataset.uploader) {
                        return Promise.resolve({ uploader: item.dataset.uploader });
                    }
                } catch (_) {}
            }

            // 策略 2: 尋找原始列表 (.itg) 中的連結
            const itgLinks = document.querySelectorAll('.itg a[href]');
            for (const a of itgLinks) {
                try {
                    const linkPath = normalizePathname(new URL(a.href, window.location.origin).pathname);
                    if (linkPath === targetPath) {
                        link = a;
                        break;
                    }
                } catch (_) {}
            }
        } catch (e) {
            // 解析失敗時靜默處理
        }

        if (!link) {
            return Promise.resolve({ uploader: null });
        }

        const row = link.closest('tr') || link.closest('div[class^="gl1"]');
        if (!row) {
            return Promise.resolve({ uploader: null });
        }

        const uploaderLink = row.querySelector('a[href*="/uploader/"]');
        if (!uploaderLink) {
            return Promise.resolve({ uploader: null });
        }

        const name = uploaderLink.textContent.trim();
        return Promise.resolve({ uploader: name });
    }
}

export async function initUploaderBlocker() {
    if (hasInitializedBlocker) return;

    console.log('[ExH] 啟動獨立的上傳者封鎖模組...');

    try {
        const { uploaders } = await browser.runtime.sendMessage({ type: 'get_blocked_uploaders' }).catch(() => ({ uploaders: [] }));
        currentBlockedUploaders = uploaders || [];

        applyBlocking(currentBlockedUploaders);

        // 監聽即時封鎖事件與儲存區變更（例如在 Popup 解除封鎖時同步還原）
        browser.runtime.onMessage.addListener(handleUploaderBlockedMessage);
        browser.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.blockedUploaders) {
                currentBlockedUploaders = changes.blockedUploaders.newValue || [];
                syncBlockingState(currentBlockedUploaders);
            }
        });

        hasInitializedBlocker = true;
    } catch (error) {
        console.error('[ExH] 載入封鎖清單時發生錯誤:', error);
    }
}

// 暴露出一個重新套用的方法，以便於 AJAX 翻頁後呼叫 (例如搭配無限滾動)
export function reapplyBlocking() {
    applyBlocking(currentBlockedUploaders);
}

export function isUploaderBlocked(uploaderName) {
    return currentBlockedUploaders.includes(uploaderName);
}
