/**
 * 歷史紀錄功能模組 (v1.2 - 修正重複紀錄)
 * - 修正：防止因頁面載入或導覽觸發多次紀錄，導致歷史紀錄出現重複項目。
 * - 更新：標準化紀錄的 URL，移除查詢參數，確保同一本書只會有一筆紀錄。
 */
import { parseImageUrlFromStyle } from './utils.js';

let hasRecorded = false; // 新增旗標，防止重複紀錄

function performRecordHistory(titleEl, thumbnailSrc, language) {
    if (hasRecorded) {
        return; // 如果已經紀錄過，就直接返回
    }
    hasRecorded = true; // 設定旗標為 true，表示已執行

    try {
        // 標準化 URL，移除所有查詢參數與 hash
        const cleanUrl = new URL(window.location.href);
        cleanUrl.search = '';
        cleanUrl.hash = '';

        const historyItem = {
            url: cleanUrl.href, // 使用清理過的 URL
            title: titleEl.textContent,
            thumbnailSrc: thumbnailSrc,
            language: language,
            timestamp: Date.now()
        };
        browser.runtime.sendMessage({ type: 'add_to_history', item: historyItem });
        console.log(`[ExH] 已成功紀錄歷史: ${historyItem.title} (${language || '無語言標籤'})`);
    } catch (error) {
        console.error('[ExH] 紀錄歷史時發生錯誤:', error);
    }
}

function setupHistoryRecording() {
    if (!window.location.pathname.match(/^\/g\/\d+\/[a-z0-9]+\/?$/)) {
        return;
    }

    const titleSelector = '#gn';
    const languageSelector = '#taglist div[id^="td_language:"]';
    const coverArtSelector = '#gd1 > div[style*="background"]';
    const firstThumbSelector = '#gdt .gdtm img';

    const checkAndRecord = () => {
        if (hasRecorded) {
            return true; // 如果已紀錄，通知 MutationObserver 停止觀察
        }
        const titleEl = document.querySelector(titleSelector);
        if (!titleEl) return false;

        let thumbnailSrc = null;
        
        const coverArtEl = document.querySelector(coverArtSelector);
        if (coverArtEl) {
            thumbnailSrc = parseImageUrlFromStyle(coverArtEl.style.backgroundImage);
        }

        if (!thumbnailSrc) {
            const firstThumbEl = document.querySelector(firstThumbSelector);
            if (firstThumbEl) {
                thumbnailSrc = firstThumbEl.src;
            }
        }

        const languageEl = document.querySelector(languageSelector);
        const language = languageEl ? languageEl.textContent : null;

        if (titleEl && thumbnailSrc) {
            performRecordHistory(titleEl, thumbnailSrc, language);
            return true;
        }
        
        return false;
    };

    if (checkAndRecord()) {
        return;
    }

    const observer = new MutationObserver((mutations, obs) => {
        if (checkAndRecord()) {
            obs.disconnect();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    setTimeout(() => {
        observer.disconnect();
    }, 15000);
}

export function initHistoryRecording() {
    setupHistoryRecording();
}
