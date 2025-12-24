/**
 * 書籍頁面標籤翻譯模組 (v1.0)
 * - 功能：將書籍詳細頁面 (#taglist) 中的標籤，替換為使用者自訂的顯示名稱。
 */
let hasInitializedTagTranslator = false;

async function runTranslation() {
    const taglist = document.getElementById('taglist');
    if (!taglist) return;

    // 1. 從背景腳本獲取所有已儲存的標籤
    const { tags } = await browser.runtime.sendMessage({ type: 'get_saved_tags' });
    if (!tags || tags.length === 0) return;

    // 2. 建立一個查找映射表以便快速查詢，只包含有自訂名稱的標籤
    const translationMap = new Map();
    for (const tag of tags) {
        if (tag.original !== tag.display) {
            translationMap.set(tag.original, tag.display);
        }
    }

    // 如果沒有任何自訂名稱，則無需繼續
    if (translationMap.size === 0) {
        console.log('[ExH] 無自訂標籤名稱，無需翻譯。');
        return;
    }

    // 3. 選取頁面上所有的標籤連結
    const tagLinks = taglist.querySelectorAll('a[id^="ta_"]');

    // 4. 遍歷所有連結，並替換其文字內容
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
    });

    console.log(`[ExH] 已完成 ${tagLinks.length} 個頁面標籤的自訂名稱檢查。`);
}

export function initTagTranslator() {
    if (hasInitializedTagTranslator) {
        console.warn('[ExH] 標籤翻譯模組已初始化，跳過重複執行。');
        return;
    }
    hasInitializedTagTranslator = true;
    runTranslation().catch(err => console.error('[ExH] 執行標籤翻譯時發生錯誤:', err));
}
