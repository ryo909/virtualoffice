// deskCallRealtime.js - Realtime channel helpers for desk calls

import { getSupabase } from '../services/supabaseClient.js';

let channel = null;
let deskId = null;

export async function joinDeskCallChannel({ deskId: nextDeskId, sessionId, onEvent, onPresenceSync }) {
    const supabase = getSupabase();

    if (channel) {
        await leaveDeskCallChannel();
    }

    deskId = nextDeskId;
    const joinAt = Date.now();

    channel = supabase.channel(`call:desk:${deskId}`, {
        config: {
            presence: { key: sessionId }
        }
    });

    channel
        .on('broadcast', { event: 'call' }, ({ payload }) => {
            onEvent?.(payload);
        })
        .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            onPresenceSync?.(state);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    sessionId,
                    joinedAt: joinAt,
                    ts: Date.now()
                });
            }
        });

    return { channel, joinAt };
}

export async function sendDeskCallEvent(payload) {
    if (!channel) return false;
    await channel.send({
        type: 'broadcast',
        event: 'call',
        payload
    });
    return true;
}

export async function leaveDeskCallChannel() {
    if (!channel) return;
    await channel.untrack();
    await channel.unsubscribe();
    channel = null;
    deskId = null;
}

export function getDeskCallChannel() {
    return channel;
}
