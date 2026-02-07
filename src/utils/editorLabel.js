// editorLabel.js - 編集者表示名の管理
// 共通アカウント運用で「誰が編集したか」を識別するためのユーティリティ

const STORAGE_KEY = 'vo.editorLabel.v1';

/**
 * editorLabel を取得
 * @returns {string|null}
 */
export function getEditorLabel() {
    try {
        return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
        return null;
    }
}

/**
 * editorLabel を保存
 * @param {string} label 
 */
export function setEditorLabel(label) {
    try {
        localStorage.setItem(STORAGE_KEY, label);
    } catch (err) {
        console.warn('[EditorLabel] save failed', err);
    }
}

/**
 * editorLabel が設定済みかチェック
 * @returns {boolean}
 */
export function hasEditorLabel() {
    const label = getEditorLabel();
    return label !== null && label.trim() !== '';
}

/**
 * editorLabel が未設定の場合、モーダルで入力を促す
 * @returns {Promise<string|null>} 入力された値、またはキャンセル時はnull
 */
export function promptEditorLabelIfNeeded() {
    return new Promise((resolve) => {
        if (hasEditorLabel()) {
            resolve(getEditorLabel());
            return;
        }

        // モーダルを作成
        const overlay = document.createElement('div');
        overlay.className = 'editor-label-modal-overlay';
        overlay.innerHTML = `
            <div class="editor-label-modal">
                <div class="editor-label-modal-header">
                    <h3>あなたの表示名</h3>
                </div>
                <div class="editor-label-modal-body">
                    <p class="editor-label-hint">
                        編集履歴に記録される表示名を入力してください。
                    </p>
                    <input type="text" 
                           class="form-input" 
                           id="editor-label-input" 
                           placeholder="例: 山田太郎" 
                           maxlength="50" />
                    <div class="editor-label-error" id="editor-label-error"></div>
                </div>
                <div class="editor-label-modal-footer">
                    <button type="button" class="btn btn-secondary" id="editor-label-cancel">キャンセル</button>
                    <button type="button" class="btn btn-primary" id="editor-label-save">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // アニメーション用に少し遅延
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });

        const input = overlay.querySelector('#editor-label-input');
        const errorEl = overlay.querySelector('#editor-label-error');
        const saveBtn = overlay.querySelector('#editor-label-save');
        const cancelBtn = overlay.querySelector('#editor-label-cancel');

        function close(value) {
            overlay.classList.remove('visible');
            setTimeout(() => {
                overlay.remove();
            }, 200);
            resolve(value);
        }

        function save() {
            const value = input.value.trim();
            if (!value) {
                errorEl.textContent = '表示名を入力してください';
                input.focus();
                return;
            }
            setEditorLabel(value);
            close(value);
        }

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                save();
            } else if (e.key === 'Escape') {
                close(null);
            }
        });

        saveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            save();
        });

        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            close(null);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                close(null);
            }
        });

        // 自動フォーカス
        setTimeout(() => input.focus(), 100);
    });
}
