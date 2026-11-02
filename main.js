import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { init, id } from '@instantdb/core';
import { INSTANT_DB_APP_ID } from './instant_db_config.js';
import { buildTrack } from './track.js';
import { Car, RivalCar, prepareModel } from './car.js';
import { getCourse, courseControlPoints, CPU_NAMES } from './data.js';
import { save, persist, carState } from './save.js';
import { perfFor } from './tuning.js';
import { makeCarVisual } from './visuals.js';
import { initUI, showSite, showResult, header, toast } from './ui.js';

// ---------- Renderer / scene ----------
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a1020, 40, 260);
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

const hemi = new THREE.HemisphereLight(0x8899cc, 0x202010, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xaabbff, 0.8);
sun.position.set(-50, 100, 30);
scene.add(sun);

const texLoader = new THREE.TextureLoader();
let nightSky = null;
let course = null;
texLoader.loadAsync('assets/night-mountain.webp').then(tex => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    nightSky = tex;
    if (course) applyAtmosphere(course);
}).catch(() => {});

const roadTex = texLoader.load('assets/asphalt-road.webp');
roadTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const grassTex = texLoader.load('assets/forest-grass.webp');

const ATMOS = {
    night: { bg: 0x0a1020, fog: [40, 260], hemi: 0.9, sun: 0.8, sunC: 0xaabbff, sky: true },
    dusk: { bg: 0x5a3a48, fog: [60, 320], hemi: 1.3, sun: 1.3, sunC: 0xffa070, sky: false },
    dawn: { bg: 0x7f8fb0, fog: [50, 300], hemi: 1.5, sun: 1.2, sunC: 0xffd0b0, sky: false },
    day: { bg: 0x9cc4e8, fog: [80, 420], hemi: 2.0, sun: 2.4, sunC: 0xffffff, sky: false }
};
function applyAtmosphere(c) {
    const a = ATMOS[c.time];
    let [near, far] = a.fog;
    if (c.weather === 'fog') { near = 10; far = 90; }
    if (c.weather === 'rain') { far *= 0.6; }
    const col = new THREE.Color(a.bg).multiplyScalar(c.weather === 'clear' ? 1 : 0.65);
    scene.fog.color.copy(col);
    scene.fog.near = near;
    scene.fog.far = far;
    if (a.sky && nightSky && c.weather === 'clear') {
        scene.background = nightSky;
        scene.environment = nightSky;
        scene.environmentIntensity = 0.5;
    } else {
        scene.background = col;
        scene.environment = nightSky;
        scene.environmentIntensity = c.time === 'day' ? 0.9 : 0.5;
    }
    hemi.intensity = a.hemi * (c.weather === 'clear' ? 1 : 0.7);
    sun.intensity = a.sun * (c.weather === 'clear' ? 1 : 0.5);
    sun.color.setHex(a.sunC);
    headlight.intensity = c.time === 'day' ? 20 : 120;
    rain.visible = c.weather === 'rain';
}

// rain particles around the camera
const RAIN_N = 2500;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_N * 3);
for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 60;
    rainPos[i * 3 + 1] = Math.random() * 30;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
}
rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rainPos, 3));
const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xaaccff, size: 0.12, transparent: true, opacity: 0.6 }));
rain.visible = false;
scene.add(rain);

// ---------- Models ----------
const gltfLoader = new GLTFLoader();
async function loadModel(url) {
    try {
        return (await gltfLoader.loadAsync(url)).scene;
    } catch (e) {
        return null;
    }
}
const [playerModel, rivalModel] = await Promise.all([
    loadModel('assets/models/player-car.glb'),
    loadModel('assets/models/rival-car.glb')
]);

// ---------- Race setup ----------
let track = null;
let cfg = null;
let player;
let rivals = [];
const headlight = new THREE.SpotLight(0xfff2d0, 120, 90, 0.5, 0.5, 1.2);
const RIVAL_COLORS = [0xffcc00, 0xffffff, 0x1d4fbf, 0xc8141c, 0x222222, 0x1f6b3a, 0xff7a1a, 0x7ec8e3];
const tailGeo = new THREE.SphereGeometry(0.09, 8, 8);
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });

function disposeGroup(g) {
    g.traverse(o => {
        if (o.geometry && o.geometry !== tailGeo) o.geometry.dispose();
        if (o.material && o.material !== tailMat) o.material.dispose();
    });
}
function addTail(group) {
    for (const sx of [-0.6, 0.6]) {
        const tl = new THREE.Mesh(tailGeo, tailMat);
        tl.position.set(sx, 0.75, -2.1);
        group.add(tl);
    }
}

// ----- bonus coins (instanced) -----
const coinGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.16, 20).rotateX(Math.PI / 2);
const gemGeo = new THREE.OctahedronGeometry(0.75);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc21a, emissive: 0x7a4a00, metalness: 0.9, roughness: 0.25 });
const gemMat = new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x1a6080, metalness: 0.6, roughness: 0.15 });
let coins = [];
let coinMesh = null;
let gemMesh = null;
let collected = { z: 0, metal: 0, count: 0 };
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
function clearCoins() {
    for (const m of [coinMesh, gemMesh]) if (m) { scene.remove(m); m.dispose(); }
    coinMesh = gemMesh = null;
    coins = [];
}
function buildCoins(b) {
    clearCoins();
    const r = Math.random;
    const step = Math.max(1, Math.round(8 / track.ds));
    const list = [];
    let wave = 0;
    for (let i = track.startIndex + 30; i < track.finishIndex - 10; i += step) {
        wave += 0.35;
        const lat = Math.sin(wave) * 3.2;
        const p = track.pts[i].clone().addScaledVector(track.sides[i], lat);
        p.y += 1.1;
        list.push({ i, pos: p, gem: r() < b.metalRate, taken: false });
    }
    coins = list;
    collected.total = list.length;
    const nz = list.filter(c => !c.gem).length;
    const ng = list.length - nz;
    coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, Math.max(1, nz));
    gemMesh = new THREE.InstancedMesh(gemGeo, gemMat, Math.max(1, ng));
    coinMesh.count = nz;
    gemMesh.count = ng;
    let zi = 0;
    let gi = 0;
    for (const c of list) {
        c.mesh = c.gem ? gemMesh : coinMesh;
        c.slot = c.gem ? gi++ : zi++;
    }
    scene.add(coinMesh, gemMesh);
    updateCoins(0);
}
let coinSpin = 0;
function updateCoins(dt) {
    if (!coins.length) return;
    coinSpin += dt * 3;
    _q.setFromAxisAngle(_up, coinSpin);
    for (const c of coins) {
        _s.setScalar(c.taken ? 0 : 1);
        _m.compose(c.pos, _q, _s);
        c.mesh.setMatrixAt(c.slot, _m);
    }
    coinMesh.instanceMatrix.needsUpdate = true;
    gemMesh.instanceMatrix.needsUpdate = true;
    if (state !== 'race') return;
    for (const c of coins) {
        if (c.taken || Math.abs(c.i - player.index) > 12 / track.ds) continue;
        const dx = c.pos.x - player.x;
        const dz = c.pos.z - player.z;
        if (dx * dx + dz * dz < 2.6 * 2.6) {
            c.taken = true;
            collected.count++;
            if (c.gem) collected.metal++;
            else collected.z += cfg.bonus.coinZ;
            playChime(c.gem);
        }
    }
}

function setupRace() {
    if (player) {
        scene.remove(player.group);
        disposeGroup(player.group);
    }
    for (const r of rivals) {
        scene.remove(r.group);
        disposeGroup(r.group);
    }
    rivals = [];
    clearCoins();
    const carId = save.current;
    const dress = carState(carId).dress;
    const perf = perfFor(carId, course.weather);
    const cpus = cfg.mode === 'battle' ? Math.max(0, Math.min(7, cfg.cpus ?? 1)) : 0;
    player = new Car(makeCarVisual(carId, dress, playerModel), track, perf);
    player.name = save.name;
    player.finishTime = null;
    player.placeAtLane(cfg.mode === 'battle' || cfg.online ? -2.4 : 0);
    scene.add(player.group);
    headlight.position.set(0, 0.8, 1.8);
    headlight.target.position.set(0, 0, 20);
    player.group.add(headlight, headlight.target);
    addTail(player.group);

    // rival strength scales a little with the player's car so every class is a fight
    const level = cfg.level * (0.88 + 0.12 * Math.min(1.8, perf.acc));
    const grip = Math.min(1.5, perf.grip) * (course.weather === 'rain' ? 0.85 : 1);
    const names = cfg.cpuNames || CPU_NAMES.slice(course.idx % 8).concat(CPU_NAMES);
    const baseS = (track.startIndex - 20) * track.ds;
    for (let k = 0; k < cpus; k++) {
        const rv = prepareModel(rivalModel ? rivalModel.clone() : null, 4.3, 0xffcc00);
        const rc = new THREE.Color(RIVAL_COLORS[(course.idx + k) % RIVAL_COLORS.length]);
        rv.traverse(o => {
            if (o.isMesh && o.material) {
                o.material = o.material.clone();
                const hsl = {};
                o.material.color.getHSL(hsl);
                if (hsl.l > 0.3) o.material.color.copy(rc);
            }
        });
        // grid: player is slot 0 (left, front row); CPUs fill the rest two-wide
        const slot = k + 1;
        const row = Math.floor(slot / 2);
        const lane = slot % 2 ? 2.4 : -2.4;
        const startS = cpus === 1 ? baseS + 8 * track.ds : baseS - row * 7;
        const lv = Math.min(1.08, level * (1 - (cpus > 1 ? k * 0.012 : 0)));
        const rival = new RivalCar(rv, track, lane, lv, grip, startS);
        rival.name = names[k % names.length];
        if (k < 2) {
            const rivalLight = new THREE.SpotLight(0xfff2d0, course.time === 'day' ? 15 : 80, 70, 0.5, 0.5, 1.2);
            rivalLight.position.set(0, 0.8, 1.8);
            rivalLight.target.position.set(0, 0, 20);
            rival.group.add(rivalLight, rivalLight.target);
        }
        addTail(rival.group);
        scene.add(rival.group);
        rivals.push(rival);
    }
    collected = { z: 0, metal: 0, count: 0 };
    if (cfg.mode === 'bonus' && cfg.bonus) buildCoins(cfg.bonus);
}

function loadCourse(idx) {
    if (track && course && course.idx === idx) return;
    if (track) track.dispose();
    course = getCourse(idx);
    track = buildTrack(scene, roadTex, grassTex, courseControlPoints(course), { lamps: course.time !== 'day' });
    applyAtmosphere(course);
}

// ---------- Input ----------
const keys = {};
const touch = {};
let camMode = 0;
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (state === 'menu') return;
    if (e.code === 'KeyR' && !cfg.online && !cfg.noRetry) startRace();
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'KeyC') camMode = (camMode + 1) % 2;
    if (e.code === 'Escape') backToMenu();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
document.querySelectorAll('.tb').forEach(b => {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); touch[k] = true; b.classList.add('on'); };
    const off = e => { e.preventDefault(); touch[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
});
document.getElementById('quitBtn').addEventListener('click', () => backToMenu());
function readInput() {
    return {
        throttle: keys.KeyW || keys.ArrowUp || touch.throttle,
        brake: keys.KeyS || keys.ArrowDown || touch.brake,
        left: keys.KeyA || keys.ArrowLeft || touch.left,
        right: keys.KeyD || keys.ArrowRight || touch.right,
        handbrake: keys.Space || touch.handbrake
    };
}

// ---------- Audio ----------
const bgm = new Audio('assets/audio/eurobeat-bgm.mp3');
bgm.loop = true;
bgm.volume = 0.45;
const squeal = new Audio('assets/audio/tire-squeal.mp3');
squeal.loop = true;
squeal.volume = 0;
let muted = false;
let actx;
let engineOsc;
let engineOsc2;
let engineGain;
function initAudio() {
    if (actx) {
        if (actx.state === 'suspended') actx.resume();
        return;
    }
    actx = new AudioContext();
    engineOsc = actx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc2 = actx.createOscillator();
    engineOsc2.type = 'square';
    const filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    engineGain = actx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    engineOsc2.connect(filter);
    filter.connect(engineGain).connect(actx.destination);
    engineOsc.start();
    engineOsc2.start();
}
function playBump(strength) {
    if (!actx || muted) return;
    const buf = actx.createBuffer(1, 4000, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    const src = actx.createBufferSource();
    src.buffer = buf;
    const g = actx.createGain();
    g.gain.value = Math.min(0.8, strength * 0.08);
    src.connect(g).connect(actx.destination);
    src.start();
}
function playChime(gem) {
    if (!actx || muted) return;
    const t = actx.currentTime;
    const notes = gem ? [1046, 1318, 1568] : [1318, 1760];
    notes.forEach((f, i) => {
        const o = actx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = actx.createGain();
        g.gain.setValueAtTime(0.12, t + i * 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.18);
        o.connect(g).connect(actx.destination);
        o.start(t + i * 0.05);
        o.stop(t + i * 0.05 + 0.2);
    });
}
function toggleMute() {
    muted = !muted;
    bgm.muted = muted;
    squeal.muted = muted;
}
function updateAudio() {
    if (!actx) return;
    const racing = state !== 'menu';
    engineGain.gain.setTargetAtTime(racing && !muted ? 0.08 : 0, actx.currentTime, 0.1);
    if (!racing) return;
    const f = 30 + (player.rpm / 60) * 2;
    engineOsc.frequency.setTargetAtTime(f, actx.currentTime, 0.05);
    engineOsc2.frequency.setTargetAtTime(f * 0.5, actx.currentTime, 0.05);
    const target = state === 'race' && player.slip > 2.5 && player.speedKmh > 25 ? Math.min(0.7, player.slip / 10) : 0;
    squeal.volume = Math.max(0, Math.min(1, squeal.volume + (target - squeal.volume) * 0.2));
    if (target > 0 && squeal.paused) squeal.play().catch(() => {});
}

// ---------- Online (InstantDB presence, up to 8 per room) ----------
export const MAX_PLAYERS = 8;
const params = new URLSearchParams(window.location.search);
const myId = id();
let db = null;
let room = null;
let unsubPresence = null;
let roomCode = params.get('room') || 'public';
const peers = new Map(); // key -> { data, group?, target, heading }
let lastGoRid = null;
let myGo = null;
let onLobbyChange = () => {};
try {
    db = init({ appId: INSTANT_DB_APP_ID });
} catch (e) {
    db = null;
}
function joinRoom(code) {
    if (!db) return false;
    try {
        if (unsubPresence) unsubPresence();
        if (room && room.leaveRoom) room.leaveRoom();
    } catch (e) { /* ignore */ }
    for (const p of peers.values()) if (p.group) scene.remove(p.group);
    peers.clear();
    roomCode = code;
    try {
        room = db.joinRoom('touge', code);
        unsubPresence = room.subscribePresence({}, onPresence);
        publishNow();
        return true;
    } catch (e) {
        room = null;
        return false;
    }
}
function onPresence(data) {
    const seen = new Set();
    for (const [key, peer] of Object.entries(data.peers || {})) {
        if (!peer || !peer.id) continue;
        seen.add(key);
        let entry = peers.get(key);
        if (!entry) {
            entry = { data: peer, target: new THREE.Vector3(), heading: 0, group: null };
            peers.set(key, entry);
        }
        entry.data = peer;
        if (peer.x !== undefined) entry.target.set(peer.x, peer.y, peer.z);
        entry.heading = peer.h || 0;
        // a lobby member pressed START
        if (peer.go && peer.go.rid !== lastGoRid && peer.go.at > Date.now() - 4000 && roomCode !== 'public') {
            lastGoRid = peer.go.rid;
            startOnline(peer.go);
        }
    }
    for (const [key, entry] of peers) {
        if (!seen.has(key)) {
            if (entry.group) scene.remove(entry.group);
            peers.delete(key);
        }
    }
    onLobbyChange();
}
function racingPeer(entry) {
    const d = entry.data;
    if (!course || d.c !== course.idx || d.x === undefined || state === 'menu') return false;
    if (cfg && cfg.online) return d.rid === cfg.online.rid;
    return !d.rid;
}
function ensurePeerVisual(entry) {
    if (entry.group) return;
    const g = new THREE.Group();
    const online = cfg && cfg.online;
    const vis = online
        ? makeCarVisual(entry.data.car || '0', { body: null, wing: 0, neon: null, wheel: 0 }, playerModel)
        : prepareModel(playerModel ? playerModel.clone() : null, 4.2, 0x66ccff);
    if (!online) {
        vis.traverse(o => {
            if (o.material) {
                o.material = o.material.clone();
                o.material.transparent = true;
                o.material.opacity = 0.55;
            }
        });
    }
    g.add(vis);
    addTail(g);
    g.position.copy(entry.target);
    scene.add(g);
    entry.group = g;
    entry.online = !!online;
}
function presencePayload() {
    const p = { id: myId, name: save.name, car: save.current, at: Date.now() };
    if (state !== 'menu' && player && course) {
        Object.assign(p, { c: course.idx, x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2), h: +player.heading.toFixed(3), kmh: Math.round(player.speedKmh), idx: player.index });
        if (cfg.online) p.rid = cfg.online.rid;
        if (player.finishTime != null) p.fin = player.finishTime;
    }
    if (myGo && myGo.at > Date.now() - 4000) p.go = myGo;
    return p;
}
function publishNow() {
    if (!room) return;
    try { room.publishPresence(presencePayload()); } catch (e) { /* ignore */ }
}
let presenceTimer = 0;
function publishPresence(dt) {
    presenceTimer += dt;
    if (!room || presenceTimer < (state === 'menu' ? 0.8 : 0.1)) return;
    presenceTimer = 0;
    publishNow();
}
function updatePeers(dt) {
    const lines = [];
    for (const entry of peers.values()) {
        const show = racingPeer(entry);
        if (show) {
            if (entry.group && entry.online !== !!(cfg && cfg.online)) { scene.remove(entry.group); entry.group = null; }
            ensurePeerVisual(entry);
            entry.group.visible = true;
            entry.group.position.lerp(entry.target, Math.min(1, dt * 10));
            entry.group.rotation.y = entry.heading;
            if (!cfg.online) lines.push(`● ${entry.data.name || 'ONLINE'} ${Math.round((entry.data.idx / track.N) * 100)}% ${entry.data.kmh} km/h`);
        } else if (entry.group) {
            entry.group.visible = false;
        }
    }
    document.getElementById('peers').textContent = lines.join('  ');
}
function lobbyMembers() {
    const list = [{ name: save.name, car: save.current, me: true }];
    for (const e of peers.values()) list.push({ name: e.data.name || 'GUEST', car: e.data.car, me: false, racing: e.data.x !== undefined });
    return list;
}
function hostStart(opts) {
    if (roomCode === 'public') return toast('ルームに参加してください');
    const n = peers.size + 1;
    if (n > MAX_PLAYERS) return toast(`最大${MAX_PLAYERS}人までです`);
    const go = { rid: id(), at: Date.now() + 2500, course: opts.courseIdx, cpus: Math.max(0, Math.min(MAX_PLAYERS - n, opts.cpus)), level: opts.level };
    myGo = go;
    lastGoRid = go.rid;
    publishNow();
    startOnline(go);
}
function startOnline(go) {
    if (state !== 'menu' && state !== 'finished') backToMenu();
    startRace({ courseIdx: go.course, mode: 'battle', cpus: go.cpus, level: go.level, online: go, noRetry: true, cpuNames: CPU_NAMES });
    countdown = 3.99 + Math.max(0, Math.min(6, (go.at - Date.now()) / 1000));
}
joinRoom(roomCode);

// ---------- HUD ----------
const ui = {
    time: document.getElementById('time'),
    best: document.getElementById('best'),
    pos: document.getElementById('pos'),
    center: document.getElementById('center'),
    progress: document.getElementById('progress'),
    courseName: document.getElementById('courseName')
};
const gauge = document.getElementById('gauge').getContext('2d');
let dots = [];
function rebuildDots() {
    ui.progress.innerHTML = '';
    dots = [];
}
function dotFor(key, color) {
    let d = dots.find(x => x.key === key);
    if (!d) {
        const el = document.createElement('div');
        el.className = 'dot';
        el.style.background = color;
        ui.progress.appendChild(el);
        d = { key, el };
        dots.push(d);
    }
    return d.el;
}

function fmt(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 1000);
    return `${m}'${String(s).padStart(2, '0')}"${String(ms).padStart(3, '0')}`;
}
const ORD = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

function drawGauge() {
    const g = gauge;
    g.clearRect(0, 0, 300, 300);
    const cx = 150;
    const cy = 150;
    g.beginPath();
    g.arc(cx, cy, 140, 0, Math.PI * 2);
    g.fillStyle = 'rgba(5,8,15,.8)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#ccc';
    g.stroke();
    const a0 = Math.PI * 0.75;
    const span = Math.PI * 1.5;
    for (let i = 0; i <= 9; i++) {
        const a = a0 + span * (i / 9);
        g.strokeStyle = i >= 8 ? '#ff3020' : '#fff';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 125, cy + Math.sin(a) * 125);
        g.lineTo(cx + Math.cos(a) * 108, cy + Math.sin(a) * 108);
        g.stroke();
        g.fillStyle = i >= 8 ? '#ff3020' : '#fff';
        g.font = 'bold 18px Orbitron';
        g.textAlign = 'center';
        g.fillText(i, cx + Math.cos(a) * 92, cy + Math.sin(a) * 92 + 6);
    }
    g.strokeStyle = '#ff3020';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(cx, cy, 131, a0 + span * (8 / 9), a0 + span);
    g.stroke();
    const na = a0 + span * Math.min(1, player.rpm / 9000);
    g.strokeStyle = '#ff6a20';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(na) * 118, cy + Math.sin(na) * 118);
    g.stroke();
    g.fillStyle = '#fff';
    g.font = 'italic bold 52px Orbitron';
    g.fillText(Math.round(player.speedKmh), cx, cy + 62);
    g.font = '14px Orbitron';
    g.fillText('km/h   x1000rpm', cx, cy + 84);
    g.font = 'italic bold 34px Orbitron';
    g.fillStyle = '#ffd23a';
    g.fillText(player.gear, cx + 2, cy - 30);
}

// ---------- Game state ----------
let state = 'menu';
let countdown = 0;
let raceTime = 0;
let won = false;

// everyone in the race, sorted: finishers by time, then by progress
function standings() {
    const list = [{ name: save.name, me: true, fin: player.finishTime, prog: player.index }];
    for (const r of rivals) list.push({ name: r.name, cpu: true, fin: r.finishTime, prog: r.index });
    if (cfg.online) {
        for (const e of peers.values()) {
            if (racingPeer(e)) list.push({ name: e.data.name || 'GUEST', online: true, fin: e.data.fin ?? null, prog: e.data.idx || 0 });
        }
    }
    list.sort((a, b) => {
        if (a.fin != null && b.fin != null) return a.fin - b.fin;
        if (a.fin != null) return -1;
        if (b.fin != null) return 1;
        return b.prog - a.prog;
    });
    return list;
}

function startRace(newCfg) {
    if (newCfg) cfg = newCfg;
    loadCourse(cfg.courseIdx);
    setupRace();
    state = 'countdown';
    countdown = 3.99;
    raceTime = 0;
    won = false;
    ui.center.textContent = '';
    ui.courseName.textContent = `${course.name}${cfg.title ? ' ／ ' + cfg.title : cfg.event ? ' ／ ' + cfg.event.title : ''}`;
    ui.pos.style.display = cfg.mode === 'battle' ? 'block' : 'none';
    rebuildDots();
    camPos.set(0, 0, 0);
    document.getElementById('result').classList.add('hidden');
    showSite(false);
    initAudio();
    if (!muted) {
        bgm.currentTime = 0;
        bgm.play().catch(() => {});
    }
}

function backToMenu() {
    state = 'menu';
    bgm.pause();
    squeal.pause();
    clearCoins();
    ui.center.textContent = '';
    document.getElementById('result').classList.add('hidden');
    showSite(true);
}

function finishRace(timeout = false) {
    state = 'finished';
    if (!timeout) player.finishTime = +raceTime.toFixed(3);
    const order = standings();
    const place = order.findIndex(o => o.me) + 1;
    const timeTarget = cfg.event && cfg.mode === 'time' ? cfg.event.target : null;
    if (cfg.mode === 'battle') won = place === 1;
    else if (cfg.mode === 'bonus') won = true;
    else won = timeTarget ? raceTime <= timeTarget : true;
    let isBest = false;
    if (!timeout && cfg.mode !== 'bonus') {
        const prev = save.best[course.idx];
        isBest = !prev || raceTime < prev;
        if (isBest) save.best[course.idx] = +raceTime.toFixed(3);
    }
    const res = { place, total: order.length, order: order.map(o => o.name), won, raceTime, timeout, collected: { ...collected } };

    let z;
    let metal = 0;
    let lines = [];
    let next = null;
    let title = cfg.title || (cfg.event ? cfg.event.title : course.name);
    if (cfg.reward) {
        const r = cfg.reward(res);
        z = r.z;
        metal = r.metal;
        lines = r.lines || [];
        next = r.next || null;
        if (r.won !== undefined) won = r.won;
    } else {
        const field = Math.max(1, order.length - 1);
        z = Math.round((course.length * 3.2 * cfg.level * (1 + course.stars * 0.15) * (1 + field * 0.12)) / 10) * 10;
        if (won) {
            metal = 1 + (course.stars >= 4 ? 1 : 0) + (cfg.level >= 0.93 ? 1 : 0) + (field >= 5 ? 1 : 0);
        } else {
            z = Math.round(z * (cfg.mode === 'battle' ? Math.max(0.15, 0.6 - place * 0.08) : 0.25));
        }
        if (cfg.mode === 'time' && !cfg.event) {
            z = Math.round(z * 0.5);
            metal = isBest ? 1 : 0;
        }
        if (cfg.event && won && !save.events[cfg.event.id]) {
            save.events[cfg.event.id] = true;
            z += cfg.event.rewardZ;
            metal += cfg.event.rewardMetal;
        }
    }
    if (cfg.mode === 'battle' && order.length > 2) {
        const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
        lines.unshift(order.map((o, i) => `${i + 1}. ${o.me ? '<b>' + esc(o.name) + '</b>' : esc(o.name)}${o.online ? ' 🌐' : ''}`).join('<br>'));
    }
    save.z += z;
    save.metal += metal;
    save.stats.races++;
    if (won && cfg.mode !== 'bonus') save.stats.wins++;
    save.stats.zEarned += z;
    save.stats.metalEarned += metal;
    persist();
    header();
    ui.center.textContent = timeout ? 'TIME UP!' : cfg.mode === 'bonus' ? 'FINISH!' : cfg.mode === 'battle' && order.length > 2 ? ORD(place) : won ? 'WIN!' : 'LOSE...';
    setTimeout(() => {
        if (state !== 'finished') return;
        ui.center.textContent = '';
        showResult({
            title,
            win: won,
            head: cfg.mode === 'bonus' ? `${collected.count} 個ゲット` : cfg.mode === 'battle' && order.length > 2 ? `${ORD(place)} / ${order.length}` : null,
            time: fmt(raceTime) + (timeTarget ? ` ／ 目標 ${timeTarget}s` : ''),
            best: isBest,
            z,
            metal,
            lines,
            next,
            noRetry: cfg.noRetry
        }, () => startRace(), () => backToMenu());
    }, 1600);
}

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
function updateCamera(dt) {
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    let desired;
    let look;
    if (camMode === 0) {
        desired = new THREE.Vector3(player.x - fx * 7.5, player.y + 2.8, player.z - fz * 7.5);
        look = new THREE.Vector3(player.x + fx * 4, player.y + 1, player.z + fz * 4);
    } else {
        desired = new THREE.Vector3(player.x + fx * 0.3, player.y + 1.15, player.z + fz * 0.3);
        look = new THREE.Vector3(player.x + fx * 10, player.y + 0.9, player.z + fz * 10);
    }
    camPos.lerp(desired, camMode === 0 ? Math.min(1, dt * 6) : 1);
    camLook.lerp(look, camMode === 0 ? Math.min(1, dt * 10) : 1);
    if (camPos.lengthSq() === 0 || camPos.distanceTo(desired) > 40) {
        camPos.copy(desired);
        camLook.copy(look);
    }
    camera.position.copy(camPos);
    if (player.hitWall > 3) {
        camera.position.x += (Math.random() - 0.5) * 0.3;
        camera.position.y += (Math.random() - 0.5) * 0.3;
    }
    camera.lookAt(camLook);
    const targetFov = 62 + player.speedKmh * 0.06;
    camera.fov += (targetFov - camera.fov) * 0.05;
    camera.updateProjectionMatrix();
}

function updateHud() {
    if (cfg.mode === 'bonus') {
        const left = Math.max(0, cfg.bonus.time - raceTime);
        ui.time.textContent = `残り ${left.toFixed(1)}s`;
        ui.time.style.color = left < 10 ? '#ff5040' : '';
        ui.best.textContent = `🪙 ${collected.z.toLocaleString()} Z  ⬡ ${collected.metal} M`;
    } else {
        ui.time.textContent = fmt(raceTime);
        ui.time.style.color = '';
        const b = save.best[course.idx];
        ui.best.textContent = b ? 'BEST ' + fmt(b) : '';
    }
    const span = track.finishIndex - track.startIndex;
    const prog = i => THREE.MathUtils.clamp((i - track.startIndex) / span, 0, 1) * 252;
    if (cfg.mode === 'battle') {
        const order = standings();
        const place = order.findIndex(o => o.me) + 1;
        ui.pos.innerHTML = `${place}<small>${ORD(place).slice(-2)}${order.length > 2 ? ' /' + order.length : ''}</small>`;
        rivals.forEach((r, k) => { dotFor('r' + k, k === 0 ? '#ffcc00' : '#f08a30').style.top = `${prog(r.index)}px`; });
        if (cfg.online) {
            for (const [key, e] of peers) if (racingPeer(e)) dotFor('p' + key, '#4fd2ff').style.top = `${prog(e.data.idx || 0)}px`;
        }
    }
    dotFor('me', '#fff').style.top = `${prog(player.index)}px`;
    drawGauge();
}

// menu backdrop: slow orbit over the last course
loadCourse(save.lastCourse || 0);
cfg = { courseIdx: course.idx, mode: 'battle', level: 0.87, cpus: 1 };
setupRace();
let orbit = 0;

initUI({
    startRace: c => startRace(c),
    online: {
        join: code => joinRoom(code),
        code: () => roomCode,
        members: () => lobbyMembers(),
        start: o => hostStart(o),
        onChange: fn => { onLobbyChange = fn; },
        available: () => !!db
    }
});

const timer = new THREE.Timer();
renderer.setAnimationLoop(time => {
    timer.update(time);
    const dt = Math.min(0.05, timer.getDelta());
    const noInput = { throttle: false, brake: true, left: false, right: false, handbrake: false };
    const rivalsGo = cfg.mode === 'battle';

    if (state === 'menu') {
        orbit += dt * 0.15;
        const p = player.group.position;
        camera.position.set(p.x + Math.sin(orbit) * 9, p.y + 3.5, p.z + Math.cos(orbit) * 9);
        camera.lookAt(p.x, p.y + 0.8, p.z);
    } else {
        if (state === 'countdown') {
            countdown -= dt;
            const n = Math.ceil(countdown - 1);
            ui.center.textContent = n > 3 ? 'READY' : n > 0 ? String(n) : 'GO!';
            const inp = readInput();
            player.rpm += ((inp.throttle ? 7000 : 900) - player.rpm) * 0.1;
            if (countdown <= 1) state = 'race';
            for (const r of rivals) r.update(dt, false);
        } else if (state === 'race') {
            if (countdown > 0) {
                countdown -= dt;
                if (countdown <= 0) ui.center.textContent = '';
            }
            raceTime += dt;
            player.update(dt, readInput());
            for (const r of rivals) {
                r.update(dt, rivalsGo);
                if (!r.finished && r.index >= track.finishIndex) { r.finished = true; r.finishTime = +raceTime.toFixed(3); }
            }
            if (player.hitWall > 2) playBump(player.hitWall);
            if (player.index >= track.finishIndex) finishRace();
            else if (cfg.mode === 'bonus' && raceTime >= cfg.bonus.time) finishRace(true);
        } else if (state === 'finished') {
            player.update(dt, noInput);
            for (const r of rivals) {
                r.update(dt, rivalsGo);
                if (!r.finished && r.index >= track.finishIndex) { r.finished = true; r.finishTime = +raceTime.toFixed(3); }
            }
        }
        updateCamera(dt);
        updateHud();
    }
    updateCoins(dt);
    publishPresence(dt);
    // VIP wind-up key spin
    player.group.traverse(o => { if (o.userData.spin) o.rotation.z += dt * 4; });
    if (rain.visible) {
        rain.position.set(camera.position.x, camera.position.y - 10, camera.position.z);
        const a = rainGeo.attributes.position.array;
        for (let i = 1; i < a.length; i += 3) {
            a[i] -= dt * 25;
            if (a[i] < 0) a[i] += 30;
        }
        rainGeo.attributes.position.needsUpdate = true;
    }
    updateAudio();
    updatePeers(dt);
    renderer.render(scene, camera);
});
