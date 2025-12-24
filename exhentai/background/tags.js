console.log("[BG] 載入背景腳本標籤模組。");

async function addTag(tagString) {
    const { SAVED_TAGS_KEY } = globalThis.exHentaiBackground;
    try {
        const data = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
        const savedTags = data[SAVED_TAGS_KEY];

        if (!savedTags.some(t => t.original === tagString)) {
            savedTags.push({ original: tagString, display: tagString });
            await browser.storage.local.set({ [SAVED_TAGS_KEY]: savedTags });
            console.log(`[BG] 已儲存標籤: ${tagString}`);
        } else {
            console.log(`[BG] 標籤 ${tagString} 已存在，無需儲存。`);
        }
        return { success: true };
    } catch (error) {
        console.error('[BG] 儲存標籤時發生錯誤:', error);
        return { success: false };
    }
}

async function getSavedTags() {
    const { SAVED_TAGS_KEY } = globalThis.exHentaiBackground;
    const tagsData = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
    return { tags: tagsData[SAVED_TAGS_KEY] };
}

async function deleteSavedTag(tagOriginal) {
    const { SAVED_TAGS_KEY } = globalThis.exHentaiBackground;
    const tagData = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
    const tags = tagData[SAVED_TAGS_KEY];
    const newTags = tags.filter(t => t.original !== tagOriginal);
    await browser.storage.local.set({ [SAVED_TAGS_KEY]: newTags });
    return { success: true };
}

async function updateSavedTag(tag) {
    const { SAVED_TAGS_KEY } = globalThis.exHentaiBackground;
    const { original, display } = tag;
    const tagData = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
    const tags = tagData[SAVED_TAGS_KEY];
    const tagIndex = tags.findIndex(t => t.original === original);
    if (tagIndex > -1) {
        tags[tagIndex].display = display;
        await browser.storage.local.set({ [SAVED_TAGS_KEY]: tags });
        return { success: true };
    }
    return { success: false, error: 'Tag not found' };
}

async function batchUpdateTags(tagsToAdd, tagsToUpdate) {
    const { SAVED_TAGS_KEY } = globalThis.exHentaiBackground;
    const data = await browser.storage.local.get({ [SAVED_TAGS_KEY]: [] });
    const savedTags = data[SAVED_TAGS_KEY];
    const savedTagsMap = new Map(savedTags.map(t => [t.original, t]));

    for (const tag of tagsToUpdate) {
        if (savedTagsMap.has(tag.original)) {
            savedTagsMap.get(tag.original).display = tag.display;
        }
    }

    for (const tag of tagsToAdd) {
        if (!savedTagsMap.has(tag.original)) {
            savedTagsMap.set(tag.original, tag);
        }
    }

    const newTagsArray = Array.from(savedTagsMap.values());
    await browser.storage.local.set({ [SAVED_TAGS_KEY]: newTagsArray });
    console.log(`[BG] 批次更新完成。新增: ${tagsToAdd.length}, 更新: ${tagsToUpdate.length}.`);
    return { success: true };
}

async function clearSavedTags() {
    const { SAVED_TAGS_KEY } = globalThis.exHentaiBackground;
    await browser.storage.local.remove(SAVED_TAGS_KEY);
    return { success: true };
}

globalThis.exHentaiBackground.addTag = addTag;
globalThis.exHentaiBackground.getSavedTags = getSavedTags;
globalThis.exHentaiBackground.deleteSavedTag = deleteSavedTag;
globalThis.exHentaiBackground.updateSavedTag = updateSavedTag;
globalThis.exHentaiBackground.batchUpdateTags = batchUpdateTags;
globalThis.exHentaiBackground.clearSavedTags = clearSavedTags;
