console.log("[BG] 載入背景腳本資料遷移模組。");

async function migrateTagsData() {
    const { SAVED_TAGS_KEY, MIGRATION_FLAG_KEY } = globalThis.exHentaiBackground;
    try {
        const { [SAVED_TAGS_KEY]: savedTags, [MIGRATION_FLAG_KEY]: migrated } =
            await browser.storage.local.get([SAVED_TAGS_KEY, MIGRATION_FLAG_KEY]);

        if (migrated || !savedTags || savedTags.length === 0) {
            return;
        }

        if (typeof savedTags[0] === 'string') {
            console.log('[BG] 偵測到舊版書籤資料，開始進行遷移...');
            const newTags = savedTags.map(tag => ({
                original: tag,
                display: tag,
            }));

            await browser.storage.local.set({
                [SAVED_TAGS_KEY]: newTags,
                [MIGRATION_FLAG_KEY]: true,
            });
            console.log('[BG] 書籤資料已成功遷移至新格式。');
        } else if (typeof savedTags[0] === 'object' && savedTags[0].hasOwnProperty('original')) {
            await browser.storage.local.set({ [MIGRATION_FLAG_KEY]: true });
            console.log('[BG] 書籤資料已是新格式，無需遷移。');
        }
    } catch (error) {
        console.error('[BG] 遷移書籤資料時發生錯誤:', error);
    }
}

globalThis.exHentaiBackground.migrateTagsData = migrateTagsData;
