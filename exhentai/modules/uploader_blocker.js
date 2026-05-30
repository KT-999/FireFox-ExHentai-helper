/**
 * 獨立的上傳者封鎖模組
 * - 在所有的列表視圖 (Compact, Extended, Minimal, Thumbnail) 中生效
 * - 透過 `a[href*="/uploader/"]` 尋找上傳者並隱藏該項目
 */

let currentBlockedUploaders = [];
let hasInitializedBlocker = false;

function applyBlocking(uploaders) {
    if (!uploaders || !Array.isArray(uploaders)) return;
    
    // 尋找所有的列表項目，.itg 是最外層的表格或容器
    const uploaderLinks = document.querySelectorAll('.itg a[href*="/uploader/"]');
    uploaderLinks.forEach(link => {
        const uploaderName = link.textContent.trim();
        if (uploaderName && uploaders.includes(uploaderName)) {
            // 找出最接近的項目容器 (如果是表格則為 tr，如果是縮圖則可能是 div.gl1t 或其他包含 gl1 的 div)
            const itemContainer = link.closest('tr') || link.closest('div[class^="gl1"]');
            if (itemContainer) {
                if (!itemContainer.dataset.exhBlockerOriginalDisplay) {
                    itemContainer.dataset.exhBlockerOriginalDisplay = itemContainer.style.display || '';
                }
                itemContainer.style.display = 'none';
            }
        }
    });
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
        // 嘗試使用 pathname 來模糊比對，避免 http/https 或相對路徑造成的 href 屬性字串不匹配
        let link = null;
        try {
            const urlObj = new URL(message.url);
            const pathname = urlObj.pathname; // 例如 /g/3958849/152bda590b/ 或 /uploader/kenny
            
            // 策略 1: 尋找是否為網格視圖的項目 (解決無限滾動載入的項目不在 .itg 內的問題)
            const gridItem = document.querySelector(`.exh-grid-item[href*="${pathname}"]`);
            if (gridItem && gridItem.dataset.uploader) {
                return Promise.resolve({ uploader: gridItem.dataset.uploader });
            }
            
            // 策略 2: 尋找原始列表 (.itg) 中的連結
            link = document.querySelector(`.itg a[href*="${pathname}"]`);
            
            if (!link && pathname.endsWith('/')) {
                const noSlashPath = pathname.slice(0, -1);
                link = document.querySelector(`.itg a[href*="${noSlashPath}"]`);
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
        
        // 監聽即時封鎖事件
        browser.runtime.onMessage.addListener(handleUploaderBlockedMessage);
        
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
