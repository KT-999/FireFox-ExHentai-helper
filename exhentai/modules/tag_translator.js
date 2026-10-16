/**
 * 書籍頁面標籤翻譯與上傳者快捷封鎖模組 (v1.2)
 * - 功能：將書籍詳細頁面 (#taglist) 中的標籤替換為使用者自訂的顯示名稱，並高亮已收藏標籤。
 * - 新增：於書籍詳細頁面的上傳者 (#gdn) 旁提供一鍵封鎖/解除封鎖按鈕。
 */
let hasInitializedTagTranslator = false;

/**
 * 在畫廊詳細頁面的上傳者連結旁注入一鍵封鎖切換按鈕
 */
async function setupInlineUploaderBlockButton() {
    const gdn = document.getElementById('gdn');
    if (!gdn || document.getElementById('exh-inline-block-uploader')) return;

    const uploaderLink = gdn.querySelector('a[href*="/uploader/"]');
    if (!uploaderLink) return;

    const uploaderName = uploaderLink.textContent.trim();
    if (!uploaderName) return;

    let blockedSet = new Set();
    try {
        const res = await browser.runtime.sendMessage({ type: 'get_blocked_uploaders' });
        if (res && Array.isArray(res.uploaders)) {
            blockedSet = new Set(res.uploaders);
        }
    } catch (e) {
        console.warn('[ExH] 無法讀取封鎖上傳者清單:', e);
    }

    const btn = document.createElement('button');
    btn.id = 'exh-inline-block-uploader';
    btn.type = 'button';
    Object.assign(btn.style, {
        marginLeft: '6px',
        padding: '1px 6px',
        fontSize: '11px',
        borderRadius: '3px',
        cursor: 'pointer',
        border: '1px solid #888',
        verticalAlign: 'middle'
    });

    const updateBtnState = (isBlocked) => {
        if (isBlocked) {
            btn.textContent = '✓ 已封鎖';
            btn.style.backgroundColor = '#f56c6c';
            btn.style.color = '#fff';
            btn.style.borderColor = '#f56c6c';
            btn.title = '點擊解除封鎖此上傳者';
        } else {
            btn.textContent = '🚫 封鎖';
            btn.style.backgroundColor = '#3c3c3c';
            btn.style.color = '#ccc';
            btn.style.borderColor = '#666';
            btn.title = '點擊封鎖此上傳者的所有畫廊';
        }
    };

    updateBtnState(blockedSet.has(uploaderName));

    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentlyBlocked = blockedSet.has(uploaderName);
        if (currentlyBlocked) {
            await browser.runtime.sendMessage({ type: 'remove_blocked_uploader', uploader: uploaderName });
            blockedSet.delete(uploaderName);
            updateBtnState(false);
        } else {
            await browser.runtime.sendMessage({ type: 'add_blocked_uploader', uploader: uploaderName });
            blockedSet.add(uploaderName);
            updateBtnState(true);
        }
    });

    gdn.appendChild(btn);
}

async function runTranslation() {
    const taglist = document.getElementById('taglist');
    if (!taglist) return;

    // 1. 從背景腳本獲取所有已儲存的標籤
    const { tags } = await browser.runtime.sendMessage({ type: 'get_saved_tags' });
    if (!tags || tags.length === 0) return;

    // 2. 建立查找映射表與已收藏集合
    const translationMap = new Map();
    const savedTagSet = new Set();
    for (const tag of tags) {
        savedTagSet.add(tag.original);
        if (tag.original !== tag.display) {
            translationMap.set(tag.original, tag.display);
        }
    }

    // 3. 選取頁面上所有的標籤連結
    const tagLinks = taglist.querySelectorAll('a[id^="ta_"]');

    // 4. 遍歷所有連結，替換文字內容並標記已收藏的標籤
    tagLinks.forEach(link => {
        const onclickAttr = link.getAttribute('onclick');
        if (!onclickAttr) return;

        // 從 onclick 屬性中，透過正規表示式提取出原始標籤字串
        // 例如：從 "return toggle_tagmenu(440446,'character:minato aqua',this)" 中提取 'character:minato aqua'
        const match = onclickAttr.match(/'([^']+)'/);
        if (!match || !match[1]) return;
        
        const originalTag = match[1];

        // 5. 如果這個原始標籤存在於我們的映射表中，就進行替換
        if (translationMap.has(originalTag)) {
            const displayTag = translationMap.get(originalTag);
            
            // 只取自訂名稱的值部分來顯示 (例如從 "character:湊阿庫婭" 中取出 "湊阿庫婭")
            const displayValue = displayTag.substring(displayTag.indexOf(':') + 1).trim();
            
            if (displayValue) {
                link.textContent = displayValue;
            }
        }

        // 若為已收藏的標籤，加上星號與視覺高亮提示
        if (savedTagSet.has(originalTag) && !link.dataset.exhBookmarked) {
            link.dataset.exhBookmarked = 'true';
            link.textContent = `★ ${link.textContent}`;
            const parentDiv = link.closest('.gt, .gtl, .gtw');
            if (parentDiv) {
                parentDiv.style.borderColor = '#ffd700';
                parentDiv.style.boxShadow = '0 0 4px rgba(255, 215, 0, 0.45)';
            }
        }
    });

    console.log(`[ExH] 已完成 ${tagLinks.length} 個頁面標籤的自訂名稱與收藏標記檢查。`);
}

export function initTagTranslator() {
    if (hasInitializedTagTranslator) {
        console.warn('[ExH] 標籤翻譯模組已初始化，跳過重複執行。');
        return;
    }
    hasInitializedTagTranslator = true;
    runTranslation().catch(err => console.error('[ExH] 執行標籤翻譯時發生錯誤:', err));
    setupInlineUploaderBlockButton().catch(err => console.error('[ExH] 初始化上傳者封鎖按鈕時發生錯誤:', err));
}
