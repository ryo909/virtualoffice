const DEFAULT_LINES = [
    'うん、聞いてるよ。続けて。',
    'なるほど。次の一手を一緒に考えよう。',
    'いい視点だね。もう少し詳しく教えて。',
    '了解。必要なら要点だけ短くまとめるよ。'
];

export const defaultCharacter = 'まるもち';

function pickRandom(lines) {
    return lines[Math.floor(Math.random() * lines.length)] || 'どうしたの？';
}

export function getReply(text, state = {}) {
    const input = typeof text === 'string' ? text.trim() : '';
    if (!input) return 'どうしたの？';

    const lower = input.toLowerCase();
    if (lower.includes('ありがとう')) return 'どういたしまして。いつでも呼んでね。';
    if (lower.includes('おは')) return 'おはよう。今日は何から進める？';
    if (lower.includes('疲') || lower.includes('つかれ')) return '少し深呼吸しよっか。短い休憩でも回復するよ。';

    const custom = Array.isArray(state?.candidateReplies) ? state.candidateReplies : null;
    if (custom && custom.length > 0) {
        return pickRandom(custom);
    }

    return pickRandom(DEFAULT_LINES);
}

export function reply(text, state = {}) {
    return getReply(text, state);
}

export default { getReply, reply, defaultCharacter };
