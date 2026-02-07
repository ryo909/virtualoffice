const SAMPLE_TEXT = 'テストです。ひま？';

const DEFAULT_SETTINGS = {
    displayName: 'もちまる',
    avatarImage: null,
    bubbleX: 0,
    bubbleY: 0,
    bubbleScale: 1.0,
    ttsEnabled: false,
    ttsVoiceURI: '',
    ttsRate: 1.0,
    ttsPitch: 1.0
};

function getBaseUrl() {
    const envBase = import.meta.env?.BASE_URL;
    if (typeof envBase === 'string' && envBase.length > 0) {
        return envBase.replace(/\/?$/, '/');
    }

    if (typeof window !== 'undefined') {
        const path = window.location.pathname || '/';
        const segments = path.split('/').filter(Boolean);
        if (segments.length > 0) {
            return `/${segments[0]}/`;
        }
    }

    return '/';
}

function getDefaultAvatarSrc() {
    return `${getBaseUrl()}src/companion/assets/mascot.png`;
}

function toNumber(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (Number.isFinite(min) && n < min) return min;
    if (Number.isFinite(max) && n > max) return max;
    return n;
}

function normalize(settings) {
    const safe = (settings && typeof settings === 'object') ? settings : {};
    return {
        displayName: typeof safe.displayName === 'string' && safe.displayName.trim()
            ? safe.displayName.trim().slice(0, 30)
            : DEFAULT_SETTINGS.displayName,
        avatarImage: typeof safe.avatarImage === 'string' && safe.avatarImage.trim()
            ? safe.avatarImage
            : null,
        bubbleX: toNumber(safe.bubbleX, DEFAULT_SETTINGS.bubbleX, -160, 160),
        bubbleY: toNumber(safe.bubbleY, DEFAULT_SETTINGS.bubbleY, -160, 160),
        bubbleScale: toNumber(safe.bubbleScale, DEFAULT_SETTINGS.bubbleScale, 0.6, 1.6),
        ttsEnabled: Boolean(safe.ttsEnabled),
        ttsVoiceURI: typeof safe.ttsVoiceURI === 'string' ? safe.ttsVoiceURI : '',
        ttsRate: toNumber(safe.ttsRate, DEFAULT_SETTINGS.ttsRate, 0.6, 1.6),
        ttsPitch: toNumber(safe.ttsPitch, DEFAULT_SETTINGS.ttsPitch, 0.6, 1.6)
    };
}

function valueText(value, digits = 0) {
    return Number(value).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setText(target, value) {
    if (target) target.textContent = value;
}

function setPreview(settings, previewEl, avatarEl, previewText = 'ひま？') {
    if (avatarEl) {
        avatarEl.src = settings.avatarImage || getDefaultAvatarSrc();
        avatarEl.alt = settings.displayName || DEFAULT_SETTINGS.displayName;
    }

    if (previewEl) {
        previewEl.textContent = previewText;
        previewEl.style.transform = `translate(${settings.bubbleX}px, ${settings.bubbleY}px) scale(${settings.bubbleScale})`;
    }
}

function fillVoiceSelect(selectEl, voices, selectedUri) {
    if (!selectEl) return;

    const opts = ['<option value="">システム既定</option>'];
    for (const voice of voices) {
        const uri = escapeHtml(voice.voiceURI || '');
        const name = escapeHtml(voice.name || voice.voiceURI || 'Unknown');
        const lang = escapeHtml(voice.lang || '');
        opts.push(`<option value="${uri}">${name}${lang ? ` (${lang})` : ''}</option>`);
    }

    selectEl.innerHTML = opts.join('');
    if (selectedUri) {
        selectEl.value = selectedUri;
    }
}

function speakSample(settings, voices) {
    if (typeof window === 'undefined' || typeof window.SpeechSynthesisUtterance === 'undefined' || !window.speechSynthesis) {
        return;
    }

    try {
        window.speechSynthesis.cancel();
        const utterance = new window.SpeechSynthesisUtterance(SAMPLE_TEXT);
        utterance.rate = settings.ttsRate;
        utterance.pitch = settings.ttsPitch;

        if (settings.ttsVoiceURI) {
            const voice = voices.find((v) => v.voiceURI === settings.ttsVoiceURI);
            if (voice) utterance.voice = voice;
        }

        window.speechSynthesis.speak(utterance);
    } catch {
        // non-fatal
    }
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function addListener(cleanups, target, eventName, handler, options) {
    target?.addEventListener?.(eventName, handler, options);
    cleanups.push(() => target?.removeEventListener?.(eventName, handler, options));
}

export function renderSettingsUI(container, settings, onChange, onReset) {
    if (!container) {
        return {
            update() { },
            destroy() { }
        };
    }

    let current = normalize(settings);
    let previewText = 'ひま？';
    let voices = [];
    const cleanups = [];

    container.innerHTML = `
        <div class="vc-settings" data-role="settings-root">
            <div class="vc-preview" data-role="preview-wrap">
                <div class="vc-preview-avatar-wrap">
                    <img class="vc-preview-avatar" data-role="preview-avatar" alt="${escapeHtml(current.displayName)}" loading="lazy" />
                </div>
                <div class="vc-preview-bubble" data-role="preview-bubble">ひま？</div>
            </div>

            <label class="vc-field">
                <span class="vc-label">キャラ名</span>
                <input class="vc-input" data-role="displayName" type="text" maxlength="30" value="${escapeHtml(current.displayName)}" />
            </label>

            <label class="vc-field">
                <span class="vc-label">キャラ画像</span>
                <input class="vc-input" data-role="avatarFile" type="file" accept="image/png,image/jpeg,image/webp" />
            </label>

            <div class="vc-settings-actions">
                <button type="button" class="companion-btn-sub" data-role="avatarReset">画像を既定に戻す</button>
            </div>

            <label class="vc-field">
                <span class="vc-label">吹き出し X</span>
                <input class="vc-range" data-role="bubbleX" type="range" min="-160" max="160" step="1" value="${valueText(current.bubbleX)}" />
                <span class="vc-value" data-role="bubbleXValue">${valueText(current.bubbleX)}</span>
            </label>

            <label class="vc-field">
                <span class="vc-label">吹き出し Y</span>
                <input class="vc-range" data-role="bubbleY" type="range" min="-160" max="160" step="1" value="${valueText(current.bubbleY)}" />
                <span class="vc-value" data-role="bubbleYValue">${valueText(current.bubbleY)}</span>
            </label>

            <label class="vc-field">
                <span class="vc-label">吹き出し Scale</span>
                <input class="vc-range" data-role="bubbleScale" type="range" min="0.6" max="1.6" step="0.01" value="${valueText(current.bubbleScale, 2)}" />
                <span class="vc-value" data-role="bubbleScaleValue">${valueText(current.bubbleScale, 2)}</span>
            </label>

            <label class="vc-field vc-switch-field">
                <span class="vc-label">TTS</span>
                <input data-role="ttsEnabled" type="checkbox" ${current.ttsEnabled ? 'checked' : ''} />
                <span data-role="ttsEnabledValue">${current.ttsEnabled ? 'ON' : 'OFF'}</span>
            </label>

            <label class="vc-field">
                <span class="vc-label">Voice</span>
                <select class="vc-input" data-role="ttsVoice"></select>
            </label>

            <label class="vc-field">
                <span class="vc-label">Rate</span>
                <input class="vc-range" data-role="ttsRate" type="range" min="0.6" max="1.6" step="0.01" value="${valueText(current.ttsRate, 2)}" />
                <span class="vc-value" data-role="ttsRateValue">${valueText(current.ttsRate, 2)}</span>
            </label>

            <label class="vc-field">
                <span class="vc-label">Pitch</span>
                <input class="vc-range" data-role="ttsPitch" type="range" min="0.6" max="1.6" step="0.01" value="${valueText(current.ttsPitch, 2)}" />
                <span class="vc-value" data-role="ttsPitchValue">${valueText(current.ttsPitch, 2)}</span>
            </label>

            <div class="vc-settings-actions">
                <button type="button" class="companion-btn-sub" data-role="ttsTest">テスト読み上げ</button>
                <button type="button" class="companion-btn-sub" data-role="resetAll">リセット</button>
            </div>
        </div>
    `;

    const root = container.querySelector('[data-role="settings-root"]');
    const previewBubble = container.querySelector('[data-role="preview-bubble"]');
    const previewAvatar = container.querySelector('[data-role="preview-avatar"]');

    const inputDisplayName = container.querySelector('[data-role="displayName"]');
    const inputAvatarFile = container.querySelector('[data-role="avatarFile"]');
    const buttonAvatarReset = container.querySelector('[data-role="avatarReset"]');

    const inputBubbleX = container.querySelector('[data-role="bubbleX"]');
    const inputBubbleY = container.querySelector('[data-role="bubbleY"]');
    const inputBubbleScale = container.querySelector('[data-role="bubbleScale"]');
    const labelBubbleX = container.querySelector('[data-role="bubbleXValue"]');
    const labelBubbleY = container.querySelector('[data-role="bubbleYValue"]');
    const labelBubbleScale = container.querySelector('[data-role="bubbleScaleValue"]');

    const inputTtsEnabled = container.querySelector('[data-role="ttsEnabled"]');
    const labelTtsEnabled = container.querySelector('[data-role="ttsEnabledValue"]');
    const inputTtsVoice = container.querySelector('[data-role="ttsVoice"]');
    const inputTtsRate = container.querySelector('[data-role="ttsRate"]');
    const inputTtsPitch = container.querySelector('[data-role="ttsPitch"]');
    const labelTtsRate = container.querySelector('[data-role="ttsRateValue"]');
    const labelTtsPitch = container.querySelector('[data-role="ttsPitchValue"]');

    const buttonTtsTest = container.querySelector('[data-role="ttsTest"]');
    const buttonResetAll = container.querySelector('[data-role="resetAll"]');

    function emit(next) {
        current = normalize(next);
        onChange?.(current);
        refreshValues();
    }

    function refreshValues() {
        if (inputDisplayName) inputDisplayName.value = current.displayName;
        if (inputBubbleX) inputBubbleX.value = valueText(current.bubbleX);
        if (inputBubbleY) inputBubbleY.value = valueText(current.bubbleY);
        if (inputBubbleScale) inputBubbleScale.value = valueText(current.bubbleScale, 2);

        if (labelBubbleX) setText(labelBubbleX, valueText(current.bubbleX));
        if (labelBubbleY) setText(labelBubbleY, valueText(current.bubbleY));
        if (labelBubbleScale) setText(labelBubbleScale, valueText(current.bubbleScale, 2));

        if (inputTtsEnabled) inputTtsEnabled.checked = current.ttsEnabled;
        if (labelTtsEnabled) setText(labelTtsEnabled, current.ttsEnabled ? 'ON' : 'OFF');

        if (inputTtsRate) inputTtsRate.value = valueText(current.ttsRate, 2);
        if (inputTtsPitch) inputTtsPitch.value = valueText(current.ttsPitch, 2);
        if (labelTtsRate) setText(labelTtsRate, valueText(current.ttsRate, 2));
        if (labelTtsPitch) setText(labelTtsPitch, valueText(current.ttsPitch, 2));

        fillVoiceSelect(inputTtsVoice, voices, current.ttsVoiceURI);
        setPreview(current, previewBubble, previewAvatar, previewText);
    }

    function refreshVoices() {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
            voices = [];
            fillVoiceSelect(inputTtsVoice, voices, current.ttsVoiceURI);
            return;
        }

        const list = window.speechSynthesis.getVoices();
        if (Array.isArray(list) && list.length) {
            voices = [...list];
            fillVoiceSelect(inputTtsVoice, voices, current.ttsVoiceURI);
        }
    }

    addListener(cleanups, inputDisplayName, 'input', () => {
        emit({ ...current, displayName: inputDisplayName.value });
    });

    addListener(cleanups, inputAvatarFile, 'change', async () => {
        const file = inputAvatarFile?.files?.[0];
        if (!file) return;

        try {
            const dataUrl = await readFileAsDataUrl(file);
            if (dataUrl) {
                emit({ ...current, avatarImage: dataUrl });
            }
        } catch {
            // non-fatal
        } finally {
            if (inputAvatarFile) inputAvatarFile.value = '';
        }
    });

    addListener(cleanups, buttonAvatarReset, 'click', () => {
        emit({ ...current, avatarImage: null });
    });

    addListener(cleanups, inputBubbleX, 'input', () => {
        emit({ ...current, bubbleX: toNumber(inputBubbleX.value, current.bubbleX, -160, 160) });
    });

    addListener(cleanups, inputBubbleY, 'input', () => {
        emit({ ...current, bubbleY: toNumber(inputBubbleY.value, current.bubbleY, -160, 160) });
    });

    addListener(cleanups, inputBubbleScale, 'input', () => {
        emit({ ...current, bubbleScale: toNumber(inputBubbleScale.value, current.bubbleScale, 0.6, 1.6) });
    });

    addListener(cleanups, inputTtsEnabled, 'change', () => {
        emit({ ...current, ttsEnabled: inputTtsEnabled.checked });
    });

    addListener(cleanups, inputTtsVoice, 'change', () => {
        emit({ ...current, ttsVoiceURI: inputTtsVoice.value || '' });
    });

    addListener(cleanups, inputTtsRate, 'input', () => {
        emit({ ...current, ttsRate: toNumber(inputTtsRate.value, current.ttsRate, 0.6, 1.6) });
    });

    addListener(cleanups, inputTtsPitch, 'input', () => {
        emit({ ...current, ttsPitch: toNumber(inputTtsPitch.value, current.ttsPitch, 0.6, 1.6) });
    });

    addListener(cleanups, buttonTtsTest, 'click', () => {
        speakSample(current, voices);
    });

    addListener(cleanups, buttonResetAll, 'click', () => {
        const reset = onReset?.();
        emit(reset || DEFAULT_SETTINGS);
    });

    if (typeof window !== 'undefined' && window.speechSynthesis) {
        const handleVoicesChanged = () => refreshVoices();
        addListener(cleanups, window.speechSynthesis, 'voiceschanged', handleVoicesChanged);
        refreshVoices();
        if (!voices.length) {
            window.setTimeout(handleVoicesChanged, 250);
        }
    }

    refreshValues();

    return {
        update(nextSettings, nextPreviewText) {
            current = normalize(nextSettings || current);
            if (typeof nextPreviewText === 'string' && nextPreviewText.trim()) {
                previewText = nextPreviewText;
            }
            refreshValues();
        },
        destroy() {
            for (const cleanup of cleanups.splice(0, cleanups.length)) {
                try {
                    cleanup();
                } catch {
                    // no-op
                }
            }
            if (root) {
                root.remove();
            }
        }
    };
}
