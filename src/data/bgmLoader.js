async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        throw new Error(`Fetch failed ${res.status} for ${url}`);
    }
    return res.json();
}

export async function loadGardenBgm() {
    const url = new URL('../../data/bgm/garden.json', import.meta.url).href;
    return fetchJson(url);
}
