export function speak(text) {
    if (!text || typeof window === 'undefined') return;
    if (typeof window.speechSynthesis === 'undefined' || typeof window.SpeechSynthesisUtterance === 'undefined') {
        return;
    }

    try {
        const utterance = new window.SpeechSynthesisUtterance(String(text));
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 0.8;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    } catch {
        // non-fatal
    }
}

export function stop() {
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') return;
    try {
        window.speechSynthesis.cancel();
    } catch {
        // non-fatal
    }
}

export default { speak, stop };
