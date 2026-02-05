export const DEFAULT_GARDEN_BGM_ID = 'garden_calm';

export const GARDEN_BGM_TRACKS = [
    { id: 'garden_calm', title: '庭園の静けさ', file: 'garden_calm.mp3' },
    { id: 'garden_koto', title: '庭園の琴', file: 'garden_koto.mp3' },
    { id: 'garden_night', title: '庭園の夜', file: 'garden_night.mp3' },
    { id: 'kagaribi_no_yado', title: '篝火のお宿', file: 'kagaribi_no_yado.mp3' },
    { id: 'noyama', title: '野山', file: 'noyama.mp3' },
    { id: 'onsengai_no_yube', title: '温泉街の夕べ', file: 'onsengai_no_yube.mp3' },
    { id: 'ryugujo', title: '竜宮城', file: 'ryugujo.mp3' },
    { id: 'sato_no_kosakura', title: '里の古桜', file: 'sato_no_kosakura.mp3' },
    { id: 'shiro_ni_somatte', title: '白に染まって', file: 'shiro_ni_somatte.mp3' },
    { id: 'yozakura_wa_maichiru', title: '夜桜は舞い散る', file: 'yozakura_wa_maichiru.mp3' },
    { id: 'suzukaze_ni_chiru', title: '涼風に散る', file: 'suzukaze_ni_chiru.mp3' },
    { id: 'akai_ha', title: '赤い葉', file: 'akai_ha.mp3' },
    { id: 'fuuga', title: '風雅', file: 'fuuga.mp3' },
    { id: 'ryuuou_no_houkou', title: '龍王の咆哮', file: 'ryuuou_no_houkou.mp3' },
    { id: 'seihitsu_o_yadosu_niwa', title: '静謐を宿す庭', file: 'seihitsu_o_yadosu_niwa.mp3' },
    { id: 'kouyou_no_kourankei', title: '紅葉の香嵐渓', file: 'kouyou_no_kourankei.mp3' }
];

export function resolveBgmUrl(file) {
    const filename = String(file || '').replace(/^\/+/, '');
    return new URL(`../../assets/bgm/${filename}`, import.meta.url).href;
}

export function resolveGardenTracks() {
    return GARDEN_BGM_TRACKS.map((track) => ({
        ...track,
        src: resolveBgmUrl(track.file),
        url: resolveBgmUrl(track.file)
    }));
}

export const gardenBgmTracks = GARDEN_BGM_TRACKS;
