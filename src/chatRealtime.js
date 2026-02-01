// chatRealtime.js
// Supabase Realtime Broadcast based ephemeral chat (no DB)

import { getSupabase } from './services/supabaseClient.js';

const CHANNEL = 'global-chat';
const EVENT = 'chat_message';

let channel = null;
let onMessageCb = null;

export function initGlobalChatRealtime({ getMyName, onMessage }) {
    const supabase = getSupabase();
    if (!supabase) {
        throw new Error('Supabase client is not initialized');
    }

    onMessageCb = onMessage;

    if (channel) {
        return {
            send: async (text) => sendChatMessage({ supabase, getMyName, text }),
            destroy: async () => destroyChannel(supabase)
        };
    }

    // Broadcast と Presence を同一チャンネルで持ってもOK（今回はBroadcastだけで十分）
    channel = supabase.channel(CHANNEL, {
        config: {
            broadcast: { self: true } // self=true だと送信者にも同じイベントが返ってくる（楽）
        }
    });

    // 受信
    channel.on('broadcast', { event: EVENT }, (payload) => {
        const msg = payload?.payload;
        if (!msg || !msg.text) return;
        onMessageCb?.(msg);
    });

    // 接続開始
    channel.subscribe((status) => {
        // console.log('[chat] subscribe:', status);
    });

    return {
        send: async (text) => sendChatMessage({ supabase, getMyName, text }),
        destroy: async () => destroyChannel(supabase)
    };
}

async function sendChatMessage({ supabase, getMyName, text }) {
    if (!channel) return null;

    const name = (getMyName?.() || 'anonymous').trim() || 'anonymous';
    const msg = {
        id: crypto.randomUUID(),
        name,
        text: String(text || '').slice(0, 500), // 念のため上限
        ts: Date.now()
    };

    // Broadcast送信（DB insertはしない）
    const res = await channel.send({
        type: 'broadcast',
        event: EVENT,
        payload: msg
    });

    return res; // "ok" など
}

async function destroyChannel(supabase) {
    if (!channel) return;
    await supabase.removeChannel(channel);
    channel = null;
}
