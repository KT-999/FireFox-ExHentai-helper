/**
 * 歷史紀錄功能模組 (v1.2 - 修正重複紀錄)
 * - 修正：防止因頁面載入或導覽觸發多次紀錄，導致歷史紀錄出現重複項目。
 * - 更新：標準化紀錄的 URL，移除查詢參數，確保同一本書只會有一筆紀錄。
 */
import { parseImageUrlFromStyle } from './utils.js';

let hasRecorded = false; // 新增旗標，防止重複紀錄
let hasInitializedHistory = false;

function extractTotalPagesFromGallery() {
    const cells = document.querySelectorAll('#gdd td.gdt2');
    for (const td of cells) {
        const match = td.textContent.match(/(\d+)\s*pages/i);
        if (match) {
            return parseInt(match[1], 10);
        }
    }
    return 0;
}

/**
 * 在畫廊詳細頁面注入「繼續閱讀」橫幅按鈕
 * @param {string} galleryId 畫廊 ID
 * @param {number} detectedTotalPages 從頁面解析出的總頁數
 */
async function injectContinueReadingBanner(galleryId, detectedTotalPages) {
    if (!galleryId || document.getElementById('exh-continue-reading-bar')) return;

    try {
        const res = await browser.runtime.sendMessage({
            type: 'get_reading_progress',
            targetGalleryId: galleryId
        });
        const progress = res?.progress;
        if (!progress || !progress.lastPageUrl || !progress.lastReadPage) return;

        const targetContainer = document.getElementById('gd2') || document.getElementById('gmid');
        if (!targetContainer || document.getElementById('exh-continue-reading-bar')) return;

        const total = progress.totalPages || detectedTotalPages || 0;
        const bar = document.createElement('div');
        bar.id = 'exh-continue-reading-bar';
        Object.assign(bar.style, {
            marginTop: '8px',
            padding: '6px 12px',
            backgroundColor: 'rgba(64, 158, 255, 0.15)',
            border: '1px solid rgba(64, 158, 255, 0.5)',
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
            color: '#eee'
        });

        const textSpan = document.createElement('span');
        textSpan.textContent = total > 0
            ? `📖 上次閱讀進度：第 ${progress.lastReadPage} / ${total} 頁`
            : `📖 上次閱讀進度：第 ${progress.lastReadPage} 頁`;

        const resumeBtn = document.createElement('a');
        resumeBtn.href = progress.lastPageUrl;
        resumeBtn.textContent = '繼續閱讀 →';
        Object.assign(resumeBtn.style, {
            backgroundColor: '#409eff',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: '4px',
            textDecoration: 'none',
            fontWeight: 'bold',
            fontSize: '12px',
            transition: 'background-color 0.2s'
        });
        resumeBtn.addEventListener('mouseenter', () => {
            resumeBtn.style.backgroundColor = '#66b1ff';
        });
        resumeBtn.addEventListener('mouseleave', () => {
            resumeBtn.style.backgroundColor = '#409eff';
        });

        bar.appendChild(textSpan);
        bar.appendChild(resumeBtn);
        targetContainer.appendChild(bar);
    } catch (e) {
        console.warn('[ExH] 讀取畫廊閱讀進度失敗:', e);
    }
}

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

        const gidMatch = window.location.pathname.match(/\/g\/(\d+)\//);
        const galleryId = gidMatch ? gidMatch[1] : null;
        const totalPages = extractTotalPagesFromGallery();

        const historyItem = {
            url: cleanUrl.href, // 使用清理過的 URL
            title: titleEl.textContent,
            thumbnailSrc: thumbnailSrc,
            language: language,
            totalPages: totalPages || 0,
            timestamp: Date.now()
        };
        browser.runtime.sendMessage({ type: 'add_to_history', item: historyItem });
        console.log(`[ExH] 已成功紀錄歷史: ${historyItem.title} (${language || '無語言標籤'})`);

        if (galleryId) {
            injectContinueReadingBanner(galleryId, totalPages);
        }
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
    if (hasInitializedHistory) {
        console.warn('[ExH] 歷史紀錄模組已初始化，跳過重複執行。');
        return;
    }
    hasInitializedHistory = true;
    setupHistoryRecording();
}