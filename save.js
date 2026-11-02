import { STARTER_ID, getCar } from './data.js';

const KEY = 'omz-save-v1';
function fresh() {
    return { v: 1, z: 30000, metal: 10, owned: [STARTER_ID], current: STARTER_ID, cars: {}, events: {}, best: {}, stats: { races: 0, wins: 0, zEarned: 0, metalEarned: 0 }, lastCourse: 0, story: 0, gp: {}, bonusDay: {}, name: 'DRIVER' + Math.floor(1000 + Math.random() * 9000) };
}
function load() {
    try {
        const s = JSON.parse(localStorage.getItem(KEY));
        if (s && s.v === 1) return Object.assign(fresh(), s);
    } catch (e) { /* ignore */ }
    return fresh();
}
export const save = load();
export function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}
export function carState(id) {
    if (!save.cars[id]) save.cars[id] = { upg: {}, parts: {}, lb: 0, dress: { body: null, wing: 0, neon: null, wheel: 0 } };
    return save.cars[id];
}
export function owns(id) { return save.owned.includes(String(id)); }
export function resetSave() {
    localStorage.removeItem(KEY);
    location.reload();
}
export function currentCar() { return getCar(save.current); }
