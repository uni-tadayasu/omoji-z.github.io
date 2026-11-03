import * as THREE from 'three';
import { prepareModel } from './car.js';
import { getCar } from './data.js';

export const BODY_COLORS = ['#f4f4f0', '#111317', '#c8141c', '#1d4fbf', '#f2c200', '#c0c4c8', '#1f6b3a', '#ff7a1a', '#5b2a86', '#7ec8e3', '#8a1020', '#e8e0c8', '#ff4fa0', '#00c2a8', '#2b2f3a', '#6b4a2b'];
export const PREMIUM_COLORS = [{ c: '#d4af37', n: 'ゴールド', m: 8 }, { c: '#e5e8ec', n: 'クローム', m: 8 }, { c: '#7a1fff', n: 'マジョーラ', m: 10 }, { c: '#00ff9c', n: 'ネオングリーン', m: 6 }];
export const WINGS = ['なし', 'ダックテール', 'GTウイング', 'スワンネック大型'];
export const NEONS = [null, '#00e5ff', '#ff2bd6', '#39ff14', '#ff3b1f', '#ffffff'];
export const WHEELS = [{ n: 'シルバー', c: '#c8ccd0' }, { n: 'ブロンズ', c: '#9a6a2a' }, { n: 'ブラック', c: '#1a1a1a' }, { n: 'ゴールド', c: '#d4af37' }, { n: 'ホワイト', c: '#f0f0f0' }];

function std(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3, ...extra });
}

// Deformed mini-car (pull-back toy proportions)
export function buildMiniCar(kind) {
    const g = new THREE.Group();
    const isBM = kind === 'vip-bm';
    const main = std(isBM ? 0x0d0d10 : 0xffd21a, { roughness: 0.18, metalness: isBM ? 0.6 : 0.15 });
    const trim = std(isBM ? 0xd4af37 : 0xffffff, { metalness: 0.9, roughness: 0.2 });
    const glass = std(0x1a2a3a, { roughness: 0.05, metalness: 0.8 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), main);
    body.scale.set(1.0, 0.62, 1.45);
    body.position.y = 0.95;
    g.add(body);
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    cabin.scale.set(0.78, 0.62, 0.85);
    cabin.position.set(0, 1.3, -0.15);
    g.add(cabin);
    const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), main);
    roof.scale.set(0.66, 0.5, 0.62);
    roof.position.set(0, 1.42, -0.2);
    g.add(roof);
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            const fender = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), main);
            fender.scale.set(0.8, 0.85, 1.1);
            fender.position.set(sx * 0.82, 0.75, sz * 0.95);
            g.add(fender);
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.42, 24), std(0x111111, { roughness: 0.9 }));
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(sx * 0.9, 0.5, sz * 0.98);
            g.add(wheel);
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.44, 16), trim);
            hub.rotation.z = Math.PI / 2;
            hub.position.copy(wheel.position);
            g.add(hub);
        }
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 1.5 }));
        lamp.position.set(sx * 0.48, 1.0, 1.38);
        g.add(lamp);
    }
    const bumper = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 8, 24, Math.PI), trim);
    bumper.rotation.set(Math.PI / 2, 0, Math.PI);
    bumper.position.set(0, 0.62, 1.15);
    g.add(bumper);
    const rb = bumper.clone();
    rb.rotation.z = 0;
    rb.position.z = -1.15;
    g.add(rb);
    // wind-up key on the back
    const key = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), trim);
    shaft.rotation.x = Math.PI / 2;
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 20), trim);
    bow.position.z = -0.3;
    key.add(shaft, bow);
    key.position.set(0, 1.25, -1.45);
    key.userData.spin = true;
    g.add(key);
    if (isBM) {
        const stripe = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.025, 6, 48), trim);
        stripe.scale.set(1, 1.45, 1);
        stripe.rotation.x = Math.PI / 2;
        stripe.position.y = 0.95;
        g.add(stripe);
    } else {
        const smile = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 20, Math.PI), std(0x222222));
        smile.rotation.z = Math.PI;
        smile.position.set(0, 0.85, 1.42);
        g.add(smile);
    }
    g.scale.setScalar(1.15);
    return g;
}

export function makeCarVisual(id, dress, baseModel) {
    const car = getCar(id);
    let holder;
    if (car.vip) {
        holder = new THREE.Group();
        holder.add(buildMiniCar(car.id));
    } else {
        holder = prepareModel(baseModel ? baseModel.clone() : null, car.len, car.color);
        const color = new THREE.Color((dress && dress.body) || car.color);
        holder.traverse(o => {
            if (o.isMesh && o.material) {
                o.material = o.material.clone();
                const hsl = {};
                o.material.color.getHSL(hsl);
                if (hsl.l > 0.25) o.material.color.copy(color).multiplyScalar(1.15);
            }
        });
    }
    const L = car.len;
    if (dress && dress.wing) {
        const wm = std(0x15151a, { roughness: 0.5 });
        const w = new THREE.Group();
        if (dress.wing === 1) {
            const lip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.35), wm);
            lip.position.set(0, 1.05, -L / 2 + 0.25);
            w.add(lip);
        } else {
            const wide = dress.wing === 3 ? 1.9 : 1.7;
            const blade = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.06, 0.45), wm);
            blade.position.set(0, dress.wing === 3 ? 1.6 : 1.4, -L / 2 + 0.3);
            w.add(blade);
            for (const sx of [-0.5, 0.5]) {
                const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, dress.wing === 3 ? 0.55 : 0.35, 0.12), wm);
                st.position.set(sx, dress.wing === 3 ? 1.33 : 1.22, -L / 2 + 0.32);
                w.add(st);
            }
        }
        holder.add(w);
    }
    if (dress && dress.neon) {
        // additive plane instead of a PointLight (lights are the most expensive thing per pixel)
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, L * 1.1), new THREE.MeshBasicMaterial({ color: dress.neon, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.05;
        holder.add(glow);
    }
    return holder;
}

// 2D side silhouette for menus
export function carSVG(car, color, wing = 0) {
    const c = color || car.color;
    if (car.vip) {
        const trim = car.id === 'vip-bm' ? '#d4af37' : '#fff';
        return `<svg viewBox="0 0 200 100" class="carsvg"><ellipse cx="100" cy="90" rx="80" ry="6" fill="#0006"/><path d="M30 70 Q30 30 80 26 Q100 10 130 24 Q172 30 172 70 Z" fill="${c}" stroke="${trim}" stroke-width="2"/><path d="M78 30 Q100 14 128 28 L124 46 L82 46 Z" fill="#1a2a3a"/><circle cx="58" cy="74" r="17" fill="#111"/><circle cx="58" cy="74" r="8" fill="${trim}"/><circle cx="144" cy="74" r="17" fill="#111"/><circle cx="144" cy="74" r="8" fill="${trim}"/><circle cx="166" cy="52" r="5" fill="#fff6c0"/><circle cx="22" cy="40" r="7" fill="none" stroke="${trim}" stroke-width="3"/></svg>`;
    }
    const t = car.body;
    let path;
    if (t === 'スーパーカー') path = 'M14 70 L22 58 Q60 50 86 36 Q120 30 150 44 L186 56 L190 70 Z';
    else if (t === 'SUV') path = 'M14 72 L16 44 Q20 32 50 30 L130 28 Q150 30 162 44 L186 50 L188 72 Z';
    else if (t === 'ワゴン') path = 'M12 72 L14 50 Q24 34 60 32 L150 32 Q160 36 170 50 L188 56 L188 72 Z';
    else if (t === 'ハッチバック' || t === '軽スポーツ') path = 'M22 72 L24 52 Q34 32 70 30 L120 30 Q140 34 156 48 L180 54 L182 72 Z';
    else if (t === 'マッスル') path = 'M10 72 L12 54 Q30 46 66 42 Q84 30 116 30 Q140 34 150 46 L190 54 L190 72 Z';
    else path = 'M12 72 L14 56 Q32 48 64 44 Q86 30 116 30 Q142 32 156 46 L188 54 L190 72 Z';
    const wingSvg = wing ? `<rect x="${wing === 1 ? 14 : 8}" y="${wing === 3 ? 30 : 40}" width="${wing === 1 ? 20 : 34}" height="4" fill="#111"/>${wing > 1 ? `<rect x="22" y="${wing === 3 ? 30 : 40}" width="3" height="${wing === 3 ? 22 : 12}" fill="#111"/>` : ''}` : '';
    return `<svg viewBox="0 0 200 100" class="carsvg"><ellipse cx="100" cy="88" rx="86" ry="5" fill="#0006"/><path d="${path}" fill="${c}" stroke="#0008" stroke-width="1.5"/><path d="M70 44 Q90 34 116 34 Q134 36 146 47 Z" fill="#1d2b3a" opacity=".9"/>${wingSvg}<circle cx="50" cy="74" r="13" fill="#111"/><circle cx="50" cy="74" r="6" fill="#bbb"/><circle cx="152" cy="74" r="13" fill="#111"/><circle cx="152" cy="74" r="6" fill="#bbb"/><rect x="180" y="58" width="8" height="4" fill="#fff6c0"/><rect x="12" y="60" width="6" height="4" fill="#f22"/></svg>`;
}
