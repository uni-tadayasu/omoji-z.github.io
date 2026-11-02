import { getCar, CAR_COUNT, MAKERS, COUNTRY, VIP, getCourse, COURSE_COUNT, REGIONS, PER_REGION, TIME_LABEL, WEATHER_LABEL, weekId, weekEvents, weekEndsAt, hpPerTon, rankOf, BONUS, GRANDPRIX, GP_POINTS, STORY, CPU_NAMES } from './data.js';
import { save, persist, carState, owns } from './save.js';
import { UPGRADES, PARTS, MAX_LV, MAX_LB, upgradeCost, limitBreakCost, allMaxed, effectiveStats, tuneProgress } from './tuning.js';
import { syncState, onSyncStatus, onRemoteApplied, newSyncKey, normalizeKey, startSync, stopSync, syncNow, exportCode, importCode, downloadSave } from './sync.js';
import { carSVG, BODY_COLORS, PREMIUM_COLORS, WINGS, NEONS, WHEELS } from './visuals.js';

const $ = s => document.querySelector(s);
const fmt = n => Math.round(n).toLocaleString('ja-JP');
const RANKS = ['C', 'B', 'A', 'S'];
const LEVELS = [{ n: '入門', v: 0.8 }, { n: '標準', v: 0.87 }, { n: '上級', v: 0.93 }, { n: '鬼', v: 0.99 }];
let api;
let page = 'home';
const st = { shopPage: 0, country: 'ALL', maker: 'ALL', rank: 'ALL', q: '', sort: 'id', region: 0, coursePage: 0, course: save.lastCourse || 0, level: 1, mode: 'battle', cpus: 1, talk: null, onCpus: 3 };
let gpRun = null;
const rankOk = limit => limit === 'ANY' || RANKS.indexOf(carEff(save.current)) <= RANKS.indexOf(limit);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ----- Grand Prix runner -----
function startGP(gp) {
    gpRun = { gp, round: 0, pts: {} };
    const names = CPU_NAMES.slice(gp.idx % 6, gp.idx % 6 + 7);
    gpRun.names = names;
    for (const n of [save.name, ...names]) gpRun.pts[n] = 0;
    runGPRound();
}
function gpTable() {
    return Object.entries(gpRun.pts).sort((a, b) => b[1] - a[1]);
}
function runGPRound() {
    const { gp, round } = gpRun;
    api.startRace({
        courseIdx: gp.courses[round], mode: 'battle', cpus: 7, level: gp.level, cpuNames: gpRun.names, noRetry: true,
        title: `${gp.name} R${round + 1}/${gp.courses.length}`,
        reward: res => {
            res.order.forEach((n, i) => { gpRun.pts[n] = (gpRun.pts[n] || 0) + (GP_POINTS[i] || 0); });
            gpRun.round++;
            const last = gpRun.round >= gp.courses.length;
            const table = gpTable();
            const lines = ['<b>ポイントランキング</b><br>' + table.map(([n, p], i) => `${i + 1}. ${n === save.name ? '<b>' + esc(n) + '</b>' : esc(n)} — ${p}pt`).join('<br>')];
            let z = 3000 + Math.max(0, 8 - res.place) * 1500;
            let metal = res.place === 1 ? 1 : 0;
            if (!last) return { z, metal, lines, won: res.place <= 3, next: { label: `▶ 第${gpRun.round + 1}戦へ`, fn: runGPRound } };
            const champ = table[0][0] === save.name;
            const podium = table.findIndex(t => t[0] === save.name) + 1;
            if (champ) {
                const first = !save.gp[gp.id];
                save.gp[gp.id] = true;
                z += first ? gp.rewardZ : Math.round(gp.rewardZ * 0.3);
                metal += first ? gp.rewardMetal : Math.ceil(gp.rewardMetal * 0.2);
                lines.unshift(`🏆 <b>${esc(gp.name)} 優勝！</b>${first ? '（初優勝ボーナス）' : ''}`);
            } else {
                z += Math.round(gp.rewardZ * 0.15 / podium);
                lines.unshift(`総合 ${podium} 位`);
            }
            gpRun = null;
            return { z, metal, lines, won: champ };
        }
    });
}

function startStory(ch) {
    api.startRace({
        courseIdx: ch.courseIdx, mode: 'battle', cpus: 1, level: ch.level, cpuNames: [ch.rival], title: ch.title,
        reward: res => {
            const first = res.won && save.story === ch.id;
            if (first) save.story = ch.id + 1;
            const lines = [res.won ? `${esc(ch.rival)}「……完敗だ。次の峠で待ってる」` : `${esc(ch.rival)}「出直してきな」`];
            if (first && ch.id === STORY.length - 1) lines.push('🎉 ストーリー完結！ あなたが尾文字Zの頂点です');
            const nextCh = STORY[ch.id + 1];
            return {
                z: first ? ch.rewardZ : res.won ? Math.round(ch.rewardZ * 0.2) : 1500,
                metal: first ? ch.rewardMetal : res.won ? 1 : 0,
                lines,
                next: res.won && nextCh ? { label: `▶ ${nextCh.title}`, fn: () => { st.talk = nextCh.id; go('story'); } } : null
            };
        }
    });
}

function startBonus(b) {
    api.startRace({
        courseIdx: b.courseIdx, mode: 'bonus', level: 0.9, bonus: b, title: b.title,
        reward: res => {
            const c = res.collected;
            const perfect = c.count >= (c.total || 1) && !res.timeout;
            const z = c.z + (res.timeout ? 0 : 2000 * b.tier) + (perfect ? 10000 * b.tier : 0);
            const metal = c.metal + (perfect ? 3 * b.tier : 0);
            return { z, metal, lines: [`🪙 コイン ${fmt(c.z)} Z ／ ⬡ メタル ${c.metal} 個`, res.timeout ? '⏰ タイムアップ（完走ボーナスなし）' : `🏁 完走ボーナス +${fmt(2000 * b.tier)} Z`, perfect ? '✨ パーフェクト！ 特別ボーナス' : ''] };
        }
    });
}
function coinTotal(b) {
    const c = getCourse(b.courseIdx);
    const all = Math.floor((c.length - 40) / 8);
    return { all, metal: Math.round(all * b.metalRate) };
}

function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('on'), 2200);
}
function header() {
    $('#zBal').textContent = fmt(save.z) + ' Z';
    $('#mBal').textContent = fmt(save.metal) + ' M';
}
function rankChip(r) { return `<span class="rank r${r}">${r}</span>`; }
function carEff(id) { const s = effectiveStats(id); return rankOf((s.power / s.weight) * 1000); }

const PAGES = {
    home() {
        const car = getCar(save.current);
        const cs = carState(save.current);
        const evs = weekEvents();
        const done = evs.filter(e => save.events[e.id]).length;
        return `
        <section class="hero">
          <div class="heroText"><div class="eyebrow">TOUGE RACING / 夜の峠を制せ</div>
            <h1><img src="omz-icon.svg" alt="">尾文字<em>Z</em></h1>
            <p>愛車と走る、無数の峠。${fmt(CAR_COUNT + 2)}台の車両と${fmt(COURSE_COUNT)}本のコース、毎週自動で更新されるイベント。</p>
            <div class="row"><button class="primary big" data-go="race">▶ レーススタート</button><button class="ghost" data-go="events">🏁 今週のイベント (${done}/${evs.length})</button></div>
          </div>
          <div class="heroCar">${carSVG(car, cs.dress.body, cs.dress.wing)}<div class="cap">${car.maker} ${car.name} ${car.grade} ${rankChip(carEff(save.current))}</div></div>
        </section>
        <div class="grid4">
          <div class="stat"><small>レース数</small><b>${fmt(save.stats.races)}</b></div>
          <div class="stat"><small>勝利数</small><b>${fmt(save.stats.wins)}</b></div>
          <div class="stat"><small>所有車両</small><b>${fmt(save.owned.length)}</b></div>
          <div class="stat"><small>獲得メタル累計</small><b>${fmt(save.stats.metalEarned)} M</b></div>
        </div>
        <div class="tiles">
          ${[['story', '📕', 'ストーリーモード', `全${STORY.length}話・峠の頂点を目指せ`], ['gp', '🏆', 'グランプリ', `8台で競う全${GRANDPRIX.length}カップ`], ['bonus', '🪙', 'ボーナスステージ', `ZとMetalを稼ぐ${BONUS.length}ステージ`], ['online', '🌐', 'オンライン対戦', '最大8人＋CPU']].map(t => `<button class="tile" data-go="${t[0]}"><span>${t[1]}</span><b>${t[2]}</b><small>${t[3]}</small></button>`).join('')}
          ${[['race', '🏔', 'コース選択', `${fmt(COURSE_COUNT)}本の峠から選んで走る`], ['events', '📅', 'ウィークリーイベント', '毎週月曜0時に自動で入れ替わる'], ['garage', '🚗', 'ガレージ', '所有車の切替とスペック確認'], ['shop', '🛒', '車両ショップ', '日本車・外車をZで購入'], ['premium', '💎', 'プレミアムショップ', 'Metalで限定車やパーツ'], ['tune', '⚙', 'チューニング', 'パーツ強化・限界突破'], ['dress', '🎨', 'ドレスアップ', 'カラー・ウイング・ネオン'], ['howto', '📖', '遊び方', '操作方法とヒント']].map(t => `<button class="tile" data-go="${t[0]}"><span>${t[1]}</span><b>${t[2]}</b><small>${t[3]}</small></button>`).join('')}
        </div>
        <div class="panel news"><h3>お知らせ</h3>
          <p>📅 第${weekId()}週のイベントを公開中。残り ${remain()}</p>
          <p>💎 VIP限定車「イエロービートル」「ブラック・マリア」をプレミアムショップで販売中（各1台限り）。</p>
          <p>⬡ Metalはレースの勝利やイベントで手に入ります。</p></div>`;
    },
    race() {
        const r = st.region;
        const start = r * PER_REGION + st.coursePage * 20;
        const list = [];
        for (let i = start; i < Math.min(start + 20, (r + 1) * PER_REGION); i++) list.push(getCourse(i));
        const c = getCourse(st.course);
        return `<h2 class="pt">コース選択 <small>${fmt(COURSE_COUNT)}本</small></h2>
        <div class="split">
          <div>
            <div class="row"><select id="regionSel">${REGIONS.map((n, i) => `<option value="${i}" ${i === r ? 'selected' : ''}>${n}（${PER_REGION}本）</option>`).join('')}</select>
            <button class="ghost" id="randCourse">🎲 ランダム</button></div>
            <div class="clist">${list.map(k => `<button class="citem ${k.idx === st.course ? 'sel' : ''}" data-course="${k.idx}"><b>${k.name}</b><small>${(k.length / 1000).toFixed(2)}km ・ ${'★'.repeat(k.stars)}${'☆'.repeat(5 - k.stars)} ・ ${TIME_LABEL[k.time]}/${WEATHER_LABEL[k.weather]}</small></button>`).join('')}</div>
            <div class="pager"><button class="ghost" id="cPrev" ${st.coursePage ? '' : 'disabled'}>◀</button><span>${st.coursePage + 1} / ${PER_REGION / 20}</span><button class="ghost" id="cNext" ${st.coursePage < PER_REGION / 20 - 1 ? '' : 'disabled'}>▶</button></div>
          </div>
          <div class="panel">
            <div class="eyebrow">COURSE #${c.idx + 1}</div><h3>${c.name}</h3>
            <div class="kv"><span>全長</span><b>${(c.length / 1000).toFixed(2)} km</b><span>標高差</span><b>${c.drop} m</b><span>難易度</span><b>${'★'.repeat(c.stars)}</b><span>時間帯</span><b>${TIME_LABEL[c.time]}</b><span>天候</span><b>${WEATHER_LABEL[c.weather]}${c.weather === 'rain' ? '（グリップ低下）' : ''}</b><span>自己ベスト</span><b>${save.best[c.idx] ? save.best[c.idx].toFixed(3) + ' 秒' : '—'}</b></div>
            <div class="sectionT">モード</div>
            <div class="seg">${[['battle', '⚔ 峠バトル'], ['time', '⏱ タイムアタック']].map(m => `<button data-mode="${m[0]}" class="${st.mode === m[0] ? 'on' : ''}">${m[1]}</button>`).join('')}</div>
            ${st.mode === 'battle' ? `<div class="sectionT">CPUの数（最大7台＝8台立て）</div>
            <div class="seg">${[1, 2, 3, 5, 7].map(n => `<button data-cpus="${n}" class="${st.cpus === n ? 'on' : ''}">${n}台</button>`).join('')}</div>` : ''}
            <div class="sectionT">ライバルの強さ</div>
            <div class="seg">${LEVELS.map((l, i) => `<button data-level="${i}" class="${st.level === i ? 'on' : ''}">${l.n}</button>`).join('')}</div>
            <div class="sectionT">使用車両</div><div class="mini">${carSVG(getCar(save.current), carState(save.current).dress.body)}<span>${getCar(save.current).maker} ${getCar(save.current).name} ${rankChip(carEff(save.current))}</span></div>
            <button class="primary big wide" id="goRace">RACE START ▶</button>
          </div>
        </div>`;
    },
    events() {
        const evs = weekEvents();
        const myRank = carEff(save.current);
        return `<h2 class="pt">ウィークリーイベント <small>第${weekId()}週 ・ 更新まで ${remain()}</small></h2>
        <p class="note">イベントは毎週月曜0:00（日本時間）に自動生成されます。各イベントの報酬は週1回受け取れます。</p>
        <div class="evgrid">${evs.map(e => {
            const c = getCourse(e.courseIdx);
            const ok = e.limit === 'ANY' || RANKS.indexOf(myRank) <= RANKS.indexOf(e.limit);
            const done = save.events[e.id];
            return `<div class="ev ${e.boss ? 'boss' : ''} ${done ? 'done' : ''}"><div class="evh"><b>${e.title}</b>${done ? '<span class="ok">✔ クリア</span>' : ''}</div>
            <small>${c.name}<br>${(c.length / 1000).toFixed(2)}km ・ ${TIME_LABEL[c.time]}/${WEATHER_LABEL[c.weather]}</small>
            <div class="evr"><span>${e.type === 'battle' ? '⚔ バトル' : `⏱ ${e.target}秒以内`}</span><span>制限 ${e.limit === 'ANY' ? 'なし' : e.limit + 'ランク以下'}</span></div>
            <div class="evr"><span class="z">+${fmt(e.rewardZ)} Z</span><span class="m">+${e.rewardMetal} M</span></div>
            <button class="primary wide" data-event="${e.id}" ${ok ? '' : 'disabled'}>${ok ? '挑戦する' : `ランク${myRank}は参加不可`}</button></div>`;
        }).join('')}</div>`;
    },
    garage() {
        const cur = getCar(save.current);
        const s = effectiveStats(save.current);
        const cs = carState(save.current);
        return `<h2 class="pt">ガレージ <small>${save.owned.length}台所有</small></h2>
        <div class="split">
          <div class="cards">${save.owned.map(id => { const c = getCar(id); const d = carState(id).dress; return `<button class="card ${id === save.current ? 'sel' : ''}" data-select="${id}">${carSVG(c, d.body, d.wing)}<b>${c.name}</b><small>${c.maker} ${c.grade}</small>${rankChip(carEff(id))}${carState(id).lb ? `<span class="lb">★${carState(id).lb}</span>` : ''}</button>`; }).join('')}</div>
          <div class="panel">${carSVG(cur, cs.dress.body, cs.dress.wing)}<h3>${cur.maker} ${cur.name} <small>${cur.grade}</small></h3>
            <div class="kv"><span>国</span><b>${COUNTRY[cur.country]}</b><span>年式</span><b>${cur.year}</b><span>ボディ</span><b>${cur.body}</b><span>駆動</span><b>${cur.drive}</b><span>最高出力</span><b>${fmt(s.power)} PS <small>(純正 ${cur.power})</small></b><span>車重</span><b>${fmt(s.weight)} kg</b><span>パワーウェイト</span><b>${Math.round(s.power / s.weight * 1000)} PS/t</b><span>最高速</span><b>${s.top} km/h</b><span>グリップ</span><b>${s.grip}</b><span>限界突破</span><b>★${s.lb}/${MAX_LB}</b><span>チューニング</span><b>${Math.round(tuneProgress(save.current) * 100)}%</b></div>
            <div class="row"><button class="primary" data-go="tune">⚙ チューニング</button><button class="ghost" data-go="dress">🎨 ドレスアップ</button><button class="ghost" data-go="race">▶ 走る</button></div></div>
        </div>`;
    },
    shop() {
        const ids = filteredCars();
        const per = 24;
        const pages = Math.max(1, Math.ceil(ids.length / per));
        st.shopPage = Math.min(st.shopPage, pages - 1);
        const slice = ids.slice(st.shopPage * per, st.shopPage * per + per);
        const makers = MAKERS.filter(m => st.country === 'ALL' || m[1] === st.country);
        return `<h2 class="pt">車両ショップ <small>${fmt(ids.length)}台ヒット</small></h2>
        <div class="filters"><input id="q" placeholder="車名・メーカー検索" value="${st.q}">
          <select id="fCountry"><option value="ALL">全ての国</option>${Object.entries(COUNTRY).map(([k, v]) => `<option value="${k}" ${st.country === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <select id="fMaker"><option value="ALL">全メーカー</option>${makers.map(m => `<option ${st.maker === m[0] ? 'selected' : ''}>${m[0]}</option>`).join('')}</select>
          <select id="fRank"><option value="ALL">全ランク</option>${RANKS.map(r => `<option ${st.rank === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
          <select id="fSort"><option value="id" ${st.sort === 'id' ? 'selected' : ''}>メーカー順</option><option value="cheap" ${st.sort === 'cheap' ? 'selected' : ''}>安い順</option><option value="power" ${st.sort === 'power' ? 'selected' : ''}>馬力順</option></select></div>
        <div class="cards">${slice.map(id => { const c = getCar(id); const own = owns(id); return `<div class="card">${carSVG(c)}<b>${c.name}</b><small>${c.maker} ・ ${c.grade} ・ ${c.year}</small><small>${c.body} ${c.drive} ・ ${c.power}PS ・ ${c.weight}kg</small>${rankChip(c.rank)}<button class="${own ? 'ghost' : 'primary'} wide" data-buy="${id}" ${own ? 'disabled' : ''}>${own ? '所有済み' : fmt(c.price) + ' Z'}</button></div>`; }).join('') || '<p class="note">該当なし</p>'}</div>
        <div class="pager"><button class="ghost" id="sPrev" ${st.shopPage ? '' : 'disabled'}>◀</button><span>${st.shopPage + 1} / ${pages}</span><button class="ghost" id="sNext" ${st.shopPage < pages - 1 ? '' : 'disabled'}>▶</button></div>`;
    },
    premium() {
        return `<h2 class="pt">プレミアムショップ <small>Metal ⬡ ${fmt(save.metal)}</small></h2>
        <p class="note">Metalはレース勝利（+1〜3）やウィークリーイベント（最大+40）で入手できる上位通貨です。</p>
        <h3 class="sub">👑 VIP限定車両（お一人様1台限り）</h3>
        <div class="vipgrid">${Object.values(VIP).map(v => { const own = owns(v.id); return `<div class="vip ${v.id}">${carSVG(v)}<div><div class="eyebrow">VIP LIMITED ・ 限定1台</div><h3>${v.name}</h3><p>${v.desc}</p><div class="kv"><span>出力</span><b>${v.power} PS</b><span>車重</span><b>${v.weight} kg</b><span>駆動</span><b>${v.drive}</b><span>ランク</span><b>${rankChip('S')}</b></div><button class="${own ? 'ghost' : 'primary'} wide" data-vip="${v.id}" ${own ? 'disabled' : ''}>${own ? '所有済み（SOLD OUT）' : `⬡ ${v.priceMetal} Metal で購入`}</button></div></div>`; }).join('')}</div>
        <h3 class="sub">💱 Metal → Z 両替</h3>
        <div class="cards">${[[5, 30000], [20, 140000], [60, 480000]].map(([m, z]) => `<div class="card"><b>${fmt(z)} Z</b><small>⬡ ${m} Metal</small><button class="primary wide" data-ex="${m}:${z}">両替する</button></div>`).join('')}</div>
        <h3 class="sub">🔧 エンジン内部パーツ・限界突破</h3>
        <p class="note">鍛造ピストン、クランク、カム、ビッグタービン、エンジン換装などはチューニング画面からMetalで購入できます。</p>
        <button class="primary" data-go="tune">⚙ チューニングへ</button>`;
    },
    tune() {
        const id = save.current;
        const car = getCar(id);
        const cs = carState(id);
        const s = effectiveStats(id);
        const maxed = allMaxed(id);
        return `<h2 class="pt">チューニング <small>${car.maker} ${car.name}</small></h2>
        <div class="tunehead panel"><div class="kv"><span>出力</span><b>${fmt(s.power)} PS</b><span>車重</span><b>${fmt(s.weight)} kg</b><span>最高速</span><b>${s.top} km/h</b><span>グリップ</span><b>${s.grip}</b><span>ランク</span><b>${rankChip(carEff(id))}</b></div>
          <div class="prog"><i style="width:${tuneProgress(id) * 100}%"></i></div><small>進捗 ${Math.round(tuneProgress(id) * 100)}%（全パーツMAXで限界突破が解放）</small></div>
        <h3 class="sub">🔩 パフォーマンスパーツ（Z）</h3>
        <div class="tgrid">${UPGRADES.map(u => { const lv = cs.upg[u.k] || 0; return `<div class="tcard"><b>${u.n}</b><div class="dots">${Array.from({ length: MAX_LV }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div><small>Lv.${lv}/${MAX_LV}</small><button class="primary wide" data-upg="${u.k}" ${lv >= MAX_LV ? 'disabled' : ''}>${lv >= MAX_LV ? 'MAX' : fmt(upgradeCost(car, lv)) + ' Z'}</button></div>`; }).join('')}</div>
        <h3 class="sub">🧠 エンジン内部パーツ（Metal）</h3>
        <div class="tgrid">${PARTS.map(p => { const has = cs.parts[p.k]; return `<div class="tcard metal"><b>${p.n}</b><small>出力 +${Math.round((p.e.pw || 0) * 100)}%</small><button class="${has ? 'ghost' : 'primary'} wide" data-part="${p.k}" ${has ? 'disabled' : ''}>${has ? '装着済み' : '⬡ ' + p.m + ' M'}</button></div>`; }).join('')}</div>
        <div class="panel lbpanel ${maxed ? 'ready' : ''}"><h3>💥 限界突破 ★${cs.lb}/${MAX_LB}</h3><p>全パフォーマンスパーツLv.MAX＋全内部パーツ装着で解放。1段階ごとに出力+5%・グリップ+2.5%・最高速+2%。</p>
          <button class="primary wide" id="lbBtn" ${maxed && cs.lb < MAX_LB ? '' : 'disabled'}>${cs.lb >= MAX_LB ? '限界突破 MAX' : maxed ? `⬡ ${limitBreakCost(cs.lb)} M で限界突破` : '条件未達成'}</button></div>`;
    },
    dress() {
        const id = save.current;
        const car = getCar(id);
        const d = carState(id).dress;
        d.owned = d.owned || [];
        return `<h2 class="pt">ドレスアップ <small>${car.maker} ${car.name}</small></h2>
        <div class="split"><div class="panel center">${carSVG(car, d.body, d.wing)}${car.vip ? '<p class="note">VIP車は専用ボディのためカラー変更は外装パーツのみ反映されます。</p>' : ''}</div>
        <div class="panel">
          <div class="sectionT">ボディカラー（無料）</div><div class="sw">${BODY_COLORS.map(c => `<button style="background:${c}" class="${d.body === c ? 'on' : ''}" data-color="${c}"></button>`).join('')}<button class="reset" data-color="">純正</button></div>
          <div class="sectionT">プレミアムカラー（Metal）</div><div class="sw">${PREMIUM_COLORS.map(p => `<button style="background:${p.c}" class="${d.body === p.c ? 'on' : ''}" data-pcolor="${p.c}" title="${p.n}">${d.owned.includes(p.c) ? '' : '⬡'}</button>`).join('')}</div>
          <small class="note">${PREMIUM_COLORS.map(p => `${p.n} ${p.m}M`).join(' ／ ')}</small>
          <div class="sectionT">リアウイング（各3,000 Z）</div><div class="seg">${WINGS.map((w, i) => `<button class="${d.wing === i ? 'on' : ''}" data-wing="${i}">${w}</button>`).join('')}</div>
          <div class="sectionT">アンダーネオン（各5,000 Z）</div><div class="sw">${NEONS.map(n => `<button style="background:${n || '#222'}" class="${d.neon === n ? 'on' : ''}" data-neon="${n || ''}">${n ? '' : '×'}</button>`).join('')}</div>
          <div class="sectionT">ホイールカラー（無料）</div><div class="seg">${WHEELS.map((w, i) => `<button class="${d.wheel === i ? 'on' : ''}" data-wheel="${i}">${w.n}</button>`).join('')}</div>
        </div></div>`;
    },
    story() {
        if (st.talk != null) {
            const ch = STORY[st.talk];
            return `<h2 class="pt">ストーリーモード <small>${ch.title}</small></h2>
            <div class="panel talk"><div class="eyebrow">VS ${esc(ch.rival)} ・ ${getCourse(ch.courseIdx).name}</div>
            ${ch.lines.map(l => `<p class="line">${esc(l)}</p>`).join('')}
            <div class="row"><button class="primary big" data-story="${ch.id}">⚔ バトル開始</button><button class="ghost" data-talk="">戻る</button></div></div>`;
        }
        return `<h2 class="pt">ストーリーモード <small>${Math.min(save.story, STORY.length)}/${STORY.length} 話クリア</small></h2>
        <p class="note">峠に現れる走り屋たちを一人ずつ倒し、伝説の頂点を目指せ。初回クリアで大量のZとMetal。</p>
        <div class="evgrid">${STORY.map(ch => {
            const locked = ch.id > save.story;
            const done = ch.id < save.story;
            const c = getCourse(ch.courseIdx);
            return `<div class="ev ${done ? 'done' : ''} ${ch.id === STORY.length - 1 ? 'boss' : ''}"><div class="evh"><b>${ch.title}</b>${done ? '<span class="ok">✔ クリア</span>' : ''}</div>
            <small>VS ${esc(ch.rival)}<br>${c.name} ・ ${TIME_LABEL[c.time]}/${WEATHER_LABEL[c.weather]}</small>
            <div class="evr"><span class="z">+${fmt(ch.rewardZ)} Z</span><span class="m">+${ch.rewardMetal} M</span></div>
            <button class="primary wide" data-talk="${ch.id}" ${locked ? 'disabled' : ''}>${locked ? '🔒 前の話をクリア' : done ? 'もう一度' : '▶ 挑む'}</button></div>`;
        }).join('')}</div>`;
    },
    gp() {
        return `<h2 class="pt">グランプリ <small>${Object.keys(save.gp).length}/${GRANDPRIX.length} 優勝</small></h2>
        <p class="note">CPU7台を加えた8台で4〜5戦を連続で走り、順位ポイント（${GP_POINTS.join('-')}）の合計で総合優勝を争います。</p>
        <div class="evgrid">${GRANDPRIX.map(gp => {
            const ok = rankOk(gp.limit);
            const done = save.gp[gp.id];
            return `<div class="ev ${done ? 'done' : ''} ${gp.idx >= 10 ? 'boss' : ''}"><div class="evh"><b>🏆 ${gp.name}</b>${done ? '<span class="ok">👑 優勝</span>' : ''}</div>
            <small>${gp.courses.map((ci, i) => `R${i + 1} ${getCourse(ci).name}`).join('<br>')}</small>
            <div class="evr"><span>8台 ・ 全${gp.courses.length}戦</span><span>制限 ${gp.limit === 'ANY' ? 'なし' : gp.limit + 'ランク以下'}</span></div>
            <div class="evr"><span class="z">+${fmt(gp.rewardZ)} Z</span><span class="m">+${gp.rewardMetal} M</span></div>
            <button class="primary wide" data-gp="${gp.idx}" ${ok ? '' : 'disabled'}>${ok ? '▶ エントリー' : 'ランク超過'}</button></div>`;
        }).join('')}</div>`;
    },
    bonus() {
        return `<h2 class="pt">ボーナスステージ <small>${BONUS.length}ステージ</small></h2>
        <p class="note">制限時間内にコース上のコイン🪙（Z）とメタル⬡（Metal）を集めよう。完走ボーナスと、全部取ればパーフェクトボーナス！何度でも挑戦できます。</p>
        <div class="evgrid">${BONUS.map(b => {
            const c = getCourse(b.courseIdx);
            return `<div class="ev bonus-${b.kind}"><div class="evh"><b>${b.title}</b></div>
            <small>${c.name}<br>${(c.length / 1000).toFixed(2)}km ・ 制限 ${b.time}秒</small>
            <div class="evr"><span class="z">🪙 1枚 ${fmt(b.coinZ)} Z</span><span class="m">⬡ 出現率 ${Math.round(b.metalRate * 100)}%</span></div>
            <button class="primary wide" data-bonus="${b.idx}">▶ スタート</button></div>`;
        }).join('')}</div>`;
    },
    online() {
        const on = api.online;
        const code = on.code();
        const inRoom = code !== 'public';
        const c = getCourse(st.course);
        const n = on.members().length;
        const maxCpu = Math.max(0, 8 - n);
        st.onCpus = Math.min(st.onCpus, maxCpu);
        if (!on.available()) return `<h2 class="pt">オンライン対戦</h2><p class="note">オンラインサーバーに接続できませんでした。</p>`;
        return `<h2 class="pt">オンライン対戦 <small>最大8人 ＋ CPU</small></h2>
        <div class="split"><div class="panel">
          <div class="sectionT">ドライバー名</div><input id="nameIn" maxlength="12" value="${esc(save.name)}">
          <div class="sectionT">ルームコード</div>
          <div class="row"><input id="roomCode" maxlength="8" placeholder="例: TOUGE1" value="${inRoom ? esc(code) : ''}"><button class="ghost" id="newRoom">🎲 作成</button><button class="primary" id="joinRoom">参加</button></div>
          ${inRoom ? `<p class="note">ルーム <b>${esc(code)}</b> に参加中 <button class="ghost" id="copyRoom">🔗 招待URLをコピー</button> <button class="ghost" id="leaveRoom">退出</button></p>` : '<p class="note">同じルームコードを入力した人同士で対戦できます。</p>'}
          <div class="sectionT">メンバー（<span id="memCount">${n}</span>/8）</div><div id="members">${membersHTML()}</div>
        </div>
        <div class="panel"><div class="eyebrow">COURSE #${c.idx + 1}</div><h3>${c.name}</h3>
          <small>${(c.length / 1000).toFixed(2)}km ・ ${TIME_LABEL[c.time]}/${WEATHER_LABEL[c.weather]}</small>
          <div class="row"><button class="ghost" id="randCourse">🎲 ランダム</button><button class="ghost" data-go="race">コース選択へ</button></div>
          <div class="sectionT">CPUを追加（合計8台まで）</div>
          <div class="seg">${Array.from({ length: maxCpu + 1 }, (_, i) => `<button data-oncpus="${i}" class="${st.onCpus === i ? 'on' : ''}">${i}</button>`).join('')}</div>
          <div class="sectionT">CPUの強さ</div>
          <div class="seg">${LEVELS.map((l, i) => `<button data-level="${i}" class="${st.level === i ? 'on' : ''}">${l.n}</button>`).join('')}</div>
          <button class="primary big wide" id="onStart" ${inRoom ? '' : 'disabled'}>${inRoom ? '🚦 全員でスタート' : 'ルームに参加してください'}</button>
          <p class="note">誰かがスタートを押すと、ルームの全員が同じコースで同時にカウントダウンを始めます。</p>
        </div></div>`;
    },
    sync() {
        const key = save.syncKey;
        const S = { off: '⚪ オフ', connecting: '🟡 接続中…', pending: '🟡 送信待ち', synced: '🟢 同期済み', error: '🔴 エラー' };
        return `<h2 class="pt">データ連携 <small>スマホ・PC・タブレット間で引き継ぎ</small></h2>
        <div class="split">
          <div class="panel">
            <h3>☁ 自動連携（おすすめ）</h3>
            <p class="note">「連携キー」を発行すると、進行状況が自動でクラウドに保存され、同じキーを入力した他の端末とリアルタイムに同期されます。</p>
            <div class="kv"><span>状態</span><b id="syncStatus">${S[syncState.status] || syncState.status}${syncState.error ? ' ' + esc(syncState.error) : ''}</b></div>
            ${key ? `<div class="sectionT">あなたの連携キー</div>
              <div class="synckey">${esc(key)}</div>
              <p class="note">⚠ このキーを知っている人はデータを読み書きできます。他人に教えないでください。</p>
              <div class="row"><button class="primary" id="copyKey">📋 キーをコピー</button><button class="ghost" id="syncNow">⟳ 今すぐ同期</button><button class="ghost" id="syncOff">連携を解除</button></div>`
            : `<button class="primary big wide" id="syncCreate">🔑 連携キーを発行（この端末のデータをアップロード）</button>`}
            <div class="sectionT">別の端末のデータをこの端末に読み込む</div>
            <div class="row"><input id="syncKeyIn" placeholder="XXXX-XXXX-XXXX" maxlength="14"><button class="primary" id="syncLink">連携する</button></div>
            <p class="note">※ 連携すると、この端末のデータはクラウドのデータで上書きされます。</p>
          </div>
          <div class="panel">
            <h3>✍ 手動連携（引き継ぎコード）</h3>
            <p class="note">オフラインでも使えます。コードをコピーして、別の端末の「読み込み」に貼り付けてください。</p>
            <div class="row"><button class="primary" id="expCopy">📋 引き継ぎコードをコピー</button><button class="ghost" id="expFile">💾 ファイルで保存</button></div>
            <div class="sectionT">コード / ファイルから読み込み</div>
            <textarea id="impText" rows="4" placeholder="OMZ1:... を貼り付け"></textarea>
            <div class="row"><button class="primary" id="impBtn">読み込む</button><label class="ghost filebtn">📂 ファイルを選択<input type="file" id="impFile" accept=".json,application/json" hidden></label></div>
            <p class="note">※ 読み込むと現在のデータは上書きされます。自動連携中なら他の端末にも反映されます。</p>
          </div>
        </div>`;
    },
    howto() {
        return `<h2 class="pt">遊び方</h2><div class="panel howto">
        <h3>操作方法（PC）</h3><p><kbd>W</kbd>/<kbd>↑</kbd> アクセル　<kbd>S</kbd>/<kbd>↓</kbd> ブレーキ・バック　<kbd>A</kbd><kbd>D</kbd>/<kbd>←</kbd><kbd>→</kbd> ハンドル</p>
        <p><kbd>Space</kbd> サイドブレーキ（ドリフト）　<kbd>C</kbd> カメラ切替　<kbd>R</kbd> リスタート　<kbd>M</kbd> ミュート　<kbd>Esc</kbd> メニューへ戻る</p>
        <h3>操作方法（スマホ）</h3><p>画面下の ◀ ▶ でハンドル、GAS / BRAKE、DRIFT ボタンでサイドブレーキ。横画面がおすすめです。</p>
        <h3>お金の稼ぎ方</h3><p>レースに勝つとZとMetalがもらえます。負けても完走すればZの一部がもらえます。ウィークリーイベントは高額報酬です。</p>
        <h3>強化</h3><p>Zでパフォーマンスパーツ、Metalでエンジン内部パーツを購入。すべてMAXにすると限界突破（★1〜★10）が可能になります。</p>
        <h3>セーブ</h3><p>進行状況はこの端末のブラウザに自動保存されます。</p>
        <button class="ghost" id="resetSave">⚠ セーブデータを初期化</button></div>`;
    }
};

function remain() {
    const ms = weekEndsAt(weekId()) - Date.now();
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    return `${d}日${h}時間`;
}

function filteredCars() {
    const out = [];
    const q = st.q.trim().toUpperCase();
    for (let i = 0; i < CAR_COUNT; i++) {
        const mk = MAKERS[Math.floor(i / 250)];
        if (st.country !== 'ALL' && mk[1] !== st.country) { i += 249 - (i % 250); continue; }
        if (st.maker !== 'ALL' && mk[0] !== st.maker) { i += 249 - (i % 250); continue; }
        if (st.rank === 'ALL' && !q && st.sort === 'id') { out.push(String(i)); continue; }
        const c = getCar(i);
        if (st.rank !== 'ALL' && c.rank !== st.rank) continue;
        if (q && !(c.name.toUpperCase().includes(q) || c.maker.includes(q))) continue;
        out.push(String(i));
    }
    if (st.sort === 'cheap') out.sort((a, b) => getCar(a).price - getCar(b).price);
    if (st.sort === 'power') out.sort((a, b) => getCar(b).power - getCar(a).power);
    return out;
}

function spend(z, m) {
    if (save.z < z || save.metal < m) { toast(z ? 'Zが足りません' : 'Metalが足りません'); return false; }
    save.z -= z;
    save.metal -= m;
    persist();
    header();
    return true;
}

function render() {
    $('#content').innerHTML = PAGES[page]();
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.go === page));
    header();
}
export function go(p) {
    page = p;
    render();
    $('#site').scrollTop = 0;
}

function onClick(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.go) return go(d.go);
    if (d.course) { st.course = +d.course; return render(); }
    if (d.mode) { st.mode = d.mode; return render(); }
    if (d.level) { st.level = +d.level; return render(); }
    if (b.id === 'randCourse') { st.course = Math.floor(Math.random() * COURSE_COUNT); st.region = Math.floor(st.course / PER_REGION); st.coursePage = Math.floor((st.course % PER_REGION) / 20); return render(); }
    if (b.id === 'cPrev') { st.coursePage--; return render(); }
    if (b.id === 'cNext') { st.coursePage++; return render(); }
    if (b.id === 'sPrev') { st.shopPage--; return render(); }
    if (b.id === 'sNext') { st.shopPage++; return render(); }
    if (b.id === 'goRace') {
        save.lastCourse = st.course;
        persist();
        return api.startRace({ courseIdx: st.course, mode: st.mode, level: LEVELS[st.level].v, cpus: st.cpus });
    }
    if (d.cpus) { st.cpus = +d.cpus; return render(); }
    if (d.oncpus !== undefined) { st.onCpus = +d.oncpus; return render(); }
    if (d.talk !== undefined) { st.talk = d.talk === '' ? null : +d.talk; return render(); }
    if (d.story !== undefined) { const ch = STORY[+d.story]; st.talk = null; return startStory(ch); }
    if (d.gp !== undefined) { const gp = GRANDPRIX[+d.gp]; if (!rankOk(gp.limit)) return toast('ランク制限で参加できません'); return startGP(gp); }
    if (d.bonus !== undefined) return startBonus(BONUS[+d.bonus]);
    if (b.id === 'joinRoom') {
        const code = ($('#roomCode').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        if (!code) return toast('ルームコードを入力してください');
        const n = $('#nameIn').value.trim().slice(0, 12);
        if (n) { save.name = n; persist(); }
        if (!api.online.join(code)) return toast('オンラインに接続できません');
        history.replaceState(null, '', '?room=' + code);
        toast(`ルーム ${code} に参加しました`);
        return render();
    }
    if (b.id === 'newRoom') { $('#roomCode').value = Math.random().toString(36).slice(2, 7).toUpperCase(); return; }
    if (b.id === 'leaveRoom') { api.online.join('public'); history.replaceState(null, '', location.pathname); return render(); }
    if (b.id === 'copyRoom') {
        const url = location.origin + location.pathname + '?room=' + api.online.code();
        navigator.clipboard?.writeText(url).then(() => toast('招待URLをコピーしました'), () => toast(url));
        return;
    }
    if (b.id === 'onStart') {
        save.lastCourse = st.course;
        persist();
        return api.online.start({ courseIdx: st.course, cpus: st.onCpus, level: LEVELS[st.level].v });
    }
    if (b.id === 'syncCreate') { const k = newSyncKey(); startSync(k, 'push').then(ok => { toast(ok ? '連携キーを発行しました' : '接続に失敗しました'); render(); }); return render(); }
    if (b.id === 'copyKey') { navigator.clipboard?.writeText(save.syncKey).then(() => toast('キーをコピーしました'), () => toast(save.syncKey)); return; }
    if (b.id === 'syncNow') { syncNow(); return toast('同期しました'); }
    if (b.id === 'syncOff') { if (confirm('連携を解除しますか？（この端末のデータは残ります）')) { stopSync(true); render(); } return; }
    if (b.id === 'syncLink') {
        const k = normalizeKey($('#syncKeyIn').value);
        if (!k) return toast('キーの形式が正しくありません');
        if (!confirm('この端末のデータをクラウドのデータで上書きします。よろしいですか？')) return;
        startSync(k, 'pull').then(ok => { toast(ok ? '✅ データを引き継ぎました' : '連携に失敗しました'); render(); });
        return;
    }
    if (b.id === 'expCopy') { const c = exportCode(); navigator.clipboard?.writeText(c).then(() => toast('引き継ぎコードをコピーしました'), () => { $('#impText').value = c; toast('下の欄のコードをコピーしてください'); }); return; }
    if (b.id === 'expFile') return downloadSave();
    if (b.id === 'impBtn') {
        const t = $('#impText').value;
        if (!t.trim()) return toast('コードを貼り付けてください');
        if (!confirm('現在のデータを上書きします。よろしいですか？')) return;
        try { importCode(t); toast('✅ 読み込みました'); render(); } catch (err) { toast('コードが正しくありません'); }
        return;
    }
    if (d.event) {
        const ev = weekEvents().find(x => x.id === d.event);
        return api.startRace({ courseIdx: ev.courseIdx, mode: ev.type, level: ev.level, event: ev });
    }
    if (d.select) { save.current = d.select; persist(); return render(); }
    if (d.buy) {
        const c = getCar(d.buy);
        if (spend(c.price, 0)) { save.owned.push(c.id); save.current = c.id; persist(); toast(`${c.name} を購入しました！`); render(); }
        return;
    }
    if (d.vip) {
        const v = VIP[d.vip];
        if (owns(v.id)) return;
        if (spend(0, v.priceMetal)) { save.owned.push(v.id); save.current = v.id; persist(); toast(`👑 ${v.name} があなたのガレージに！`); render(); }
        return;
    }
    if (d.ex) {
        const [m, z] = d.ex.split(':').map(Number);
        if (spend(0, m)) { save.z += z; persist(); toast(`+${fmt(z)} Z`); render(); }
        return;
    }
    if (d.upg) {
        const cs = carState(save.current);
        const lv = cs.upg[d.upg] || 0;
        if (spend(upgradeCost(getCar(save.current), lv), 0)) { cs.upg[d.upg] = lv + 1; persist(); render(); }
        return;
    }
    if (d.part) {
        const p = PARTS.find(x => x.k === d.part);
        if (spend(0, p.m)) { carState(save.current).parts[p.k] = true; persist(); toast(`${p.n} を組み込みました`); render(); }
        return;
    }
    if (b.id === 'lbBtn') {
        const cs = carState(save.current);
        if (spend(0, limitBreakCost(cs.lb))) { cs.lb++; persist(); toast(`💥 限界突破 ★${cs.lb}！`); render(); }
        return;
    }
    const dress = carState(save.current).dress;
    if (d.color !== undefined) { dress.body = d.color || null; persist(); return render(); }
    if (d.pcolor) {
        dress.owned = dress.owned || [];
        const p = PREMIUM_COLORS.find(x => x.c === d.pcolor);
        if (!dress.owned.includes(p.c)) { if (!spend(0, p.m)) return; dress.owned.push(p.c); }
        dress.body = p.c; persist(); return render();
    }
    if (d.wing) { const w = +d.wing; if (w !== dress.wing && w > 0 && !spend(3000, 0)) return; dress.wing = w; persist(); return render(); }
    if (d.neon !== undefined) { const n = d.neon || null; if (n && n !== dress.neon && !spend(5000, 0)) return; dress.neon = n; persist(); return render(); }
    if (d.wheel) { dress.wheel = +d.wheel; persist(); return render(); }
    if (b.id === 'resetSave' && confirm('本当にセーブデータを初期化しますか？')) { localStorage.removeItem('omz-save-v1'); location.reload(); }
}
function onChange(e) {
    const t = e.target;
    if (t.id === 'regionSel') { st.region = +t.value; st.coursePage = 0; st.course = st.region * PER_REGION; render(); }
    if (t.id === 'fCountry') { st.country = t.value; st.maker = 'ALL'; st.shopPage = 0; render(); }
    if (t.id === 'fMaker') { st.maker = t.value; st.shopPage = 0; render(); }
    if (t.id === 'fRank') { st.rank = t.value; st.shopPage = 0; render(); }
    if (t.id === 'fSort') { st.sort = t.value; st.shopPage = 0; render(); }
    if (t.id === 'impFile' && t.files && t.files[0]) {
        t.files[0].text().then(txt => {
            if (!confirm('現在のデータを上書きします。よろしいですか？')) return;
            try { importCode(txt); toast('✅ 読み込みました'); render(); } catch (err) { toast('ファイルが正しくありません'); }
        });
        return;
    }
    if (t.id === 'q') { st.q = t.value; st.shopPage = 0; render(); }
}

export function initUI(a) {
    api = a;
    $('#content').addEventListener('click', onClick);
    $('#nav').addEventListener('click', onClick);
    $('#brand').addEventListener('click', () => go('home'));
    $('#content').addEventListener('change', onChange);
    api.online.onChange(() => {
        if (page !== 'online' || $('#site').classList.contains('hidden')) return;
        const el = $('#members');
        if (el) el.innerHTML = membersHTML();
        const n = $('#memCount');
        if (n) n.textContent = api.online.members().length;
    });
    onSyncStatus(() => {
        const el = $('#syncStatus');
        if (el) el.textContent = ({ off: '⚪ オフ', connecting: '🟡 接続中…', pending: '🟡 送信待ち', synced: '🟢 同期済み', error: '🔴 エラー' }[syncState.status] || '') + (syncState.error ? ' ' + syncState.error : '');
    });
    onRemoteApplied(() => {
        header();
        if (!$('#site').classList.contains('hidden') && !['sync', 'online'].includes(page)) render();
    });
    st.region = Math.floor(st.course / PER_REGION);
    st.coursePage = Math.floor((st.course % PER_REGION) / 20);
    render();
    setTimeout(() => $('#splash').classList.add('hide'), 1200);
}
export function showSite(show) {
    $('#site').classList.toggle('hidden', !show);
    document.body.classList.toggle('racing', !show);
    if (show) render();
}
function membersHTML() {
    return api.online.members().map(p => { const c = getCar(p.car || '0'); return `<div class="member ${p.me ? 'me' : ''}">${p.me ? '🟢' : '🔵'} <b>${esc(p.name)}</b> <small>${esc(c.maker)} ${esc(c.name)}</small></div>`; }).join('');
}
export function showResult(res, onRetry, onMenu) {
    const m = $('#result');
    m.innerHTML = `<div class="panel resbox"><div class="eyebrow">${res.title}</div><h2 class="${res.win ? 'win' : 'lose'}">${res.head || (res.win ? 'WIN!' : 'LOSE…')}</h2>
    <div class="restime">${res.time}</div>${res.best ? '<div class="eyebrow">🏆 NEW RECORD</div>' : ''}
    <div class="rew"><span class="z">+${fmt(res.z)} Z</span><span class="m">+${res.metal} M</span></div>
    ${(res.lines || []).filter(Boolean).map(l => `<p class="resline">${l}</p>`).join('')}
    <div class="row">${res.next ? `<button class="primary" id="resNext">${res.next.label}</button>` : ''}${res.noRetry ? '' : `<button class="${res.next ? 'ghost' : 'primary'}" id="resRetry">↻ リトライ</button>`}<button class="ghost" id="resMenu">メニューへ</button></div></div>`;
    m.classList.remove('hidden');
    if (res.next) $('#resNext').onclick = () => { m.classList.add('hidden'); onMenu(); res.next.fn(); };
    if (!res.noRetry) $('#resRetry').onclick = () => { m.classList.add('hidden'); onRetry(); };
    $('#resMenu').onclick = () => { m.classList.add('hidden'); if (gpRun) { gpRun = null; toast('グランプリを棄権しました'); } onMenu(); };
}
export { toast, header };
