// dmMessages.js - Persistent DM operations via Supabase

import { getSupabase } from './supabaseClient.js';

export function createDmThreadKey(actorA, actorB) {
    if (!actorA || !actorB) return null;
    const sorted = [String(actorA), String(actorB)].sort();
    return `${sorted[0]}:${sorted[1]}`;
}

export async function insertDmMessage({ threadKey, senderId, recipientId, body }) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized');

    const payload = {
        thread_key: threadKey,
        sender_id: senderId,
        recipient_id: recipientId,
        body: String(body || '').slice(0, 500)
    };

    const { data, error } = await supabase
        .from('dm_messages')
        .insert(payload)
        .select('*')
        .single();

    if (error) throw error;
    return data;
}

export async function fetchDmMessagesByThread(threadKey, limit = 200) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized');
    if (!threadKey) return [];

    const { data, error } = await supabase
        .from('dm_messages')
        .select('*')
        .eq('thread_key', threadKey)
        .order('created_at', { ascending: true })
        .limit(Math.max(1, Math.min(500, Number(limit) || 200)));

    if (error) throw error;
    return data || [];
}

export async function fetchDmThreadSummariesForActor(actorId, limitRows = 300) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized');
    if (!actorId) return [];

    const { data, error } = await supabase
        .from('dm_messages')
        .select('thread_key,sender_id,recipient_id,body,created_at')
        .or(`sender_id.eq.${actorId},recipient_id.eq.${actorId}`)
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Math.min(1000, Number(limitRows) || 300)));

    if (error) throw error;
    return data || [];
}

export function subscribeDmThread({ threadKey, onInsert, onError }) {
    const supabase = getSupabase();
    if (!supabase || !threadKey) {
        return async () => {};
    }

    const channel = supabase.channel(`dm:thread:${threadKey}`);
    channel.on(
        'postgres_changes',
        {
            event: 'INSERT',
            schema: 'public',
            table: 'dm_messages',
            filter: `thread_key=eq.${threadKey}`
        },
        (payload) => {
            try {
                onInsert?.(payload?.new || null);
            } catch (err) {
                onError?.(err);
            }
        }
    );

    channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
            onError?.(new Error('dm realtime channel error'));
        }
    });

    return async () => {
        try {
            await supabase.removeChannel(channel);
        } catch (err) {
            onError?.(err);
        }
    };
}

export function subscribeDmInbox({ actorId, onInsert, onError }) {
    const supabase = getSupabase();
    if (!supabase || !actorId) {
        return async () => {};
    }

    const channel = supabase.channel(`dm:inbox:${actorId}`);
    channel.on(
        'postgres_changes',
        {
            event: 'INSERT',
            schema: 'public',
            table: 'dm_messages'
        },
        (payload) => {
            try {
                const row = payload?.new || null;
                if (!row) return;
                if (row.sender_id !== actorId && row.recipient_id !== actorId) return;
                onInsert?.(row);
            } catch (err) {
                onError?.(err);
            }
        }
    );

    channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
            onError?.(new Error('dm inbox realtime channel error'));
        }
    });

    return async () => {
        try {
            await supabase.removeChannel(channel);
        } catch (err) {
            onError?.(err);
        }
    };
}

export async function adminPurgeDmBefore(days) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized');

    const safeDays = Math.max(1, Number(days) || 30);
    const { data, error } = await supabase.rpc('admin_purge_dm_before', { p_days: safeDays });
    if (error) throw error;
    return Number(data) || 0;
}

export async function adminPurgeDmAll() {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized');

    const { data, error } = await supabase.rpc('admin_purge_dm_all');
    if (error) throw error;
    return Number(data) || 0;
}
