/**
 * 處理選項頁面的邏輯：儲存和讀取快捷鍵設定。
 */
const defaultKeys = {
    keyPrev: 'a',
    keyNext: 'd',
    keyFit: 's',
    keyHide: 'q',
    keyExit: 'e',
    keyClear: 'w', // 新增預設值
};

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
        keyClear: document.getElementById('key-btn-clear').dataset.key || defaultKeys.keyClear, // 新增儲存邏輯
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

function loadKeySettings() {
    browser.storage.local.get(defaultKeys).then(result => {
        // 更新按鈕列表以包含新的按鍵
        const keyButtons = [ 'prev', 'next', 'fit', 'hide', 'exit', 'clear' ];
        keyButtons.forEach(key => {
            const btn = document.getElementById(`key-btn-${key}`);
            const storedKey = result[`key${key.charAt(0).toUpperCase() + key.slice(1)}`];
            btn.dataset.key = storedKey;
            btn.textContent = formatKeyForDisplay(storedKey);
        });
    }).catch(error => {
        console.error('讀取快捷鍵設定時發生錯誤:', error);
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
    loadKeySettings();
    initKeyListeners();
});
document.getElementById('save-button').addEventListener('click', saveKeySettings);
