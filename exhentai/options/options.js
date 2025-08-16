/**
 * 處理選項頁面的邏輯 (v1.1.1)
 * - 儲存和讀取快捷鍵設定。
 * - 新增主題套用功能。
 */
const defaultKeys = {
    keyPrev: 'a',
    keyNext: 'd',
    keyFit: 's',
    keyHide: 'q',
    keyExit: 'e',
    keyClear: 'w',
};

// --- 主題處理 ---
const applyTheme = (theme) => {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark-theme', isDark);
};

// 監聽系統主題變化
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    browser.storage.local.get({ themeMode: 'system' }).then(result => {
        if (result.themeMode === 'system') {
            applyTheme('system');
        }
    });
});


// 將 event.key 轉換為更易讀的顯示文字
function formatKeyForDisplay(key) {
    if (key === ' ') return 'Space';
    if (key === 'escape') return 'Esc';
    return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
}

function saveKeySettings() {
    const settings = {
        keyPrev: document.getElementById('key-btn-prev').dataset.key || defaultKeys.keyPrev,
        keyNext: document.getElementById('key-btn-next').dataset.key || defaultKeys.keyNext,
        keyFit: document.getElementById('key-btn-fit').dataset.key || defaultKeys.keyFit,
        keyHide: document.getElementById('key-btn-hide').dataset.key || defaultKeys.keyHide,
        keyExit: document.getElementById('key-btn-exit').dataset.key || defaultKeys.keyExit,
        keyClear: document.getElementById('key-btn-clear').dataset.key || defaultKeys.keyClear,
    };

    browser.storage.local.set(settings).then(() => {
        const status = document.getElementById('status-message');
        status.textContent = '✅ 快捷鍵設定已儲存！';
        setTimeout(() => { status.textContent = ''; }, 2000);
    }).catch(error => {
        console.error('儲存快捷鍵設定時發生錯誤:', error);
        const status = document.getElementById('status-message');
        status.textContent = '❌ 儲存失敗！';
    });
}

function loadSettings() {
    // 現在同時讀取按鍵和主題設定
    browser.storage.local.get({ ...defaultKeys, themeMode: 'system' }).then(result => {
        // 載入主題
        applyTheme(result.themeMode);

        // 載入按鍵
        const keyButtons = [ 'prev', 'next', 'fit', 'hide', 'exit', 'clear' ];
        keyButtons.forEach(key => {
            const btn = document.getElementById(`key-btn-${key}`);
            const storedKey = result[`key${key.charAt(0).toUpperCase() + key.slice(1)}`];
            btn.dataset.key = storedKey;
            btn.textContent = formatKeyForDisplay(storedKey);
        });
    }).catch(error => {
        console.error('讀取設定時發生錯誤:', error);
    });
}

function initKeyListeners() {
    const keyButtons = document.querySelectorAll('.key-input-btn');
    let listeningButton = null;

    function stopListening() {
        if (listeningButton) {
            listeningButton.classList.remove('listening');
            listeningButton.textContent = formatKeyForDisplay(listeningButton.dataset.key);
            listeningButton = null;
        }
    }

    const handleGlobalKeyDown = (event) => {
        if (listeningButton) {
            event.preventDefault();
            event.stopPropagation();
            const newKey = event.key.toLowerCase();
            listeningButton.dataset.key = newKey;
            stopListening();
        }
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown, true);

    keyButtons.forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            if (listeningButton && listeningButton !== btn) {
                stopListening();
            }
            listeningButton = btn;
            btn.classList.add('listening');
            btn.textContent = '請按下按鍵...';
        });
    });

    document.body.addEventListener('click', () => {
        if (listeningButton) {
            stopListening();
        }
    }, false);
}

document.addEventListener('DOMContentLoaded', () => {
    loadSettings(); // 載入所有設定
    initKeyListeners();
});
document.getElementById('save-button').addEventListener('click', saveKeySettings);
