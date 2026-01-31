// realtime.js - Supabase Realtime handling

import { getSupabase } from './supabaseClient.js';

let presenceChannel = null;
let eventChannels = [];
let chatChannels = [];

const callbacks = {
    onPresenceChange: null,
    onEvent: null,
    onChat: null
};

/**
 * Initialize realtime subscriptions
 */
export function initRealtime({ supabase, me, onPresenceChange, onEvent, onChat }) {
    callbacks.onPresenceChange = onPresenceChange;
    callbacks.onEvent = onEvent;
    callbacks.onChat = onChat;
}

/**
 * Join presence channel
 */
export async function joinPresence({ presenceChannelKey, initialState }) {
    const supabase = getSupabase();

    presenceChannel = supabase.channel(presenceChannelKey, {
        config: {
            presence: {
                key: initialState.actorId
            }
        }
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            if (callbacks.onPresenceChange) {
                callbacks.onPresenceChange(state);
            }
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('Presence join:', key, newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('Presence leave:', key, leftPresences);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await presenceChannel.track(initialState);
            }
        });

    return presenceChannel;
}

/**
 * Update presence state
 */
export async function updatePresence(patch) {
    if (!presenceChannel) return;

    await presenceChannel.track(patch);
}

/**
 * Leave presence channel
 */
export async function leavePresence() {
    if (!presenceChannel) return;

    await presenceChannel.untrack();
    await presenceChannel.unsubscribe();
    presenceChannel = null;
}

/**
 * Subscribe to events for this actor
 */
export function subscribeEvents({ myActorId }) {
    const supabase = getSupabase();

    // Subscribe to direct events
    const directChannel = supabase.channel(`evt:to:${myActorId}`);
    directChannel
        .on('broadcast', { event: 'evt' }, ({ payload }) => {
            if (callbacks.onEvent) {
                callbacks.onEvent(payload);
            }
        })
        .subscribe();

    eventChannels.push(directChannel);

    // Subscribe to all events
    const allChannel = supabase.channel('evt:all');
    allChannel
        .on('broadcast', { event: 'evt' }, ({ payload }) => {
            if (callbacks.onEvent) {
                callbacks.onEvent(payload);
            }
        })
        .subscribe();

    eventChannels.push(allChannel);
}

/**
 * Send event to a specific actor
 */
export async function sendEventTo(targetActorId, { type, payload }) {
    const supabase = getSupabase();

    const channel = supabase.channel(`evt:to:${targetActorId}`);

    await channel.subscribe();
    await channel.send({
        type: 'broadcast',
        event: 'evt',
        payload: { type, ...payload }
    });

    // Cleanup temporary channel
    setTimeout(() => channel.unsubscribe(), 1000);
}

/**
 * Subscribe to chat channels
 */
export function subscribeChat({ all = true, room = null, dmList = [] }) {
    const supabase = getSupabase();

    // Unsubscribe from existing chat channels
    chatChannels.forEach(ch => ch.unsubscribe());
    chatChannels = [];

    // Subscribe to all chat
    if (all) {
        const allChat = supabase.channel('chat:all');
        allChat
            .on('broadcast', { event: 'msg' }, ({ payload }) => {
                if (callbacks.onChat) {
                    callbacks.onChat({ channel: 'all', ...payload });
                }
            })
            .subscribe();
        chatChannels.push(allChat);
    }

    // Subscribe to room chat
    if (room) {
        const roomChat = supabase.channel(`chat:room:${room}`);
        roomChat
            .on('broadcast', { event: 'msg' }, ({ payload }) => {
                if (callbacks.onChat) {
                    callbacks.onChat({ channel: 'room', room, ...payload });
                }
            })
            .subscribe();
        chatChannels.push(roomChat);
    }

    // Subscribe to DM channels
    dmList.forEach(dmChannel => {
        const dmChat = supabase.channel(dmChannel);
        dmChat
            .on('broadcast', { event: 'msg' }, ({ payload }) => {
                if (callbacks.onChat) {
                    callbacks.onChat({ channel: 'dm', dmChannel, ...payload });
                }
            })
            .subscribe();
        chatChannels.push(dmChat);
    });
}

/**
 * Send chat message
 */
export async function sendChat(channelName, text, extra = {}) {
    const supabase = getSupabase();

    const channel = supabase.channel(channelName);

    await channel.subscribe();
    await channel.send({
        type: 'broadcast',
        event: 'msg',
        payload: { text, timestamp: Date.now(), ...extra }
    });
}

/**
 * Shutdown all realtime connections
 */
export async function shutdownRealtime() {
    await leavePresence();

    for (const ch of eventChannels) {
        await ch.unsubscribe();
    }
    eventChannels = [];

    for (const ch of chatChannels) {
        await ch.unsubscribe();
    }
    chatChannels = [];
}
