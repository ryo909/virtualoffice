// globalMessages.js - Persistent global chat operations via Supabase

import { getSupabase } from './supabaseClient.js';

export const DEFAULT_GLOBAL_ROOM_ID = 'room:default';

export async function sendGlobalMessage({
    roomId = DEFAULT_GLOBAL_ROOM_ID,
    message,
    senderActorId,
    senderDisplayName,
    clientMsgId = null
}) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized');

    const payload = {
        room_id: roomId || DEFAULT_GLOBAL_ROOM_ID,
        sender_actor_id: senderActorId,
        sender_display_name: String(senderDisplayName || 'anonymous').slice(0, 80),
        message: String(message || '').slice(0, 500),
        client_msg_id: clientMsgId || null
    };

    const { data, error } = await supabase
        .from('global_messages')
        .insert(payload)
        .select('*')
        .single();

    if (error) throw error;
    return data;
}

export async function fetchGlobalMessages({ roomId = DEFAULT_GLOBAL_ROOM_ID, limit = 200, before = null } = {}) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized');

    let query = supabase
        .from('global_messages')
        .select('*')
        .eq('room_id', roomId || DEFAULT_GLOBAL_ROOM_ID)
        .eq('deleted', false)
        .order('created_at', { ascending: true })
        .limit(Math.max(1, Math.min(500, Number(limit) || 200)));

    if (before) {
        query = query.lt('created_at', before);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export function subscribeGlobalMessages({ roomId = DEFAULT_GLOBAL_ROOM_ID, onInsert, onDeleteOrUpdate, onError } = {}) {
    const supabase = getSupabase();
    if (!supabase) return async () => {};

    const safeRoomId = roomId || DEFAULT_GLOBAL_ROOM_ID;
    const channel = supabase.channel(`global:messages:${safeRoomId}`);

    channel.on(
        'postgres_changes',
        {
            event: 'INSERT',
            schema: 'public',
            table: 'global_messages',
            filter: `room_id=eq.${safeRoomId}`
        },
        (payload) => {
            try {
                onInsert?.(payload?.new || null);
            } catch (err) {
                onError?.(err);
            }
        }
    );

    channel.on(
        'postgres_changes',
        {
            event: 'UPDATE',
            schema: 'public',
            table: 'global_messages',
            filter: `room_id=eq.${safeRoomId}`
        },
        (payload) => {
            try {
                onDeleteOrUpdate?.(payload?.new || null, payload?.old || null);
            } catch (err) {
                onError?.(err);
            }
        }
    );

    channel.on(
        'postgres_changes',
        {
            event: 'DELETE',
            schema: 'public',
            table: 'global_messages',
            filter: `room_id=eq.${safeRoomId}`
        },
        (payload) => {
            try {
                onDeleteOrUpdate?.(null, payload?.old || null);
            } catch (err) {
                onError?.(err);
            }
        }
    );

    channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
            onError?.(new Error('global_messages realtime channel error'));
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

export async function fetchGlobalMessagesForAdmin({ roomId = null, limit = 200 } = {}) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized');

    let query = supabase
        .from('global_messages')
        .select('id,created_at,room_id,sender_actor_id,sender_display_name,message,deleted')
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Math.min(1000, Number(limit) || 200)));

    if (roomId) {
        query = query.eq('room_id', roomId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function adminDeleteGlobalMessage(id) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized');
    if (!id) return 0;

    const { data, error } = await supabase.rpc('admin_delete_global_message', { p_id: id });
    if (error) throw error;
    return Number(data) || 0;
}

export async function adminPurgeGlobalBefore(days, roomId = null) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized');

    const safeDays = Math.max(1, Number(days) || 30);
    const { data, error } = await supabase.rpc('admin_purge_global_before', {
        p_days: safeDays,
        p_room_id: roomId || null
    });
    if (error) throw error;
    return Number(data) || 0;
}

export async function adminPurgeGlobalAll(roomId = null) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized');

    const { data, error } = await supabase.rpc('admin_purge_global_all', {
        p_room_id: roomId || null
    });
    if (error) throw error;
    return Number(data) || 0;
}
