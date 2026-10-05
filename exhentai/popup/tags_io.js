/**
 * 處理書籤匯入/匯出頁面的邏輯
 */
import { loadLocaleMessages, getMessage, applyTheme } from './modules/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- UI 元素 ---
    const exportTextarea = document.getElementById('export-textarea');
    const importTextarea = document.getElementById('import-textarea');
    const generateExportButton = document.getElementById('generate-export-button');
    const copyClipboardButton = document.getElementById('copy-clipboard-button');
    const importSubmitButton = document.getElementById('import-submit-button');
    const exportStatus = document.getElementById('export-status');
    const importStatus = document.getElementById('import-status');

    // --- 功能函式 ---
    const handleGenerateExport = async () => {
        exportStatus.textContent = '';
        const { tags } = await browser.runtime.sendMessage({ type: 'get_saved_tags' });
        const { uploaders } = await browser.runtime.sendMessage({ type: 'get_blocked_uploaders' }).catch(() => ({ uploaders: [] }));

        const exportObj = {};

        // 匯出所有已儲存標籤（包含尚未自訂翻譯名稱的收藏標籤，避免備份遺失）
        if (tags && tags.length > 0) {
            tags.forEach(tag => {
                const key = "tag_" + tag.original.replace(/[:\s]/g, '_').replace(/['"]/g, '');
                exportObj[key] = { "message": tag.display };
            });
        }

        if (uploaders && uploaders.length > 0) {
            uploaders.forEach(uploader => {
                const key = "uploader_" + uploader.replace(/[\s]/g, '_').replace(/['"]/g, '');
                exportObj[key] = { "message": uploader };
            });
        }

        const exportText = JSON.stringify(exportObj, null, 2);
        exportTextarea.value = exportText;
    };

    const handleCopyToClipboard = () => {
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

        const { tags: existingTags } = await browser.runtime.sendMessage({ type: 'get_saved_tags' });
        const existingTagsMap = new Map(existingTags.map(t => [t.original, t]));

        const { uploaders: existingUploaders } = await browser.runtime.sendMessage({ type: 'get_blocked_uploaders' }).catch(() => ({ uploaders: [] }));

        const tagsToAdd = [];
        const tagsToUpdate = [];
        const uploadersToAdd = [];
        let hasValidEntries = false;

        for (const key in parsedJson) {
            if (Object.prototype.hasOwnProperty.call(parsedJson, key)) {
                if (key.startsWith('tag_')) {
                    hasValidEntries = true;
                    const keyParts = key.replace(/^tag_/, '').split('_');
                    const namespace = keyParts.shift();
                    const tagName = keyParts.join(' ').trim();
                    const originalTag = `${namespace}:${tagName}`;
                    const displayMessage = parsedJson[key]?.message || originalTag;

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
                }
            }
        }

        if (!hasValidEntries) {
            importStatus.textContent = getMessage("importErrorNoData");
            importStatus.style.color = '#dc3545';
            return;
        }

        const addedCount = tagsToAdd.length + uploadersToAdd.length;
        const updatedCount = tagsToUpdate.length;

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
        importSubmitButton.addEventListener('click', handleImport);
    };

    initialize();
});
