// validate.js - Input validation utilities

export function validateDisplayName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: '名前を入力してください' };
    }

    const trimmed = name.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: '名前を入力してください' };
    }

    if (trimmed.length > 20) {
        return { valid: false, error: '名前は20文字以内で入力してください' };
    }

    // Check for invalid characters (basic sanitization)
    if (/[<>\"\'&]/.test(trimmed)) {
        return { valid: false, error: '使用できない文字が含まれています' };
    }

    return { valid: true, value: trimmed };
}

export function validatePassword(pw) {
    if (!pw || typeof pw !== 'string') {
        return { valid: false, error: 'パスワードを入力してください' };
    }

    if (pw.length === 0) {
        return { valid: false, error: 'パスワードを入力してください' };
    }

    return { valid: true, value: pw };
}

export function validateChatMessage(text) {
    if (!text || typeof text !== 'string') {
        return { valid: false };
    }

    const trimmed = text.trim();

    if (trimmed.length === 0 || trimmed.length > 500) {
        return { valid: false };
    }

    return { valid: true, value: trimmed };
}
