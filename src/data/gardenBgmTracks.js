export const DEFAULT_GARDEN_BGM_ID = 'garden_calm';

export const gardenBgmTracks = [
    { id: 'garden_calm', title: '庭園の静けさ', file: '/assets/bgm/garden_calm.mp3' },
    { id: 'garden_koto', title: '庭園の琴', file: '/assets/bgm/garden_koto.mp3' },
    { id: 'garden_night', title: '庭園の夜', file: '/assets/bgm/garden_night.mp3' },
    { id: 'kagaribi_no_yado', title: '篝火のお宿', file: '/assets/bgm/kagaribi_no_yado.mp3' },
    { id: 'noyama', title: '野山', file: '/assets/bgm/noyama.mp3' },
    { id: 'onsengai_no_yube', title: '温泉街の夕べ', file: '/assets/bgm/onsengai_no_yube.mp3' },
    { id: 'ryugujo', title: '竜宮城', file: '/assets/bgm/ryugujo.mp3' },
    { id: 'sato_no_kosakura', title: '里の古桜', file: '/assets/bgm/sato_no_kosakura.mp3' },
    { id: 'shiro_ni_somatte', title: '白に染まって', file: '/assets/bgm/shiro_ni_somatte.mp3' },
    { id: 'yozakura_wa_maichiru', title: '夜桜は舞い散る', file: '/assets/bgm/yozakura_wa_maichiru.mp3' },
    { id: 'suzukaze_ni_chiru', title: '涼風に散る', file: '/assets/bgm/suzukaze_ni_chiru.mp3' },
    { id: 'akai_ha', title: '赤い葉', file: '/assets/bgm/akai_ha.mp3' },
    { id: 'fuuga', title: '風雅', file: '/assets/bgm/fuuga.mp3' },
    { id: 'ryuuou_no_houkou', title: '龍王の咆哮', file: '/assets/bgm/ryuuou_no_houkou.mp3' },
    { id: 'seihitsu_o_yadosu_niwa', title: '静謐を宿す庭', file: '/assets/bgm/seihitsu_o_yadosu_niwa.mp3' },
    { id: 'kouyou_no_kourankei', title: '紅葉の香嵐渓', file: '/assets/bgm/kouyou_no_kourankei.mp3' }
];

function resolveTrackSrc(baseUrl, filePath) {
    const base = String(baseUrl || '/').replace(/\/+$/, '');
    const path = String(filePath || '').replace(/^\/+/, '');
    return `${base}/${path}`.replace(/^\/\//, '/');
}

export function resolveGardenTracks(baseUrl = import.meta.env.BASE_URL || '/') {
    return gardenBgmTracks.map((track) => ({
        ...track,
        src: resolveTrackSrc(baseUrl, track.file)
    }));
}
