import * as dialogue from './js/dialogue.js';
import * as tts from './js/tts.js';

export function getReply(text, state) {
    if (typeof dialogue.getReply === 'function') return dialogue.getReply(text, state);
    if (typeof dialogue.reply === 'function') return dialogue.reply(text, state);
    if (typeof dialogue.default === 'function') return dialogue.default(text, state);
    throw new Error('dialogue.getReply/reply not found');
}

export const ttsApi = tts;
