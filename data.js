// 尾文字Z — procedural catalogue: cars, courses, weekly events (deterministic seeds)
export function rng(seed) {
    let s = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const lerp = (a, b, t) => a + (b - a) * t;

export const COUNTRY = { JP: '🇯🇵 日本', DE: '🇩🇪 ドイツ', IT: '🇮🇹 イタリア', UK: '🇬🇧 イギリス', US: '🇺🇸 アメリカ', FR: '🇫🇷 フランス', SE: '🇸🇪 スウェーデン', KR: '🇰🇷 韓国' };

// Fictional makers modelled on real-world national car cultures
export const MAKERS = [
    ['TOYOMARU', 'JP'], ['NISHIKAWA', 'JP'], ['HONDO', 'JP'], ['MATSUDA', 'JP'], ['SUBAKI', 'JP'], ['MITSUHA', 'JP'],
    ['SUZURA', 'JP'], ['DAIKOU', 'JP'], ['ISUKA', 'JP'], ['LEXIA', 'JP'], ['INFORA', 'JP'], ['ACURO', 'JP'], ['KAWAMI', 'JP'],
    ['BAVARIA MW', 'DE'], ['MERCATOR', 'DE'], ['PORSHA', 'DE'], ['AUDEX', 'DE'], ['VOLKSWERK', 'DE'], ['OPALE', 'DE'],
    ['FERRANO', 'IT'], ['LAMBERTI', 'IT'], ['ALFIERI', 'IT'], ['FIATO', 'IT'], ['MASERO', 'IT'], ['PAGANO', 'IT'],
    ['ASTON VALE', 'UK'], ['LOTUSK', 'UK'], ['MCLARREN', 'UK'], ['JAGWIRE', 'UK'], ['MINIMO', 'UK'], ['BENTWOOD', 'UK'],
    ['FORDHAM', 'US'], ['CHEVRAL', 'US'], ['DODGEWOOD', 'US'], ['CADEN', 'US'], ['TESLAR', 'US'], ['SHELBRON', 'US'],
    ['PEUGOT', 'FR'], ['RENAULD', 'FR'], ['CITRINE', 'FR'], ['ALPINA BLEU', 'FR'], ['BUGATTE', 'FR'],
    ['VOLVIK', 'SE'], ['KOENIGHAUS', 'SE'], ['HYUNDA', 'KR'], ['KIAN', 'KR']
];

const BODIES = [
    { t: 'ハッチバック', p: [75, 210], w: [760, 1200], g: 1.0, len: 3.9, top: [170, 235] },
    { t: 'クーペ', p: [120, 320], w: [950, 1350], g: 1.04, len: 4.3, top: [200, 270] },
    { t: 'セダン', p: [110, 330], w: [1150, 1600], g: 0.98, len: 4.6, top: [190, 270] },
    { t: 'ライトウェイト', p: [90, 230], w: [700, 1000], g: 1.1, len: 3.8, top: [180, 240] },
    { t: 'スポーツ', p: [200, 480], w: [1100, 1500], g: 1.1, len: 4.4, top: [240, 310] },
    { t: 'スーパーカー', p: [450, 900], w: [1250, 1650], g: 1.18, len: 4.6, top: [300, 360] },
    { t: 'ワゴン', p: [110, 300], w: [1250, 1650], g: 0.96, len: 4.7, top: [180, 260] },
    { t: 'マッスル', p: [280, 700], w: [1500, 1900], g: 0.95, len: 4.9, top: [240, 320] },
    { t: 'SUV', p: [150, 600], w: [1600, 2300], g: 0.9, len: 4.8, top: [190, 290] },
    { t: '軽スポーツ', p: [52, 64], w: [650, 850], g: 1.06, len: 3.4, top: [140, 175] }
];
const DRIVE = ['FR', 'FR', 'FF', '4WD', 'MR', 'RR'];
const SYL = ['RA', 'ZE', 'KO', 'SU', 'TA', 'NI', 'MI', 'RO', 'VE', 'LO', 'SI', 'GA', 'DO', 'XA', 'FU', 'KA', 'LE', 'NO', 'SE', 'TRU', 'SKY', 'CEL', 'AR', 'IM', 'PRE'];
export const GRADES = ['STD', 'GT', 'TYPE-S', 'SPEC-R', 'FINAL EDITION'];
export const PER_MAKER = 250; // 50 models × 5 grades
export const CAR_COUNT = MAKERS.length * PER_MAKER;
const PAINT = ['#f4f4f0', '#111317', '#c8141c', '#1d4fbf', '#f2c200', '#c0c4c8', '#1f6b3a', '#ff7a1a', '#5b2a86', '#7ec8e3', '#8a1020', '#e8e0c8'];

export function rankOf(hpPerTon) {
    return hpPerTon >= 380 ? 'S' : hpPerTon >= 250 ? 'A' : hpPerTon >= 150 ? 'B' : 'C';
}

export const VIP = {
    'vip-yb': { id: 'vip-yb', vip: true, maker: 'OMZ SPECIAL', country: 'JP', name: 'イエロービートル', grade: 'VIP LIMITED', body: 'デフォルメミニカー', drive: 'RR', year: 1998, power: 420, weight: 780, grip: 1.32, top: 300, len: 3.4, color: '#ffd21a', priceMetal: 300, rank: 'S', desc: 'まんまるボディの黄色いミニカー。背中にゼンマイを背負った限定1台。' },
    'vip-bm': { id: 'vip-bm', vip: true, maker: 'OMZ SPECIAL', country: 'JP', name: 'ブラック・マリア', grade: 'VIP LIMITED', body: 'デフォルメミニカー', drive: 'MR', year: 1999, power: 480, weight: 800, grip: 1.3, top: 320, len: 3.5, color: '#0d0d10', priceMetal: 350, rank: 'S', desc: '漆黒と金の装飾をまとったミニカーの女王。限定1台。' }
};

const cache = new Map();
export function getCar(id) {
    if (VIP[id]) return VIP[id];
    let i = Number(id);
    if (!Number.isFinite(i)) i = 0;
    i = Math.max(0, Math.min(CAR_COUNT - 1, i | 0));
    if (cache.has(i)) return cache.get(i);
    const mk = Math.floor(i / PER_MAKER);
    const mi = Math.floor((i % PER_MAKER) / 5);
    const g = i % 5;
    const [maker, country] = MAKERS[mk];
    const r = rng(mk * 1000 + mi * 7 + 13);
    let body = pick(r, BODIES);
    if (body.t === '軽スポーツ' && country !== 'JP') body = BODIES[0];
    const year = 1966 + Math.floor(r() * 59);
    const era = (year - 1966) / 58;
    const name = pick(r, SYL) + pick(r, SYL).toLowerCase() + (r() < 0.6 ? ' ' + (Math.floor(r() * 9) + 1) * (r() < 0.5 ? 10 : 1) + pick(r, ['', '', 'X', 'Z', 'R', 'S']) : '');
    const prm = r();
    const power = Math.round(lerp(body.p[0], body.p[1], prm) * (0.7 + era * 0.45) * (1 + g * 0.12));
    const weight = Math.round(lerp(body.w[0], body.w[1], r()) * (1 - g * 0.025));
    const grip = +(body.g + g * 0.025 + era * 0.06 + r() * 0.04).toFixed(3);
    const top = Math.round(lerp(body.top[0], body.top[1], prm) * (1 + g * 0.03));
    const hpt = (power / weight) * 1000;
    const rank = rankOf(hpt);
    const price = Math.max(800, Math.round((hpt * hpt * 0.9 * grip + power * 25) / 100) * 100);
    const car = {
        id: String(i), maker, country, name, grade: GRADES[g], body: body.t, drive: body.t === 'スーパーカー' ? pick(r, ['MR', '4WD']) : pick(r, DRIVE),
        year, power, weight, grip, top, len: body.len, color: pick(r, PAINT), price, rank
    };
    cache.set(i, car);
    return car;
}
export function hpPerTon(c) { return Math.round((c.power / c.weight) * 1000); }

// starter: cheapest JP C-rank car
export const STARTER_ID = (() => {
    let best = 0, bp = Infinity;
    for (let i = 0; i < PER_MAKER * 3; i++) {
        const c = getCar(i);
        if (c.rank === 'C' && c.price < bp && c.body !== 'SUV') { bp = c.price; best = i; }
    }
    return String(best);
})();

// ---------------- Courses ----------------
export const REGIONS = ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川', '新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山', '鳥取', '島根', '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄', 'アルプス', 'ピレネー', 'ロッキー', 'スコットランド', 'アイフェル'];
const KAN = ['碓', '氷', '妙', '義', '榛', '赤', '城', '箱', '椿', '七', '曲', '白', '樺', '霧', '月', '風', '雪', '鬼', '龍', '狐', '鷹', '桜', '楓', '嵐', '黒', '銀', '天', '星', '紅', '蒼', '雷', '朧', '峰', '湖', '滝'];
const SUF = ['ダウンヒル', '旧道', '新道', 'スカイライン', 'ヘアピン区間', 'ワインディング'];
export const PER_REGION = 100;
export const COURSE_COUNT = REGIONS.length * PER_REGION;
export const TIME_LABEL = { night: '深夜', dusk: '夕暮れ', day: '昼', dawn: '夜明け' };
export const WEATHER_LABEL = { clear: '晴れ', fog: '霧', rain: '雨' };

export function getCourse(idx) {
    idx = Math.max(0, Math.min(COURSE_COUNT - 1, idx | 0));
    const r = rng(idx * 7919 + 3);
    const region = REGIONS[Math.floor(idx / PER_REGION)];
    const name = `${region}・${pick(r, KAN)}${pick(r, KAN)}峠 ${pick(r, SUF)}`;
    const length = Math.round(900 + r() * 2300);
    const hairpin = +(0.08 + r() * 0.4).toFixed(2);
    const drop = Math.round(60 + r() * 220);
    const time = pick(r, ['night', 'night', 'dusk', 'day', 'dawn']);
    const weather = pick(r, ['clear', 'clear', 'clear', 'fog', 'rain']);
    const stars = Math.max(1, Math.min(5, Math.round(hairpin * 8 + length / 1600 + (weather === 'rain' ? 1 : 0) - 0.5)));
    return { idx, seed: idx * 31 + 11, name, region, length, hairpin, drop, time, weather, stars };
}

export function courseControlPoints(course) {
    const r = rng(course.seed);
    let h = 0, x = 0, z = 0, y = course.drop + 20;
    const pts = [[0, y, 40], [0, y, 0]];
    let dist = 0;
    const step = (head, len) => {
        x += Math.sin(head) * len;
        z -= Math.cos(head) * len;
        y -= (len / course.length) * course.drop;
        dist += len;
        pts.push([x, y, z]);
    };
    step(0, 50);
    while (dist < course.length) {
        if (r() < course.hairpin && Math.abs(h) > 0.55) {
            const target = -Math.sign(h) * (0.85 + r() * 0.3);
            step(h * 0.3, 16);
            step(target * 0.3, 16);
            h = target;
            step(h, 30 + r() * 25);
        } else {
            h = Math.max(-1.15, Math.min(1.15, h + (r() - 0.5) * 1.0));
            step(h, 35 + r() * 40);
        }
    }
    step(h * 0.4, 50);
    step(0, 60);
    return pts;
}

// ---------------- Bonus stages (coin / metal collecting) ----------------
const BONUS_KINDS = [
    { k: 'gold', n: 'ゴールドラッシュ', icon: '🪙', zMul: 1, metalRate: 0.03, time: 1.0 },
    { k: 'metal', n: 'メタルラッシュ', icon: '⬡', zMul: 0.4, metalRate: 0.22, time: 1.0 },
    { k: 'jackpot', n: 'ジャックポット', icon: '💰', zMul: 2.2, metalRate: 0.08, time: 0.85 },
    { k: 'night', n: 'ミッドナイト宝探し', icon: '🌙', zMul: 1.4, metalRate: 0.12, time: 0.95 }
];
export const BONUS = Array.from({ length: 48 }, (_, i) => {
    const r = rng(i * 977 + 5);
    const kind = BONUS_KINDS[i % BONUS_KINDS.length];
    const course = getCourse(Math.floor(r() * COURSE_COUNT));
    const tier = 1 + Math.floor(i / 12);
    return {
        id: 'b' + i, idx: i, kind: kind.k, title: `${kind.icon} ${kind.n} ${['I', 'II', 'III', 'IV'][tier - 1]}-${(i % 12) + 1}`,
        courseIdx: course.idx, tier,
        coinZ: Math.round(150 * tier * kind.zMul / 10) * 10,
        metalRate: kind.metalRate,
        time: Math.round((course.length / 22) * kind.time + 6)
    };
});

// ---------------- Grand Prix ----------------
export const GP_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
const GP_NAMES = ['ルーキーカップ', '関東峠グランプリ', '東北ダウンヒル杯', '中部山岳GP', '関西ナイトカップ', '九州ファイナル', '雨天サバイバルGP', '霧の峠カップ', 'ヨーロッパ遠征GP', 'Sクラス選手権', 'レジェンドカップ', '尾文字Z 王者決定GP'];
export const GRANDPRIX = GP_NAMES.map((name, i) => {
    const r = rng(i * 4243 + 9);
    const limit = ['C', 'C', 'B', 'B', 'B', 'A', 'ANY', 'ANY', 'A', 'S', 'ANY', 'ANY'][i];
    const courses = Array.from({ length: i >= 10 ? 5 : 4 }, () => Math.floor(r() * COURSE_COUNT));
    return { id: 'gp' + i, idx: i, name, limit, courses, level: +(0.8 + i * 0.018).toFixed(3), rewardZ: 40000 + i * 30000, rewardMetal: 10 + i * 6 };
});

// ---------------- Story mode ----------------
export const STORY = [
    { rival: '蓮', title: '第1話 深夜の配達便', courseIdx: 900, level: 0.8, lines: ['店長「夜の峠に、異常に速い配達バンが出るらしい」', 'あなた「……ただの噂でしょう」', '蓮「乗れよ。下りで勝負だ」'] },
    { rival: '白瀬', title: '第2話 白い彗星', courseIdx: 910, level: 0.83, lines: ['白瀬「理論で走る。それが俺の峠だ」', 'あなた「理屈じゃ下りは降りられない」'] },
    { rival: '航', title: '第3話 弟の意地', courseIdx: 925, level: 0.85, lines: ['航「兄貴の前にまず俺を倒してみな！」'] },
    { rival: '沙樹', title: '第4話 霧の女王', courseIdx: 1460, level: 0.86, lines: ['沙樹「この霧の中、ラインが見える？」', 'あなた「見えなくても体が覚えてる」'] },
    { rival: '岩城', title: '第5話 雨のヒルクライマー', courseIdx: 1930, level: 0.88, lines: ['岩城「雨は俺の味方だ。タイヤを信じすぎるなよ」'] },
    { rival: '剛田', title: '第6話 鉄の腕', courseIdx: 1310, level: 0.9, lines: ['剛田「ハンドルは腕で回すんじゃない。魂で回す」'] },
    { rival: '小鳥遊', title: '第7話 ブラインドアタック', courseIdx: 2120, level: 0.91, lines: ['小鳥遊「ライトを消して走ったことはあるか？」'] },
    { rival: '赤城', title: '第8話 ターボの悪魔', courseIdx: 3300, level: 0.93, lines: ['赤城「直線で千切ってやるよ」', 'あなた「峠は直線じゃ決まらない」'] },
    { rival: '源さん', title: '第9話 伝説の男', courseIdx: 940, level: 0.95, lines: ['源さん「……悪くない走りだ」', '源さん「だが、まだ足りない」'] },
    { rival: 'シャドウ', title: '第10話 尾文字Z', courseIdx: 5000, level: 0.99, lines: ['？？？「お前が噂の走り屋か」', 'シャドウ「この峠の頂点は一つだけだ」', 'あなた「なら、今夜それを決めよう」'] }
].map((s, i) => ({ ...s, id: i, rewardZ: 15000 + i * 12000, rewardMetal: 5 + i * 3 }));

export const CPU_NAMES = ['蓮', '白瀬', '航', '沙樹', '岩城', '剛田', '小鳥遊', '赤城', '源さん', '真壁', '東雲', '霧島', '神崎', '早乙女', '九条', '鷲尾'];

// ---------------- Weekly events ----------------
const WEEK = 604800000;
export function weekId(now = Date.now()) {
    return Math.floor((now + 9 * 3600e3 - 4 * 86400e3) / WEEK); // JST, resets Monday 00:00
}
export function weekEndsAt(w) { return (w + 1) * WEEK - 9 * 3600e3 + 4 * 86400e3; }
const EV_NAMES = ['峠の挑戦状', '夜明けのダウンヒル', '雨の死闘', 'ヘアピン地獄', '週末ナイトバトル', '新人狩り', '伝説の走り屋', 'ラインを刻め', '限界ブレーキング', '霧の亡霊', '下りの鬼', '峠の王者決定戦'];
export function weekEvents(w = weekId()) {
    const r = rng(w * 131 + 7);
    const list = [];
    for (let k = 0; k < 12; k++) {
        const boss = k === 11;
        const type = boss ? 'battle' : r() < 0.68 ? 'battle' : 'time';
        const course = getCourse(Math.floor(r() * COURSE_COUNT));
        const limit = boss ? 'ANY' : pick(r, ['C', 'B', 'B', 'A', 'S', 'ANY']);
        const level = boss ? 1.0 : +(0.82 + r() * 0.15).toFixed(2);
        const z = Math.round((course.length * (boss ? 18 : 6) * level) / 100) * 100;
        const metal = boss ? 40 : 3 + Math.floor(r() * 8);
        const target = +(course.length / (17 + r() * 4 + (limit === 'S' ? 4 : 0))).toFixed(1);
        list.push({ id: `${w}-${k}`, title: boss ? '👑 ' + EV_NAMES[11] : EV_NAMES[k], type, courseIdx: course.idx, limit, level, rewardZ: z, rewardMetal: metal, target, boss });
    }
    return list;
}
