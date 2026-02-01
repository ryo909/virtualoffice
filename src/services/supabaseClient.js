// supabaseClient.js - Supabase client initialization

let supabaseClient = null;
let config = null;

export async function loadConfig() {
    if (config) return config;

    const res = await fetch('./data/config/app.config.json');
    if (!res.ok) throw new Error('Failed to load config');
    config = await res.json();
    return config;
}

export function getConfig() {
    return config;
}

export async function initSupabase() {
    if (supabaseClient) return supabaseClient;

    const cfg = await loadConfig();

    // Use the global supabase from CDN
    supabaseClient = supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey);

    return supabaseClient;
}

export function getSupabase() {
    return supabaseClient;
}

export async function getSession() {
    const client = getSupabase();
    if (!client) return null;

    const { data: { session } } = await client.auth.getSession();
    return session;
}

export async function signIn(password) {
    const client = getSupabase();
    const cfg = getConfig();

    const { data, error } = await client.auth.signInWithPassword({
        email: cfg.supabase.sharedEmail,
        password: password
    });

    if (error) {
        throw error;
    }

    return data;
}

export async function signOut() {
    const client = getSupabase();
    if (!client) return;

    await client.auth.signOut();
}
