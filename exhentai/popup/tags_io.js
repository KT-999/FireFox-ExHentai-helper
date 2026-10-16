/**
 * 處理書籤與設定匯入/匯出頁面的邏輯
 */
import { loadLocaleMessages, getMessage, applyTheme } from './modules/ui.js';

const SETTINGS_KEYS = [
    'enableGridView',
    'gridColumns',
    'readerMode',
    'preloadCount',
    'cacheSize',
    'maxHistoryCount',
    'fitToWindow',
    'hidePreviewBar',
    'doublePageMode',
    'doublePageCoverSingle',
    'reverseReadingDirection',
    'themeMode',
    'uiLanguage',
    'hotkeys'
];

document.addEventListener('DOMContentLoaded', () => {
    // --- UI 元素 ---
    const exportTextarea = document.getElementById('export-textarea');
    const importTextarea = document.getElementById('import-textarea');
    const generateExportButton = document.getElementById('generate-export-button');
    const copyClipboardButton = document.getElementById('copy-clipboard-button');
    const downloadExportButton = document.getElementById('download-export-button');
    const importFileButton = document.getElementById('import-file-button');
    const importFileInput = document.getElementById('import-file-input');
    const importSubmitButton = document.getElementById('import-submit-button');
    const exportStatus = document.getElementById('export-status');
    const importStatus = document.getElementById('import-status');

    // --- 功能函式 ---
    /**
     * 產生完整匯出資料並填入匯出文字框
     * @returns {Promise<string>} 匯出的 JSON 字串
     */
    const handleGenerateExport = async () => {
        exportStatus.textContent = '';
        const [
            tagsRes,
            uploadersRes,
            blockedTagsRes,
            progressRes,
            settingsObj
        ] = await Promise.all([
            browser.runtime.sendMessage({ type: 'get_saved_tags' }).catch(() => ({ tags: [] })),
            browser.runtime.sendMessage({ type: 'get_blocked_uploaders' }).catch(() => ({ uploaders: [] })),
            browser.runtime.sendMessage({ type: 'get_blocked_tags' }).catch(() => ({ blockedTags: [] })),
            browser.runtime.sendMessage({ type: 'get_reading_progress' }).catch(() => ({ progressMap: {} })),
            browser.storage.local.get(SETTINGS_KEYS).catch(() => ({}))
        ]);

        const tags = tagsRes?.tags || [];
        const uploaders = uploadersRes?.uploaders || [];
        const blockedTags = blockedTagsRes?.blockedTags || [];
        const progressMap = progressRes?.progressMap || {};

        const exportObj = {};

        // 匯出所有已儲存標籤（包含尚未自訂翻譯名稱的收藏標籤，並保留原始鍵值避免底線或無分類標籤失真）
        if (tags.length > 0) {
            tags.forEach(tag => {
                const key = "tag_" + tag.original.replace(/[:\s]/g, '_').replace(/['"]/g, '');
                exportObj[key] = {
                    "message": tag.display,
                    "original": tag.original
                };
            });
        }

        if (uploaders.length > 0) {
            uploaders.forEach(uploader => {
                const key = "uploader_" + uploader.replace(/[\s]/g, '_').replace(/['"]/g, '');
                exportObj[key] = { "message": uploader };
            });
        }

        if (blockedTags.length > 0) {
            blockedTags.forEach(blockedTag => {
                const key = "blocked_tag_" + blockedTag.replace(/[:\s]/g, '_').replace(/['"]/g, '');
                exportObj[key] = { "message": blockedTag };
            });
        }

        exportObj._meta = {
            version: browser.runtime.getManifest().version,
            exportedAt: new Date().toISOString(),
            settings: settingsObj,
            readingProgress: progressMap
        };

        const exportText = JSON.stringify(exportObj, null, 2);
        exportTextarea.value = exportText;
        return exportText;
    };

    const handleCopyToClipboard = async () => {
        if (!exportTextarea.value) {
            await handleGenerateExport();
        }
        if (!exportTextarea.value) return;
        navigator.clipboard.writeText(exportTextarea.value).then(() => {
            exportStatus.textContent = getMessage("copySuccess");
            exportStatus.style.color = '#28a745';
            setTimeout(() => { exportStatus.textContent = ''; }, 2500);
        }).catch(err => {
            console.error('複製失敗:', err);
            exportStatus.textContent = '❌ 複製失敗!';
            exportStatus.style.color = '#dc3545';
        });
    };

    /**
     * 將匯出資料直接下載為 .json 備份檔
     */
    const handleDownloadBackupFile = async () => {
        let content = exportTextarea.value;
        if (!content) {
            content = await handleGenerateExport();
        }
        if (!content) return;

        const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const dateStr = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exhentai-helper-backup-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        exportStatus.textContent = '✅ 備份檔已開始下載！';
        exportStatus.style.color = '#28a745';
        setTimeout(() => { exportStatus.textContent = ''; }, 2500);
    };

    const handleImport = async () => {
        const jsonString = importTextarea.value;
        importStatus.textContent = '';

        if (!jsonString.trim()) return;

        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonString);
        } catch (error) {
            importStatus.textContent = getMessage("importErrorInvalidJson");
            importStatus.style.color = '#dc3545';
            return;
        }

        const [
            existingTagsRes,
            existingUploadersRes,
            existingBlockedTagsRes
        ] = await Promise.all([
            browser.runtime.sendMessage({ type: 'get_saved_tags' }).catch(() => ({ tags: [] })),
            browser.runtime.sendMessage({ type: 'get_blocked_uploaders' }).catch(() => ({ uploaders: [] })),
            browser.runtime.sendMessage({ type: 'get_blocked_tags' }).catch(() => ({ blockedTags: [] }))
        ]);

        const existingTags = existingTagsRes?.tags || [];
        const existingTagsMap = new Map(existingTags.map(t => [t.original, t]));
        const existingUploaders = existingUploadersRes?.uploaders || [];
        const existingBlockedTags = existingBlockedTagsRes?.blockedTags || [];

        const tagsToAdd = [];
        const tagsToUpdate = [];
        const uploadersToAdd = [];
        const blockedTagsToAdd = [];
        let restoredSettingsCount = 0;
        let restoredProgressCount = 0;
        let hasValidEntries = false;

        const KNOWN_NAMESPACES = new Set([
            'artist', 'group', 'parody', 'character', 'language',
            'female', 'male', 'mixed', 'other', 'cosplay', 'reclass', 'temp'
        ]);

        for (const key in parsedJson) {
            if (!Object.prototype.hasOwnProperty.call(parsedJson, key)) continue;

            if (key === '_meta' && parsedJson._meta && typeof parsedJson._meta === 'object') {
                const meta = parsedJson._meta;
                if (meta.settings && typeof meta.settings === 'object') {
                    const validSettings = {};
                    for (const k of SETTINGS_KEYS) {
                        if (meta.settings[k] !== undefined) {
                            validSettings[k] = meta.settings[k];
                            restoredSettingsCount++;
                        }
                    }
                    if (restoredSettingsCount > 0) {
                        hasValidEntries = true;
                        await browser.storage.local.set(validSettings);
                    }
                }
                if (meta.readingProgress && typeof meta.readingProgress === 'object') {
                    const progEntries = Object.keys(meta.readingProgress);
                    if (progEntries.length > 0) {
                        hasValidEntries = true;
                        restoredProgressCount = progEntries.length;
                        await browser.runtime.sendMessage({
                            type: 'batch_update_reading_progress',
                            progressMapToMerge: meta.readingProgress
                        });
                    }
                }
                continue;
            }

            if (key.startsWith('tag_')) {
                hasValidEntries = true;
                const entry = parsedJson[key];
                let originalTag = typeof entry?.original === 'string' ? entry.original.trim() : '';

                if (!originalTag) {
                    const keyParts = key.replace(/^tag_/, '').split('_');
                    if (keyParts.length > 1 && KNOWN_NAMESPACES.has(keyParts[0])) {
                        const namespace = keyParts.shift();
                        const tagName = keyParts.join(' ').trim();
                        originalTag = `${namespace}:${tagName}`;
                    } else {
                        originalTag = keyParts.join(' ').trim();
                    }
                }

                if (!originalTag) continue;
                const displayMessage = entry?.message || originalTag;

                if (existingTagsMap.has(originalTag)) {
                    if (existingTagsMap.get(originalTag).display !== displayMessage) {
                        tagsToUpdate.push({ original: originalTag, display: displayMessage });
                    }
                } else {
                    tagsToAdd.push({ original: originalTag, display: displayMessage });
                }
            } else if (key.startsWith('uploader_')) {
                hasValidEntries = true;
                const uploaderName = parsedJson[key]?.message;
                if (uploaderName && !existingUploaders.includes(uploaderName) && !uploadersToAdd.includes(uploaderName)) {
                    uploadersToAdd.push(uploaderName);
                }
            } else if (key.startsWith('blocked_tag_')) {
                hasValidEntries = true;
                const blockedTagName = parsedJson[key]?.message;
                if (blockedTagName && !existingBlockedTags.includes(blockedTagName) && !blockedTagsToAdd.includes(blockedTagName)) {
                    blockedTagsToAdd.push(blockedTagName);
                }
            }
        }

        if (!hasValidEntries) {
            importStatus.textContent = getMessage("importErrorNoData");
            importStatus.style.color = '#dc3545';
            return;
        }

        const addedCount = tagsToAdd.length + uploadersToAdd.length + blockedTagsToAdd.length + restoredProgressCount;
        const updatedCount = tagsToUpdate.length + restoredSettingsCount;

        if (tagsToAdd.length > 0 || tagsToUpdate.length > 0) {
            await browser.runtime.sendMessage({
                type: 'batch_update_tags',
                tagsToAdd,
                tagsToUpdate
            });
        }

        if (uploadersToAdd.length > 0) {
            await browser.runtime.sendMessage({
                type: 'batch_update_uploaders',
                uploadersToAdd
            });
        }

        if (blockedTagsToAdd.length > 0) {
            await browser.runtime.sendMessage({
                type: 'batch_update_blocked_tags',
                tagsToAdd: blockedTagsToAdd
            });
        }

        if (addedCount > 0 && updatedCount > 0) {
            importStatus.textContent = getMessage("importSuccess", { addedCount, updatedCount });
        } else if (addedCount > 0) {
            importStatus.textContent = getMessage("importSuccessAddOnly", { addedCount });
        } else if (updatedCount > 0) {
            importStatus.textContent = getMessage("importSuccessUpdateOnly", { updatedCount });
        } else {
            importStatus.textContent = getMessage("importErrorNoAction");
            importStatus.style.color = '#6c757d';
            return;
        }

        importStatus.style.color = '#28a745';
        importTextarea.value = '';
    };

    // --- 初始化 ---
    const initialize = async () => {
        await loadLocaleMessages();

        const { themeMode = 'system' } = await browser.storage.local.get('themeMode');
        applyTheme(themeMode);
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
            const current = await browser.storage.local.get({ themeMode: 'system' });
            if (current.themeMode === 'system') applyTheme('system');
        });

        generateExportButton.addEventListener('click', handleGenerateExport);
        copyClipboardButton.addEventListener('click', handleCopyToClipboard);
        if (downloadExportButton) {
            downloadExportButton.addEventListener('click', handleDownloadBackupFile);
        }
        if (importFileButton && importFileInput) {
            importFileButton.addEventListener('click', () => importFileInput.click());
            importFileInput.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    importTextarea.value = text;
                    await handleImport();
                } catch (err) {
                    console.error('讀取匯入檔案失敗:', err);
                    importStatus.textContent = '❌ 讀取檔案失敗！';
                    importStatus.style.color = '#dc3545';
                } finally {
                    importFileInput.value = '';
                }
            });
        }
        importSubmitButton.addEventListener('click', handleImport);
    };

    initialize();
});
