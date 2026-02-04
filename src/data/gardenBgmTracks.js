export const GARDEN_BGM_TRACKS = [
    { id: 'ryugujo', title: '竜宮城', file: 'ryugujo.mp3' },
    { id: 'kagaribi_no_yado', title: '篝火のお宿', file: 'kagaribi_no_yado.mp3' },
    { id: 'onsengai_no_yube', title: '温泉街の夕べ', file: 'onsengai_no_yube.mp3' },
    { id: 'noyama', title: '野山', file: 'noyama.mp3' },
    { id: 'sato_no_kosakura', title: '里の古桜', file: 'sato_no_kosakura.mp3' }
];

export function resolveGardenTracks(baseUrl = '/virtualoffice') {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    return GARDEN_BGM_TRACKS.map(track => ({
        ...track,
        src: `${base}/assets/bgm/${track.file}`
    }));
}
