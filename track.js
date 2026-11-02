import * as THREE from 'three';

export const ROAD_WIDTH = 11;

const CONTROL = [
    [0, 120, 40], [0, 120, 0], [0, 118, -60], [-20, 115, -120], [-80, 110, -150], [-150, 105, -150],
    [-190, 100, -180], [-180, 96, -230], [-120, 92, -250], [-40, 88, -250],
    [40, 84, -260], [90, 80, -300], [80, 76, -350], [20, 72, -380],
    [-60, 68, -390], [-120, 64, -420], [-110, 60, -480], [-40, 56, -500],
    [60, 52, -500], [140, 48, -530], [150, 44, -590], [90, 40, -630],
    [0, 36, -650], [-40, 32, -720], [-20, 28, -800], [-20, 27, -840]
];

function ribbon(track, offA, offB, yA, yB, vScale) {
    const { pts, sides, ds } = track;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const s = sides[i];
        pos.push(p.x + s.x * offA, p.y + yA, p.z + s.z * offA);
        pos.push(p.x + s.x * offB, p.y + yB, p.z + s.z * offB);
        uv.push(0, (i * ds) / vScale, 1, (i * ds) / vScale);
        if (i > 0) {
            const a = (i - 1) * 2;
            idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

function bannerTexture(text, checker) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const ctx = c.getContext('2d');
    if (checker) {
        for (let x = 0; x < 32; x++) {
            for (let y = 0; y < 6; y++) {
                ctx.fillStyle = (x + y) % 2 ? '#111' : '#eee';
                ctx.fillRect(x * 16, y * 16, 16, 16);
            }
        }
    } else {
        ctx.fillStyle = '#b01010';
        ctx.fillRect(0, 0, 512, 96);
    }
    ctx.font = 'bold italic 54px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = checker ? '#ff3030' : '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6;
    ctx.strokeText(text, 256, 68);
    ctx.fillText(text, 256, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

function addGate(scene, track, i, text, checker) {
    const p = track.pts[i];
    const s = track.sides[i];
    const group = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 });
    for (const sign of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6), poleMat);
        pole.position.set(s.x * sign * (ROAD_WIDTH / 2 + 0.8), 3, s.z * sign * (ROAD_WIDTH / 2 + 0.8));
        group.add(pole);
    }
    const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_WIDTH + 1.6, 1.6),
        new THREE.MeshBasicMaterial({ map: bannerTexture(text, checker), side: THREE.DoubleSide })
    );
    banner.position.y = 5.4;
    banner.rotation.y = Math.atan2(s.x, s.z) - Math.PI / 2;
    group.add(banner);
    group.position.copy(p);
    scene.add(group);
}

export function buildTrack(rootScene, roadTex, grassTex, control = CONTROL, opts = {}) {
    const scene = new THREE.Group();
    rootScene.add(scene);
    const curve = new THREE.CatmullRomCurve3(control.map(p => new THREE.Vector3(...p)), false, 'centripetal');
    const N = Math.max(1200, Math.min(6000, Math.round(curve.getLength() / 0.6)));
    const pts = curve.getSpacedPoints(N - 1);
    const length = curve.getLength();
    const ds = length / (N - 1);
    const tangents = [];
    const sides = [];
    for (let i = 0; i < N; i++) {
        const t = pts[Math.min(i + 1, N - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
        tangents.push(t);
        sides.push(new THREE.Vector3(t.z, 0, -t.x).normalize());
    }

    // Corner speed limits from curvature (lateral grip ~8.5 m/s²)
    const speedLimit = [];
    for (let i = 0; i < N; i++) {
        const a = tangents[Math.max(i - 10, 0)];
        const b = tangents[Math.min(i + 10, N - 1)];
        const ang = Math.abs(Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z)) + 1e-4;
        const radius = (20 * ds) / ang;
        speedLimit.push(Math.min(80, Math.sqrt(8.5 * radius)));
    }

    const track = { pts, tangents, sides, ds, N, length, speedLimit, startIndex: 60, finishIndex: N - 60, group: scene };
    track.dispose = () => {
        rootScene.remove(scene);
        scene.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material && o.material.map && o.material.map.isCanvasTexture) o.material.map.dispose();
            if (o.material) o.material.dispose();
        });
    };

    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.colorSpace = THREE.SRGBColorSpace;
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.colorSpace = THREE.SRGBColorSpace;
    grassTex.repeat.set(3, 1);

    const road = new THREE.Mesh(
        ribbon(track, -ROAD_WIDTH / 2, ROAD_WIDTH / 2, 0, 0, 12),
        new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85, side: THREE.DoubleSide })
    );
    scene.add(road);

    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, side: THREE.DoubleSide, color: 0x8a9a80 });
    scene.add(new THREE.Mesh(ribbon(track, ROAD_WIDTH / 2, ROAD_WIDTH / 2 + 1.5, -0.02, 0.2, 12), grassMat));
    scene.add(new THREE.Mesh(ribbon(track, ROAD_WIDTH / 2 + 1.5, ROAD_WIDTH / 2 + 14, 0.2, 7, 12), grassMat));
    scene.add(new THREE.Mesh(ribbon(track, -ROAD_WIDTH / 2, -ROAD_WIDTH / 2 - 2, -0.02, -0.1, 12), grassMat));
    scene.add(new THREE.Mesh(ribbon(track, -ROAD_WIDTH / 2 - 2, -ROAD_WIDTH / 2 - 16, -0.1, -10, 12), grassMat));

    const railMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
        const off = side * (ROAD_WIDTH / 2 + 0.25);
        scene.add(new THREE.Mesh(ribbon(track, off, off, 0.45, 0.8, 12), railMat));
    }
    // Posts
    const postGeo = new THREE.BoxGeometry(0.12, 0.8, 0.12);
    const postCount = Math.floor(N / 6) * 2;
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x777777 }), postCount);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < N && k < postCount - 1; i += 6) {
        for (const side of [-1, 1]) {
            const p = pts[i].clone().addScaledVector(sides[i], side * (ROAD_WIDTH / 2 + 0.35));
            m.makeTranslation(p.x, p.y + 0.4, p.z);
            posts.setMatrixAt(k++, m);
        }
    }
    scene.add(posts);

    // Pine trees
    const treeCount = 900;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 2), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }), treeCount);
    const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(2, 7, 7), new THREE.MeshStandardMaterial({ color: 0x1d3a24, roughness: 1 }), treeCount);
    let placed = 0;
    for (let tries = 0; tries < treeCount * 4 && placed < treeCount; tries++) {
        const i = Math.floor(Math.random() * N);
        const left = Math.random() < 0.5;
        const d = 3 + Math.random() * 10;
        const off = (left ? 1 : -1) * (ROAD_WIDTH / 2 + 1.5 + d);
        const p = pts[i].clone().addScaledVector(sides[i], off);
        let ok = true;
        for (let j = 0; j < N; j += 8) {
            const dx = pts[j].x - p.x;
            const dz = pts[j].z - p.z;
            if (dx * dx + dz * dz < (ROAD_WIDTH / 2 + 3) ** 2) {
                ok = false;
                break;
            }
        }
        if (!ok) {
            continue;
        }
        p.y += left ? 0.2 + (d / 12.5) * 6.8 : -0.1 - (d / 14) * 9.9;
        const sc = 0.7 + Math.random() * 0.8;
        m.compose(new THREE.Vector3(p.x, p.y + sc, p.z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc));
        trunk.setMatrixAt(placed, m);
        m.compose(new THREE.Vector3(p.x, p.y + sc * 5, p.z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc));
        leaves.setMatrixAt(placed, m);
        placed++;
    }
    trunk.count = placed;
    leaves.count = placed;
    scene.add(trunk, leaves);

    // Street lamps at corners
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
    const lampStep = Math.max(160, Math.floor(N / 12));
    for (let i = 100; i < N && opts.lamps !== false; i += lampStep) {
        const p = pts[i].clone().addScaledVector(sides[i], -(ROAD_WIDTH / 2 + 1));
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6), railMat);
        pole.position.set(p.x, p.y + 3, p.z);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), lampMat);
        bulb.position.set(p.x, p.y + 6, p.z);
        const light = new THREE.PointLight(0xffa050, 40, 30, 1.6);
        light.position.copy(bulb.position);
        scene.add(pole, bulb, light);
    }

    addGate(scene, track, track.startIndex, 'START', false);
    addGate(scene, track, track.finishIndex, 'GOAL', true);

    track.project = (x, z, hint) => {
        let best = hint;
        let bestD = Infinity;
        const from = Math.max(0, hint - 25);
        const to = Math.min(N - 1, hint + 40);
        for (let i = from; i <= to; i++) {
            const dx = x - pts[i].x;
            const dz = z - pts[i].z;
            const d = dx * dx + dz * dz;
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        const p = pts[best];
        const lateral = (x - p.x) * sides[best].x + (z - p.z) * sides[best].z;
        return { index: best, lateral };
    };
    return track;
}
