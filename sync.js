// Cross-device save sync.
// Auto: a secret "sync key" maps to one InstantDB record (last-write-wins by updatedAt).
// Manual: export / import a text code or a .json file.
import { init } from '@instantdb/core';
import { INSTANT_DB_APP_ID } from './instant_db_config.js';
import { save, setPersistHook, replaceSave } from './save.js';

export let db = null;
try {
    db = init({ appId: INSTANT_DB_APP_ID });
} catch (e) {
    db = null;
}

const LOCAL_ONLY = ['syncKey'];
let recordId = null;
let unsub = null;
let pushTimer = null;
let onApplied = () => {};
export const syncState = { status: 'off', last: 0, error: '' };
let notify = () => {};
export function onSyncStatus(fn) { notify = fn; }
export function onRemoteApplied(fn) { onApplied = fn; }
function setStatus(s, err = '') {
    syncState.status = s;
    syncState.error = err;
    notify();
}

// ---------- keys ----------
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newSyncKey() {
    const b = crypto.getRandomValues(new Uint8Array(12));
    const s = Array.from(b, v => ALPH[v % ALPH.length]).join('');
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
export function normalizeKey(k) {
    const s = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return s.length === 12 ? `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}` : null;
}
async function keyToUuid(key) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('omz-sync:' + key));
    const h = Array.from(new Uint8Array(buf).slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
    // RFC4122 v4-shaped
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ---------- payload ----------
function payload() {
    const o = {};
    for (const [k, v] of Object.entries(save)) if (!LOCAL_ONLY.includes(k)) o[k] = v;
    return o;
}
function applyData(data) {
    const keep = {};
    for (const k of LOCAL_ONLY) keep[k] = save[k];
    replaceSave({ ...data, ...keep });
    onApplied();
}

// ---------- auto sync ----------
function push() {
    if (!db || !recordId) return;
    const data = payload();
    try {
        db.transact(db.tx.omzsaves[recordId].update({ data: JSON.stringify(data), updatedAt: data.updatedAt || Date.now(), device: navigator.userAgent.slice(0, 80) }));
        syncState.last = Date.now();
        setStatus('synced');
    } catch (e) {
        setStatus('error', String(e && e.message || e));
    }
}
function schedulePush() {
    if (!recordId) return;
    clearTimeout(pushTimer);
    setStatus('pending');
    pushTimer = setTimeout(push, 2500);
}

// mode: 'auto' = newer side wins, 'pull' = take remote (linking a new device), 'push' = upload local
export async function startSync(key, mode = 'auto') {
    if (!db) { setStatus('error', 'オンラインに接続できません'); return false; }
    stopSync(false);
    recordId = await keyToUuid(key);
    save.syncKey = key;
    replaceSave(save); // persist key locally without bumping updatedAt
    setStatus('connecting');
    let first = true;
    return new Promise(resolve => {
        unsub = db.subscribeQuery({ omzsaves: { $: { where: { id: recordId } } } }, res => {
            if (res.error) { setStatus('error', res.error.message || 'error'); if (first) { first = false; resolve(false); } return; }
            if (!res.data) return;
            const rec = res.data.omzsaves && res.data.omzsaves[0];
            const remoteAt = rec ? rec.updatedAt || 0 : 0;
            const localAt = save.updatedAt || 0;
            if (first) {
                first = false;
                if (mode === 'pull') {
                    if (!rec) { setStatus('error', 'このキーのデータが見つかりません'); stopSync(true); resolve(false); return; }
                    applyData(JSON.parse(rec.data));
                    setStatus('synced');
                } else if (mode === 'push' || !rec || localAt > remoteAt) {
                    push();
                } else if (remoteAt > localAt) {
                    applyData(JSON.parse(rec.data));
                    setStatus('synced');
                } else {
                    setStatus('synced');
                }
                resolve(true);
                return;
            }
            // live update from another device
            if (rec && remoteAt > (save.updatedAt || 0)) {
                try { applyData(JSON.parse(rec.data)); setStatus('synced'); } catch (e) { /* ignore */ }
            }
        });
    });
}
export function stopSync(forget = true) {
    if (unsub) { try { unsub(); } catch (e) { /* ignore */ } }
    unsub = null;
    clearTimeout(pushTimer);
    recordId = null;
    if (forget) {
        delete save.syncKey;
        replaceSave(save);
        setStatus('off');
    }
}
export function syncNow() { if (recordId) push(); }

setPersistHook(() => schedulePush());
window.addEventListener('pagehide', () => { if (pushTimer && recordId) { clearTimeout(pushTimer); push(); } });

// ---------- manual export / import ----------
export function exportCode() {
    const json = JSON.stringify(payload());
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return 'OMZ1:' + btoa(bin);
}
export function importCode(text) {
    let t = String(text || '').trim();
    let data;
    if (t.startsWith('{')) data = JSON.parse(t);
    else {
        t = t.replace(/^OMZ1:/, '').replace(/\s+/g, '');
        const bin = atob(t);
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        data = JSON.parse(new TextDecoder().decode(bytes));
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.owned) || typeof data.z !== 'number') throw new Error('invalid');
    data.updatedAt = Date.now();
    applyData(data);
    if (recordId) push();
}
export function downloadSave() {
    const blob = new Blob([JSON.stringify(payload(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `omz-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// resume auto-sync on startup
if (save.syncKey) startSync(save.syncKey, 'auto');
