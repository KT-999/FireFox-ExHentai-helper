/**
 * 獨立的上傳者與標籤封鎖模組
 * - 在所有的列表視圖 (Compact, Extended, Minimal, Thumbnail) 中生效
 * - 透過 `a[href*="/uploader/"]` 尋找上傳者，或透過 `.gt[title], .gtl[title]` 比對封鎖標籤並隱藏該項目
 */

let currentBlockedUploaders = [];
let currentBlockedTags = [];
let hasInitializedBlocker = false;

/**
 * 檢查列表項目是否包含被封鎖的上傳者或被封鎖的標籤
 * @param {Element} itemContainer - 列表項目容器 (tr 或 div.gl1*)
 * @param {Set<string>} blockedUploadersSet - 封鎖的上傳者集合
 * @param {Set<string>} blockedTagsSet - 封鎖的標籤集合
 * @returns {boolean}
 */
function shouldBlockContainer(itemContainer, blockedUploadersSet, blockedTagsSet) {
    if (!itemContainer) return false;

    if (blockedUploadersSet.size > 0) {
        const uploaderLink = itemContainer.querySelector('a[href*="/uploader/"]');
        const uploaderName = uploaderLink ? uploaderLink.textContent.trim() : '';
        if (uploaderName && blockedUploadersSet.has(uploaderName)) {
            return true;
        }
    }

    if (blockedTagsSet.size > 0) {
        const tagNodes = itemContainer.querySelectorAll('.gt[title], .gtl[title]');
        for (const tagNode of tagNodes) {
            const rawTitle = (tagNode.getAttribute('title') || '').trim();
            if (rawTitle && blockedTagsSet.has(rawTitle)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * 根據封鎖清單隱藏或還原列表項目
 * @param {string[]} uploaders - 完整封鎖上傳者名單
 * @param {string[]} [tags] - 完整封鎖標籤名單
 */
function syncBlockingState(uploaders = currentBlockedUploaders, tags = currentBlockedTags) {
    const blockedUploadersSet = new Set(Array.isArray(uploaders) ? uploaders : []);
    const blockedTagsSet = new Set(Array.isArray(tags) ? tags : []);

    const rows = document.querySelectorAll('.itg tbody > tr, .itg > div[class^="gl1"]');
    rows.forEach(itemContainer => {
        if (shouldBlockContainer(itemContainer, blockedUploadersSet, blockedTagsSet)) {
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

function applyBlocking(uploaders = currentBlockedUploaders, tags = currentBlockedTags) {
    const blockedUploadersSet = new Set(Array.isArray(uploaders) ? uploaders : []);
    const blockedTagsSet = new Set(Array.isArray(tags) ? tags : []);

    const rows = document.querySelectorAll('.itg tbody > tr, .itg > div[class^="gl1"]');
    rows.forEach(itemContainer => {
        if (shouldBlockContainer(itemContainer, blockedUploadersSet, blockedTagsSet)) {
            if (itemContainer.dataset.exhBlockerOriginalDisplay === undefined) {
                itemContainer.dataset.exhBlockerOriginalDisplay = itemContainer.style.display || '';
            }
            itemContainer.style.display = 'none';
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
        applyBlocking(currentBlockedUploaders, currentBlockedTags);
    } else if (message.type === 'tag_blocked') {
        const tagName = message.tag;
        if (!tagName) return;

        if (!currentBlockedTags.includes(tagName)) {
            currentBlockedTags.push(tagName);
        }

        // 即時隱藏
        applyBlocking(currentBlockedUploaders, currentBlockedTags);
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

    console.log('[ExH] 啟動上傳者與標籤封鎖模組...');

    try {
        const [{ uploaders }, { blockedTags }] = await Promise.all([
            browser.runtime.sendMessage({ type: 'get_blocked_uploaders' }).catch(() => ({ uploaders: [] })),
            browser.runtime.sendMessage({ type: 'get_blocked_tags' }).catch(() => ({ blockedTags: [] })),
        ]);
        currentBlockedUploaders = uploaders || [];
        currentBlockedTags = blockedTags || [];

        applyBlocking(currentBlockedUploaders, currentBlockedTags);

        // 監聽即時封鎖事件與儲存區變更（例如在 Popup 解除封鎖時同步還原）
        browser.runtime.onMessage.addListener(handleUploaderBlockedMessage);
        browser.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && (changes.blockedUploaders || changes.blockedTags)) {
                if (changes.blockedUploaders) {
                    currentBlockedUploaders = changes.blockedUploaders.newValue || [];
                }
                if (changes.blockedTags) {
                    currentBlockedTags = changes.blockedTags.newValue || [];
                }
                syncBlockingState(currentBlockedUploaders, currentBlockedTags);
            }
        });

        hasInitializedBlocker = true;
    } catch (error) {
        console.error('[ExH] 載入封鎖清單時發生錯誤:', error);
    }
}

// 暴露出一個重新套用的方法，以便於 AJAX 翻頁後呼叫 (例如搭配無限滾動)
export function reapplyBlocking() {
    applyBlocking(currentBlockedUploaders, currentBlockedTags);
}

export function isUploaderBlocked(uploaderName) {
    return currentBlockedUploaders.includes(uploaderName);
}

/**
 * 檢查單一標籤是否位於封鎖清單中
 * @param {string} tagName - 原始標籤名稱 (例如 "female:ntr")
 * @returns {boolean}
 */
export function isTagBlocked(tagName) {
    return currentBlockedTags.includes(tagName);
}
