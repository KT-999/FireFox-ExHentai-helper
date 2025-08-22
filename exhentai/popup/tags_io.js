/**
 * 處理書籤匯入/匯出頁面的邏輯
 */
document.addEventListener('DOMContentLoaded', () => {
    let messages = {};

    // --- UI 元素 ---
    const exportTextarea = document.getElementById('export-textarea');
    const importTextarea = document.getElementById('import-textarea');
    const generateExportButton = document.getElementById('generate-export-button');
    const copyClipboardButton = document.getElementById('copy-clipboard-button');
    const importSubmitButton = document.getElementById('import-submit-button');
    const exportStatus = document.getElementById('export-status');
    const importStatus = document.getElementById('import-status');

    // --- 多語系處理 ---
    const getMessage = (key, substitutions) => {
        let message = messages[key]?.message || key;
        if (substitutions) {
            for (const subKey in substitutions) {
                message = message.replace(`{${subKey}}`, substitutions[subKey]);
            }
        }
        return message;
    };

    const localizePage = () => {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = getMessage(el.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = getMessage(el.getAttribute('data-i18n-title'));
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = getMessage(el.getAttribute('data-i18n-placeholder'));
        });
    };
    
    const loadLocaleMessages = async () => {
        const { uiLanguage = 'auto' } = await browser.storage.local.get('uiLanguage');
        let lang = uiLanguage === 'auto' ? browser.i18n.getUILanguage() : uiLanguage;
        const locale = lang.replace('-', '_');
        
        try {
            const response = await fetch(`/_locales/${locale}/messages.json`);
            if (!response.ok) throw new Error('Locale not found, falling back to en');
            messages = await response.json();
        } catch (e) {
            console.warn(e);
            const response = await fetch('/_locales/en/messages.json');
            messages = await response.json();
        }
        localizePage();
    };

    // --- 主題處理 ---
    const applyTheme = (theme) => {
        const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark-theme', isDark);
    };

    // --- 功能函式 ---
    const handleGenerateExport = async () => {
        exportStatus.textContent = '';
        const { tags } = await browser.runtime.sendMessage({ type: 'get_saved_tags' });
        const exportObj = {};
        
        tags.forEach(tag => {
            if (tag.original !== tag.display) {
                const key = "tag_" + tag.original.replace(/[:\s]/g, '_').replace(/['"]/g, '');
                exportObj[key] = { "message": tag.display };
            }
        });

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
        
        const tagsToAdd = [];
        const tagsToUpdate = [];

        for (const key in parsedJson) {
            if (Object.prototype.hasOwnProperty.call(parsedJson, key) && key.startsWith('tag_')) {
                const keyParts = key.replace(/^tag_/, '').split('_');
                const namespace = keyParts.shift();
                const tagName = keyParts.join(' ').trim();
                const originalTag = `${namespace}:${tagName}`;
                const displayMessage = parsedJson[key].message || originalTag;

                if (existingTagsMap.has(originalTag)) {
                    if (existingTagsMap.get(originalTag).display !== displayMessage) {
                        tagsToUpdate.push({ original: originalTag, display: displayMessage });
                    }
                } else {
                    tagsToAdd.push({ original: originalTag, display: displayMessage });
                }
            }
        }
        
        const addedCount = tagsToAdd.length;
        const updatedCount = tagsToUpdate.length;

        if (addedCount > 0 || updatedCount > 0) {
            await browser.runtime.sendMessage({
                type: 'batch_update_tags',
                tagsToAdd,
                tagsToUpdate
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
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
             if (themeMode === 'system') applyTheme('system');
        });

        generateExportButton.addEventListener('click', handleGenerateExport);
        copyClipboardButton.addEventListener('click', handleCopyToClipboard);
        importSubmitButton.addEventListener('click', handleImport);
    };

    initialize();
});
