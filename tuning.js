import { getCar } from './data.js';
import { carState } from './save.js';

export const MAX_LV = 10;
export const MAX_LB = 10;
// Z-currency upgrades (10 levels each)
export const UPGRADES = [
    { k: 'intake', n: 'エアクリーナー・吸気', e: { pw: 0.015 } },
    { k: 'exhaust', n: 'マフラー・排気系', e: { pw: 0.02 } },
    { k: 'ecu', n: 'ECU・現車セッティング', e: { pw: 0.025 } },
    { k: 'turbo', n: 'ターボ／スーパーチャージャー', e: { pw: 0.04 } },
    { k: 'cooling', n: 'インタークーラー・冷却', e: { pw: 0.01 } },
    { k: 'trans', n: 'クロスミッション', e: { top: 0.012, pw: 0.008 } },
    { k: 'clutch', n: '強化クラッチ・軽量フライホイール', e: { pw: 0.008 } },
    { k: 'susp', n: '車高調サスペンション', e: { grip: 0.018 } },
    { k: 'brake', n: 'ブレーキキャリパー・ローター', e: { brake: 0.04 } },
    { k: 'tire', n: 'ハイグリップタイヤ', e: { grip: 0.022 } },
    { k: 'lsd', n: '機械式LSD', e: { grip: 0.01 } },
    { k: 'weight', n: '軽量化（カーボン・内装剥がし）', e: { wt: -0.015 } },
    { k: 'aero', n: 'エアロ・ディフューザー', e: { grip: 0.012, top: 0.004 } },
    { k: 'body', n: 'ボディ補強・ロールケージ', e: { grip: 0.008 } }
];
// Metal-currency internal engine parts (one-time)
export const PARTS = [
    { k: 'piston', n: '鍛造ピストン', m: 6, e: { pw: 0.05 } },
    { k: 'crank', n: 'フルカウンタークランク', m: 8, e: { pw: 0.05 } },
    { k: 'cam', n: 'ハイリフトカムシャフト', m: 8, e: { pw: 0.05 } },
    { k: 'rod', n: 'H断面コンロッド', m: 6, e: { pw: 0.04 } },
    { k: 'valve', n: 'チタンバルブ・強化スプリング', m: 7, e: { pw: 0.04 } },
    { k: 'injector', n: '大容量インジェクター', m: 5, e: { pw: 0.03 } },
    { k: 'bigturbo', n: 'ビッグシングルタービン', m: 15, e: { pw: 0.1 } },
    { k: 'drysump', n: 'ドライサンプ・オイルシステム', m: 10, e: { pw: 0.03, grip: 0.02 } },
    { k: 'stroker', n: 'ストローカーキット（排気量UP）', m: 18, e: { pw: 0.12 } },
    { k: 'swap', n: 'レース用エンジン換装', m: 25, e: { pw: 0.18, top: 0.04 } }
];

export function upgradeCost(car, lv) {
    const base = car.vip ? 20000 : car.price;
    return Math.max(500, Math.round((base * 0.035 * Math.pow(lv + 1, 1.45)) / 100) * 100);
}
export function limitBreakCost(lb) { return 30 + lb * 15; }
export function allMaxed(id) {
    const st = carState(id);
    return UPGRADES.every(u => (st.upg[u.k] || 0) >= MAX_LV) && PARTS.every(p => st.parts[p.k]);
}
export function tuneProgress(id) {
    const st = carState(id);
    const total = UPGRADES.length * MAX_LV + PARTS.length;
    const done = UPGRADES.reduce((a, u) => a + (st.upg[u.k] || 0), 0) + PARTS.filter(p => st.parts[p.k]).length;
    return done / total;
}

export function effectiveStats(id) {
    const car = getCar(id);
    const st = carState(id);
    const m = { pw: 1, grip: 1, brake: 1, top: 1, wt: 1 };
    for (const u of UPGRADES) {
        const lv = st.upg[u.k] || 0;
        for (const [k, v] of Object.entries(u.e)) m[k] += v * lv;
    }
    for (const p of PARTS) {
        if (st.parts[p.k]) for (const [k, v] of Object.entries(p.e)) m[k] += v;
    }
    m.pw += st.lb * 0.05;
    m.grip += st.lb * 0.025;
    m.top += st.lb * 0.02;
    return {
        power: Math.round(car.power * m.pw),
        weight: Math.round(car.weight * Math.max(0.6, m.wt)),
        grip: +(car.grip * m.grip).toFixed(3),
        brake: m.brake,
        top: Math.round(car.top * m.top),
        lb: st.lb
    };
}
// physics parameters for car.js
export function perfFor(id, weather) {
    const s = effectiveStats(id);
    const hpkg = s.power / s.weight;
    return {
        acc: Math.min(3.2, Math.max(0.6, Math.pow(hpkg / 0.138, 0.7))),
        top: Math.min(115, Math.max(40, s.top / 3.6)),
        grip: s.grip * (weather === 'rain' ? 0.8 : 1),
        brake: s.brake
    };
}
