// ERGS Digital Skills & AI: A Teacher's Guide — issue library
// Content is encrypted with the staff password; release state lives in Firestore (ergs-ai project).
// Firebase loads on demand, so the library still opens if Firebase is unreachable (releases then fall back to defaults).
let initializeApp, getFirestore, doc, collection, onSnapshot, setDoc, getDoc, getDocs, deleteDoc, serverTimestamp, getAuth, onAuthStateChanged, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut, GoogleAuthProvider, signInWithPopup, signInWithRedirect;
async function loadFirebase() {
  const V = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [a, f, u] = await Promise.all([import(V + 'firebase-app.js'), import(V + 'firebase-firestore.js'), import(V + 'firebase-auth.js')]);
  ({ initializeApp } = a); ({ getFirestore, doc, collection, onSnapshot, setDoc, getDoc, getDocs, deleteDoc, serverTimestamp } = f);
  ({ getAuth, onAuthStateChanged, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut, GoogleAuthProvider, signInWithPopup, signInWithRedirect } = u);
}

const C = window.NL_CONFIG;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const START_HREF = location.href;
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
const SS = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }, del(k) { try { sessionStorage.removeItem(k); } catch (e) {} } };
const THEMES = ['Getting Started', 'Planning', 'Assessment & Feedback', 'Inclusion', 'Admin & Communication', 'Leadership & Data', 'Tools & Platforms', 'Pupil AI Literacy'];
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- crypto ---------- */
const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let KEY = null;
async function deriveKey(pw) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(C.salt), iterations: C.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
const importRaw = raw => crypto.subtle.importKey('raw', b64d(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
async function dec(u8) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, KEY, u8.subarray(12))); }
async function enc(u8) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, KEY, u8)); const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out; }
const encJSON = async o => b64e(await enc(new TextEncoder().encode(JSON.stringify(o))));
const decJSON = async s => JSON.parse(new TextDecoder().decode(await dec(b64d(s))));
const imgCache = new Map();
function fileImg(path) {
  if (!imgCache.has(path)) imgCache.set(path, fetch(path).then(r => r.arrayBuffer()).then(b => dec(new Uint8Array(b))).then(u => URL.createObjectURL(new Blob([u], { type: 'image/jpeg' }))));
  return imgCache.get(path);
}

/* ---------- state ---------- */
let OLDRO = null, CONTENT = null, RELEASES = {}, SERIES = null, ORDER = null, MIGRATED = true, CUSTOM = [], ADMIN = false, AUTHUSER = null, STAFFVIEW = localStorage.getItem('ergsNL.sv') === '1', DB = null, AUTH = null;
let filt = { q: '', theme: '', tool: '' };

function issueMap() {
  const m = new Map();
  CONTENT.orig.forEach(x => m.set('w' + x.n, { ...x, id: 'w' + x.n, kind: 'img', imgs: ['img/w' + String(x.n).padStart(2, '0') + '.bin'], thumb: 'img/w' + String(x.n).padStart(2, '0') + '-t.bin', def: 'live' }));
  CONTENT.bank.forEach(x => { const b = bankItem(x); m.set(b.id, b); });
  CUSTOM.filter(x => !x.overrides).forEach(x => m.set(x.id, { ...x, custom: true, fsPages: true, def: 'locked' }));
  return m;
}
// The running order of every issue in the series. Numbers come from position (removed issues are skipped).
function orderIds() {
  const m = issueMap(), has = id => m.has(id);
  let o;
  if (ORDER) o = ORDER.filter(has);
  else {   // first run: originals, then the existing series, then every other generated issue
    const ser = seriesIds();
    o = [...CONTENT.orig.map(x => 'w' + x.n), ...ser, ...CONTENT.bank.map(x => 'b' + x.n).filter(id => !ser.includes(id))];
  }
  const seen = new Set(o);
  CONTENT.orig.forEach(x => { if (!seen.has('w' + x.n)) { o.splice(Math.min(o.length, x.n - 1), 0, 'w' + x.n); seen.add('w' + x.n); } });
  CUSTOM.filter(x => !x.overrides && !seen.has(x.id)).sort((p, q) => (p.n || 0) - (q.n || 0)).forEach(x => { o.splice(Math.max(0, Math.min(o.length, (x.n || o.length + 1) - 1)), 0, x.id); seen.add(x.id); });
  return o;
}
function allIssues() {
  const m = issueMap();
  // edits to built-in issues are stored as override documents (encrypted) and merged in here
  const ov = {}; CUSTOM.filter(x => x.overrides).forEach(x => { ov[x.overrides] = x; });
  const merge = base => {
    const x = ov[base.id]; if (!x) return base;
    const r = { ...base, edited: true, ovDocId: x.docId };
    for (const k of ['title', 'theme', 'summary', 'link']) if (x[k] !== undefined && x[k] !== '') r[k] = x[k];
    if (x.tools && x.tools.length) r.tools = x.tools;
    if (x.pageDocs && x.pageDocs.length) { r.imgs = undefined; r.pageDocs = x.pageDocs; r.fsPages = true; if (x.thumb) r.thumb = x.thumb; r.ovPages = x.pageDocs; }
    return r;
  };
  let k = 0;
  return orderIds().map(id => merge(m.get(id))).map(i => status(i) === 'removed' ? { ...i, n: '–' } : { ...i, n: ++k });
}
// numbers of released issues are confirmed: any change that would alter one is refused
function liveNums(o) { const m = issueMap(); let k = 0; const r = {}; o.forEach(id => { const i = m.get(id); if (!i || status(i) === 'removed') return; k++; if (status(i) === 'live') r[id] = k; }); return r; }
function keepsLive(o) { const a = liveNums(orderIds()), b = liveNums(o); return Object.keys(a).every(id => a[id] === b[id]); }
function saveOrder(arr, msg) {
  if (!ADMIN || !DB) return toast('Sign in at Staff admin to change the order');
  if (!keepsLive(arr)) { render(); return toast('Released issues keep their numbers – place this after the last released issue'); }
  ORDER = arr; render();
  writing = writing.then(() => setDoc(doc(DB, 'newsletter', 'state'), { order: arr, updated: serverTimestamp() }, { merge: true }))
    .then(() => msg && toast(msg)).catch(e => { console.warn(e); toast('Couldn’t save – check you’re signed in'); });
}
// move an issue so it becomes Issue n (counting only issues that aren't removed)
function moveTo(id, n) {
  const all = allIssues(), o = orderIds().filter(x => x !== id), vis = all.filter(i => i.id !== id && i.n !== '–');
  n = Math.max(1, Math.min(vis.length + 1, n | 0));
  const before = vis[n - 1];
  o.splice(before ? o.indexOf(before.id) : o.length, 0, id);
  return o;
}
const BANK_START = 28;
function bankItem(x) { return { ...x, key: x.n, id: 'b' + x.n, kind: 'img', bank: true, imgs: Array.from({ length: x.pages || 2 }, (_, k) => `img/b${x.n}-${k + 1}.bin`), thumb: `img/b${x.n}-t.bin`, def: 'locked' }; }
function bankById(id) { const x = CONTENT.bank.find(z => 'b' + z.n === id); return x ? bankItem(x) : null; }
function seriesIds() { return (SERIES || CONTENT.bank.filter(x => x.n <= 52).map(x => 'b' + x.n)).filter(id => CONTENT.bank.some(z => 'b' + z.n === id)); }
function poolIssues() { const s = new Set(orderIds()); return CONTENT.bank.filter(x => !s.has('b' + x.n)).map(bankItem); }
function saveSeries(arr, msg) {
  if (!ADMIN || !DB) return toast('Sign in at Staff admin to change the series');
  SERIES = arr; render();
  writing = writing.then(() => setDoc(doc(DB, 'newsletter', 'state'), { series: arr, updated: serverTimestamp() }, { merge: true }))
    .then(() => msg && toast(msg)).catch(e => { console.warn(e); toast('Couldn’t save – check you’re signed in'); });
}
function status(i) {
  const r = RELEASES[i.id];
  if (!r || !r.s) return i.def;
  if (r.s === 'sched') return r.d && r.d <= today() ? 'live' : 'sched';
  return r.s;
}
const canManage = () => ADMIN && !STAFFVIEW;

/* ---------- gate ---------- */
async function tryKey() {
  try {
    const r = await fetch('content.enc', { cache: 'no-cache' });
    CONTENT = JSON.parse(new TextDecoder().decode(await dec(new Uint8Array(await r.arrayBuffer()))));
    return true;
  } catch (e) { return false; }
}
const SPLASH_T0 = performance.now();
function hideSplash(minMs) {
  const sp = $('#splash'); if (!sp || sp.classList.contains('out')) return Promise.resolve();
  const wait = Math.max(0, minMs - (performance.now() - SPLASH_T0));
  return new Promise(r => setTimeout(() => { sp.classList.add('out'); setTimeout(() => { sp.remove(); r(); }, 650); }, wait));
}
function mountIntro() {
  document.querySelectorAll('.coin-edge').forEach(ed => { if (ed.children.length) return; ed.innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="transform:translateZ(${(-6.5 + i).toFixed(1)}px)"></i>`).join(''); });
  document.querySelectorAll('.sp-title').forEach(t => { if (t.classList.contains('split')) return; const txt = t.textContent; t.setAttribute('aria-label', txt); let i = 0; t.innerHTML = txt.split(' ').map(w => `<span class="wd" aria-hidden="true">${[...w].map(ch => `<span class="ch" style="--i:${i++}">${esc(ch)}</span>`).join('')}</span>${w === 'Digital' ? '<br>' : ' '}`).join(''); t.classList.add('split'); });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.sp-net').forEach(cv => {
    if (cv.dataset.on) return; cv.dataset.on = 1;
    const host = cv.closest('.splash,.gate'); host.insertBefore(cv, host.querySelector('.sp-bg').nextSibling);
    if (reduce) return;
    const ctx = cv.getContext('2d'); let W, H, pts = [], raf;
    const size = () => { const d = Math.min(2, devicePixelRatio || 1); W = cv.width = host.clientWidth * d; H = cv.height = host.clientHeight * d; const n = Math.round(Math.min(90, W * H / (26000 * d * d))); pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35 * d, vy: (Math.random() - .5) * .35 * d, r: (Math.random() * 1.6 + .6) * d, g: Math.random() < .3 })); };
    size(); addEventListener('resize', size);
    const draw = () => {
      if (!cv.isConnected) return; raf = requestAnimationFrame(draw); if (host.hidden) return; if (!W || W !== Math.round(host.clientWidth * Math.min(2, devicePixelRatio || 1))) size();
      ctx.clearRect(0, 0, W, H); const L = 140 * (devicePixelRatio || 1);
      for (const p of pts) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y); if (d < L) { ctx.strokeStyle = `rgba(217,192,140,${(1 - d / L) * .28})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
      for (const p of pts) { ctx.fillStyle = p.g ? 'rgba(244,223,166,.9)' : 'rgba(170,195,235,.65)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    };
    draw();
  });
  if (reduce || mountIntro.tilt) return; mountIntro.tilt = 1;
  const tilt = (x, y) => document.querySelectorAll('.coin3d').forEach(c => { c.style.setProperty('--ty', (x * 22).toFixed(1) + 'deg'); c.style.setProperty('--tx', (-y * 18).toFixed(1) + 'deg'); });
  addEventListener('pointermove', e => { if (document.querySelector('.splash,.gate:not([hidden])')) tilt(e.clientX / innerWidth - .5, e.clientY / innerHeight - .5); }, { passive: true });
  addEventListener('deviceorientation', e => { if (e.gamma != null && document.querySelector('.splash,.gate:not([hidden])')) tilt(Math.max(-1, Math.min(1, e.gamma / 40)) / 2, Math.max(-1, Math.min(1, (e.beta - 45) / 40)) / 2); }, { passive: true });
}
function appNet() {
  const cv = document.querySelector('.app-net'); if (!cv) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const G = 26, O = 13;   // must match the CSS dot grid: 26px tiles, dot in the middle of each tile
  const ctx = cv.getContext('2d'); let W, H, d, cols, rows, pts = [], pulses = [], last = 0, want = 0;
  const gp = () => ({ i: Math.random() * cols | 0, j: Math.random() * rows | 0, born: performance.now() - (reduce ? 1e6 : 0), life: 14000 + Math.random() * 16000, hub: Math.random() < .15 });
  const size = () => {
    d = Math.min(2, devicePixelRatio || 1); W = cv.width = innerWidth * d; H = cv.height = innerHeight * d;
    cols = Math.ceil(innerWidth / G); rows = Math.ceil(innerHeight / G);
    want = Math.round(Math.min(60, innerWidth * innerHeight / 24000));
    pts = Array.from({ length: want }, () => { const p = gp(); p.born -= Math.random() * p.life; return p; });
  };
  size(); addEventListener('resize', size);
  const X = i => (O + i * G) * d, Y = j => (O + j * G) * d;
  const alphaOf = (p, t) => { const age = t - p.born; if (reduce) return 1; if (age < 2500) return age / 2500; if (age > p.life - 2500) return Math.max(0, (p.life - age) / 2500); return 1; };
  const frame = t => {
    requestAnimationFrame(frame);
    if (document.hidden || document.getElementById('app').hidden || t - last < 40) return; last = t;
    pts = pts.filter(p => t - p.born < p.life); while (pts.length < want) pts.push(gp());
    ctx.clearRect(0, 0, W, H);
    const lim = 7, links = [];
    ctx.lineWidth = d;
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
      const p = pts[a], q = pts[b], di = Math.abs(p.i - q.i), dj = Math.abs(p.j - q.j);
      if (di + dj > lim || (di === 0 && dj === 0)) continue;
      const al = Math.min(alphaOf(p, t), alphaOf(q, t)) * (1 - (di + dj) / (lim + 1)) * .38;
      if (al < .01) continue;
      ctx.strokeStyle = `rgba(${document.documentElement.classList.contains('dark') ? '120,165,225' : '31,79,143'},${al.toFixed(3)})`;
      const x1 = X(p.i) + .5, y1 = Y(p.j) + .5, x2 = X(q.i) + .5, y2 = Y(q.j) + .5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y2); ctx.stroke();
      links.push([p, q]);
    }
    for (const p of pts) {
      const al = alphaOf(p, t), x = X(p.i), y = Y(p.j), r = (p.hub ? 2.4 : 1.8) * d;
      if (p.hub) { ctx.strokeStyle = `rgba(184,134,43,${(.3 * al).toFixed(3)})`; ctx.strokeRect(x - 5 * d, y - 5 * d, 10 * d, 10 * d); }
      ctx.fillStyle = p.hub ? `rgba(184,134,43,${(.55 * al).toFixed(3)})` : `rgba(${document.documentElement.classList.contains('dark') ? '120,165,225' : '31,79,143'},${(.5 * al).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    if (!reduce && links.length && pulses.length < 3 && Math.random() < .015) { const [p, q] = links[Math.random() * links.length | 0]; pulses.push({ p, q, k: 0 }); }
    pulses = pulses.filter(u => (u.k += .006) < 1 && pts.includes(u.p) && pts.includes(u.q));
    for (const u of pulses) {
      const x1 = X(u.p.i), y1 = Y(u.p.j), x2 = X(u.q.i), y2 = Y(u.q.j), s1 = Math.abs(x2 - x1), tot = s1 + Math.abs(y2 - y1) || 1, s = u.k * tot;
      const x = s < s1 ? x1 + Math.sign(x2 - x1) * s : x2, y = s < s1 ? y1 : y1 + Math.sign(y2 - y1) * (s - s1);
      const fade = Math.sin(Math.PI * u.k) * .5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 6 * d); g.addColorStop(0, `rgba(200,160,80,${fade.toFixed(3)})`); g.addColorStop(1, 'rgba(200,160,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 6 * d, 0, 7); ctx.fill();
    }
  };
  requestAnimationFrame(frame);
}
/* ---------- screensaver: the intro, after 5 minutes without any activity ---------- */
const SAVER_MS = 5 * 60 * 1000;
// ERGS school day (bell times from the ICT dept)
const BELLS = [['9:00', '9:35', 'Period 1'], ['9:35', '10:10', 'Period 2'], ['10:10', '10:45', 'Period 3'], ['10:45', '11:00', 'Form Time A'], ['11:00', '11:15', 'Form Time B'], ['11:15', '11:50', 'Period 4'], ['11:50', '12:25', 'Period 5'], ['12:25', '13:05', 'Period 6A'], ['13:05', '13:45', 'Period 6B'], ['13:45', '14:20', 'Period 7'], ['14:20', '14:55', 'Period 8'], ['14:55', '15:25', 'Period 9']];
function schoolPeriod(d) {
  const day = d.getDay(); if (day === 0 || day === 6) return ['Weekend', ''];
  const m = d.getHours() * 60 + d.getMinutes(), mins = t => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
  const ft = t => { const [h, mm] = t.split(':').map(Number); return `${h > 12 ? h - 12 : h}:${String(mm).padStart(2, '0')}`; };
  if (m < mins('9:00')) return ['Before school', m >= mins('7:30') ? `Period 1 starts at 9:00` : ''];
  if (m >= mins('15:25')) return day === 5 ? ['🎉 Have a great weekend', ''] : ['After school', ''];
  const i = BELLS.findIndex(([a, b]) => m >= mins(a) && m < mins(b)); if (i < 0) return null;
  const [, end, name] = BELLS[i], left = mins(end) - m, next = BELLS[i + 1];
  return [name, `${left} min left · ${next ? `${next[2]} at ${ft(end)}` : `home time at ${ft(end)}`}`];
}
function startSaver() {
  let t, el = null;
  const html = () => `<div class="sp-bg"></div><div class="sp-center saver-drift">
      <div class="sp-crestwrap small"><canvas class="sp-net" aria-hidden="true"></canvas>
        <div class="sp-orbit o1"><i></i></div><div class="sp-orbit o2"><i></i></div><div class="sp-orbit o3"><i></i></div>
        <div class="coin3d"><div class="coin-spin"><div class="coin-face front"><img class="sp-crest" alt="" src="${window.ERGS_CREST || ''}"></div><div class="coin-edge"></div><div class="coin-face back"><span>ERGS<b>AI</b></span></div></div><div class="coin-shine"></div></div>
        <div class="coin-shadow"></div></div>
      <p class="sp-school">Enniskillen Royal Grammar School</p>
      <h1 class="sp-title">ERGS Digital Skills &amp; AI</h1>
      <div class="sp-rule"></div>
      <p class="saver-clock"></p><p class="saver-date"></p><p class="saver-period"></p>
    </div><p class="sp-foot">Tap or press any key to continue</p>`;
  const blocked = () => document.getElementById('splash') || !$('#gate').hidden || $('#app').hidden || document.querySelector('dialog[open], .modal:not([hidden])');
  const show = () => {
    if (el || blocked() || document.hidden) return arm();
    el = document.createElement('div'); el.className = 'splash saver'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Screensaver – press any key to continue');
    el.innerHTML = html(); document.body.appendChild(el); mountIntro();
    const ck = el.querySelector('.saver-clock'), dt = el.querySelector('.saver-date'), tick = () => { if (!el) return; const d = new Date(); ck.textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); dt.textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); const pp = el.querySelector('.saver-period'), pn = schoolPeriod(d);
      // Friday, last period: a little countdown to the weekend
      const wk = d.getDay() === 5 && pn && pn[0] === 'Period 9';
      el.classList.toggle('friday', !!wk);
      // Monday 6–9am: a calm "fresh week" welcome with a soft sunrise
      const mon = d.getDay() === 1 && d.getHours() >= 6 && d.getHours() < 9;
      el.classList.toggle('monday', mon);
      if (mon) {
        const lines = ['A fresh week, a fresh start.', 'Small steps make big weeks.', 'One good lesson at a time.', 'Coffee first. Then greatness.', 'You’ve got this week.', 'Be the calm in the corridor.'];
        const wkNo = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 6048e5);
        pp.innerHTML = `<b>☕ Good morning</b><em class="mon-line">${lines[wkNo % lines.length]}</em>`;
        pp.hidden = false; setTimeout(tick, 10000); return;
      }
      if (wk) {
        const end = new Date(d); end.setHours(15, 25, 0, 0); const left = Math.max(0, Math.round((end - d) / 1000)), pct = 100 - left / 18;
        const lines = ['Nearly there…', 'Hold the line!', 'The weekend is loading…', 'Last push!', 'So close you can taste it'];
        pp.innerHTML = `<b>🎉 Weekend in</b><strong class="wk-count">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</strong><i class="wk-bar"><i style="width:${Math.min(100, Math.max(0, pct)).toFixed(1)}%"></i></i><span>${lines[Math.floor(left / 360) % lines.length]}</span>`;
      } else pp.innerHTML = pn ? `<b>${esc(pn[0])}</b>${pn[1] ? `<span>${esc(pn[1])}</span>` : ''}` : '';
      pp.hidden = !pn; setTimeout(tick, wk ? 1000 : 10000); }; tick();
  };
  const hide = () => { const x = el; el = null; x.classList.add('out'); setTimeout(() => x.remove(), 650); };
  const arm = () => { clearTimeout(t); t = setTimeout(show, SAVER_MS); };
  const wake = e => {
    if (el) { if (e.type === 'pointerdown' || e.type === 'keydown') { e.preventDefault(); e.stopPropagation(); } if (e.type !== 'pointermove' && e.type !== 'scroll') hide(); }
    arm();
  };
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => addEventListener(ev, wake, { capture: true, passive: ev !== 'pointerdown' && ev !== 'keydown' }));
  let lastMove = 0; addEventListener('pointermove', e => { const now = Date.now(); if (now - lastMove > 1000) { lastMove = now; if (!el) arm(); } }, { passive: true });
  addEventListener('click', e => { if (e.target.closest && e.target.closest('.saver')) { e.preventDefault(); e.stopPropagation(); } }, true);
  arm();
  document.querySelectorAll('#saverNow,[data-saver]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); setTimeout(show, 50); }));
}
// light / dark theme, remembered on this device
function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  const b = $('#themeBtn'); if (b) { b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode'); b.title = dark ? 'Light mode' : 'Dark mode'; }
}
function wireTheme() {
  applyTheme(document.documentElement.classList.contains('dark'));
  $('#themeBtn')?.addEventListener('click', () => { const d = !document.documentElement.classList.contains('dark'); LS.set('ergsNL.theme', d ? 'dark' : 'light'); applyTheme(d); });
}
async function boot() {
  wireTheme();
  $('#gateCrest').src = $('#mastCrest').src = $('#splashCrest').src = window.ERGS_CREST || '';
  mountIntro(); appNet(); startSaver();
  const raw = LS.get('ergsNL.k') || SS.get('ergsNL.k');
  if (raw) { try { KEY = await importRaw(raw); if (await tryKey()) { start(); return hideSplash(4300); } } catch (e) {} }
  $('#splash')?.remove(); $('#gate').hidden = false; setTimeout(() => $('#pw').focus(), 1500);   // first visit: the password screen plays the same intro
}
$('#gateForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button'); btn.disabled = true; $('#gateErr').textContent = '';
  try {
    KEY = await deriveKey($('#pw').value.trim());
    if (!(await tryKey())) throw 0;
    const raw = b64e(new Uint8Array(await crypto.subtle.exportKey('raw', KEY)));
    LS.set('ergsNL.k', raw);   // enter it once – this device stays unlocked
    const nm = $('#gName').value.trim().replace(/\s+/g, ' ').slice(0, 60); if (nm) LS.set('ergsNL.name', nm);
    $('#gate').classList.add('leaving'); setTimeout(() => { $('#gate').hidden = true; start(); }, 450);
  } catch (err) { $('#gateErr').textContent = 'That password isn’t right. Please try again.'; const f = $('.gate-field'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); }
  btn.disabled = false;
});

/* ---------- firebase ---------- */
async function startFirebase() {
  try {
    await loadFirebase();
    const app = initializeApp(C.firebase, 'ergs-ai'); DB = getFirestore(app); AUTH = getAuth(app);
  } catch (e) { console.warn(e); return; }
  onSnapshot(doc(DB, 'newsletter', 'state'), async s => {
    let d = (s.exists() && s.data()) || {};
    // Until the editor copies the data across, keep using the old release settings (read-only) so nothing locked appears early
    if (!s.exists() && C.oldFirebase) { try { const o = await getDoc(doc((OLDRO ||= getFirestore(initializeApp(C.oldFirebase, 'old-ro'))), 'newsletter', 'state')); if (o.exists()) d = o.data(); } catch (e) { console.warn('old state', e); } } RELEASES = d.releases || {}; SERIES = Array.isArray(d.series) ? d.series : null; ORDER = Array.isArray(d.order) ? d.order : null; MIGRATED = !!d.migratedFrom; TIPSTATE = { hidden: d.hiddenTips || {}, custom: d.customTips || {}, used: d.usedTips || {}, img: d.tipImgs || {} }; SHEETHIDE = d.hiddenSheets || {}; render(); if (location.hash === '#tips') renderTips(); if (location.hash === '#help') renderSheets(); }, e => console.warn('state', e));
  onSnapshot(collection(DB, 'newsletterIssues'), async s => {
    const out = [];
    for (const d of s.docs) { try { const x = await decJSON(d.data().enc); out.push({ ...x, id: 'c' + d.id, docId: d.id }); } catch (e) {} }
    CUSTOM = out; render();
  }, e => console.warn('issues', e));
  onAuthStateChanged(AUTH, u => {
    AUTHUSER = u;
    ADMIN = !!(u && u.email && C.admins.includes(u.email.toLowerCase()));
    render();
  });
  completeLink();
  trackVisit();
  loadTipLog().then(() => { renderTipDay(); if (location.hash === '#tips') renderTips(); });
}
let LINK_MSG = '';
async function completeLink(emailTyped) {
  if (!isSignInWithEmailLink(AUTH, START_HREF)) return;
  const email = emailTyped || LS.get('ergsNL.linkEmail');
  if (!email) { LINK_MSG = 'confirm'; location.hash = 'admin'; render(); return; }
  try {
    await signInWithEmailLink(AUTH, email.toLowerCase(), START_HREF);
    LS.del('ergsNL.linkEmail'); LINK_MSG = '';
    history.replaceState(null, '', location.pathname + '#admin'); toast('Signed in – release desk unlocked');
  } catch (e) { LINK_MSG = /expired|invalid-action/.test(String(e.code)) ? 'expired' : 'failed'; }
  render();
}

/* ---------- rendering ---------- */
const cleanName = s => s.trim().replace(/\s+/g, ' ').slice(0, 60);
function askName() {
  if (LS.get('ergsNL.name')) return;
  const p = $('#namePrompt'); p.hidden = false; setTimeout(() => $('#npName').focus(), 200);
  $('#nameForm').addEventListener('submit', e => { e.preventDefault(); const n = cleanName($('#npName').value); if (n.split(' ').length < 2) { $('#npName').setCustomValidity('Please add your first and last name'); $('#npName').reportValidity(); return; } LS.set('ergsNL.name', n); p.hidden = true; LS.set('ergsNL.devT', '0'); trackVisit(); askSubjects(); });
  $('#npName').addEventListener('input', () => $('#npName').setCustomValidity(''));
}
/* ---------- "What do you teach?" subject picker (shown once after first sign-in; changeable any time) ---------- */
const SUBJECTS = [
  ['English', '📖', '#7b2d42'], ['English Literature', '🖋️', '#8e3b5a'], ['Mathematics', '➗', '#1f4f8f'], ['Further Mathematics', '∑', '#27407a'],
  ['Science', '🔬', '#2e7d4f'], ['Biology', '🧬', '#3b8a3e'], ['Chemistry', '⚗️', '#0f7a74'], ['Physics', '⚛️', '#2f5d9c'],
  ['Life and Health Sciences', '🩺', '#2b7f8f'], ['Geography', '🌍', '#2f7d6b'], ['History', '🏰', '#8a5a2b'], ['Religious Studies', '🕊️', '#6b5b95'],
  ['French', '🥐', '#3556a8'], ['German', '🥨', '#8b2f2f'], ['Spanish', '💃', '#c0502b'], ['Digital Technology & IT', '💻', '#14284b'],
  ['Technology and Design', '🛠️', '#5b6170'], ['Engineering', '⚙️', '#4a5568'], ['Construction and the Built Environment', '🏗️', '#b7791f'], ['Art and Design', '🎨', '#c2417a'],
  ['Moving Image Arts', '🎬', '#2d2d3a'], ['Music', '🎵', '#7c3aed'], ['Drama', '🎭', '#9b2c2c'], ['Performing Arts', '🎤', '#b83280'],
  ['Physical Education', '🏉', '#2f855a'], ['Sports Science and the Active Leisure Industry', '🏃', '#276749'], ['Home Economics', '🍳', '#c05621'], ['Nutrition and Food Science', '🥗', '#5a8f29'],
  ['Business Studies', '📈', '#2c5282'], ['Economics', '💷', '#2a4365'], ['Government and Politics', '🏛️', '#4a5578'], ['Health and Social Care', '🤝', '#b5476a'],
  ['Agriculture', '🚜', '#6b8e23'], ['Learning for Life and Work', '🧭', '#2b6cb0'], ['Personal Development', '🌱', '#38a169'], ['Careers', '🎓', '#975a16'], ['Special Educational Needs', '🤝', '#b04a8f'], ['Admin & Office', '🗂️', '#4a5d7a'], ['Senior Leadership Team', '🏛️', '#5a3e8a']];
const mySubjects = () => { try { const v = JSON.parse(LS.get('ergsNL.subjects') || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } };   // null = not chosen yet, [] = show everything
const myTool = () => { const t = LS.get('ergsNL.tool'); return t === 'Gemini' || t === 'Copilot' ? t : ''; };
function setMyTool(t) { LS.set('ergsNL.tool', t || ''); }
const toolPick = (cur, attr) => ['Gemini', 'Copilot', ''].map(t => `<button type="button" class="tp-opt${cur === t ? ' on' : ''}" ${attr}="${t}" aria-pressed="${cur === t}">${t ? `<img src="${TOOL_ICON[t]}" alt="">${t}` : 'Not allocated yet'}</button>`).join('');
// levels taught per subject, e.g. { 'History': ['KS3','GCSE'] } – missing means all levels
const LEVELS = ['KS3', 'GCSE', 'A Level'];
const ROLES = [   // [name, icon, colour, description, subject option it maps to]
  ['Subject teacher', '📚', '#1f4f8f', 'I teach one or more subjects', ''],
  ['Curriculum Leader', '🧭', '#2f7d6b', 'Head of department or subject lead', ''],
  ['Head of Year', '🧑‍🤝‍🧑', '#8a5a2b', 'Pastoral lead for a year group', ''],
  ['Form teacher', '🏫', '#6b5b95', 'I have a form class', ''],
  ['Senior Leadership Team', '🏛️', '#5a3e8a', 'Principal, vice principal or senior teacher', 'Senior Leadership Team'],
  ['Teaching assistant', '🤝', '#b04a8f', 'Supporting pupils with SEN', 'Special Educational Needs'],
  ['Admin & Office', '🗂️', '#4a5d7a', 'Office, admin or support staff', 'Admin & Office']];
const myRoles = () => jget('ergsNL.roles', []);
// only teaching staff are allocated a Gemini or Copilot pro licence
const TEACHING_ROLES = ['Subject teacher', 'Curriculum Leader', 'Head of Year', 'Form teacher', 'Senior Leadership Team'];
const isTeaching = () => { const r = myRoles(); return !r.length || r.some(x => TEACHING_ROLES.includes(x)); };
const SUBJ_INTRO = 'Pick your subjects and we’ll show you prompts for them, plus the general ones that work for everyone. You can change this any time.';
// prompt areas that suit each role come first in the Prompt Bank
const ROLE_AREAS = { 'Curriculum Leader': ['Leadership & Data', 'Planning'], 'Head of Year': ['Pastoral & Wellbeing', 'Admin & Communication'], 'Form teacher': ['Pastoral & Wellbeing'], 'Senior Leadership Team': ['Leadership & Data', 'Admin & Communication'], 'Teaching assistant': ['Inclusion & SEN'], 'Admin & Office': ['Admin & Communication'] };
const roleAreas = () => [...new Set(myRoles().flatMap(r => ROLE_AREAS[r] || []))];
const NOLEVEL = ['Special Educational Needs', 'Admin & Office', 'Senior Leadership Team'];   // roles rather than taught subjects: no levels to pick
const myLevels = () => jget('ergsNL.levels', {});
function levelOK(p) {
  if (canManage() || !p.stage || p.stage === 'Any') return true;
  const lv = myLevels(), subs = (p.subj || []).filter(x => lv[x] && lv[x].length);
  return !subs.length || subs.some(x => lv[x].includes(p.stage));
}
function askSubjects(force) {
  if (!force && ((mySubjects() || []).length || canManage())) return;   // staff who skipped before are asked again
  const box = $('#subjPicker'), grid = $('#spGrid'), done = $('#spDone');
  const firstTime = !(mySubjects() || []).length;   // first visit: role and subjects must be chosen, no skipping
  const cancel = () => { box.hidden = true; document.body.classList.remove('sp-open'); };
  const sel = new Set(mySubjects() || []);
  const upd = () => { done.disabled = !sel.size; done.textContent = sel.size ? `Continue with ${sel.size} subject${sel.size === 1 ? '' : 's'}` : 'Pick at least one'; };
  grid.innerHTML = SUBJECTS.map(([n, ic, col], k) => `<button type="button" class="sp-tile${sel.has(n) ? ' on' : ''}" data-subj="${esc(n)}" aria-pressed="${sel.has(n)}" style="--c:${col};--d:${k * 18}ms"><span class="sp-ic" aria-hidden="true">${ic}</span><span class="sp-name">${esc(n)}</span><i class="sp-tick" aria-hidden="true">✓</i><span class="sp-main">Main</span><span class="sp-mainbtn" role="button" title="Make this my main subject">☆ Make main</span></button>`).join('');
  const mark = () => { const first = [...sel][0]; grid.querySelectorAll('.sp-tile').forEach(t => t.classList.toggle('main', t.dataset.subj === first)); };
  grid.onclick = e => { const t = e.target.closest('[data-subj]'); if (!t) return; const n = t.dataset.subj; if (e.target.closest('.sp-mainbtn')) { sel.delete(n); const rest = [...sel]; sel.clear(); [n, ...rest].forEach(x => sel.add(x)); t.classList.add('on'); mark(); upd(); return; } sel.has(n) ? sel.delete(n) : sel.add(n); t.classList.toggle('on', sel.has(n)); t.setAttribute('aria-pressed', sel.has(n)); mark(); upd(); };
  mark();
  $('#spSearch').value = ''; $('#spSearch').oninput = e => { const q = e.target.value.toLowerCase(); grid.querySelectorAll('.sp-tile').forEach(t => { t.hidden = q && !t.dataset.subj.toLowerCase().includes(q); }); };
  document.querySelectorAll('.sp-ta [data-role]').forEach(b => { b.onclick = () => { const t = grid.querySelector(`[data-subj="${CSS.escape(b.dataset.role)}"]`); if (t) { if (!t.classList.contains('on')) t.click(); t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }; });
  let tp = myTool(); const tpBox = $('#spTool'); tpBox.innerHTML = toolPick(tp, 'data-tp');
  tpBox.onclick = e => { const b = e.target.closest('[data-tp]'); if (!b) return; tp = b.dataset.tp; tpBox.innerHTML = toolPick(tp, 'data-tp'); };
  const close = v => { setMyTool(tp); LS.set('ergsNL.subjects', JSON.stringify(v)); box.hidden = true; document.body.classList.remove('sp-open'); plFilt.subj = v[0] || ''; plFilt.subjSet = true; if ($('#plSubj')) { $('#plCats').dataset.ready = ''; } render(); toast(v.length ? 'Prompts tailored to your subjects' : 'Showing prompts for every subject'); };
  // step 2: which levels do you teach in each subject?
  const lvBox = $('#spLevels'), head = box.querySelector('header'), toolRow = box.querySelector('.sp-toolrow');
  // final step: which AI tool does your licence give you? (its own screen)
  const tlBox = $('#spToolStep');
  const showTool = back => {
    if (!isTeaching()) { tp = ''; return close([...sel]); }   // support staff don't get a licence: skip this screen, both tools stay available
    const draw = () => { tlBox.innerHTML = [['Gemini', 'Google Gemini Pro', 'You’ve been given a Gemini Pro licence on your school Google account'], ['Copilot', 'Microsoft 365 Copilot', 'You’ve been given a Copilot licence on your school Microsoft account'], ['', 'Not allocated yet', 'Both will be shown on every prompt – choose in Settings once your licence arrives']]
      .map(([v, n, d]) => `<button type="button" class="tl-opt${tp === v ? ' on' : ''}" data-tp="${v}" aria-pressed="${tp === v}">${v ? `<img src="${TOOL_ICON[v]}" alt="">` : '<span class="tl-q" aria-hidden="true">?</span>'}<span><b>${n}</b><small>${d}</small></span><i class="tl-tick" aria-hidden="true">✓</i></button>`).join(''); };
    draw(); tlBox.onclick = e => { const x = e.target.closest('[data-tp]'); if (!x) return; tp = x.dataset.tp; draw(); };
    tlBox.hidden = false; grid.hidden = true; lvBox.hidden = true; rlBox.hidden = true; toolRow.hidden = true; $('#spSearch').hidden = true;
    $('#spTitle').textContent = 'Which AI licence do you have?'; head.querySelector('p').hidden = false; head.querySelector('p').textContent = 'Each member of staff is allocated a pro licence for either Gemini or Copilot. Prompts will open in yours.';
    done.disabled = false; done.textContent = 'Finish'; done.onclick = () => close([...sel]);
    $('#spSkip').hidden = false; $('#spSkip').textContent = '← Back'; $('#spSkip').onclick = () => { tlBox.hidden = true; head.querySelector('p').textContent = SUBJ_INTRO; back(); };
    box.querySelector('.sp-panel').scrollTop = 0;
  };
  const showGrid = () => { lvBox.hidden = true; rlBox.hidden = true; grid.hidden = false; toolRow.hidden = true; tlBox.hidden = true; $('#spSearch').hidden = false; $('#spTitle').textContent = 'What do you teach?'; head.querySelector('p').hidden = false; $('.sp-ta') && ($('.sp-ta').hidden = true); upd(); done.onclick = toLevels; $('#spSkip').hidden = firstTime; $('#spSkip').textContent = 'Cancel'; $('#spSkip').onclick = cancel; };
  const toLevels = () => {
    const subs = [...sel].filter(n => !NOLEVEL.includes(n)); if (!subs.length) return showTool(showGrid);
    const cur = myLevels(), lv = {}; subs.forEach(n => { lv[n] = new Set(cur[n] && cur[n].length ? cur[n] : LEVELS); });
    const draw = () => { lvBox.innerHTML = `<p class="lv-intro">Untick any level you don’t teach. You’ll only see prompts for the levels you choose.</p>` + subs.map(n => { const sj = SUBJECTS.find(x => x[0] === n) || [n, '📘', '#14284b']; return `<div class="lv-row" style="--c:${sj[2]}"><span class="lv-name"><i aria-hidden="true">${sj[1]}</i>${esc(n)}</span><span class="lv-chips">${LEVELS.map(l => `<button type="button" class="lv-chip${lv[n].has(l) ? ' on' : ''}" data-lv="${esc(n)}|${l}" aria-pressed="${lv[n].has(l)}">${lv[n].has(l) ? '✓ ' : ''}${l}</button>`).join('')}</span></div>`; }).join(''); };
    draw();
    lvBox.onclick = e => { const b = e.target.closest('[data-lv]'); if (!b) return; const [n, l] = b.dataset.lv.split('|'); lv[n].has(l) ? lv[n].delete(l) : lv[n].add(l); if (!lv[n].size) lv[n].add(l); draw(); };
    lvBox.hidden = false; tlBox.hidden = true; grid.hidden = true; toolRow.hidden = true; $('#spSearch').hidden = true; head.querySelector('p').hidden = true; $('.sp-ta') && ($('.sp-ta').hidden = true);
    $('#spTitle').textContent = 'Which levels do you teach?';
    done.disabled = false; done.textContent = 'Save'; $('#spSkip').hidden = false; $('#spSkip').textContent = '← Back to subjects'; $('#spSkip').onclick = showGrid;
    done.onclick = () => { const out = { ...myLevels() }; subs.forEach(n => { out[n] = lv[n].size === LEVELS.length ? [] : [...lv[n]]; }); LS.set('ergsNL.levels', JSON.stringify(out)); showTool(toLevels); };
    box.querySelector('.sp-panel').scrollTop = 0;
  };
  // step 0: what is your role? (pick all that apply) – then Next shows the subjects, with role options pre-ticked
  const rlBox = $('#spRoles');
  const showRoles = () => {
    const rs = new Set(myRoles());
    const draw = () => { rlBox.innerHTML = ROLES.map(([n, ic, col, sub], k) => `<button type="button" class="sp-tile rl-tile${rs.has(n) ? ' on' : ''}" data-role-pick="${esc(n)}" aria-pressed="${rs.has(n)}" style="--c:${col};--d:${k * 30}ms"><span class="sp-ic" aria-hidden="true">${ic}</span><span class="sp-name">${esc(n)}<small>${esc(sub)}</small></span><i class="sp-tick" aria-hidden="true">✓</i></button>`).join(''); };
    draw();
    rlBox.onclick = e => { const b = e.target.closest('[data-role-pick]'); if (!b) return; const n = b.dataset.rolePick; rs.has(n) ? rs.delete(n) : rs.add(n); draw(); nx(); };
    const nx = () => { done.disabled = !rs.size; done.textContent = rs.size ? 'Next: your subjects →' : 'Pick at least one'; };
    rlBox.hidden = false; grid.hidden = true; $('#spLevels').hidden = true; toolRow.hidden = true; $('#spSearch').hidden = true; $('.sp-ta') && ($('.sp-ta').hidden = true);
    $('#spTitle').textContent = 'What’s your role?'; head.querySelector('p').hidden = false; head.querySelector('p').textContent = 'Pick all that apply. We’ll tailor the prompts and tips to what you do.';
    $('#spSkip').hidden = firstTime; $('#spSkip').textContent = 'Cancel'; $('#spSkip').onclick = cancel;
    done.onclick = () => {
      LS.set('ergsNL.roles', JSON.stringify([...rs]));
      ROLES.forEach(([n, , , , subj]) => { if (subj && rs.has(n) && !sel.has(subj)) { sel.add(subj); grid.querySelector(`[data-subj="${CSS.escape(subj)}"]`)?.classList.add('on'); } });
      mark(); rlBox.hidden = true; head.querySelector('p').textContent = SUBJ_INTRO; showGrid();
      $('#spTitle').textContent = rs.has('Subject teacher') || rs.has('Curriculum Leader') ? 'What do you teach?' : 'Your area';
    };
    nx(); box.querySelector('.sp-panel').scrollTop = 0;
  };
  showRoles();
  upd(); box.hidden = false; document.body.classList.add('sp-open'); setTimeout(() => grid.querySelector('.sp-tile')?.focus(), 300);
}

function start() {
  $('#app').hidden = false;
  askName(); if (LS.get('ergsNL.name')) askSubjects();
  buildChips();
  startFirebase();
  window.addEventListener('hashchange', route);
  route();
}
function setView(staff) {
  STAFFVIEW = staff; localStorage.setItem('ergsNL.sv', staff ? '1' : '0');
  const h = location.hash.slice(1);
  if (staff && (h === 'admin' || h === 'tips')) { location.hash = ''; return; }
  render(); toast(staff ? 'Staff view – exactly what staff see' : 'Editor view');
}
document.addEventListener('click', e => { const b = e.target.closest('#viewSwitch button[data-v]'); if (b) setView(b.dataset.v === 'staff'); });
function route() { render(); window.scrollTo(0, 0); }
const ADMIN_TABS = h => [['admin', 'Release desk'], ['tips', 'Tips editor'], ['help', 'Help sheets'], ['flow', 'Workflow']].map(([k, l]) => `<a href="#${k}" class="${h === k ? 'on' : ''}">${l}</a>`).join('');
function render() {
  if (!CONTENT) return;
  if (location.hash === '#binder' && Binder.active) { Binder.refresh(); return; }
  const h = location.hash.slice(1);
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === ((h === 'admin' || h === 'tips' || h === 'flow' || (canManage() && h === 'help')) ? 'admin' : h === 'binder' ? 'binder' : h === 'prompts' ? 'prompts' : (h === 'help' || h.startsWith('sheet-') || h.startsWith('issue-')) ? '' : 'library')));
  $('#adminLink').hidden = !canManage();
  document.body.classList.toggle('clean', !canManage());
  document.body.classList.toggle('is-admin', ADMIN);
  const vs = $('#viewSwitch'); vs.hidden = !ADMIN;
  vs.querySelectorAll('button[data-v]').forEach(b => b.classList.toggle('on', (b.dataset.v === 'staff') === STAFFVIEW));
  document.querySelectorAll('.admin-tabs').forEach(t => { t.hidden = !canManage(); t.innerHTML = ADMIN_TABS(h); });
  $('#library').hidden = $('#reader').hidden = $('#admin').hidden = $('#binder').hidden = $('#prompts').hidden = $('#flow').hidden = $('#tips').hidden = $('#help').hidden = $('#sheetView').hidden = true;
  document.body.classList.toggle('sheet-on', h.startsWith('sheet-'));
  document.body.classList.toggle('binder-on', h === 'binder');
  if (h === 'admin') { $('#admin').hidden = false; renderAdmin(); }
  else if (h === 'binder') { $('#binder').hidden = false; Binder.open(); }
  else if (h === 'prompts') { $('#prompts').hidden = false; if (plFilt.keepCat) plFilt.keepCat = false; else { plFilt.cat = null; plFilt.q = ''; if ($('#plQ')) $('#plQ').value = ''; } renderPrompts(); scrollTo(0, 0); document.title = 'Prompt library · ERGS Digital Skills & AI'; }
  else if (h === 'flow') { if (!canManage()) { location.replace('#'); return; } $('#flow').hidden = false; renderFlow(); document.title = 'Workflow · ERGS Digital Skills & AI'; }
  else if (h === 'tips') { if (!canManage()) { location.replace('#help'); return; } $('#tips').hidden = false; renderTips(); document.title = 'Quick tips · ERGS Digital Skills & AI'; }
  else if (h === 'help') { $('#help').hidden = false; renderSheets(); document.title = 'Help sheets · ERGS Digital Skills & AI'; }
  else if (h.startsWith('sheet-')) { $('#sheetView').hidden = false; renderSheet(+h.slice(6)); }
  else if (h.startsWith('issue-')) { $('#reader').hidden = false; renderReader(h.slice(6)); }
  else { $('#library').hidden = false; renderLibrary(); }
}
function buildChips() {
  const sel = $('#toolSel');
  sel.innerHTML = '<option value="">All issues</option><optgroup label="Topic">' + THEMES.map(t => `<option value="th:${esc(t)}">${esc(t)}</option>`).join('') + '</optgroup><optgroup label="Tool">' + ['Gemini', 'Copilot', 'NotebookLM'].map(t => `<option value="tl:${t}">${t}</option>`).join('') + '</optgroup>';
  $('#q').addEventListener('input', e => { filt.q = e.target.value.toLowerCase(); renderLibrary(); });
  sel.addEventListener('change', e => { const v = e.target.value; filt.theme = v.startsWith('th:') ? v.slice(3) : ''; filt.tool = v.startsWith('tl:') ? v.slice(3) : ''; renderLibrary(); });
}
function miniCover(i) {
  return `<div class="mini"><div class="mh"><small>ERGS Digital Skills &amp; AI</small><b>${esc(i.title)}</b><i>${i.n}</i></div><div class="kick">${esc(i.kicker || i.theme || '')}</div><div class="mb"><div><span style="height:34px"></span><span class="y" style="height:16px"></span><span style="height:12px"></span></div><div><span class="g" style="height:26px"></span><span style="height:22px"></span></div></div></div>`;
}
function coverHTML(i) {
  if (i.thumb && i.thumb.startsWith('data:')) return `<img alt="" src="${esc(i.thumb)}">`;
  if (i.thumb) return `<img alt="" data-src="${esc(i.thumb)}">`;
  return miniCover(i);
}
function hydrateImgs(root) {
  root.querySelectorAll('img[data-src]').forEach(img => fileImg(img.dataset.src).then(u => { img.src = u; img.removeAttribute('data-src'); }).catch(() => {}));
}
function matches(i) {
  if (filt.theme && i.theme !== filt.theme) return false;
  if (filt.tool && !(i.tools || []).includes(filt.tool)) return false;
  if (filt.q) { const hay = [i.title, i.summary, i.theme, i.kicker, (i.tools || []).join(' '), 'issue ' + i.n].join(' ').toLowerCase(); if (!hay.includes(filt.q)) return false; }
  return true;
}
function cardHTML(i) {
  const st = status(i), locked = st !== 'live', mg = canManage();
  const sched = RELEASES[i.id]?.d;
  const badge = st === 'live' ? (i === latestIssue() ? '<span class="badge">Latest</span>' : '') :
    st === 'sched' ? `<span class="badge sched">Out ${esc(fmtDate(sched))}</span>` : '<span class="badge locked">Locked</span>';
  const quick = mg ? `<button class="btn small quick" data-quick="${esc(i.id)}">${locked ? 'Release' : 'Lock'}</button>` : '';
  const tools = (i.tools || []).map(t => `<span class="tool ${esc(t)}">${esc(t)}</span>`).join('');
  const inner = `${badge}<div class="cover">${locked && !mg ? miniCover({ ...i, title: 'Coming soon', kicker: i.theme }) : coverHTML(i)}</div>
    <div class="meta"><span class="num">Issue ${i.n} · ${esc(i.theme || '')}</span><h3>${esc(i.title)}</h3>${locked && !mg ? '<p>Not released yet – watch this space.</p>' : `<p>${esc(i.summary || '')}</p>`}<div class="tools">${tools}</div></div>`;
  if (locked && !mg) return `<div class="card locked staff">${inner}</div>`;
  return `<a class="card${locked ? ' locked' : ''}" href="#issue-${esc(i.id)}">${inner}${quick}</a>`;
}
function latestIssue() { const live = allIssues().filter(i => status(i) === 'live'); return live[live.length - 1]; }
function fmtDate(d) { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }

function carousel() {
  const g = $('#grid'), btns = document.querySelectorAll('.car-btn');
  // everything is read fresh from the DOM, because the library re-renders whenever the data updates
  const reals = () => [...g.children].filter(c => c.classList.contains('card') && !c.classList.contains('car-clone'));
  const real = reals(), loop = document.body.classList.contains('clean') && real.length > 3;
  g.classList.toggle('looping', loop);
  if (loop) {   // one copy of the set either side, so swiping or the arrows wrap round seamlessly
    const mk = c => { const k = c.cloneNode(true); k.classList.add('car-clone'); k.setAttribute('aria-hidden', 'true'); k.tabIndex = -1; return k; };
    real.slice().reverse().forEach(c => g.prepend(mk(c))); real.forEach(c => g.append(mk(c)));
  }
  if (!g.dataset.car) {
    g.dataset.car = 1; let tm;
    const setW = () => { const r = reals(); return g.classList.contains('looping') && r.length ? r[0].offsetLeft - g.children[0].offsetLeft : 0; };
    const jump = dx => { g.style.scrollSnapType = 'none'; g.style.scrollBehavior = 'auto'; g.scrollLeft += dx; requestAnimationFrame(() => { g.style.scrollSnapType = ''; g.style.scrollBehavior = ''; }); };
    g._fix = () => { const w = setW(); if (!w) return; if (g.scrollLeft < w * .5) jump(w); else if (g.scrollLeft > w * 1.5) jump(-w); };
    g._upd = () => {
      if (g.classList.contains('looping')) { g.classList.remove('at-end'); btns.forEach(b => b.disabled = false); return; }
      const end = g.scrollLeft + g.clientWidth >= g.scrollWidth - 4; g.classList.toggle('at-end', end); btns[0].disabled = g.scrollLeft < 4; btns[1].disabled = end;
    };
    g._start = () => { const r = reals(); if (!r.length || !document.body.classList.contains('clean')) return 0; let x = r[r.length - 1].offsetLeft - g.children[0].offsetLeft; const w = setW(); if (w && x > w * 1.5) x -= w; return x; };   // open on the latest issue
    g.addEventListener('scroll', () => { g._upd(); clearTimeout(tm); tm = setTimeout(g._fix, 120); }, { passive: true });
    g.addEventListener('scrollend', () => g._fix());
    ['pointerdown', 'wheel', 'touchstart'].forEach(ev => g.addEventListener(ev, () => { g._touched = 1; }, { passive: true }));
    addEventListener('resize', () => { g._upd(); g._fix(); });
    btns.forEach(b => b.addEventListener('click', () => { g._touched = 1; g._fix(); g.scrollBy({ left: +b.dataset.car * Math.max(260, g.clientWidth * .8), behavior: 'smooth' }); }));
  }
  const go = () => { g.style.scrollBehavior = 'auto'; g.scrollLeft = g._start(); g.style.scrollBehavior = ''; g._upd(); };
  if (g._touched) { g._fix(); g._upd(); } else { go(); requestAnimationFrame(go); }
}
/* ---------- staff home: three clean cards (Tip of the day · Binder · Prompt bank) ---------- */
function promptOfDay() {   // a general prompt that works for every teacher, whatever they teach (same for everyone each day)
  const pool = allPrompts().filter(p => (!p.issue || status(p.issue) === 'live') && !p.mine && !p.by && p.subj.length === 1 && p.subj[0] === 'All subjects' && (!p.stage || p.stage === 'Any') && p.tool !== 'NotebookLM');
  return pool.length ? pool[Math.floor(Date.now() / 864e5) % pool.length] : null;
}
function renderHome3() {
  const el = $('#home3'); if (!el) return; watchShared(); watchUses();
  el.hidden = false; const ed = canManage();
  const t = window.TODAY_TIP, live = allIssues().filter(i => status(i) === 'live'), L = live[live.length - 1];
  const mine = !ed && (mySubjects() || []).length ? mySubjects() : null;
  const pr = allPrompts().filter(p => (!p.issue || status(p.issue) === 'live') && (!mine || p.subj[0] === 'All subjects' || p.subj.some(s => mine.includes(s))));
  const pd = promptOfDay();
  const hr = new Date().getHours(), first = (LS.get('ergsNL.name') || '').split(' ')[0];
  const tried = t && triedMap()[t.id];
  el.innerHTML = `<div class="h3-greet"><h1>${hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'}${first ? ', ' + esc(first) : ''}</h1><p>${ed ? 'Editor view – what staff see today, plus your release desk.' : 'Three things for today – each takes a minute or two.'}</p><p class="h3-cpd"><button type="button" class="linkbtn" id="h3Cpd">📄 My CPD record</button></p></div>
  <div class="h3-grid${ed ? ' ed' : ''}">
    <article class="h3-card h3-tip">${t ? `<span class="h3-label">Tip of the day <b>${esc(t.app)}</b></span><h2>${esc(t.title)}</h2><p>${esc(t.why)}</p>
      <div class="h3-tipbody">${tipArt(t)}${t.steps.length ? `<ol class="h3-steps">${t.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}</div>
      <div class="h3-actions"><button class="tried-btn${tried ? ' on' : ''}" data-tried="${esc(t.id)}">${tried ? '✓ Tried it' : 'I tried this'}</button></div>` : '<span class="h3-label">Tip of the day</span><h2>Loading…</h2>'}</article>
    <a class="h3-card h3-binder" href="#binder" id="h3Binder">
      <span class="h3-label">The binder</span>
      <div class="h3-book" aria-hidden="true"><img alt="" src="${window.ERGS_CREST || ''}"><b>ERGS Digital Skills &amp; AI</b><i>${live.length} issues</i></div>
      <h2>${L ? `Issue ${L.n}: ${esc(L.title)}` : 'Every issue in one place'}</h2><p>${L ? esc(L.summary || 'The latest issue') : 'Turn the pages like a printed book.'}</p>
      ${(() => { const rec = live.filter(i => !L || i.id !== L.id).sort((a, b) => (+b.n || 0) - (+a.n || 0)).slice(0, 3); return rec.length ? `<div class="h3-recent"><span class="h3-rlabel">Also in the binder</span>${rec.map(i => `<span class="h3-ri" data-bk="${esc(i.id)}"><b>${esc(String(i.n))}</b><span>${esc(i.title)}</span><i aria-hidden="true">›</i></span>`).join('')}</div>` : ''; })()}
      <div class="h3-actions"><span class="btn h3-btn primary">${L ? 'Open at the latest' : 'Open the binder'}</span><span class="h3-link" data-binder>Start from the cover →</span></div></a>
    <article class="h3-card h3-prompts">${canManage() ? `<span class="h3-label">Prompt bank</span>
      <h2>${pr.length} prompts${mine ? ` for ${esc(mine[0])}${mine.length > 1 ? ' and more' : ''}` : ''}</h2>` : `<h2>Prompt Bank</h2>`}
      ${pd ? `<div class="h3-today"><span class="h3-tlabel">Today’s prompt <span class="h3-tool">${esc(pd.tool.replace(' or ', ' · '))}</span></span><h3>${esc(pd.title)}</h3><p class="pl-fit h3-fit">🎯 <b>Great for:</b> ${esc(promptFit(pd))}</p>${summaryHTML(pd)}<button class="btn h3-btn h3-use" id="h3TryPrompt">Use this prompt</button></div>` : '<p>Ready-made prompts you can send to Gemini or Copilot.</p>'}
      <div class="h3-actions"><a class="h3-link" href="#prompts">Browse all prompts →</a></div></article>
    ${ed ? edCard() : ''}
  </div>
  ${ed ? `<div class="h3-more"><button class="btn" id="h3Grid">${document.body.classList.contains('show-grid') ? 'Hide all issues' : 'Show all issues'}</button></div>` : ''}`;
  $('#h3Grid')?.addEventListener('click', () => { document.body.classList.toggle('show-grid'); renderHome3(); });
  $('#h3Release')?.addEventListener('click', e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap again to release'; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = 'Release now'; } }, 4000); return; } setRelease(b.dataset.id, { s: 'live' }, 'Released – staff can see it now'); });
  el.querySelector('[data-binder]')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); Binder.target = 'cover'; location.hash = 'binder'; });
  $('#h3Binder')?.addEventListener('click', e => { if (e.target.closest('[data-binder]')) return; e.preventDefault(); const bk = e.target.closest('[data-bk]'); Binder.target = bk ? bk.dataset.bk : L ? L.id : null; if (location.hash === '#binder') Binder.open(); else location.hash = 'binder'; });
  el.querySelectorAll('[data-tried]').forEach(b => b.addEventListener('click', () => { setTried(b.dataset.tried, !triedMap()[b.dataset.tried]); renderHome3(); }));
  $('#h3TipOpen')?.addEventListener('click', () => showTipSheet(t));
  el.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', () => { plFilt.cat = b.dataset.area; plFilt.keepCat = true; plFilt.shown = 40; location.hash = 'prompts'; }));
  $('.h3-today .pl-sum')?.addEventListener('click', () => $('#h3TryPrompt').click());
  $('#h3Cpd')?.addEventListener('click', openCPD);
  $('#h3TryPrompt')?.addEventListener('click', () => { const tmp = document.createElement('div'); tmp.innerHTML = promptCard(pd); const card = tmp.firstElementChild; card.hidden = true; document.body.appendChild(card); openFill(card, (txt, go) => { card.remove(); go && go !== 'copy' ? sendText(txt, go) : copyText(txt, null); }, true); if (!document.querySelector('.fill-sheet')) card.remove(); });
}
function edCard() {
  const all = allIssues(), st = s => all.filter(i => status(i) === s).length;
  const vis = all.filter(i => status(i) !== 'removed'); let k = vis.length; while (k > 0 && status(vis[k - 1]) !== 'live') k--;
  const next = vis.slice(k).find(i => status(i) === 'locked') || null, sch = all.filter(i => status(i) === 'sched');
  return `<article class="h3-card h3-ed"><span class="h3-label">Release desk</span>
    <div class="h3-stats"><div><b>${st('live')}</b><span>released</span></div><div><b>${sch.length}</b><span>scheduled</span></div><div><b>${st('locked')}</b><span>to come</span></div></div>
    ${next ? `<div class="h3-next"><span class="h3-tlabel">Next to release</span><h3>Issue ${next.n}: ${esc(next.title)}</h3><div class="h3-actions"><button class="btn h3-btn primary" id="h3Release" data-id="${esc(next.id)}">Release now</button><a class="h3-link" href="#issue-${esc(next.id)}">Preview →</a></div></div>` : '<p>Nothing waiting to be released.</p>'}
    ${sch.length ? `<p class="h3-sch">Scheduled: ${sch.slice(0, 2).map(i => `Issue ${i.n} on ${fmtDate(RELEASES[i.id].d)}`).join(' · ')}</p>` : ''}
    ${SHARED.filter(x => x.st === 'pending').length ? `<p class="h3-pend"><a href="#flow">✍️ ${SHARED.filter(x => x.st === 'pending').length} shared prompt${SHARED.filter(x => x.st === 'pending').length === 1 ? '' : 's'} waiting for you to check →</a></p>` : ''}
    <div class="h3-edlinks"><a href="#admin">Release desk</a><a href="#tips">Tips</a><a href="#flow">Workflow</a><a href="#admin">Usage</a></div></article>`;
}
function showTipSheet(t) {
  if (!t) return;
  const s = document.createElement('div'); s.className = 'fill-sheet';
  s.innerHTML = `<div class="fill-card tip-sheet"><header><span class="eyebrow">Tip of the day · ${esc(t.app)}</span><h3>${esc(t.title)}</h3><button type="button" class="fill-x" aria-label="Close">×</button></header>${tipBody(t)}<footer><button class="btn primary" data-done>${triedMap()[t.id] ? 'Close' : 'I tried this ✓'}</button></footer></div>`;
  document.body.appendChild(s); document.body.classList.add('sp-open');
  const close = () => { s.remove(); document.body.classList.remove('sp-open'); };
  s.addEventListener('click', e => { if (e.target === s || e.target.closest('.fill-x')) close(); });
  s.querySelector('[data-done]').addEventListener('click', () => { if (!triedMap()[t.id]) setTried(t.id, true); close(); renderHome3(); });
}
function renderLibrary() {
  const all = allIssues(), live = all.filter(i => status(i) === 'live'), soon = all.filter(i => status(i) !== 'live' && status(i) !== 'removed');
  { const th = new Set(live.map(i => i.theme)).size;
    $('#stats').innerHTML = `<span>${live.length} issues</span><span>${th} themes</span>` + (canManage() && soon.length ? `<span class="st-admin">${soon.length} not yet released</span>` : ''); }
  const bc = document.querySelector('.bp-crest'); if (bc && !bc.src) bc.src = window.ERGS_CREST || '';
  { const pg = live.reduce((t, i) => t + ((i.imgs || i.pageDocs || [1]).length), 0); $('#bpCount').textContent = `${live.length} issues` + (pg > live.length ? ` · ${pg} pages` : ''); }
  renderTipDay();
  const L = latestIssue();
  $('#latest').hidden = !L;
  if (L) { $('#latest').href = '#issue-' + L.id; $('#latest').innerHTML = `<div class="cover">${coverHTML(L)}</div><div><span class="tag">Latest issue · Issue ${L.n}</span><h2>${esc(L.title)}</h2><p>${esc(L.summary || '')}</p></div>`; hydrateImgs($('#latest')); }
  const ab = $('#adminBar');
  ab.hidden = !canManage();
  if (canManage()) {
    const next = soon[0];
    ab.innerHTML = `<b>Editor view</b><span>Locked issues are shown greyed out – only you can open them.</span><span class="spacer"></span>${next ? `<button class="btn small primary" id="relNext">Release next: Issue ${next.n}</button>` : ''}<a class="btn small" href="#admin">Release desk</a>`;
    $('#relNext')?.addEventListener('click', () => setRelease(next.id, { s: 'live' }, `Issue ${next.n} released`));
  }
  const liveShown = document.body.classList.contains('clean') ? live.filter(matches) : live.filter(matches).reverse(), soonShown = canManage() ? soon.filter(matches) : [];   // staff never see what's still to come
  const g = $('#grid');
  g.innerHTML = liveShown.map(cardHTML).join('') + (soonShown.length ? `<h2 style="grid-column:1/-1;font:800 20px var(--head);color:var(--navy);margin:16px 0 0">Not yet released <small style="font:600 13px var(--body);color:var(--muted)">– only you can see these</small></h2>` + soonShown.map(cardHTML).join('') : '');
  $('#empty').hidden = liveShown.length + soonShown.length > 0;
  carousel(); hydrateImgs(g); renderPromptHome();
  g.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const i = all.find(x => x.id === b.dataset.quick); const lk = status(i) !== 'live';
    setRelease(i.id, { s: lk ? 'live' : 'locked' }, lk ? `Issue ${i.n} released` : `Issue ${i.n} locked`);
  }));
}

function list(a) { return (a || []).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join(''); }
function tplHTML(i) {
  const paras = (Array.isArray(i.intro) ? i.intro : String(i.intro || '').split(/\n\s*\n/)).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
  const meta = [i.kicker, i.difficulty && 'Difficulty: ' + i.difficulty, i.read && 'Est. read time: ' + i.read, (i.tools || []).length && 'Tools: ' + i.tools.join(', ')].filter(Boolean).map(esc).join('<span class="sep">|</span>');
  return `<div class="sheet">
  <header class="nl-head"><h1>ERGS Digital Skills &amp; AI: A Teacher’s Guide</h1><p>Whole-School AI Skills CPD Portfolio | ${esc(i.title)}</p><span class="nl-issue">Issue ${i.n}</span></header>
  ${meta ? `<div class="nl-meta">${meta}</div>` : ''}
  <div class="nl-body">
    ${i.aim ? `<p class="nl-aim">${esc(i.aim)}</p>` : ''}
    <h2 class="nl-sec">${esc(i.title)}</h2>
    <div class="nl-cols">
      <div>
        <div class="box"><h4>How AI can help</h4>${paras}
          ${i.prompt ? `<div class="prompt"><h5>Try this prompt</h5><q>${esc(i.prompt)}</q><button class="btn small copy" data-copy>Copy</button></div>` : ''}
        </div>
        ${i.challenge ? `<p class="hand">Want to give it a go this week?</p><div class="challenge"><h4>Department challenge</h4><p>${esc(i.challenge)}</p></div>` : ''}
      </div>
      <aside>
        ${i.saved ? `<div class="saved"><h4>Estimated time saved</h4><b>${esc(i.saved)}</b><span>${esc(i.savedPer || '')}</span></div>` : ''}
        ${i.tip ? `<div class="box tip"><h4>Pro tip</h4><p>${esc(i.tip)}</p></div>` : ''}
        ${(i.ideas || []).length ? `<div class="box ideas"><h4>${esc(i.ideasTitle || 'Ideas to try')}</h4><ul>${list(i.ideas)}</ul></div>` : ''}
      </aside>
    </div>
    ${i.bad?.p || i.good?.p ? `<div class="vs">
      <div class="box bad"><h4>✗ Bad prompt</h4><p><i>“${esc(i.bad?.p)}”</i></p>${i.bad?.r ? `<div class="r"><b>Result:</b> ${esc(i.bad.r)}</div>` : ''}</div>
      <div class="box good"><h4>✓ Good prompt</h4><p><i>“${esc(i.good?.p)}”</i></p>${i.good?.r ? `<div class="r"><b>Result:</b> ${esc(i.good.r)}</div>` : ''}</div>
    </div>` : ''}
    ${(i.dos || []).length || (i.donts || []).length ? `<div class="dd"><div class="box do"><h4>Do</h4><ul>${list(i.dos)}</ul></div><div class="box dont"><h4>Don’t</h4><ul>${list(i.donts)}</ul></div></div>` : ''}
    ${i.link ? `<p><a class="extlink" href="${esc(i.link)}" target="_blank" rel="noopener">Open the linked resource ↗</a></p>` : ''}
  </div>
  ${i.key ? `<footer class="nl-key"><h4>Key message</h4><p>${esc(i.key)}</p></footer>` : ''}
</div>`;
}
async function customPageImg(docId) {
  const k = 'fs:' + docId;
  if (!imgCache.has(k)) imgCache.set(k, getDoc(doc(DB, 'newsletterImgs', docId)).then(async s => URL.createObjectURL(new Blob([await dec(b64d(s.data().data))], { type: 'image/jpeg' }))));
  return imgCache.get(k);
}
function renderReader(id) {
  const all = allIssues(); let i = all.find(x => x.id === id), inPool = false;
  if (!i && canManage()) { i = poolIssues().find(x => x.id === id); inPool = !!i; if (i) i = { ...i, n: '–' }; }
  const sheet = $('#sheet');
  if (!i) { sheet.innerHTML = '<p class="empty">Issue not found – it may still be loading.</p>'; $('#uses').hidden = true; return; }
  const st = inPool ? 'pool' : status(i);
  if (st !== 'live' && !canManage()) { sheet.innerHTML = '<div class="info"><h1>This issue isn’t available</h1><p>Have a look through the library for the latest issues.</p><a class="btn" href="#">Back to the library</a></div>'; $('#lockNote').hidden = true; return; }
  $('#lockNote').hidden = st === 'live';
  $('#lockNote').textContent = st === 'pool' ? 'Preview – this issue is in the issue bank. Add it to the series on the release desk to give it a number.' : st === 'sched' ? `Preview – scheduled for release on ${fmtDate(RELEASES[i.id].d)}. Staff can’t see this yet.` : 'Preview – this issue is locked. Staff can’t see it yet.';
  const visible = inPool ? poolIssues() : all.filter(x => status(x) === 'live' || (canManage() && status(x) !== 'removed'));
  const idx = visible.findIndex(x => x.id === i.id);
  $('#prevBtn').disabled = idx <= 0; $('#nextBtn').disabled = idx >= visible.length - 1;
  $('#prevBtn').onclick = () => { location.hash = 'issue-' + visible[idx - 1].id; };
  $('#nextBtn').onclick = () => { location.hash = 'issue-' + visible[idx + 1].id; };
  $('#printBtn').onclick = () => window.print();
  $('#editIssueBtn').hidden = !canManage() || inPool; $('#editIssueBtn').onclick = () => startEdit(i);
  document.title = `Issue ${i.n}: ${i.title} · ERGS Digital Skills & AI`;
  if (i.kind === 'tpl') sheet.innerHTML = tplHTML(i);
  else {
    const pages = i.imgs || (i.pageDocs || []);
    sheet.innerHTML = `<div class="info"><span class="num eyebrow">Issue ${i.n} · ${esc(i.theme || '')}</span><h1>${esc(i.title)}</h1><p class="muted" style="margin:0">${esc(i.summary || '')}</p>${i.link ? `<a class="extlink" href="${esc(i.link)}" target="_blank" rel="noopener">Open the linked resource ↗</a>` : ''}</div>` +
      pages.map((p, n) => `<img class="page-img" alt="Issue ${i.n} page ${n + 1}" data-p="${n}">`).join('');
    sheet.querySelectorAll('img[data-p]').forEach(img => {
      const p = pages[+img.dataset.p];
      (i.fsPages ? customPageImg(p) : fileImg(p)).then(u => { img.src = u; }).catch(() => { img.alt = 'Page could not be loaded'; });
    });
  }
  renderUses(i.id);
  sheet.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.parentElement.querySelector('q').textContent); toast('Prompt copied'); } catch (e) { toast('Select the prompt text to copy it'); }
  }));
}

/* ---------- admin: how everything fits together ---------- */
function renderFlow() {
  watchShared(); watchEdits();
  const all = allIssues(), st = s => all.filter(i => status(i) === s).length;
  const live = st('live'), locked = st('locked'), sched = st('sched'), latest = all.filter(i => status(i) === 'live').pop();
  const nPrompts = allPrompts().length, nTips = (typeof visibleTips === 'function' ? visibleTips().length : 0);
  const step = (ic, t, d, href, stat) => `<${href ? `a href="${href}"` : 'div'} class="fl-step">${stat ? `<b class="fl-stat">${stat}</b>` : ''}<span class="fl-ic" aria-hidden="true">${ic}</span><h4>${t}</h4><p>${d}</p>${href ? '<span class="fl-go">Open →</span>' : ''}</${href ? 'a' : 'div'}>`;
  const lane = (cls, title, sub, steps) => `<section class="fl-lane ${cls}"><header><h3>${title}</h3><p>${sub}</p></header><ol class="fl-row">${steps.map(s => `<li>${s}</li>`).join('')}</ol></section>`;
  $('#flowBody').innerHTML = `<div class="fl-head"><span class="eyebrow">Admin</span><h1>Workflow</h1><p class="muted">How staff use ERGS Digital Skills &amp; AI, and what you do to keep it running. Tap any step to go there.</p></div>
  ${sharedQueueHTML()}
  ${editsPanelHTML()}
  ${lane('staff', 'Staff journey', 'What a member of staff does, from first install to everyday use.', [
    step('📲', 'Install', 'Open the link or scan the QR code, then Add to Home Screen.'),
    step('🔑', 'Unlock', 'Staff password once per device – content stays encrypted.'),
    step('🙋', 'Name', 'First and last name, so you can see who is using it.', '', ''),
    step('🎯', 'Pick subjects', 'Pinterest-style tiles tailor the prompt library.'),
    step('💡', 'Tip of the day', 'A quick win each day – tap “I tried this”.', '#', nTips + ' tips'),
    step('📰', 'Read issues', 'Latest issue, carousel and the binder.', '#binder', live + ' released'),
    step('✨', 'Use prompts', 'Filter by area, subject, stage or tool – Send to Gemini/Copilot.', '#prompts', nPrompts + ' prompts'),
    step('💬', 'Share', '“How I used it” one-liners under each issue.')])}
  ${lane('admin', 'Your workflow', 'Your regular jobs as editor – most take a minute or two.', [
    step('🗂️', 'Order the series', 'Drag, arrows or type a number. Released issues stay locked in place.', '#admin', (live + locked + sched) + ' issues'),
    step('📅', 'Release or schedule', 'Release the next issue now, or set a date.', '#admin', latest ? 'Latest: ' + latest.n : ''),
    step('✏️', 'Edit or upload', 'Fix a title, replace a PDF, or upload your own issue.', '#admin'),
    step('💡', 'Curate tips', 'Hide tips, add your own, attach screenshots.', '#tips'),
    step('🧹', 'Moderate', 'Remove any “How I used it” comment that isn’t suitable (open an issue).'),
    step('📊', 'Check usage', 'Named staff, devices, tips tried and installs.', '#admin')])}
  ${lane('behind', 'Behind the scenes', 'Where things live – nothing here needs your attention day to day.', [
    step('🔒', 'Encrypted content', 'Issues, prompts and comments are locked with the staff password.'),
    step('☁️', 'Firebase (ergs-ai)', 'Release state, usage, tips tried and comments.'),
    step('🌐', 'GitHub Pages', 'The app itself, with offline caching and auto-update.')])}
  <p class="muted fl-foot">Right now: ${live} released · ${sched} scheduled · ${locked} locked · ${nPrompts} prompts · ${nTips} tips.</p>`;
}

/* ---------- prompt library ---------- */
const PL_AREA = { '': ['🗂️', '#14284b'], 'Planning': ['🗓️', '#1f4f8f'], 'Resources': ['📄', '#2f7d6b'], 'Assessment & Feedback': ['✅', '#7b2d42'], 'Inclusion & SEN': ['🤝', '#b5476a'], 'Revision & Exams': ['📚', '#6b5b95'], 'Engagement': ['✨', '#c05621'], 'Pastoral & Wellbeing': ['💚', '#2f855a'], 'Admin & Communication': ['✉️', '#4a5578'], 'Leadership & Data': ['📊', '#2c5282'], 'Pupil AI Literacy': ['🤖', '#0f7a74'], 'Metacognition & Cowriting': ['🧠', '#8a5a14'], '__saved': ['⭐', '#8a6a12'] };
const PL_DESC = { 'Planning': 'Lesson plans, schemes of work, starters and plenaries', 'Resources': 'Worksheets, slides, reading texts and model answers', 'Assessment & Feedback': 'Quizzes, mark schemes and feedback comments', 'Inclusion & SEN': 'Scaffolds, simplified texts and support for every learner', 'Revision & Exams': 'Revision guides, exam-style questions and practice', 'Engagement': 'Hooks, games, debates and real-world links', 'Pastoral & Wellbeing': 'Form time, PD and wellbeing activities', 'Admin & Communication': 'Emails, letters, reports and minutes', 'Leadership & Data': 'Department planning, data and policy', 'Pupil AI Literacy': 'Teaching pupils to use AI safely and well', 'Metacognition & Cowriting': 'Live modelling, co-writing and plan, monitor, evaluate routines', '__saved': 'Prompts you starred and your own edited versions' };
const PL_CATS = ['Planning', 'Resources', 'Assessment & Feedback', 'Metacognition & Cowriting', 'Inclusion & SEN', 'Revision & Exams', 'Engagement', 'Pastoral & Wellbeing', 'Admin & Communication', 'Leadership & Data', 'Pupil AI Literacy'];
const THEME_CAT = { 'Getting Started': 'Planning', 'Planning': 'Planning', 'Assessment & Feedback': 'Assessment & Feedback', 'Inclusion': 'Inclusion & SEN', 'Admin & Communication': 'Admin & Communication', 'Leadership & Data': 'Leadership & Data', 'Tools & Platforms': 'Resources', 'Pupil AI Literacy': 'Pupil AI Literacy' };
const plFilt = { q: '', cat: null, subj: '', stage: '', tool: '', shown: 40, withGen: true };
function allPrompts() {
  const P = (CONTENT && CONTENT.prompts) || {};
  const fromIssues = allIssues().filter(i => status(i) !== 'removed').flatMap(i => {
    const list = (P[i.id] || []).slice();
    if (i.kind === 'tpl' && i.prompt) list.push({ tool: (i.tools || [])[0] || 'Gemini or Copilot', title: i.title, text: i.prompt });
    const cat = THEME_CAT[i.theme] || (/revis|exam/i.test(i.theme + i.title) ? 'Revision & Exams' : /feedback|assess|mark|misconcep/i.test(i.theme + i.title) ? 'Assessment & Feedback' : 'Resources');
    return list.map((p, k) => ({ ...p, text: noDash(p.text || ''), cat, subj: ['All subjects'], stage: 'Any', key: i.id + ':' + k, issue: i }));
  });
  const lib = ((CONTENT && CONTENT.plib) || []).map((p, k) => ({ ...p, text: noDash(p.text || ''), subj: Array.isArray(p.subj) ? p.subj : [p.subj], key: 'L' + k, issue: null }));
  return applyEdits([...fromIssues, ...lib, ...sharedLive()]);
}
// the editor's changes to any prompt (stored encrypted in Firebase) apply for everyone; hidden prompts disappear
var EDITS = {}, editsUnsub = null;
function applyEdits(list) {
  if (!EDITS || !Object.keys(EDITS).length) return list;
  return list.flatMap(p => { const e = EDITS[p.key]; if (!e) return [p]; if (e.hidden) return []; return [{ ...p, title: e.title || p.title, text: noDash(e.text || p.text), subj: e.subj ? [e.subj] : p.subj, stage: e.stage || p.stage, cat: e.cat || p.cat, tool: e.tool || p.tool, edited: true, fit: e.text ? '' : p.fit }]; });
}
function watchEdits() {
  if (editsUnsub || !DB) return;
  editsUnsub = onSnapshot(collection(DB, 'newsletterPromptEdits'), async sn => {
    const m = {}; for (const d of sn.docs) { try { const x = await decJSON(d.data().enc); if (x && x.key) m[x.key] = { ...x, docId: d.id }; } catch (e) {} }
    EDITS = m; if (location.hash === '#prompts') renderPrompts(); if (location.hash === '#flow') renderFlow();
  }, e => { console.warn('edits', e.code || e); editsUnsub = null; });
}
const CAT_USE = { 'Planning': 'planning lessons and units', 'Resources': 'making classroom resources', 'Assessment & Feedback': 'marking, feedback and assessment', 'Inclusion & SEN': 'supporting pupils with additional needs', 'Revision & Exams': 'revision and exam classes', 'Engagement': 'hooks and lively lessons', 'Pastoral & Wellbeing': 'form time and pastoral work', 'Admin & Communication': 'emails, letters and reports', 'Leadership & Data': 'department leadership and data', 'Pupil AI Literacy': 'teaching pupils about AI', 'Metacognition & Cowriting': 'modelling and independent learning' };
// "Great for" hint: the new CCEA prompts carry their own; others are described from their stage, subject and area
function promptFit(p) {
  if (p.fit) return p.fit;
  const subj = (p.subj || []).filter(x => x !== 'All subjects'), st = p.stage && p.stage !== 'Any' ? p.stage : '';
  const who = subj.length ? `${st ? st + ' ' : ''}${subj.join(', ')}` : st ? `${st}, any subject` : 'Any subject, any year';
  return `${who} · ${CAT_USE[p.cat] || 'everyday teaching'}${/\[[^\]]*(topic|unit|text|question)[^\]]*\]/i.test(p.text) ? ' · add your own topic' : ''}`;
}
// Plain-language overview of a prompt for the card: what it does, what you get, what you can change.
// The full wording (role, rules, UK English…) is only shown once the teacher taps "Use this prompt".
const RULE_RE = /^(act as|you are|format:|use uk english|do not ask|do not include|don't ask|base everything|write original|align with|keep both|keep it|questions must|if something|if you are unsure|rules?:|use plain|use accurate|make it|never use|include:|write:|do the following:|for each|the task:)/i;
const toYou = t => t.replace(/\bmy\b/g, 'your').replace(/\bMy\b/g, 'Your').replace(/\bI'm\b/g, "you're").replace(/\bI want\b/g, 'You want').replace(/\bI can\b/g, 'you can').replace(/\bI should\b/g, 'you should').replace(/\bme\b/g, 'you');
function promptSummary(p) {
  const lines = (p.text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const plain = t => t.replace(/\[[^\]\n]{1,220}\]/g, m => tokParts(m).def || tokParts(m).label);
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 6).replace(/\s+\S*$/, '') + '…' : t);
  const body = lines.filter(l => !RULE_RE.test(l) && !/^([-•]|\d+\.)/.test(l) && !/^\[(paste|insert|attach)/i.test(l));
  let what = body.slice(0, 2).join(' ');
  if (what.length > 260) what = clip(what, 260);
  // what you get: the prompt's own checklist of contents, then how it is laid out
  const items = lines.filter(l => /^([-•]|\d+\.)\s/.test(l)).map(l => clip(plain(l.replace(/^([-•]|\d+\.)\s*/, '')), 120));
  const fl = lines.find(l => /^format:/i.test(l)); let layout = fl ? plain(fl.replace(/^format:\s*/i, '')) : '';
  let get = items;
  if (!get.length && layout) { get = layout.split(/;\s+|,?\s+then\s+|\.\s+/).map(x => x.trim()).filter(x => x.length > 3).map(x => clip(x, 120)); layout = ''; }
  layout = clip(layout, 200);
  const ins = [...new Set(((p.text || '').match(TOKRE) || []).map(m => tokParts(m).label.replace(/^paste (the |your )?/i, 'Paste ')))].slice(0, 5);
  return { what: toYou(what || p.title), get: get.slice(0, 6), more: Math.max(0, get.length - 6), layout, ins };
}
const upFirst = t => t ? t[0].toUpperCase() + t.slice(1) : t;
function summaryHTML(p) {
  const sm = promptSummary(p);
  return `<div class="pl-sum"><p class="ps-what">${showTokens(esc(sm.what))}</p>
    ${sm.get.length ? `<div class="ps-get"><b>What you’ll get</b><ul>${sm.get.map(x => `<li>${esc(upFirst(x))}</li>`).join('')}${sm.more ? `<li class="ps-more">and ${sm.more} more</li>` : ''}</ul>${sm.layout ? `<p class="ps-lay"><b>Laid out as:</b> ${esc(sm.layout[0].toLowerCase() + sm.layout.slice(1))}</p>` : ''}</div>` : sm.layout ? `<p class="ps-lay"><b>What you’ll get:</b> ${esc(sm.layout)}</p>` : ''}
    ${sm.ins.length ? `<p class="ps-in"><b>You can change:</b> ${sm.ins.map(x => `<span>${esc(upFirst(x))}</span>`).join('')}</p>` : ''}</div>`;
}
// which tools a prompt can go to, with the teacher's own tool first
function cardTools(tool) {
  let tools = ['Gemini', 'Copilot', 'NotebookLM'].filter(x => tool.includes(x)); if (!tools.length) tools = ['Gemini', 'Copilot'];
  const mt = myTool();
  if (mt && /^(Gemini|Copilot)( or (Gemini|Copilot))?$/.test(tool.trim())) tools = [mt, mt === 'Gemini' ? 'Copilot' : 'Gemini'];
  else if (mt && tools.includes(mt)) tools = [mt, ...tools.filter(x => x !== mt)];
  return tools;
}
function promptCard(p) {
  const ph = t => showTokens(esc(t));
  const live = p.issue && status(p.issue) === 'live';
  const from = p.mine ? `<span>Your own version</span>` : p.by ? `<span>Shared by ${esc(p.by)}</span>` : p.issue ? (live || canManage() ? `<a href="#issue-${esc(p.issue.id)}">From Issue ${p.issue.n} · ${esc(p.issue.title)}</a>` : '<span>From an upcoming issue</span>') : `<span>${esc(p.subj[0] === 'All subjects' ? p.cat : p.subj.join(', ') + ' · ' + p.cat)}${p.stage && p.stage !== 'Any' ? ' · ' + esc(p.stage) : ''}</span>`;
  let tools = ['Gemini', 'Copilot', 'NotebookLM'].filter(x => p.tool.includes(x)); if (!tools.length) tools = ['Gemini', 'Copilot'];
  const mt = myTool();
  // plain Gemini/Copilot prompts work in either, so lead with the teacher's own tool and offer the other as "Use … instead"
  if (mt && /^(Gemini|Copilot)( or (Gemini|Copilot))?$/.test(p.tool.trim())) tools = [mt, mt === 'Gemini' ? 'Copilot' : 'Gemini'];
  else if (mt && tools.includes(mt)) tools = [mt, ...tools.filter(x => x !== mt)];
  const send = mt && tools[0] === mt
    ? `<button class="pl-send main" data-send="${mt}" title="Copy this prompt and open ${mt}"><img src="${TOOL_ICON[mt]}" alt="">Send to ${mt}</button>` + tools.slice(1).map(x => `<button class="pl-alt" data-send="${x}" title="Copy this prompt and open ${x}">Use ${x} instead</button>`).join('')
    : tools.map(x => `<button class="pl-send" data-send="${x}" title="Copy this prompt and open ${x}"><img src="${TOOL_ICON[x]}" alt="">Send to ${x}</button>`).join('');
  const starred = savedKeys().includes(p.key), rt = ratingOf(p.key), ed = canManage();
  const badge = rt.up || (ed && rt.down) ? `<span class="pl-score" title="${rt.up} said it worked${ed ? `, ${rt.down} said it needed fixing` : ''}">👍 ${rt.up}${ed && rt.down ? ` · 👎 ${rt.down}` : ''}</span>` : '';
  const adm = ed && !p.mine ? `<button class="btn small pl-admedit" data-admin-edit="${esc(p.key)}">✏️ Edit prompt</button>` : '';
  const extra = adm + (p.mine ? `<button class="btn small" data-mine-share="${esc(p.mine.id)}">Share with staff</button><button class="btn small" data-mine-del="${esc(p.mine.id)}">Delete</button>` : '');
  return `<article class="pl-card" data-key="${esc(p.key)}" data-cat="${esc(p.cat)}" data-stage="${esc(p.stage || 'Any')}" data-tool="${esc(p.tool)}" data-subj="${esc((p.subj || []).join('|'))}" data-raw="${esc(p.text)}"><header><div class="pl-toprow"><b class="pl-tool">${esc(p.tool.replace(' or ', ' · '))}</b>${badge}${p.mine ? '' : `<button class="pl-star${starred ? ' on' : ''}" data-star="${esc(p.key)}" aria-pressed="${starred}" title="${starred ? 'Saved – tap to remove' : 'Save this prompt'}">${starred ? '★' : '☆'}</button>`}</div><h3>${esc(p.title)}</h3><p class="pl-fit"><span aria-hidden="true">🎯</span> <b>Great for:</b> ${esc(promptFit(p))}</p></header>${summaryHTML(p)}<div class="pl-sendrow"><button class="btn primary pl-use" data-pledit>Use this prompt</button><span class="pl-usehint">${tools[0] === mt && mt ? `Opens in ${mt}` : `Gemini or Copilot`}</span></div><footer>${from}<span class="pl-fbtns">${extra}</span></footer></article>`;
}
// "Send to…": copies the prompt and opens the tool in a new tab (none of these tools accept a prompt in the link, so staff paste with Ctrl+V)
const TOOL_URL = { Gemini: 'https://gemini.google.com/app', Copilot: 'https://m365.cloud.microsoft/chat', NotebookLM: 'https://notebooklm.google.com/' };
const svgIcon = s => 'data:image/svg+xml,' + encodeURIComponent(s);
const TOOL_ICON = {
  Gemini: svgIcon('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8df7"/><stop offset="1" stop-color="#a66cf2"/></linearGradient></defs><path fill="url(#g)" d="M12 1c.6 5.8 5.2 10.4 11 11-5.8.6-10.4 5.2-11 11-.6-5.8-5.2-10.4-11-11C6.8 11.4 11.4 6.8 12 1z"/></svg>'),
  Copilot: svgIcon('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2aa8f2"/><stop offset=".5" stop-color="#7b5cf0"/><stop offset="1" stop-color="#f2668b"/></linearGradient></defs><path fill="url(#c)" d="M7 3h7a4 4 0 0 1 3.8 2.8L21 16a3.5 3.5 0 0 1-3.4 5H10a4 4 0 0 1-3.8-2.8L3 8a3.5 3.5 0 0 1 3.4-5z"/></svg>'),
  NotebookLM: svgIcon('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#111"/><path d="M6 15a6 6 0 0 1 12 0M8.5 15a3.5 3.5 0 0 1 7 0" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>')
};
function plSend(b) { openFill(b.closest('.pl-card'), (txt, go) => (go === 'copy' ? copyText(txt, b) : sendText(txt, go && go !== 'copy' ? go : b.dataset.send))); }
function plEdit(b) { const c = b.closest('.pl-card'); openFill(c, (txt, go) => (go && go !== 'copy' ? sendText(txt, go) : copyText(txt, c.querySelector('[data-plcopy]'))), true); }
function sendText(txt, x) {
  let ok = true; try { navigator.clipboard.writeText(txt).catch(() => { ok = false; }); } catch (e) { ok = false; }
  const w = window.open(TOOL_URL[x], '_blank', 'noopener');
  toast(`Prompt copied – in ${x}, click the message box and paste (Ctrl+V)${/Android|iPhone|iPad/i.test(navigator.userAgent) ? ' or press and hold, then Paste' : ''}`);
  if (!w) setTimeout(() => toast(`Prompt copied – now open ${x} and paste it in`), 2700);
  if (!ok) setTimeout(() => toast('Couldn’t copy automatically – select the prompt text and copy it'), 200);
}
/* ---------- "Make it yours": fill the [brackets] before sending ---------- */
// Topic suggestions taken from the CCEA GCSE specifications (unit titles and main content areas). Staff can always type their own.
const CCEA_TOPICS = {
  'Biology': ['Cells', 'Living processes', 'Biodiversity', 'Body systems', 'Genetics', 'Microorganisms and health', 'Practical skills'],
  'Chemistry': ['Structures', 'Trends', 'Chemical reactions', 'Quantitative chemistry', 'Analysis', 'Further chemical reactions', 'Rates and equilibrium', 'Calculations', 'Organic chemistry', 'Practical skills'],
  'Physics': ['Motion', 'Force', 'Moments', 'Density and kinetic theory', 'Energy', 'Atomic and nuclear physics', 'Waves', 'Light', 'Electricity', 'Magnetism and electromagnetism', 'Space physics', 'Practical skills'],
  'Science': ['Cells, living processes and biodiversity', 'Body systems, genetics, microorganisms and health', 'Structures, trends and chemical reactions', 'Quantitative chemistry and analysis', 'Rates, equilibrium and organic chemistry', 'Motion, force, moments and energy', 'Density, kinetic theory and radioactivity', 'Waves, light, electricity and magnetism', 'Space physics', 'Practical skills'],
  'English': ['Writing for purpose and audience', 'Reading non-fiction and media texts', 'Speaking and listening', 'Studying spoken and written language', 'Personal or creative writing', 'Reading literary and non-fiction texts'],
  'English Literature': ['The study of prose', 'The study of drama', 'The study of poetry', 'The study of Shakespeare'],
  'Geography': ['Rivers and river management', 'Coasts and coastal management', 'Weather and extreme weather', 'Earthquakes and volcanoes', 'Population and migration', 'Refugees', 'Inner city issues and urban change', 'Sustainable development', 'Consumption and the environment', 'Fieldwork'],
  'History': ["Germany 1933–45 (Hitler's dictatorship)", 'The USA 1920–33 (the Roaring Twenties)', 'Northern Ireland and its neighbours', 'International relations 1945–2003', 'The Cuban Missile Crisis', 'The USA and 9/11'],
  'Religious Studies': ['The Christian Church (Catholic and Protestant)', 'The revelation of God', 'The Gospel of Matthew', 'The Gospel of Mark', 'Christian ethics', 'Philosophy of religion', 'Islam', 'Judaism'],
  'Digital Technology & IT': ['Digital technology', 'Digital authoring concepts', 'Digital authoring practice', 'Digital development concepts (programming)', 'Digital development practice'],
  'Business Studies': ['Starting a business', 'Developing a business', 'Planning a business'],
  'Home Economics': ['Where food comes from', 'Macronutrients and micronutrients', 'Nutritional guidelines', 'Food safety', 'Dietary needs of different groups', 'Practical food preparation', 'Being an effective consumer'],
  'Learning for Life and Work': ['Local and global citizenship', 'Personal development', 'Employability', 'Controlled assessment task'],
  'Moving Image Arts': ['Critical understanding of moving image production', 'Acquisition of skills in moving image production', 'Planning and making a moving image product'],
  'Music': ['Performing and appraising', 'Composing', 'Listening and appraising'],
  'French': ['Identity, lifestyle and culture', 'Local, national, international and global areas of interest', 'School life, studies and the world of work', 'Listening', 'Speaking', 'Reading', 'Writing'],
  'German': ['Identity, lifestyle and culture', 'Local, national, international and global areas of interest', 'School life, studies and the world of work', 'Listening', 'Speaking', 'Reading', 'Writing'],
  'Spanish': ['Identity, lifestyle and culture', 'Local, national, international and global areas of interest', 'School life, studies and the world of work', 'Listening', 'Speaking', 'Reading', 'Writing'],
  'Drama': ['Devised performance', 'Scripted performance', 'Knowledge and understanding of drama'],
  'Physical Education': ['Factors underpinning health and performance', 'Health', 'Physical fitness', 'The active leisure industry', 'Developing performance', 'Individual performances in physical activities'],
  'Technology and Design': ['Technology and Design core content', 'Electronic and microelectronic control systems', 'Mechanical and pneumatic control systems', 'Product design', 'Design and manufacturing project'],
  'Art and Design': ['Exploratory portfolio', 'Understanding the creative and cultural industries', 'Externally set assignment'],
  'Mathematics': ['Number', 'Algebra', 'Geometry and measures', 'Handling data', 'Probability']
};
// The ERGS prospectus says Key Stage 4 courses follow CCEA unless otherwise stated, and none are stated otherwise.
const YEARS = ['Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13', 'Year 14'];
const fillMem = () => { try { return JSON.parse(LS.get('ergsNL.fill') || '{}'); } catch (e) { return {}; } };
// inputs can carry a default: [Label=default] shows as the default text and opens as a pre-filled box
const TOKRE = /\[[^\]\n]{1,220}\]/g;
const tokParts = t => { const m = t.slice(1, -1).match(/^([^=]{1,40})=(.*)$/s); return m ? { label: m[1].trim(), def: m[2].trim() } : { label: t.slice(1, -1), def: '' }; };
const resolveDefaults = t => t.replace(TOKRE, m => { const p = tokParts(m); return p.def ? p.def : m; });
const showTokens = h => h.replace(/\[[^\]\n]{1,220}\]/g, m => { const p = tokParts(m); return p.def ? `<mark class="ph def" title="${p.label} – tap to change">${p.def}</mark>` : `<mark class="ph">${m}</mark>`; });
function fieldKind(tok) {
  tok = '[' + tokParts(tok).label + ']';
  const t = tok.toLowerCase();
  if (/^\[(x|year|year group|year group\/class)\]$/.test(t)) return 'year';
  if (/^\[(subject)\]$/.test(t) || /^\[subject\/topic\]$/.test(t) && false) return 'subject';
  if (/paste|insert text|attach/.test(t)) return 'paste';
  if (/topic|unit/.test(t)) return 'topic';
  return 'text';
}
// Added to every prompt sent or copied (teachers can untick it): asks the AI for a clean, ready-to-use answer
const TIDY = `

---
How to lay out your answer (I'm a busy teacher):
- Go straight into the finished resource. No introduction, no recap of my request, no sign-off.
- Use clear headings, short bullet points and tables where they help, so it's quick to scan.
- Make it ready to use as it is: easy to print, or to paste into Word, Google Docs or PowerPoint.
- Follow any format I've asked for above. Put answers, mark schemes or teacher notes in a separate section at the end.
- Use UK English. Where it's for pupils, pitch the wording at their age and level.
- If something is unclear, make a sensible assumption and note it in one line at the end rather than asking me first.
- Never use em dashes. Use commas, colons, brackets or full stops instead.`;
const tidyOn = () => true;   // always on: every prompt asks for a clean, ready-to-use answer
const noDash = t => t.replace(/\s*[\u2014]\s*/g, ', ').replace(/\u2013/g, '-');
const withTidy = (t, on = tidyOn()) => { t = noDash(resolveDefaults(t)); return on && !t.includes("I'm a busy teacher") ? t.trim() + TIDY : t; };
function openFill(card, action0, edit) {
  let shareVariant = () => {};
  const action = (t, go) => { const r = action0(withTidy(t), go); logUse(card, go); try { shareVariant(); } catch (e) {} setTimeout(() => askRating(card), 900); return r; };
  const txt = card.dataset.raw || card.querySelector('.pl-text').textContent;
  const toks = [...new Set(txt.match(TOKRE) || [])];
  if (!toks.length && !edit) return action(txt);
  const mem = fillMem(), main = (mySubjects() || [])[0] || '';
  const subjOfCard = (card.dataset.subj || '').split('|').find(s => CCEA_TOPICS[s]) || '';
  const label = t => { const k = fieldKind(t), s = tokParts(t).label; return k === 'year' ? 'Year group' : k === 'paste' ? s.charAt(0).toUpperCase() + s.slice(1) : s.charAt(0).toUpperCase() + s.slice(1); };
  const sheet = document.createElement('div'); sheet.className = 'fill-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Fill in this prompt');
  const tools = cardTools(card.dataset.tool || 'Gemini or Copilot');
  sheet.innerHTML = `<form class="fill-card"><header><span class="eyebrow">${toks.length ? 'Make it yours' : 'Edit this prompt'}</span><h3>${esc(card.querySelector('h3').textContent)}</h3><button type="button" class="fill-x" aria-label="Close">×</button></header><p class="fill-what">${showTokens(esc(promptSummary({ text: txt, title: '' }).what))}</p>
    <div class="fill-fields">${toks.map((t, k) => {
      const kind = fieldKind(t), id = 'ff' + k, def = tokParts(t).def;
      if (kind === 'year') { const pick = def && YEARS.includes(def) ? def : mem.year; return `<label for="${id}">Year group</label><select id="${id}" data-tok="${esc(t)}"><option value="">Choose…</option>${YEARS.map(y => `<option ${pick === y ? 'selected' : ''}>${y}</option>`).join('')}</select>`; }
      if (def && def.length > 60) return `<label for="${id}">${esc(label(t))}</label><textarea id="${id}" rows="3" data-tok="${esc(t)}">${esc(def)}</textarea>`;
      if (def) return `<label for="${id}">${esc(label(t))}</label><input id="${id}" data-tok="${esc(t)}" ${kind === 'topic' ? 'data-topic list="fillTopics"' : tokParts(t).label === 'Need' ? 'list="fillNeeds"' : ''} value="${esc(def)}">`;
      if (kind === 'paste') return `<label for="${id}">${esc(label(t))} <small>optional – you can paste this in the AI tool instead</small></label><textarea id="${id}" rows="3" data-tok="${esc(t)}" placeholder="Paste here, or leave blank"></textarea>`;
      if (kind === 'subject') return `<label for="${id}">Subject</label><input id="${id}" data-tok="${esc(t)}" list="fillSubj" value="${esc(subjOfCard || main || mem.subject || '')}" placeholder="e.g. Geography">`;
      if (kind === 'topic') { const dl = CCEA_TOPICS[subjOfCard || main] || [], demo = mem.topic && mem.topicSubj === (subjOfCard || main) ? mem.topic : dl.length ? dl[Math.floor(Date.now() / 864e5) % dl.length] : '';
        return `<label for="${id}">${esc(label(t))} ${demo ? '<small>demo topic – replace with your own</small>' : ''}</label><input id="${id}" data-tok="${esc(t)}" data-topic data-demo="${esc(demo)}" list="fillTopics" value="${esc(demo)}" placeholder="Type or pick a CCEA topic">`; }
      return `<label for="${id}">${esc(label(t))}</label><input id="${id}" data-tok="${esc(t)}" placeholder="${esc(t.slice(1, -1))}">`;
    }).join('')}</div>
    <datalist id="fillSubj">${(mySubjects() && mySubjects().length ? mySubjects() : SUBJECTS.map(s => s[0])).map(s => `<option value="${esc(s)}">`).join('')}</datalist><datalist id="fillTopics"></datalist><datalist id="fillNeeds">${['Dyslexia', 'Autism (ASD)', 'ADHD', 'Dyspraxia (DCD)', 'speech, language and communication needs', 'working memory difficulties', 'moderate learning difficulties', 'social, emotional and mental health needs', 'anxiety', 'hearing impairment', 'visual impairment', 'dyscalculia'].map(n => `<option value="${n}">`).join('')}</datalist>
    <p class="fill-hint" id="fillHint"></p>
    <label class="fill-edlab" for="fillPrev">The full prompt <small>this is exactly what gets sent – edit anything you like</small></label><textarea id="fillPrev" class="fill-ed" rows="${edit ? 10 : 6}" spellcheck="true"></textarea>
    ${toks.some(t => /topic|task|question|situation|focus|theme|destination|skill/i.test(tokParts(t).label)) ? `<label class="fill-sharemine"><input type="checkbox" id="fillShareMine" checked><span><b>Add my version for colleagues</b><small>If you change the topic or task, your version (with your name) is added to the Prompt Bank so other staff can use it too.</small></span></label>` : ''}
    <div class="fill-tidy"><span class="ft-ic" aria-hidden="true">✓</span><span><b>Ready-to-use answer is switched on</b><small>Every prompt asks the AI to skip the waffle: headings, short bullets, answers at the end, UK English, no em dashes. <a href="#" id="fillTidyPeek">See what's added</a></small></span></div>
    <pre class="fill-tidypeek" id="fillTidyText" hidden></pre>
    <footer>${tools.map((x, i) => i && myTool() === tools[0] ? `<button type="submit" class="linkbtn fill-alt" data-go="${x}">Use ${x} instead</button>` : `<button type="submit" class="btn ${i ? '' : 'primary'}" data-go="${x}"><img src="${TOOL_ICON[x]}" alt=""> Send to ${x}</button>`).join('')}<button type="submit" class="btn" data-go="copy">Copy</button><button type="button" class="linkbtn fill-save" data-save-mine>☆ Save my version</button></footer>
    ${toks.length ? '<p class="fill-skip"><button type="button" class="linkbtn" data-go-raw>Use it with the [brackets] as they are</button></p>' : ''}</form>`;
  document.body.appendChild(sheet); document.body.classList.add('sp-open');
  const f = sheet.querySelector('form'), fields = [...f.querySelectorAll('[data-tok]')];
  const curSubj = () => { const s = f.querySelector('[list="fillSubj"]'); return (s && s.value.trim()) || subjOfCard || main; };
  const build = () => { let out = txt; fields.forEach(el => { const v = el.value.trim() || tokParts(el.dataset.tok).def; if (v) out = out.split(el.dataset.tok).join(fieldKind(el.dataset.tok) === 'year' && /Year \[/i.test(txt) && el.dataset.tok === '[X]' ? v.replace(/^Year /, '') : v); }); return out; };
  const refresh = () => {
    const s = curSubj(), list = CCEA_TOPICS[s] || [];
    $('#fillTopics').innerHTML = list.map(t => `<option value="${esc(t)}">`).join('');
    $('#fillHint').textContent = f.querySelector('[data-topic]') ? (list.length ? `Topic suggestions are from the CCEA GCSE ${s} specification – or type your own.` : 'Type your topic – suggestions appear for subjects with a CCEA GCSE specification.') : '';
    const ta = $('#fillPrev'); if (!ta.dataset.dirty) ta.value = build(); else fields.forEach(el => { const v = el.value.trim(); if (v && ta.value.includes(el.dataset.tok)) ta.value = ta.value.split(el.dataset.tok).join(v); });
  };
  // linked boxes: changing the main one (Topic or Need) swaps untouched detail boxes for a neutral line, so they never clash
  const DEPS = { 'Topic': { 'Content to cover': 'the key content for this topic in the CCEA specification' },
    'Need': { 'Need details': 'the typical difficulties associated with this need', 'Helpful approaches': 'approaches known to help pupils with this need' } };
  const byLabel = l => fields.find(el => tokParts(el.dataset.tok).label === l);
  // a teacher's own topic or task is added to the Prompt Bank for everyone (named), unless they untick the box
  const OWN_RE = /topic|task|question|situation|focus|theme|destination|skill|subject and topic/i;
  const ownFields = () => fields.filter(el => { const tp = tokParts(el.dataset.tok), base = tp.def || el.dataset.demo || ''; const v = el.value.trim(); return OWN_RE.test(tp.label) && v && v !== base && v.length >= 3 && v.length <= 140 && !/@|\d{5,}/.test(v); });
  shareVariant = () => {
    const own = ownFields(); if (!own.length || !$('#fillShareMine')?.checked || !DB || !KEY) return;
    let text = txt; fields.forEach(el => { const tp = tokParts(el.dataset.tok), v = el.value.trim(); if (v && (tp.def || own.includes(el)) && v !== tp.def) text = text.split(el.dataset.tok).join(`[${tp.label}=${v}]`); });
    const main0 = own[0].value.trim(), t0 = card.querySelector('h3').textContent, title = (t0.includes(':') ? t0.replace(/:.*$/, '') : t0) + ': ' + main0;
    const subj = (card.dataset.subj || '').split('|')[0] || 'All subjects';
    if (SHARED.some(x => x.title.toLowerCase() === title.toLowerCase() && x.subj === subj)) return;
    encJSON({ title: title.slice(0, 100), text: text.slice(0, 4000), subj, stage: card.dataset.stage || 'Any', cat: card.dataset.cat || 'Resources', tool: card.dataset.tool || 'Gemini or Copilot', name: (LS.get('ergsNL.name') || '').slice(0, 60), b: card.dataset.key || '' })
      .then(async enc => { const t = await visitToken(); return putShared(enc, t); }).then(() => toast('Your version is now in the Prompt Bank for colleagues')).catch(e => console.warn('variant', e.code || e));
  };
  f.querySelector('[data-save-mine]').addEventListener('click', () => saveMyVersion(card, $('#fillPrev').value.trim() || build()));
  f.addEventListener('input', e => {
    if (e.target.id === 'fillPrev') { e.target.dataset.dirty = 1; return; }
    e.target.dataset.edited = 1;
    const lab = e.target.dataset.tok ? tokParts(e.target.dataset.tok).label : '', deps = DEPS[lab];
    if (deps) { const changed = e.target.value.trim() !== tokParts(e.target.dataset.tok).def;
      Object.entries(deps).forEach(([dl, neutral]) => { const d = byLabel(dl); if (d && !d.dataset.edited) d.value = changed ? neutral : tokParts(d.dataset.tok).def; }); }
    refresh();
  }); refresh();
  const close = () => { sheet.remove(); document.body.classList.remove('sp-open'); };
  sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('.fill-x')) close(); });
  sheet.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  let go = null; f.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go = b.dataset.go; });
  f.querySelector('[data-go-raw]')?.addEventListener('click', () => { close(); action(txt); });
  $('#fillTidyPeek').addEventListener('click', e => { e.preventDefault(); const p = $('#fillTidyText'); p.textContent = TIDY.replace(/^\s*---\s*/, ''); p.hidden = !p.hidden; e.target.textContent = p.hidden ? "See what's added" : 'Hide'; });
  f.addEventListener('submit', e => {
    e.preventDefault(); const out = $('#fillPrev').value.trim() || build();
    const y = f.querySelector('select[data-tok]'), tp = f.querySelector('[data-topic]');
    LS.set('ergsNL.fill', JSON.stringify({ ...fillMem(), ...(y && y.value ? { year: y.value } : {}), ...(tp && tp.value ? { topic: tp.value, topicSubj: curSubj() } : {}) }));
    close(); action(out, go);
  });
  setTimeout(() => { const el = edit ? $('#fillPrev') : (fields.find(el => !el.value) || fields[0]); el?.focus(); }, 60);
}
function plCopy(b) { openFill(b.closest('.pl-card'), (txt, go) => (go && go !== 'copy' ? sendText(txt, go) : copyText(txt, b))); }
async function copyText(txt, b) {
  if (!b || !b.hasAttribute('data-plcopy')) { try { await navigator.clipboard.writeText(txt); toast('Prompt copied'); } catch (er) { toast('Select the prompt text to copy it'); } return; }
  try { await navigator.clipboard.writeText(txt); b.textContent = 'Copied ✓'; b.classList.add('done'); setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1800); }
  catch (er) { toast('Select the prompt text to copy it'); }
}
function renderPrompts() {
  watchRatings(); watchShared(); watchEdits();
  const all = allPrompts();
  if (!plFilt.subjSet) { plFilt.subjSet = true; const m = !canManage() && (mySubjects() || [])[0]; if (m) plFilt.subj = m; }
  if (!$('#plCats').dataset.ready) {
    $('#plCats').dataset.ready = 1;
    const subs = [...new Set(all.flatMap(p => p.subj).filter(s => s !== 'All subjects'))].sort();
    const mineS = canManage() ? null : (mySubjects() || []).length ? mySubjects() : null;
    $('#plSubj').innerHTML = `<option value="">${mineS ? 'All my subjects' : 'All subjects'}</option><option value="__gen">General (any subject)</option>` + (mineS ? subs.filter(s => mineS.includes(s)) : subs).map(s => `<option>${esc(s)}</option>`).join('') + (canManage() ? '' : '<option value="__edit">✎ Change my subjects…</option>');
    $('#plStage').innerHTML = '<option value="">Any stage</option>' + ['KS3', 'GCSE', 'A Level'].map(s => `<option>${s}</option>`).join('');
    $('#plTool').innerHTML = '<option value="">Any AI tool</option>' + ['Gemini', 'Copilot', 'NotebookLM'].map(s => `<option>${s}</option>`).join('');
    $('#plSubj').value = plFilt.subj;
    const set = (k, v) => { plFilt[k] = v; plFilt.shown = 40; renderPrompts(); };
    if (!$('#plQ').dataset.w) { $('#plQ').dataset.w = 1;
    $('#plQ').addEventListener('input', e => set('q', e.target.value.toLowerCase().trim()));
    $('#plSubj').addEventListener('change', e => { if (e.target.value === '__edit') { e.target.value = plFilt.subj; askSubjects(true); return; } set('subj', e.target.value); });
    $('#plStage').addEventListener('change', e => set('stage', e.target.value));
    $('#plTool').addEventListener('change', e => set('tool', e.target.value));
    $('#plGen').addEventListener('change', e => set('withGen', e.target.checked));
    $('#plCats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) set('cat', b.dataset.cat); });
    $('#plPick').addEventListener('click', e => { if (e.target.closest('[data-share]')) return openSharePrompt(); const b = e.target.closest('[data-cat]'); if (b) { set('cat', b.dataset.cat); scrollTo({ top: 0, behavior: 'smooth' }); } });
    $('#plMyTool').addEventListener('click', e => { const b = e.target.closest('[data-mt]'); if (!b) return; setMyTool(b.dataset.mt); toast(b.dataset.mt ? `Prompts will open in ${b.dataset.mt} – you can still pick the other one` : 'Licence not allocated yet – both are shown'); renderPrompts(); });
    $('#plCrumb').addEventListener('click', e => { if (e.target.closest('[data-back]')) { plFilt.q = ''; $('#plQ').value = ''; set('cat', null); scrollTo({ top: 0, behavior: 'smooth' }); } });
    $('#plReset').addEventListener('click', () => { Object.assign(plFilt, { q: '', cat: plFilt.cat ?? '', subj: (!canManage() && (mySubjects() || [])[0]) || '', stage: '', tool: '', shown: 40, withGen: true }); $('#plGen').checked = true; $('#plQ').value = ''; ['#plStage', '#plTool'].forEach(s => { $(s).value = ''; }); $('#plSubj').value = plFilt.subj; renderPrompts(); });
    if (!$('#plMore').dataset.w) { $('#plMore').dataset.w = 1; $('#plMore').addEventListener('click', () => { plFilt.shown += 40; renderPrompts(); }); $('#plMySubj').addEventListener('click', () => askSubjects(true)); }
    const cardClick = e => {
      const st_ = e.target.closest('[data-star]'); if (st_) { e.stopPropagation(); toggleStar(st_.dataset.star, st_); if (plFilt.cat === '__saved') renderPrompts(); return; }
      const ae = e.target.closest('[data-admin-edit]'); if (ae) { e.stopPropagation(); return openPromptEditor(ae.dataset.adminEdit); }
      const md = e.target.closest('[data-mine-del]'); if (md) return deleteMine(md.dataset.mineDel);
      const ms = e.target.closest('[data-mine-share]'); if (ms) { const m = myVersions().find(x => x.id === ms.dataset.mineShare); return openSharePrompt(m); }
      const b = e.target.closest('[data-plcopy]'); if (b) plCopy(b); const s = e.target.closest('[data-send]'); if (s) plSend(s); const ed = e.target.closest('[data-pledit]'); if (ed) return plEdit(ed);
      const card = e.target.closest('.pl-card'); if (card && !e.target.closest('button,a,select,input') && !getSelection().toString()) plEdit(card); };
    $('#plList').addEventListener('click', cardClick); $('#plToday').addEventListener('click', cardClick);
    }
  }
  const mine = canManage() ? null : (mySubjects() || []).length ? mySubjects() : null;
  const words = plFilt.q.split(/\s+/).filter(Boolean);
  const base = all.filter(p => {
    if (mine && p.subj[0] !== 'All subjects' && !p.subj.some(s => mine.includes(s))) return false;
    if (plFilt.subj === '__gen' ? p.subj[0] !== 'All subjects' : plFilt.subj && !p.subj.includes(plFilt.subj) && !(plFilt.withGen && p.subj[0] === 'All subjects')) return false;
    if (plFilt.stage && !(p.stage === plFilt.stage || p.stage === 'Any')) return false;
    if (!plFilt.stage && !levelOK(p)) return false;   // only the levels this teacher teaches in each of their subjects
    if (plFilt.tool && !p.tool.includes(plFilt.tool)) return false;
    const hay = (p.title + ' ' + p.text + ' ' + (p.fit || '') + ' ' + (p.issue ? p.issue.title + ' ' + (p.issue.theme || '') : '') + ' ' + p.tool + ' ' + p.subj.join(' ') + ' ' + p.cat).toLowerCase();
    return words.every(w => hay.includes(w));
  });
  const counts = {}; base.forEach(p => { counts[p.cat] = (counts[p.cat] || 0) + 1; });
  $('#plMyTool').innerHTML = `<span class="tp-lab">My AI licence</span>${toolPick(myTool(), 'data-mt')}`;
  // step 1: "What do you want a prompt for?" – a grid of big cards; step 2: the prompts for that choice
  const choosing = plFilt.cat === null && !plFilt.q;
  $('#plPick').hidden = !choosing; ['#plSels', '#plCount', '#plList'].forEach(s => { $(s).hidden = choosing; }); $('#plIntro').hidden = !choosing;
  $('#plCrumb').hidden = choosing; $('#plMyTool').hidden = !choosing || !isTeaching();
  { const pd = choosing ? promptOfDay() : null; $('#plToday').hidden = !pd; $('#plToday').innerHTML = pd ? `<span class="pt-label">✨ Prompt of the day</span>${promptCard(pd)}` : ''; }
  if (choosing) {
    $('#plTitle').textContent = 'What do you want a prompt for?'; $('#plMore').hidden = true;
    const ra = roleAreas(); $('#plPick').innerHTML = [...PL_CATS].sort((x, y) => (ra.includes(x) ? ra.indexOf(x) : 99) - (ra.includes(y) ? ra.indexOf(y) : 99)).filter(c => counts[c]).map(c => { const [ic, col] = PL_AREA[c]; return `<button class="pp-card" style="--c:${col}" data-cat="${esc(c)}"><span class="pp-ic" aria-hidden="true">${ic}</span><b>${esc(c)}</b><span class="pp-desc">${esc(PL_DESC[c] || '')}</span>${ra.includes(c) ? '<em class="pp-role">For your role</em>' : ''}</button>`; }).join('')
      + `<button class="pp-card pp-all" data-cat=""><span class="pp-ic" aria-hidden="true">🗂️</span><b>Show me everything</b><span class="pp-desc">Browse every prompt with filters</span></button>`
      + `<button class="pp-card pp-all pp-share" data-share><span class="pp-ic" aria-hidden="true">✍️</span><b>Share a prompt that worked</b><span class="pp-desc">Add your own to the bank, with your name on it</span></button>`;
    const nSaved = savedPrompts().length;
    if (nSaved) $('#plPick').insertAdjacentHTML('afterbegin', `<button class="pp-card pp-saved" style="--c:#8a6a12" data-cat="__saved"><span class="pp-ic" aria-hidden="true">⭐</span><b>My saved prompts</b><span class="pp-desc">${nSaved} saved, including your own versions</span></button>`);
    return;
  }
  { const c = plFilt.cat || '', [ic, col] = PL_AREA[c] || ['🔎', '#14284b'];
    $('#plTitle').textContent = plFilt.cat === '__saved' ? 'My saved prompts' : plFilt.cat ? plFilt.cat : plFilt.q && plFilt.cat === null ? 'Search results' : 'All prompts';
    $('#plCrumb').innerHTML = `<button class="pc-back" data-back>← Choose something else</button>${plFilt.cat ? `<span class="pc-tag" style="--c:${col}">${ic} ${esc(PL_DESC[c] || '')}</span>` : ''}`; }
  $('#plCats').classList.toggle('picked', !!plFilt.cat);
  $('#plCats').innerHTML = [['', 'All areas', base.length], ...PL_CATS.map(c => [c, c, counts[c] || 0])].map(([v, l, n]) => { const [ic, col] = PL_AREA[v] || ['🗂️', '#14284b']; return `<button class="pl-area${plFilt.cat === v ? ' on' : ''}" style="--c:${col}" data-cat="${esc(v)}" role="tab" aria-selected="${plFilt.cat === v}"${n || !v ? '' : ' disabled'}><span class="pa-ic" aria-hidden="true">${ic}</span><span class="pa-name">${esc(l)}</span><small>${n} prompt${n === 1 ? '' : 's'}</small></button>`; }).join('');
  { const on = $('#plCats .pl-chip.on'), row = $('#plCats'); if (!plFilt.cat) row.scrollLeft = 0; else if (on) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - 16); }
  let list = base.filter(p => !plFilt.cat || p.cat === plFilt.cat);
  if (plFilt.cat === '__saved') list = savedPrompts().filter(p => words.every(w => (p.title + ' ' + p.text).toLowerCase().includes(w)));
  // released issue prompts first (newest first), then the library, then upcoming issue prompts
  const rank = p => p.issue ? (status(p.issue) === 'live' ? 0 : 2) : 1;
  const own = p => plFilt.subj && plFilt.subj !== '__gen' && p.subj.includes(plFilt.subj) ? 0 : 1;   // the chosen subject's own prompts first
  const score = p => { const r = ratingOf(p.key); return r.up - r.down * 1.5; };   // prompts colleagues say worked rise to the top
  if (plFilt.cat !== '__saved') list.sort((x, y) => (own(x) - own(y)) || (score(y) - score(x)) || (rank(x) - rank(y)) || (rank(x) === 0 ? y.issue.n - x.issue.n : 0));
  $('#plGenWrap').hidden = true;
  [['#plSubj', plFilt.subj], ['#plStage', plFilt.stage], ['#plTool', plFilt.tool]].forEach(([k, v]) => $(k).parentElement.classList.toggle('set', !!v));
  $('#plCount').textContent = `${list.length} prompt${list.length === 1 ? '' : 's'}`;
  $('#plReset').hidden = !(plFilt.q || (plFilt.subj && plFilt.subj !== ((!canManage() && (mySubjects() || [])[0]) || '')) || plFilt.stage || plFilt.tool);
  $('#plList').innerHTML = list.slice(0, plFilt.shown).map(promptCard).join('') || '<p class="empty">No prompts match – try clearing a filter.</p>';
  $('#plMore').hidden = list.length <= plFilt.shown;
}
// homepage: a "prompt of the day" card at the very bottom of the library
function renderPromptHome() {
  const el = $('#plHome'); if (!el) return;
  const mine = canManage() ? null : (mySubjects() || []).length ? mySubjects() : null;
  const lib = allPrompts().filter(p => (!p.issue || status(p.issue) === 'live') && (!mine || p.subj[0] === 'All subjects' || p.subj.some(s => mine.includes(s))));
  const own = mine ? lib.filter(p => p.subj.some(s => mine.includes(s))) : []; const pool = own.length ? own : lib; if (!pool.length) { el.hidden = true; return; }
  const p = pool[Math.floor(Date.now() / 864e5) % pool.length], total = lib.length;
  el.hidden = false;
  el.innerHTML = `<div class="plh-text"><span class="eyebrow">Prompt library</span><h2>${total} ready-made prompts</h2>${mine ? `<p class="plh-mine">For ${esc(mine.length > 3 ? mine.slice(0, 3).join(', ') + ' and ' + (mine.length - 3) + ' more' : mine.join(', '))} · <button class="linkbtn" data-mysubj>change</button></p>` : ''}<p>For every subject we teach, from KS3 to A Level – planning, resources, feedback, SEN, revision, admin and more. Filter by subject, stage or AI tool, then copy and go.</p><a class="btn primary" href="#prompts">Browse all prompts</a></div>
    <div class="plh-pick"><span class="plh-label">${mine ? 'Your prompt of the day' : 'Prompt of the day'}</span>${promptCard(p)}</div>`;
  el.querySelector('[data-plcopy]')?.addEventListener('click', e => plCopy(e.currentTarget));
  el.querySelectorAll('[data-send]').forEach(s => s.addEventListener('click', () => plSend(s)));
  el.querySelector('.pl-card')?.addEventListener('click', e => { if (!e.target.closest('button,a') && !getSelection().toString()) plEdit(e.currentTarget); });
  el.querySelector('[data-pledit]')?.addEventListener('click', e => { e.stopPropagation(); plEdit(e.currentTarget); });
  el.querySelector('[data-mysubj]')?.addEventListener('click', () => askSubjects(true));
}

/* ---------- "How I used it" one-liners under each issue (encrypted with the staff key) ---------- */
let USES = null, usesUnsub = null;
function watchUses() {
  if (usesUnsub || !DB) return;
  usesUnsub = onSnapshot(collection(DB, 'newsletterUses'), async s => {
    const out = {};
    for (const d of s.docs) { try { const x = await decJSON(d.data().enc); (out[d.data().issue] ||= []).push({ ...x, id: d.id, at: d.data().at?.toMillis?.() || 0 }); } catch (e) {} }
    USES = out; const h = location.hash.slice(1); if (h.startsWith('issue-')) renderUses(h.slice(6));
  }, e => { console.warn('uses', e); USES = USES || {}; usesUnsub = null; const h = location.hash.slice(1); if (h.startsWith('issue-')) renderUses(h.slice(6)); });
}
function renderUses(id) {
  const el = $('#uses'); if (!el) return;
  const i = allIssues().find(x => x.id === id); if (!i) { el.hidden = true; return; }
  el.hidden = false; watchUses();
  const list = ((USES || {})[id] || []).slice().sort((a, b) => b.at - a.at);
  const name = LS.get('ergsNL.name') || '';
  el.innerHTML = `<h2>How colleagues have used this</h2>
    ${USES === null ? '<p class="muted">Loading…</p>' : list.length ? `<ul class="uses-list">${list.map(u => `<li><p>“${esc(u.text)}”</p><span>${esc(u.name || 'A colleague')}${u.at ? ' · ' + new Date(u.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}${canManage() ? ` <button class="linkbtn" data-unuse="${esc(u.id)}">Remove</button>` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Nobody has shared how they used this yet – be the first.</p>'}
    <form class="uses-form" id="usesForm"><label for="usesText">Tried this? Share how in one line</label>
      <div><input id="usesText" maxlength="140" placeholder="e.g. Used the quiz prompt for Y9 – saved 20 mins" required><button class="btn primary">Share</button></div>
      <small class="muted">Shown to staff with your name${name ? ` (${esc(name)})` : ''}. No pupil names or details, please.</small></form>`;
  $('#usesForm').addEventListener('submit', async e => {
    e.preventDefault(); const txt = $('#usesText').value.trim(); if (!txt) return;
    if (!DB || !KEY) return toast('Can’t share right now – check your connection');
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      await setDoc(doc(collection(DB, 'newsletterUses')), { issue: id, enc: await encJSON({ text: txt.slice(0, 140), name: (LS.get('ergsNL.name') || '').slice(0, 60) }), t: await visitToken(), at: serverTimestamp() });
      toast('Thanks for sharing'); $('#usesText').value = '';
    } catch (er) { console.warn(er); toast('Couldn’t share – try again'); }
    btn.disabled = false;
  });
  el.querySelectorAll('[data-unuse]').forEach(b => b.addEventListener('click', async () => { try { await deleteDoc(doc(DB, 'newsletterUses', b.dataset.unuse)); toast('Removed'); } catch (er) { toast('Couldn’t remove – check you’re signed in'); } }));
}

/* ---------- "I tried this" on tips ---------- */
const triedMap = () => { try { return JSON.parse(LS.get('ergsNL.tried') || '{}'); } catch (e) { return {}; } };
async function setTried(id, on) {
  const m = triedMap(); if (on) m[id] = today(); else delete m[id];
  LS.set('ergsNL.tried', JSON.stringify(m)); renderTipDayTally();
  try {
    if (!DB || !KEY) return; const dev = LS.get('ergsNL.dev'); if (!dev) return;
    await setDoc(doc(DB, 'newsletterTried', dev), { t: await visitToken(), c: Object.keys(m).length, at: serverTimestamp() });
  } catch (e) { console.warn('tried', e.code || e); }
}
function renderTipDayTally() {
  const el = $('#tdTally'); if (!el) return; const n = Object.keys(triedMap()).length;
  el.textContent = n ? `You’ve tried ${n} tip${n === 1 ? '' : 's'} so far` : ''; el.hidden = !n;
  document.querySelectorAll('[data-tried]').forEach(b => { const on = !!triedMap()[b.dataset.tried]; b.classList.toggle('on', on); b.textContent = on ? '✓ Tried it' : 'I tried this'; b.setAttribute('aria-pressed', on); });
}

/* ---------- writes ---------- */
let writing = Promise.resolve();
function setRelease(id, val, msg) {
  if (!ADMIN) return;
  RELEASES = { ...RELEASES, [id]: val }; render();
  writing = writing.then(() => setDoc(doc(DB, 'newsletter', 'state'), { releases: { [id]: val }, updated: serverTimestamp() }, { merge: true }))
    .then(() => msg && toast(msg)).catch(e => { console.warn(e); toast('Couldn’t save – check you’re signed in'); });
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }

/* ---------- admin ---------- */
let editing = null, formKind = 'tpl', pendingPages = null, pendingThumb = null;
function startEdit(i) {
  if (!i) return;
  if (i.custom) editing = { ...CUSTOM.find(c => c.id === i.id) };
  else editing = { kind: 'img', baseId: i.id, docId: i.ovDocId, n: i.n, title: i.title, theme: i.theme, tools: i.tools, summary: i.summary, link: i.link, pageDocs: i.ovPages || [], thumb: i.ovPages ? i.thumb : '' };
  formKind = editing.kind; pendingPages = pendingThumb = null;
  if (location.hash !== '#admin') location.hash = 'admin'; else renderAdmin();
  setTimeout(() => $('#formPanel')?.scrollIntoView({ behavior: 'smooth' }), 80);
}
function renderAdmin() {
  const w = $('#adminWrap');
  if (!AUTH) { w.innerHTML = '<div class="panel"><h2>Release desk</h2><p>Connecting…</p></div>'; return; }
  if (!ADMIN) {
    const signedOther = AUTHUSER && !ADMIN;
    w.innerHTML = `<div class="panel"><h2>Release desk</h2>
      <p class="muted">Only the newsletter editor can release and add issues. Enter your school email and we’ll send you a sign-in link – open it on this device.</p>
      ${LINK_MSG === 'confirm' ? '<p class="note">Confirm your email address to finish signing in.</p>' : LINK_MSG === 'expired' ? '<p class="note">That link has expired or was already used. Send a new one.</p>' : LINK_MSG === 'failed' ? '<p class="note">Sign-in didn’t finish. Check the address and try again.</p>' : ''}
      ${signedOther ? `<p class="note">You’re signed in as ${esc(AUTHUSER.email || 'another account')}, which isn’t the editor account. <button class="btn small" id="so">Sign out</button></p>` : ''}
      <div class="row"><div class="field"><label for="ae">Your email</label><input id="ae" type="email" value="${esc(LS.get('ergsNL.linkEmail') || C.admins[0])}"></div>
      <button class="btn primary" id="sendLink">${LINK_MSG === 'confirm' ? 'Finish signing in' : 'Email me a sign-in link'}</button></div><p id="am" class="muted"></p>
      <div class="row" style="margin-top:6px"><span class="muted">Using your Gmail account?</span><button class="btn" id="gSign"><svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" style="vertical-align:-3px;margin-right:6px"><path fill="#4285F4" d="M45 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.9 6.5-9.6 6.5-16.2z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.8-.7-4.3s.3-3 .7-4.3V14H4.5C3 17 2 20.4 2 24s1 7 2.5 10l7.3-5.7z"/><path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/></svg>Sign in with Google</button></div></div>`;
    $('#so')?.addEventListener('click', () => signOut(AUTH));
    $('#gSign').addEventListener('click', async () => {
      const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      try { await signInWithPopup(AUTH, p); }
      catch (err) { if (/popup-blocked|operation-not-supported|popup-closed-by-browser/.test(err.code || '')) return signInWithRedirect(AUTH, p); $('#am').textContent = err.code === 'auth/popup-closed-by-user' ? '' : 'Couldn’t sign in: ' + (err.code || err.message); }
    });
    $('#sendLink').addEventListener('click', async () => {
      const e = $('#ae').value.trim().toLowerCase();
      if (LINK_MSG === 'confirm') return completeLink(e);
      try {
        await sendSignInLinkToEmail(AUTH, e, { url: location.origin + location.pathname + '#admin', handleCodeInApp: true });
        LS.set('ergsNL.linkEmail', e);
        $('#am').textContent = 'Link sent – check your inbox (and junk folder), then open the link on this device.';
      } catch (err) { $('#am').textContent = 'Couldn’t send the link: ' + (err.code || err.message); }
    });
    return;
  }
  const all = allIssues();
  const removed = all.filter(i => status(i) === 'removed');
  const rows = all.filter(i => status(i) !== 'removed').map(i => {
    const r = RELEASES[i.id] || {}, st = status(i), sel = r.s || i.def;
    const src = i.custom ? 'uploaded by you' : i.id.startsWith('b') ? 'new issue' : 'original';
    const fixed = st === 'live';
    const ord = fixed ? '' : `<span class="ordbtns"><button class="btn small" data-up="${esc(i.id)}" title="Move earlier" aria-label="Move earlier">↑</button><button class="btn small" data-down="${esc(i.id)}" title="Move later" aria-label="Move later">↓</button>${st !== 'live' ? `<button class="btn small" data-next="${esc(i.id)}" title="Make this the next issue to release">Next</button>` : ''}${i.bank && st !== 'live' ? `<button class="btn small" data-pool="${esc(i.id)}" title="Take out of the series and back to the issue bank">To bank</button>` : ''}</span> `;
    const acts = ord + `<button class="btn small" data-edit="${esc(i.id)}">Edit</button> ` + (fixed ? '' : i.custom ? `<button class="btn small danger" data-del="${esc(i.id)}">Delete</button>` : `<button class="btn small danger" data-rm="${esc(i.id)}">Remove</button>`) + (i.edited ? ` <button class="btn small" data-undo="${esc(i.id)}">Undo edits</button>` : '');
    return `<tr class="${st}" data-row="${esc(i.id)}"><td class="dragc">${fixed ? `<span class="lockn" title="Released – number confirmed">🔒</span><b class="numfix">${i.n}</b>` : `<span class="drag" title="Drag to reorder" aria-hidden="true">⠿</span><input class="numin" type="number" min="1" value="${i.n}" data-num="${esc(i.id)}" aria-label="Issue number">`}</td><td><a href="#issue-${esc(i.id)}">${esc(i.title)}</a><br><small class="muted">${esc(i.theme || '')} · ${src}${i.edited ? ' · edited' : ''}</small></td>
      <td><select data-s="${esc(i.id)}"><option value="live"${sel === 'live' ? ' selected' : ''}>Released</option><option value="locked"${sel === 'locked' ? ' selected' : ''}>Locked</option><option value="sched"${sel === 'sched' ? ' selected' : ''}>Scheduled</option></select></td>
      <td>${sel === 'sched' ? `<input type="date" data-d="${esc(i.id)}" value="${esc(r.d || '')}">` : ''}</td>
      <td class="acts">${acts}</td></tr>`;
  }).join('');
  const nextN = all.filter(i => i.n !== '–').length + 1;
  const e = editing || {};
  const val = (k, d = '') => esc(e[k] ?? d);
  const lines = k => esc((e[k] || []).join('\n'));
  w.innerHTML = `<div class="admin-tabs">${ADMIN_TABS('admin')}</div>
  <div class="panel"><div class="row"><h2 style="margin:0">Release desk</h2><span class="spacer"></span><small class="muted">Signed in as ${esc(AUTHUSER.email)}</small><button class="btn small" id="so">Sign out</button></div>
    <p class="muted">Released issues appear for all staff straight away. Scheduled issues appear automatically on their date. Staff only ever see released issues – nothing about what’s still to come.</p>
    <div class="row"><button class="btn primary" id="relNext2">Release the next issue</button><a class="btn" href="#">View library</a><button class="btn" id="addBtn">+ Upload a new issue</button></div>
  </div>
  <div class="panel"><h2>Download the series</h2><p class="muted">One PDF with a cover page and every issue in order – ready to print, archive or share.</p>
    <div class="row"><select id="dlWhich"><option value="released">Released issues only</option><option value="all">All issues (including locked)</option></select><button class="btn primary" id="dlBtn">Download PDF</button><span id="dlMsg" class="muted"></span></div>
  </div>
  ${MIGRATED ? '' : `<div class="panel" id="migratePanel"><h2>Bring your data across</h2><p class="muted">ERGS AI now has its own database. Copy everything from the old shared setup – releases, tips history, uploaded and edited issues, and staff usage – in one go. Do this once, on the device where you usually sign in.</p><div class="row"><button class="btn primary" id="migrateBtn">Copy my data across</button><span id="migrateMsg" class="muted"></span></div></div>`}
  <div class="panel" id="usagePanel"><h2>Staff usage</h2><p class="muted">Loading…</p></div>
  <div class="panel" id="formPanel"${editing || formKind === 'open' ? '' : ' hidden'}>
    <h2>${editing && (editing.docId || editing.baseId) ? 'Edit issue ' + esc(editing.n) : 'Upload a new issue'}</h2>
    <p class="muted">${editing && editing.baseId ? 'Change the details below, or upload a replacement PDF. Leave the file empty to keep the current pages. You can undo your edits at any time.' : 'Upload a finished PDF (or image), or type it into the house template and it’s designed for you.'}</p>
    <div class="seg" id="kindSeg"${editing && editing.baseId ? ' hidden' : ''}><button data-k="img" class="${(e.kind || 'img') === 'img' ? 'on' : ''}">Upload PDF / image</button><button data-k="tpl" class="${e.kind === 'tpl' ? 'on' : ''}">Use the template</button></div>
    <form id="issueForm" style="margin-top:14px">
      <div class="row">
        <div class="field" style="flex:0 1 110px"><label>Issue no.</label><input name="n" type="number" min="1" required value="${val('n', nextN)}"></div>
        <div class="field" style="flex:3 1 300px"><label>Title</label><input name="title" required value="${val('title')}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Theme</label><select name="theme">${THEMES.map(t => `<option${e.theme === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="field"><label>Tools</label><div class="row">${['Gemini', 'Copilot', 'NotebookLM'].map(t => `<label class="check" style="margin:0"><input type="checkbox" name="tools" value="${t}"${(e.tools || []).includes(t) ? ' checked' : ''}> ${t}</label>`).join('')}</div></div>
        <div class="field"><label>When saved</label><select name="initial"><option value="locked">${editing && (editing.docId || editing.baseId) ? 'No change to release' : 'Keep locked for now'}</option><option value="live">Release now</option></select></div>
      </div>
      <div class="field"><label>One-line summary (shown on the card)</label><input name="summary" value="${val('summary')}"></div>
      <div class="field"><label>Link (optional – e.g. a Drive or SharePoint copy)</label><input name="link" type="url" value="${val('link')}"></div>
      <div id="imgFields">
        <div class="field"><label>PDF or image file</label><input type="file" id="fileIn" accept="application/pdf,image/*"><small>${editing && (editing.baseId || (editing.kind === 'img' && editing.docId)) ? 'Leave empty to keep the current pages. ' : ''}Each page is stored encrypted. Multi-page PDFs are fine.</small></div>
        <div id="filePrev" class="row"></div>
      </div>
      <div id="tplFields">
        <div class="row"><div class="field"><label>Role / kicker</label><input name="kicker" value="${val('kicker')}" placeholder="e.g. Retrieval Practice Engineer"></div>
        <div class="field"><label>Difficulty</label><select name="difficulty">${['Beginner', 'Intermediate', 'Advanced'].map(d => `<option${e.difficulty === d ? ' selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="field"><label>Read time</label><input name="read" value="${val('read', '5 mins')}"></div></div>
        <div class="row"><div class="field"><label>Time saved</label><input name="saved" value="${val('saved')}" placeholder="~20 mins"></div><div class="field"><label>…per</label><input name="savedPer" value="${val('savedPer')}" placeholder="per lesson"></div></div>
        <div class="field"><label>This week’s skill (aim)</label><input name="aim" value="${val('aim')}"></div>
        <div class="field"><label>How AI can help (blank line between paragraphs)</label><textarea name="intro" rows="5">${esc(Array.isArray(e.intro) ? e.intro.join('\n\n') : e.intro || '')}</textarea></div>
        <div class="field"><label>Try this prompt</label><textarea name="prompt" rows="4">${val('prompt')}</textarea></div>
        <div class="field"><label>Pro tip</label><textarea name="tip" rows="2">${val('tip')}</textarea></div>
        <div class="row"><div class="field"><label>Ideas box title</label><input name="ideasTitle" value="${val('ideasTitle', 'Ideas to try')}"></div></div>
        <div class="field"><label>Ideas (one per line)</label><textarea name="ideas" rows="4">${lines('ideas')}</textarea></div>
        <div class="field"><label>Department challenge</label><textarea name="challenge" rows="2">${val('challenge')}</textarea></div>
        <div class="row"><div class="field"><label>Bad prompt</label><textarea name="badp" rows="2">${esc(e.bad?.p || '')}</textarea></div><div class="field"><label>…result</label><textarea name="badr" rows="2">${esc(e.bad?.r || '')}</textarea></div></div>
        <div class="row"><div class="field"><label>Good prompt</label><textarea name="goodp" rows="3">${esc(e.good?.p || '')}</textarea></div><div class="field"><label>…result</label><textarea name="goodr" rows="3">${esc(e.good?.r || '')}</textarea></div></div>
        <div class="row"><div class="field"><label>Do (one per line)</label><textarea name="dos" rows="4">${lines('dos')}</textarea></div><div class="field"><label>Don’t (one per line)</label><textarea name="donts" rows="4">${lines('donts')}</textarea></div></div>
        <div class="field"><label>Key message</label><input name="key" value="${val('key')}"></div>
      </div>
      <div class="row"><button class="btn primary" type="submit" id="saveBtn">Save issue</button><button class="btn" type="button" id="cancelBtn">Cancel</button><span id="saveMsg" class="muted"></span></div>
    </form>
  </div>
  <div class="panel"><h2>All issues</h2><p class="muted">This is the running order of the whole series. Released issues 🔒 are confirmed and keep their numbers. Reorder anything not yet released: drag ⠿, use the arrows, or type a new number – the rest renumber straight away, including in the binder. Remove leaves an unreleased issue out and closes up the numbers; restore it any time.</p><table class="rel" id="relTable"><thead><tr><th>#</th><th>Issue</th><th>Status</th><th>Release date</th><th></th></tr></thead><tbody id="relBody">${rows}</tbody></table></div>
  ${bankPanel()}
  ${removed.length ? `<div class="panel"><h2>Removed issues</h2><p class="muted">Left out of the series and hidden from everyone. Restore puts an issue back in its old place, locked.</p><table class="rel"><tbody>${removed.map(i => `<tr><td><b>–</b></td><td>${esc(i.title)}</td><td class="acts"><button class="btn small" data-restore="${esc(i.id)}">Restore</button></td></tr>`).join('')}</tbody></table></div>` : ''}`;
  wireAdmin(all);
  renderUsage();
}
/* ---------- issue bank & series order ---------- */
let bankFilt = { q: '', theme: '', shown: 24 };
function bankPanel() {
  const pool = poolIssues(), f = bankFilt;
  const list = pool.filter(x => (!f.theme || x.theme === f.theme) && (!f.q || (x.title + ' ' + x.theme + ' ' + (x.summary || '') + ' ' + (x.tools || []).join(' ')).toLowerCase().includes(f.q)));
  const cards = list.slice(0, f.shown).map(x => `<div class="bk-card"><a class="bk-cov" href="#issue-${esc(x.id)}" title="Preview">${coverHTML(x)}</a><div class="bk-meta"><small>${esc(x.theme)}${x.level ? ' · ' + esc(x.level) : ''}</small><b>${esc(x.title)}</b><span class="muted">${esc((x.tools || []).join(' · '))}</span>
    <div class="bk-acts"><a class="btn small" href="#issue-${esc(x.id)}">Preview</a><button class="btn small primary" data-add="${esc(x.id)}">Add to series</button><button class="btn small" data-addnext="${esc(x.id)}" title="Add as the very next issue">Add as next</button></div></div></div>`).join('');
  return `<div class="panel" id="bankPanel"><div class="row"><h2 style="margin:0">Issue bank</h2><span class="spacer"></span><span class="muted">${pool.length} issues not in the series</span></div>
    <p class="muted">Issues taken out of the series with “To bank”. Add them back and they join as locked, numbered by position.</p>
    <div class="row"><input type="search" id="bankQ" placeholder="Search the bank" value="${esc(f.q)}"><select id="bankTheme"><option value="">All topics</option>${THEMES.map(t => `<option${f.theme === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
    <div class="bk-grid">${cards || '<p class="muted">No issues match.</p>'}</div>
    ${list.length > f.shown ? `<div class="row" style="justify-content:center"><button class="btn" id="bankMore">Show more (${list.length - f.shown})</button></div>` : ''}</div>`;
}
function wireSeries(all) {
  const once = (sel, ev, fn) => document.querySelectorAll(sel).forEach(el => { if (el.dataset.w) return; el.dataset.w = 1; el.addEventListener(ev, () => fn(el)); });
  const ord = () => orderIds().slice();
  const vis = () => allIssues().filter(i => i.n !== '–').map(i => i.id);
  const isLive = id => { const i = all.find(x => x.id === id); return i && ['live', 'sched'].includes(status(i)); };
  const numOf = (o, id) => { let k = 0; for (const x of o) { const i = all.find(y => y.id === x); if (i && status(i) !== 'removed') k++; if (x === id) return k; } return k; };
  once('[data-up],[data-down]', 'click', b => {
    const id = b.dataset.up || b.dataset.down, v = vis(), k = v.indexOf(id), j = k + (b.dataset.up ? -1 : 1);
    if (j < 0 || j >= v.length) return toast(b.dataset.up ? 'Already Issue 1' : 'Already the last issue');
    const o = moveTo(id, j + 1); saveOrder(o, `Now Issue ${j + 1}`);
  });
  once('[data-next]', 'click', b => {
    const v = vis().filter(x => x !== b.dataset.next); let k = v.length; while (k > 0 && !isLive(v[k - 1])) k--;
    saveOrder(moveTo(b.dataset.next, k + 1), `Now the next issue (Issue ${k + 1})`);
  });
  document.querySelectorAll('[data-num]').forEach(inp => { if (inp.dataset.w) return; inp.dataset.w = 1;
    const go = () => { const id = inp.dataset.num, n = +inp.value; if (!n || n === numOf(ord(), id)) return; saveOrder(moveTo(id, n), `Moved to Issue ${Math.max(1, Math.min(vis().length, n))}`); };
    inp.addEventListener('change', go); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
  });
  once('[data-pool]', 'click', b => saveOrder(ord().filter(x => x !== b.dataset.pool), 'Moved back to the issue bank – later issues renumbered'));
  once('[data-add],[data-addnext]', 'click', b => {
    const id = b.dataset.add || b.dataset.addnext, o = ord().filter(x => x !== id);
    if (b.dataset.addnext) { const v = vis(); let k = v.length; while (k > 0 && !isLive(v[k - 1])) k--; o.push(id); ORDER = o; saveOrder(moveTo(id, k + 1), `Added as Issue ${k + 1} (locked)`); }
    else { o.push(id); saveOrder(o, `Added as Issue ${vis().length + 1} (locked)`); }
  });
  // drag to reorder (mouse and touch)
  const body = $('#relBody');
  if (body && !body.dataset.drag) {
    body.dataset.drag = 1;
    body.addEventListener('pointerdown', e => {
      const h = e.target.closest('.drag'); if (!h) return;
      const row = h.closest('tr'); e.preventDefault();
      row.classList.add('dragging');
      const move = ev => {
        const y = ev.clientY;
        const over = [...body.children].find(r => r !== row && (() => { const b = r.getBoundingClientRect(); return y > b.top && y < b.bottom; })());
        if (over) { const b = over.getBoundingClientRect(); body.insertBefore(row, y < b.top + b.height / 2 ? over : over.nextSibling); }
        const vh = innerHeight; if (y < 70) scrollBy(0, -12); else if (y > vh - 70) scrollBy(0, 12);
      };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        row.classList.remove('dragging');
        const newVis = [...body.children].map(r => r.dataset.row), o = ord(), oldVis = vis();
        if (newVis.join() === oldVis.join()) return;
        const set = new Set(newVis); let k = 0; const merged = o.map(x => set.has(x) ? newVis[k++] : x);
        saveOrder(merged, `Moved to Issue ${newVis.indexOf(row.dataset.row) + 1} – numbers updated`);
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
  }
  const q = $('#bankQ'); if (q) q.addEventListener('input', () => { bankFilt.q = q.value.toLowerCase(); bankFilt.shown = 24; refreshBank(all); });
  $('#bankTheme')?.addEventListener('change', e => { bankFilt.theme = e.target.value; bankFilt.shown = 24; refreshBank(all); });
  $('#bankMore')?.addEventListener('click', () => { bankFilt.shown += 24; refreshBank(all); });
  hydrateImgs($('#bankPanel'));
}
function refreshBank(all) {
  const p = $('#bankPanel'), had = document.activeElement && document.activeElement.id === 'bankQ', pos = had ? document.activeElement.selectionStart : 0;
  p.outerHTML = bankPanel(); wireSeries(all);
  if (had) { const q = $('#bankQ'); q.focus(); q.setSelectionRange(pos, pos); }
}
async function migrateOld() {
  const msg = $('#migrateMsg'), btn = $('#migrateBtn'); btn.disabled = true;
  const say = t => { msg.textContent = t; };
  try {
    const old = initializeApp(C.oldFirebase), odb = getFirestore(old), oauth = getAuth(old);
    await new Promise(r => { const u = onAuthStateChanged(oauth, () => { u(); r(); }); setTimeout(r, 4000); });
    let copied = 0;
    say('Copying release settings and tips…');
    const st = await getDoc(doc(odb, 'newsletter', 'state'));
    const cur = await getDoc(doc(DB, 'newsletter', 'state'));
    const merged = { ...(st.exists() ? st.data() : {}), ...(cur.exists() ? cur.data() : {}) };
    if (st.exists() && cur.exists() && st.data().releases) merged.releases = { ...st.data().releases, ...(cur.data().releases || {}) };
    await setDoc(doc(DB, 'newsletter', 'state'), merged); copied++;
    for (const c of ['newsletterIssues', 'newsletterImgs', 'newsletterTipLog']) {
      say(`Copying ${c === 'newsletterIssues' ? 'uploaded and edited issues' : c === 'newsletterImgs' ? 'issue pages' : 'tip history'}…`);
      const s = await getDocs(collection(odb, c));
      for (const d of s.docs) { await setDoc(doc(DB, c, d.id), d.data()); copied++; }
    }
    let visitsNote = '';
    try {
      say('Copying staff usage…');
      const v = await getDocs(collection(odb, 'newsletterVisits'));
      for (const d of v.docs) { const ex = await getDoc(doc(DB, 'newsletterVisits', d.id)); if (!ex.exists()) await setDoc(doc(DB, 'newsletterVisits', d.id), d.data()); copied++; }
    } catch (e) { visitsNote = ' Staff usage couldn’t be copied (this device isn’t signed in to the old setup), so the counter starts again from now.'; }
    await setDoc(doc(DB, 'newsletter', 'state'), { migratedFrom: 'ergs-live', migratedAt: serverTimestamp() }, { merge: true });
    toast('Data copied across'); say(`Done – ${copied} records copied.${visitsNote}`);
  } catch (e) { console.warn(e); say('Couldn’t copy: ' + (e.code || e.message)); btn.disabled = false; }
}
function wireAdmin(all) {
  $('#so').addEventListener('click', () => signOut(AUTH));
  $('#migrateBtn')?.addEventListener('click', migrateOld);
  $('#dlBtn').addEventListener('click', downloadSeries);
  $('#relNext2').addEventListener('click', () => { const n = all.find(i => status(i) !== 'live' && status(i) !== 'removed'); if (n) setRelease(n.id, { s: 'live' }, `Issue ${n.n} released`); else toast('Everything is already released'); });
  $('#addBtn').addEventListener('click', () => { editing = { kind: 'img' }; formKind = 'img'; pendingPages = pendingThumb = null; renderAdmin(); $('#formPanel').scrollIntoView({ behavior: 'smooth' }); });
  document.querySelectorAll('[data-s]').forEach(s => s.addEventListener('change', () => {
    const id = s.dataset.s, v = s.value, cur = RELEASES[id] || {};
    setRelease(id, v === 'sched' ? { s: 'sched', d: cur.d || today() } : { s: v }, v === 'live' ? 'Released' : v === 'locked' ? 'Locked' : 'Pick a release date');
  }));
  document.querySelectorAll('[data-d]').forEach(d => d.addEventListener('change', () => setRelease(d.dataset.d, { s: 'sched', d: d.value }, 'Scheduled for ' + fmtDate(d.value))));
  document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => startEdit(all.find(i => i.id === b.dataset.edit))));
  const twice = (b, label, fn) => { let armed = false; b.addEventListener('click', async () => { if (!armed) { armed = true; const t = b.textContent; b.textContent = label; setTimeout(() => { armed = false; b.textContent = t; }, 3000); return; } await fn(); }); };
  document.querySelectorAll('[data-rm]').forEach(b => twice(b, 'Click again to remove', () => { const i = all.find(x => x.id === b.dataset.rm); setRelease(i.id, { s: 'removed' }, `Issue ${i.n} removed – restore it any time`); }));
  wireSeries(all);
  document.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', () => setRelease(b.dataset.restore, { s: 'locked' }, 'Restored (locked)')));
  document.querySelectorAll('[data-undo]').forEach(b => twice(b, 'Click again to undo', async () => {
    const i = all.find(x => x.id === b.dataset.undo);
    try { for (const p of i.ovPages || []) await deleteDoc(doc(DB, 'newsletterImgs', p)); await deleteDoc(doc(DB, 'newsletterIssues', i.ovDocId)); toast('Back to the original version'); } catch (e) { toast('Couldn’t undo: ' + (e.code || e.message)); }
  }));
  document.querySelectorAll('[data-del]').forEach(b => {
    let armed = false;
    b.addEventListener('click', async () => {
      if (!armed) { armed = true; b.textContent = 'Click again to delete'; setTimeout(() => { armed = false; b.textContent = 'Delete'; }, 3000); return; }
      const c = CUSTOM.find(x => x.id === b.dataset.del);
      try { for (const p of c.pageDocs || []) await deleteDoc(doc(DB, 'newsletterImgs', p)); await deleteDoc(doc(DB, 'newsletterIssues', c.docId)); toast('Issue deleted'); } catch (e) { toast('Couldn’t delete: ' + (e.code || e.message)); }
    });
  });
  const fp = $('#formPanel'); if (fp.hidden) return;
  const setKind = k => { formKind = k; $('#imgFields').hidden = k !== 'img'; $('#tplFields').hidden = k !== 'tpl'; document.querySelectorAll('#kindSeg button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); };
  setKind(editing?.kind || 'img');
  document.querySelectorAll('#kindSeg button').forEach(b => b.addEventListener('click', () => setKind(b.dataset.k)));
  $('#cancelBtn').addEventListener('click', () => { editing = null; formKind = 'tpl'; renderAdmin(); });
  $('#fileIn').addEventListener('change', async ev => {
    const f = ev.target.files[0]; if (!f) return;
    $('#saveMsg').textContent = 'Preparing pages…'; $('#saveBtn').disabled = true;
    try { const r = await fileToPages(f); pendingPages = r.pages; pendingThumb = r.thumb; $('#filePrev').innerHTML = `<img src="${r.thumb}" style="width:120px;border:1px solid var(--line);border-radius:6px"><span class="muted">${r.pages.length} page${r.pages.length > 1 ? 's' : ''} ready</span>`; $('#saveMsg').textContent = ''; }
    catch (e) { $('#saveMsg').textContent = 'Couldn’t read that file: ' + e.message; }
    $('#saveBtn').disabled = false;
  });
  $('#issueForm').addEventListener('submit', saveIssue);
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return window.pdfjsLib;
}
const canvasBlob = (c, q) => new Promise(r => c.toBlob(r, 'image/jpeg', q));
async function fitJpeg(canvas) {
  for (const q of [0.82, 0.74, 0.66, 0.58, 0.5]) { const b = await canvasBlob(canvas, q); if (b.size < 640000) return new Uint8Array(await b.arrayBuffer()); }
  const s = document.createElement('canvas'); s.width = canvas.width * 0.75; s.height = canvas.height * 0.75; s.getContext('2d').drawImage(canvas, 0, 0, s.width, s.height); return fitJpeg(s);
}
async function fileToPages(f) {
  const canvases = [];
  if (f.type === 'application/pdf') {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    if (pdf.numPages > 12) throw new Error('please keep issues to 12 pages or fewer');
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p); const vp0 = page.getViewport({ scale: 1 }); const vp = page.getViewport({ scale: 1240 / vp0.width });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise; canvases.push(c);
    }
  } else if (f.type.startsWith('image/')) {
    const img = await createImageBitmap(f); const sc = Math.min(1, 1240 / img.width);
    const c = document.createElement('canvas'); c.width = img.width * sc; c.height = img.height * sc;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); canvases.push(c);
  } else throw new Error('choose a PDF or an image');
  const pages = []; for (const c of canvases) pages.push(await fitJpeg(c));
  const t = document.createElement('canvas'); t.width = 330; t.height = Math.round(canvases[0].height * 330 / canvases[0].width);
  t.getContext('2d').drawImage(canvases[0], 0, 0, t.width, t.height);
  return { pages, thumb: t.toDataURL('image/jpeg', 0.72) };
}
async function saveIssue(ev) {
  ev.preventDefault();
  const fd = new FormData(ev.target), g = k => (fd.get(k) || '').toString().trim(), ln = k => g(k).split('\n').map(s => s.trim()).filter(Boolean);
  const msg = $('#saveMsg'), btn = $('#saveBtn');
  const docId = editing?.docId || (editing?.baseId ? 'ov-' + editing.baseId : doc(collection(DB, 'newsletterIssues')).id);
  const base = { n: +g('n'), title: g('title'), theme: g('theme'), tools: fd.getAll('tools'), summary: g('summary'), link: g('link'), kind: formKind };
  let data;
  if (formKind === 'img') {
    if (!pendingPages && !editing?.baseId && !(editing?.kind === 'img' && editing.pageDocs?.length)) { msg.textContent = 'Choose a PDF or image first.'; return; }
    data = { ...base, pageDocs: editing?.pageDocs || [], thumb: editing?.thumb || '' };
  } else {
    data = { ...base, kicker: g('kicker'), difficulty: g('difficulty'), read: g('read'), saved: g('saved'), savedPer: g('savedPer'), aim: g('aim'), intro: g('intro'), prompt: g('prompt'), tip: g('tip'), ideasTitle: g('ideasTitle'), ideas: ln('ideas'), challenge: g('challenge'), bad: { p: g('badp'), r: g('badr') }, good: { p: g('goodp'), r: g('goodr') }, dos: ln('dos'), donts: ln('donts'), key: g('key') };
    if (!data.summary) data.summary = data.aim;
  }
  btn.disabled = true; msg.textContent = 'Saving…';
  try {
    if (formKind === 'img' && pendingPages) {
      const old = editing?.pageDocs || [], ids = [];
      for (let p = 0; p < pendingPages.length; p++) { const pid = `${docId}_${p}`; msg.textContent = `Uploading page ${p + 1} of ${pendingPages.length}…`; await setDoc(doc(DB, 'newsletterImgs', pid), { data: b64e(await enc(pendingPages[p])) }); ids.push(pid); }
      for (const o of old) if (!ids.includes(o)) await deleteDoc(doc(DB, 'newsletterImgs', o)).catch(() => {});
      data.pageDocs = ids; data.thumb = pendingThumb; [...imgCache.keys()].filter(k => k.startsWith('fs:' + docId)).forEach(k => imgCache.delete(k));
    }
    delete data.id; delete data.docId; delete data.custom; if (editing?.baseId) data.overrides = editing.baseId;
    await setDoc(doc(DB, 'newsletterIssues', docId), { enc: await encJSON(data), updated: serverTimestamp() });
    const relId = editing?.baseId || ('c' + docId);
    if (!editing?.docId && !editing?.baseId) setRelease(relId, { s: g('initial') === 'live' ? 'live' : 'locked' });
    else if (g('initial') === 'live') setRelease(relId, { s: 'live' });
    { const cur = allIssues().find(i => i.id === relId); if (data.n && (!cur || cur.n !== data.n)) saveOrder(moveTo(relId, data.n)); }
    toast(`Issue ${data.n} saved`); editing = null; pendingPages = pendingThumb = null; formKind = 'tpl'; renderAdmin();
  } catch (e) { console.warn(e); msg.textContent = 'Couldn’t save: ' + (e.code || e.message); btn.disabled = false; }
}
/* ---------- install as an app ---------- */
const BASE = location.origin + location.pathname;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferredInstall = null;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });   // install is offered in the share panel
window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('Installed – find ERGS AI on your home screen'); });
$('#installBtn').addEventListener('click', async () => {
  if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; $('#installBtn').hidden = true; }
  else if (isIOS) $('#iosTip').hidden = false;
  else toast('Use your browser menu → Install app / Add to Home screen');
});
$('#iosClose').addEventListener('click', () => { $('#iosTip').hidden = true; });

/* ---------- share (same card as ERGS Live) ---------- */
/* simple share panel: QR code, copy address, install */
function openShare(issue) {
  document.querySelector('.shr-ov')?.remove();
  const targets = [{ key: 'lib', label: 'Whole library', url: BASE }];
  if (issue) targets.unshift({ key: 'iss', label: 'This issue', url: BASE + '#issue-' + issue.id });
  const isAndroid = /Android/i.test(navigator.userAgent);
  const installHTML = standalone() ? '<p class="shr-note">You’re using the installed app.</p>'
    : deferredInstall ? '<button class="btn primary" id="shrInstall">Install on this device</button>'
    : isIOS ? '<ol class="shr-steps"><li>Tap the <b>Share</b> button in Safari</li><li>Choose <b>Add to Home Screen</b></li></ol>'
    : isAndroid ? '<ol class="shr-steps"><li>Open the browser menu <b>⋮</b></li><li>Choose <b>Install app</b> or <b>Add to Home screen</b></li></ol>'
    : '<p class="shr-note">In Chrome or Edge, click the install icon at the right of the address bar.</p>';
  const ov = document.createElement('div'); ov.className = 'shr-ov';
  ov.innerHTML = `<div class="shr" role="dialog" aria-modal="true" aria-label="Share">
    <div class="shr-head"><h2>Share</h2><button class="shr-x" aria-label="Close">×</button></div>
    ${targets.length > 1 ? `<div class="seg shr-seg">${targets.map((t, k) => `<button data-k="${k}" class="${k ? '' : 'on'}">${t.label}</button>`).join('')}</div>` : ''}
    <div class="shr-qr"></div>
    <p class="shr-cap">Scan with a phone camera to open</p>
    <div class="shr-copy"><input readonly aria-label="Address"><button class="btn primary" id="shrCopy">Copy</button></div>
    <div class="shr-inst"><h3>Install the app</h3>${installHTML}
      <p class="shr-other">${isIOS ? 'On Android: browser menu ⋮ → Install app' : isAndroid ? 'On iPhone: Safari Share → Add to Home Screen' : 'On phones – iPhone: Share → Add to Home Screen · Android: menu ⋮ → Install app'}</p></div>
    <p class="shr-foot">Colleagues will need the staff password the first time they open it.</p>
  </div>`;
  document.body.appendChild(ov);
  const set = k => {
    const t = targets[k]; ov.querySelector('input').value = t.url;
    const q = ov.querySelector('.shr-qr'); q.innerHTML = '';
    try { q.appendChild(window.ERGSShare.draw(t.url, window.ERGS_CREST)); } catch (e) { q.textContent = 'QR code unavailable'; }
    ov.querySelectorAll('.shr-seg button').forEach(b => b.classList.toggle('on', +b.dataset.k === k));
  };
  set(0);
  ov.querySelectorAll('.shr-seg button').forEach(b => b.addEventListener('click', () => set(+b.dataset.k)));
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  ov.querySelector('.shr-x').addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  ov.querySelector('#shrCopy').addEventListener('click', async () => {
    const inp = ov.querySelector('input');
    try { await navigator.clipboard.writeText(inp.value); } catch (e) { inp.select(); document.execCommand?.('copy'); }
    const b = ov.querySelector('#shrCopy'); b.textContent = 'Copied ✓'; setTimeout(() => { b.textContent = 'Copy'; }, 1800);
  });
  ov.querySelector('#shrInstall')?.addEventListener('click', async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; close(); });
}
$('#shareBtn')?.addEventListener('click', () => openShare(null));
$('#shareIssueBtn').addEventListener('click', () => { const id = location.hash.slice(7); openShare(allIssues().find(x => x.id === id) || null); });
/* ---------- automatic updates ----------
   The app fingerprints its own files. When anything is pushed to GitHub, open and installed copies
   notice within minutes (and whenever they're reopened) and refresh themselves – no version numbers to bump. */
const WATCH = ['index.html', 'app.js', 'style.css', 'config.js', 'share.js', 'tips.js', 'skills.js', 'skills-art.js', 'tips-art.js', 'skillart-draw.js', 'tipshots.js', 'sheets.js', 'content.enc'];
let BUILD = null, updating = false;
async function fingerprint() {
  const bufs = await Promise.all(WATCH.map(f => fetch(f + '?v=' + Date.now(), { cache: 'no-store' }).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })));
  const all = new Uint8Array(bufs.reduce((n, b) => n + b.byteLength, 0)); let o = 0; for (const b of bufs) { all.set(new Uint8Array(b), o); o += b.byteLength; }
  return b64e(new Uint8Array(await crypto.subtle.digest('SHA-256', all)));
}
async function checkUpdate() {
  if (updating || !navigator.onLine) return;
  try {
    const fp = await fingerprint();
    if (!BUILD) { BUILD = fp; return; }
    if (fp === BUILD) return;
    updating = true;
    const busy = location.hash === '#admin' && !$('#formPanel')?.hidden;   // don't throw away a half-typed issue
    if (document.hidden || !busy) { await refreshApp(); return; }
    const bar = document.createElement('div'); bar.className = 'updbar';
    bar.innerHTML = '<span>A new version of ERGS Digital Skills &amp; AI is ready.</span><button class="btn small primary">Update now</button>';
    bar.querySelector('button').onclick = refreshApp; document.body.appendChild(bar);
  } catch (e) {}
}
async function refreshApp() {
  try { const r = await navigator.serviceWorker?.getRegistration(); await r?.update(); const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
  sessionStorage.setItem('ergsNL.updated', '1'); location.reload();
}
checkUpdate();
setInterval(checkUpdate, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
window.addEventListener('online', checkUpdate);
if (SS.get('ergsNL.updated')) { SS.del('ergsNL.updated'); setTimeout(() => toast('Updated to the latest version'), 800); }

/* ---------- binder: flip through every released issue like a real book ---------- */
const Binder = (() => {
  let pages = [], spread = 0, single = false, busy = false, built = false, sig = '';
  const st = () => $('#bkStage');
  const issuesInBinder = () => allIssues().filter(i => status(i) === 'live' || (canManage() && status(i) !== 'removed'));
  function buildPages() {
    const list = issuesInBinder();
    const PER = 30, P = [{ kind: 'cover' }];   // contents spread over as many pages as needed (30 entries each)
    for (let k = 0; k < Math.max(1, list.length); k += PER) P.push({ kind: 'contents', list: list.slice(k, k + PER), cont: k > 0 });
    list.forEach(i => {
      const srcs = i.imgs || i.pageDocs || [];
      if (!srcs.length) P.push({ kind: 'info', issue: i }); // template issues without page images
      srcs.forEach((src, k) => P.push({ kind: 'img', issue: i, src, k, of: srcs.length }));
    });
    // contents page numbers (1-based, cover = page 1)
    list.forEach(i => { i._page = P.findIndex(p => p.issue === i) + 1; });
    P.push({ kind: 'back' });
    pages = P;
    const sel = $('#bkJump');
    sel.innerHTML = '<option value="">Jump to issue…</option>' + list.map(i => `<option value="${i._page - 1}">Issue ${i.n}: ${esc(i.title)}</option>`).join('');
  }
  function pageEl(idx) {
    const el = document.createElement('div'); el.className = 'bk-page';
    const p = pages[idx];
    if (!p) { el.classList.add('blank'); return el; }
    if (p.kind === 'cover') {
      const d = new Date(), y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1, n = issuesInBinder().length;
      el.classList.add('cv-front');
      el.innerHTML = `<div class="cvf-spine"></div>
        <div class="cvf-top"><img src="${window.ERGS_CREST || ''}" alt=""><div><b>Enniskillen Royal Grammar School</b><span>Staff Professional Learning</span></div></div>
        <div class="cvf-title"><p class="cvf-eyebrow">Whole-School AI Skills CPD Portfolio</p><h1>ERGS Digital<br>Skills &amp; AI</h1><h2>A Teacher’s Guide</h2><div class="cvf-rule"></div>
          <p class="cvf-lede">Practical, classroom-focused guidance on using Microsoft Copilot, Google Gemini and NotebookLM to support teaching and learning.</p></div>
        <div class="cvf-foot"><div><small>Collected edition</small><b>${n} issues</b></div><div><small>Academic year</small><b>${y}–${String(y + 1).slice(2)}</b></div><div><small>Audience</small><b>All teaching staff</b></div></div>`;
    } else if (p.kind === 'contents') {
      el.classList.add('contents');
      el.innerHTML = `<h3>Contents${p.cont ? ' <small>continued</small>' : ''}</h3><ol>${p.list.map(i => `<li data-go="${i._page - 1}"${status(i) !== 'live' ? ' class="lk" title="Locked – only you can see this"' : ''}><b>${i.n}</b><span>${esc(i.title)}</span><i>${i._page}</i></li>`).join('')}</ol>`;
      el.querySelectorAll('[data-go]').forEach(li => li.addEventListener('click', e => { e.stopPropagation(); go(+li.dataset.go); }));
    } else if (p.kind === 'back') {
      el.classList.add('cv-back');
      el.innerHTML = `<div class="cvb-in"><p class="cvb-eyebrow">About this series</p>
        <p class="cvb-text">Each issue focuses on one practical skill, with a prompt to try, examples across the curriculum and a short challenge to use in your own classroom.</p>
        <div class="cvb-rule"></div>
        <dl><dt>Approved tools</dt><dd>Microsoft Copilot · Google Gemini · NotebookLM</dd><dt>Guiding principle</dt><dd>AI supports professional judgement – it never replaces it.</dd><dt>Data protection</dt><dd>Never enter pupil names or personal information into AI tools.</dd></dl></div>
        <div class="cvb-foot"><img src="${window.ERGS_CREST || ''}" alt=""><div><b>Enniskillen Royal Grammar School</b><span>ERGS Digital Skills &amp; AI: A Teacher’s Guide · For staff use only</span></div></div>`;
    } else if (p.kind === 'info') {
      el.innerHTML = `<div class="bk-info"><small>Issue ${p.issue.n}</small><h3>${esc(p.issue.title)}</h3><p>${esc(p.issue.summary || '')}</p><a href="#issue-${esc(p.issue.id)}">Open this issue</a></div>`;
    } else {
      const img = document.createElement('img'); img.alt = `Issue ${p.issue.n}, page ${p.k + 1}`; img.draggable = false;
      (p.issue.fsPages ? customPageImg(p.src) : fileImg(p.src)).then(u => { img.src = u; }).catch(() => {});
      el.appendChild(img);
      if (status(p.issue) !== 'live') { const r = document.createElement('span'); r.className = 'bk-lock'; r.textContent = 'Locked – only you can see this'; el.appendChild(r); }
    }
    el.dataset.n = idx + 1;
    return el;
  }
  function preload(i) { for (let k = i - 2; k <= i + 4; k++) { const p = pages[k]; if (p && p.kind === 'img') (p.issue.fsPages ? customPageImg(p.src) : fileImg(p.src)).catch(() => {}); } }
  // spread s: left = pages[2s-1], right = pages[2s]
  const maxSpread = () => single ? pages.length - 1 : Math.ceil((pages.length - 1) / 2);
  const leftIdx = s => 2 * s - 1, rightIdx = s => 2 * s;
  function layout() {
    const box = $('#bkArea').getBoundingClientRect();
    single = box.width < 760;
    const ratio = 1.4142, availH = Math.max(240, innerHeight - box.top - 24), availW = box.width - 16;
    let pw = Math.min(availH / ratio, single ? availW : availW / 2);
    pw = Math.floor(pw); const ph = Math.floor(pw * ratio);
    const s = st(); s.style.setProperty('--pw', pw + 'px'); s.style.setProperty('--ph', ph + 'px');
    s.classList.toggle('single', single);
  }
  // smooth = after a page turn: build the new pages off-screen and swap them in only once their images have loaded,
  // so the end of the animation never flashes a blank or half-drawn page
  function draw(smooth) {
    const s = st(); let nodes;
    if (single) {
      const slot = document.createElement('div'); slot.className = 'bk-slot r'; slot.appendChild(pageEl(spread)); nodes = [slot];
      preload(spread);
    } else {
      const L = document.createElement('div'); L.className = 'bk-slot l'; L.appendChild(pageEl(leftIdx(spread)));
      const R = document.createElement('div'); R.className = 'bk-slot r'; R.appendChild(pageEl(rightIdx(spread)));
      nodes = [L, R]; preload(rightIdx(spread));
    }
    const put = () => {
      s.replaceChildren(...nodes);
      if (!single) { s.classList.toggle('closed', spread === 0); s.classList.toggle('end', rightIdx(spread) >= pages.length); }
      updateBar();
    };
    if (!smooth) { put(); return Promise.resolve(); }
    const imgs = nodes.flatMap(n => [...n.querySelectorAll('img')]), t0 = Date.now();
    return new Promise(res => (function wait() {
      const ready = imgs.every(im => im.getAttribute('src') && im.complete && im.naturalWidth);
      if (ready || Date.now() - t0 > 700) { Promise.all(imgs.map(im => im.decode ? im.decode().catch(() => {}) : 0)).then(() => { put(); res(); }); }
      else setTimeout(wait, 30);
    })());
  }
  function curIssue() { const i = single ? spread : Math.max(leftIdx(spread), 0); const p = pages[i] || pages[i + 1]; return p && p.issue; }
  function updateBar() {
    const total = pages.length;
    const label = single ? `Page ${spread + 1} of ${total}` : spread === 0 ? `Cover · ${total} pages` : `Pages ${leftIdx(spread) + 1}${rightIdx(spread) < total ? '–' + (rightIdx(spread) + 1) : ''} of ${total}`;
    $('#bkPos').textContent = label;
    $('#bkPrev').disabled = spread <= 0; $('#bkNext').disabled = spread >= maxSpread();
    const iss = curIssue(); $('#bkOpen').hidden = !iss; if (iss) $('#bkOpen').href = '#issue-' + iss.id;
    $('#bkRange').max = maxSpread(); $('#bkRange').value = spread;
  }
  // page turn: the leaf is built from thin vertical strips chained in 3D, so it curls like paper as it turns,
  // with light and shadow worked out per strip each frame and a soft shadow cast on the page underneath
  const N = 14, DUR = 1050, ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function leaf(side, frontIdx, backIdx, reverse, under, done) {
    const s = st(), W = s.querySelector('.bk-slot').offsetWidth, H = s.querySelector('.bk-slot').offsetHeight, w = W / N, R = side === 'r';
    const make = idx => idx === 'paper' ? Object.assign(document.createElement('div'), { className: 'bk-page paper' }) : pageEl(idx);
    const dur = single ? 820 : DUR, curl = single ? 95 : 62;
    const root = document.createElement('div'); root.className = 'bk-leaf ' + side;
    root.style.cssText = `left:${R ? (single ? 0 : W) : 0}px;width:${W}px;height:${H}px`;
    const faces = []; let parent = root;
    for (let i = 0; i < N; i++) {
      const st_ = document.createElement('div'); st_.className = 'lf-strip';
      st_.style.cssText = `width:${w + .6}px;height:${H}px;left:${i === 0 ? (R ? 0 : W - w) : (R ? w : -w)}px;transform-origin:${R ? 'left' : 'right'} center`;
      const fx = R ? i * w : W - (i + 1) * w, bx = R ? W - (i + 1) * w : i * w;
      const f = document.createElement('div'); f.className = 'lf-face front'; const fi = make(frontIdx); fi.style.cssText = `position:absolute;top:0;left:${-fx}px;width:${W}px;height:${H}px`; f.appendChild(fi);
      const b = document.createElement('div'); b.className = 'lf-face back'; const bi = make(backIdx); bi.style.cssText = `position:absolute;top:0;left:${-bx}px;width:${W}px;height:${H}px`; b.appendChild(bi);
      const fs = document.createElement('i'), bs = document.createElement('i'); fs.className = bs.className = 'lf-light'; f.appendChild(fs); b.appendChild(bs);
      st_.append(f, b); parent.appendChild(st_); faces.push([st_, fs, bs]); parent = st_;
    }
    const cast = document.createElement('div'); cast.className = 'bk-cast'; s.append(root, cast);
    const sg = R ? -1 : 1, t0 = performance.now();
    const frame = now => {
      let t = Math.min(1, (now - t0) / dur); const e = ease(reverse ? 1 - t : t);
      const th = 180 * e, bend = curl * Math.sin(Math.PI * e) * (reverse ? -1 : 1), lift = Math.sin(Math.PI * e);
      let acc = 0; const angs = [];
      faces.forEach(([el], i) => {
        const a = i === 0 ? th + bend * .55 : -bend * 1.1 / (N - 1);   // the edge by the spine leads, the free edge trails behind
        acc += a; angs.push(acc); el.style.transform = `rotateY(${sg * a}deg)`;
      });
      // light each strip with a gradient running into its neighbour's value, so the curl shades smoothly (no bands)
      const lit = k => { const g = angs[Math.min(k, N - 1)] * Math.PI / 180, c = Math.cos(g); return [.46 * (1 - Math.abs(c)), Math.max(0, Math.sin(2 * g)) * .14]; };
      faces.forEach(([, fs, bs], i) => {
        const [d0] = lit(i), [d1] = lit(i + 1), [, g0] = lit(i), [, g1] = lit(i + 1);
        fs.style.background = `linear-gradient(${R ? 'to right' : 'to left'},rgba(0,0,0,${d0.toFixed(3)}),rgba(0,0,0,${d1.toFixed(3)}))`;
        bs.style.background = `linear-gradient(${R ? 'to left' : 'to right'},rgba(${g0 > d0 ? '255,255,255' : '0,0,0'},${Math.max(g0, d0 * .8).toFixed(3)}),rgba(${g1 > d1 ? '255,255,255' : '0,0,0'},${Math.max(g1, d1 * .8).toFixed(3)}))`;
      });
      // shadow thrown onto the page being uncovered, strongest mid-turn and hugging the spine
      const proj = Math.max(0, Math.cos(th * Math.PI / 180)), reach = (proj * 100 + 14 * lift).toFixed(1);
      cast.style.cssText = `left:${R ? (single ? 0 : W) : (th < 90 ? 0 : W)}px;width:${W}px;height:${H}px;background:linear-gradient(${R === th < 90 ? 'to right' : 'to left'},rgba(0,0,0,${(.42 * lift).toFixed(3)}) 0%,rgba(0,0,0,${(.18 * lift).toFixed(3)}) ${(+reach * .55).toFixed(1)}%,transparent ${reach}%)`;
      if (t < 1) requestAnimationFrame(frame); else { cast.remove(); done(); }   // the leaf stays put until the new pages are ready (see draw)
    };
    requestAnimationFrame(frame);
  }
  // phones (one page at a time): a fold sweeps from the right edge to the spine, lifting the page off the one beneath –
  // the folded flap shows the paper's back, lit by the curl, with a soft shadow on the page being revealed
  function peel(idx, reverse, done) {
    const s = st(), slot = s.querySelector('.bk-slot'), W = slot.offsetWidth, H = slot.offsetHeight, t0 = performance.now(), dur = 900;
    const box = document.createElement('div'); box.className = 'pl-peel';
    const flat = document.createElement('div'); flat.className = 'pp-flat'; flat.appendChild(pageEl(idx));
    const flap = document.createElement('div'); flap.className = 'pp-flap';
    const inner = pageEl(idx); inner.style.cssText = `position:absolute;top:0;width:${W}px;height:${H}px`; flap.appendChild(inner);
    const veil = document.createElement('i'); veil.className = 'pp-veil'; flap.appendChild(veil);
    const shade = document.createElement('i'); shade.className = 'pp-shade';
    box.append(flat, shade, flap); s.appendChild(box);
    const frame = now => {
      const t = Math.min(1, (now - t0) / dur), e = ease(reverse ? 1 - t : t);
      const f = W * (1 - e), lift = Math.sin(Math.PI * e), ang = 180 - 38 * lift;   // fold position and how far the flap lifts off the page
      flat.style.clipPath = `inset(0 ${(W - f).toFixed(1)}px 0 0)`;
      flap.style.cssText = `left:${f.toFixed(1)}px;width:${(W - f + 1).toFixed(1)}px;height:${H}px;transform:rotateY(${-ang}deg)`;
      inner.style.left = `${(-f).toFixed(1)}px`;
      veil.style.background = `linear-gradient(to right,rgba(0,0,0,${(.28 * lift + .06).toFixed(3)}),rgba(255,255,255,0) 35%,rgba(0,0,0,${(.12 * lift).toFixed(3)}))`;
      shade.style.cssText = `left:${f.toFixed(1)}px;width:${Math.min(W - f, 90 + 60 * lift).toFixed(1)}px;height:${H}px;background:linear-gradient(to right,rgba(0,0,0,${(.38 * lift).toFixed(3)}),transparent)`;
      flap.style.boxShadow = `-6px 0 18px rgba(0,0,0,${(.28 * lift).toFixed(3)})`;
      if (t < 1) requestAnimationFrame(frame); else { shade.remove(); flap.style.visibility = 'hidden'; done(); }
    };
    requestAnimationFrame(frame);
  }
  function flip(dir) {
    if (busy) return;
    const target = spread + dir; if (target < 0 || target > maxSpread()) return;
    busy = true;
    const s = st(), fin = () => { spread = target; draw(true).then(() => { busy = false; }); };
    if (reduced()) return fin();
    if (single) {
      const slot = s.querySelector('.bk-slot');
      // one page at a time: the page peels away to the left and folds into the spine; its back shows through faintly like real paper
      if (dir > 0) { slot.replaceChildren(pageEl(target)); peel(spread, false, fin); }
      else peel(target, true, fin);
    } else if (dir > 0) {
      s.querySelector('.bk-slot.r').replaceChildren(pageEl(rightIdx(target)));
      s.classList.remove('end', 'closed'); if (rightIdx(target) >= pages.length) s.classList.add('end');
      leaf('r', rightIdx(spread), leftIdx(target), false, null, fin);
    } else {
      s.querySelector('.bk-slot.l').replaceChildren(pageEl(leftIdx(target)));
      s.classList.remove('end');
      leaf('l', leftIdx(spread), rightIdx(target), false, null, fin);
    }
  }
  function go(pageIndex) {
    spread = single ? pageIndex : Math.ceil(pageIndex / 2);
    spread = Math.max(0, Math.min(spread, maxSpread())); draw();
  }
  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    $('#bkPrev').addEventListener('click', () => flip(-1));
    $('#bkNext').addEventListener('click', () => flip(1));
    $('#bkJump').addEventListener('change', e => { if (e.target.value !== '') go(+e.target.value); e.target.value = ''; });
    $('#bkRange').addEventListener('input', e => { spread = +e.target.value; draw(); });
    const pm = $('#bkPrintMenu');
    $('#bkPrintBtn').addEventListener('click', e => { e.stopPropagation(); pm.querySelector('[data-pr=page]').textContent = printLabel(); pm.hidden = !pm.hidden; });
    document.addEventListener('click', e => { if (!e.target.closest('#bkPrintMenu')) pm.hidden = true; });
    pm.addEventListener('click', e => { const b = e.target.closest('[data-pr]'); if (!b) return; pm.hidden = true; print(b.dataset.pr === 'all'); });
    $('#bkFull').addEventListener('click', () => { const el = $('#binder'); (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.())?.catch?.(() => {}); });
    document.addEventListener('fullscreenchange', () => setTimeout(() => { layout(); draw(); }, 120));
    st().addEventListener('click', e => {
      if (e.target.closest('a,[data-go]')) return;
      const r = st().getBoundingClientRect(); flip(e.clientX - r.left > r.width / 2 ? 1 : -1);
    });
    let x0 = null, y0 = null;
    st().addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    st().addEventListener('touchend', e => {
      if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { e.preventDefault(); flip(dx < 0 ? 1 : -1); }
    });
    document.addEventListener('keydown', e => { if (location.hash !== '#binder') return; if (e.key === 'ArrowRight') flip(1); if (e.key === 'ArrowLeft') flip(-1); });
    let rt; window.addEventListener('resize', () => { if (location.hash !== '#binder') return; clearTimeout(rt); rt = setTimeout(() => { const wasSingle = single; const pIdx = single ? spread : Math.max(0, leftIdx(spread)); layout(); if (wasSingle !== single) go(pIdx); else draw(); }, 150); });
  }
  const visIdx = () => single ? [spread] : [leftIdx(spread), rightIdx(spread)].filter(k => k >= 0 && k < pages.length);
  const visIssues = () => [...new Set(visIdx().map(k => pages[k] && pages[k].issue).filter(Boolean))];
  function printLabel() { const iss = visIssues(); return !iss.length ? 'Print this page' : iss.length === 1 ? `Print Issue ${iss[0].n}` : `Print Issues ${iss.map(i => i.n).join(' and ')}`; }
  async function print(all) {
    let idxs;
    if (all) idxs = pages.map((_, k) => k);
    else {   // the whole issue that's open (every page of it), or the cover/contents/back page if no issue is showing
      const vis = visIdx(), iss = visIssues();
      idxs = iss.length ? pages.map((p, k) => iss.includes(p.issue) ? k : -1).filter(k => k >= 0) : vis;
    }
    let box = $('#bkPrint'); if (!box) { box = document.createElement('div'); box.id = 'bkPrint'; document.body.appendChild(box); }
    box.innerHTML = ''; idxs.forEach(k => { const el = pageEl(k); el.classList.add('bk-pp'); box.appendChild(el); });
    if (all) toast(`Preparing ${idxs.length} pages…`);
    const imgs = [...box.querySelectorAll('img')];
    await Promise.all(imgs.map(im => new Promise(res => { const t0 = Date.now(); (function w() { if ((im.getAttribute('src') && im.complete) || Date.now() - t0 > 20000) res(); else setTimeout(w, 80); })(); })));
    document.body.classList.add('bk-printing');
    const done = () => { document.body.classList.remove('bk-printing'); box.innerHTML = ''; removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  }
  return {
    active: false, print,
    target: null,
    open() { this.active = true; wire(); const s2 = JSON.stringify(issuesInBinder().map(i => i.id + status(i))); if (!built || s2 !== sig) { buildPages(); built = true; sig = s2; spread = 0; } layout();
      const t = this.target; this.target = null;
      const idx = t === 'cover' ? 0 : t ? pages.findIndex(p => p.issue && p.issue.id === t) : -1;
      if (t === 'cover') { spread = 0; draw(); }
      else if (idx > 0) {   // open the book, then turn the last page to the issue
        const to = single ? idx : Math.ceil(idx / 2); spread = Math.max(0, to - 1); draw();
        setTimeout(() => { if (this.active && spread === to - 1) flip(1); }, 450);
      } else draw();
      document.title = 'Binder · ERGS Digital Skills & AI'; },
    refresh() { const s2 = JSON.stringify(issuesInBinder().map(i => i.id + status(i))); if (s2 !== sig) { sig = s2; buildPages(); spread = Math.min(spread, maxSpread()); layout(); draw(); } }
  };
})();
window.addEventListener('hashchange', () => { if (location.hash !== '#binder') Binder.active = false; });

/* ---------- quick tips ---------- */
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const mkTip = path => ([app, level, title, why, steps]) => ({ id: slug(app + '-' + title), app, level, title, why, steps: (steps || []).filter(Boolean), path });
// NL_SKILLS is the computer-skills path (time-saving tricks): shown in order, every other day
const BUILTIN_TIPS = [...(window.NL_TIPS || []).map(mkTip(false)), ...(window.NL_SKILLS || []).map(mkTip(true))];
let TIPSTATE = { hidden: {}, custom: {}, used: {}, img: {} };
let TIPLOG = null;   // { 'YYYY-MM-DD': tipId } – every Tip of the day, logged once per day
const allTips = () => [...BUILTIN_TIPS, ...Object.entries(TIPSTATE.custom).filter(([, t]) => t && t.title).map(([id, t]) => ({ id, custom: true, app: t.app, level: t.level, title: t.title, why: t.why || '', steps: (t.steps || []).filter(Boolean) }))];
const visibleTips = () => allTips().filter(t => !TIPSTATE.hidden[t.id]);
let tipFilt = { q: '', app: '', level: '', used: '' }, tipOffset = 0, tipsWired = false, tipFormOpen = false;
// picture for a tip: your own screenshot if added, otherwise the drawn illustration (computer-skills tips)
const tipArt = t => { const id = (TIPSTATE.img || {})[t.id]; if (id) return `<figure class="tip-art photo"><img data-tipimg="${esc(id)}" alt="Screenshot for ${esc(t.title)}"></figure>`; const sh = window.NL_TIP_SHOTS && window.NL_TIP_SHOTS[t.title]; if (sh) return `<figure class="tip-art photo"><img src="${esc(sh)}" loading="lazy" alt="Screenshot for ${esc(t.title)}"></figure>`; const sp = window.NL_SKILL_ART && window.NL_SKILL_ART[t.title]; return sp && window.skillArtSVG ? `<figure class="tip-art">${window.skillArtSVG(sp)}</figure>` : ''; };
const tipBody = t => `<p class="tip-why">${esc(t.why)}</p>${tipArt(t)}${t.steps.length ? `<ol class="tip-steps">${t.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}`;
const tipCard = t => `<article class="tip-card"><div class="tip-top"><span class="tip-app" data-app="${esc(t.app)}">${esc(t.app)}</span><span class="tip-lvl${t.level === 'New to this' ? ' new' : ''}">${esc(t.level)}</span></div><h3>${esc(t.title)}</h3>${tipBody(t)}${canManage() ? tipAdminHTML(t) : ''}</article>`;
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDay = k => new Date(k + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
async function loadTipLog() {
  try { const snap = await getDocs(collection(DB, 'newsletterTipLog')); const m = {}; snap.docs.forEach(d => { if (d.data().id) m[d.id] = d.data().id; }); TIPLOG = m; }
  catch (e) { console.warn('tiplog', e.code || e); TIPLOG = TIPLOG || {}; }
}
// pick today's tip: the next beginner-friendly tip that has never been Tip of the day (oldest-used first once all have had a turn)
function chooseTip(vis) {
  const lastUsed = {}; Object.entries(TIPLOG || {}).forEach(([day, id]) => { if (!lastUsed[id] || day > lastUsed[id]) lastUsed[id] = day; });
  // alternate days: the computer-skills path (in order), then the other tips
  const dayNo = Math.floor(Date.parse(todayKey() + 'T12:00:00Z') / 864e5);
  const pathFresh = vis.filter(t => t.path && !lastUsed[t.id]), otherVis = vis.filter(t => !t.path);
  if (pathFresh.length && (dayNo % 2 === 0 || !otherVis.some(t => !lastUsed[t.id]))) return pathFresh[0];
  vis = otherVis.length ? otherVis : vis;
  const beg = vis.filter(t => t.level === 'New to this'), pool = beg.length ? beg : vis;
  const fresh = pool.filter(t => !lastUsed[t.id]);
  if (fresh.length) return fresh[0];
  return [...pool].sort((a, b) => (lastUsed[a.id] || '').localeCompare(lastUsed[b.id] || ''))[0];
}
let tipDayBusy = false;
async function ensureTodayTip() {
  if (tipDayBusy || !DB || TIPLOG === null) return;
  const day = todayKey(), vis = visibleTips();
  if (TIPLOG[day] && vis.some(t => t.id === TIPLOG[day])) return;
  const pick = chooseTip(vis); if (!pick) return;
  tipDayBusy = true;
  try { await setDoc(doc(DB, 'newsletterTipLog', day), { id: pick.id, at: serverTimestamp(), t: await visitToken() }); TIPLOG[day] = pick.id; }
  catch (e) { try { const s = await getDoc(doc(DB, 'newsletterTipLog', day)); if (s.exists()) TIPLOG[day] = s.data().id; } catch (e2) {} }   // another device logged today's tip first
  tipDayBusy = false; renderTipDay();
}
// staff only see tips that have already had their day (Tip of the day, or marked as used) before today
const releasedTips = () => visibleTips().filter(t => tipUses(t.id).some(u => u.day < todayKey()));
function lastUse(id) { return tipUses(id).map(u => u.day).sort().pop() || ''; }
new MutationObserver(() => document.querySelectorAll('img[data-tipimg]:not([src])').forEach(im => { im.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACw='); customPageImg(im.dataset.tipimg).then(u => { im.src = u; }).catch(() => { im.closest('figure')?.remove(); }); })).observe(document.documentElement, { childList: true, subtree: true });
function renderTipDay() {
  const el = $('#tipDay'); if (!el) return;
  const vis = visibleTips(); if (!vis.length) { el.hidden = true; return; } el.hidden = false;
  let t = null; const logged = TIPLOG && TIPLOG[todayKey()];
  if (logged) t = vis.find(x => x.id === logged);
  if (!t) {   // until today's tip is logged, use a stable choice for the day
    const beg = vis.filter(x => x.level === 'New to this'), pool = beg.length ? beg : vis;
    t = TIPLOG ? chooseTip(vis) : pool[Math.floor(Date.now() / 864e5) % pool.length];
  }
  // today's tip first, then earlier tips (most recent first) – staff swipe back through them
  const past = releasedTips().filter(x => x.id !== t.id).sort((a, b) => lastUse(b.id).localeCompare(lastUse(a.id)));
  window.TODAY_TIP = t;
  const items = [t, ...past];
  const card = (x, k) => `<div class="td-card"><div class="td-label"><span>${k ? fmtDay(lastUse(x.id)) : 'Tip of the day'}</span><b data-app="${esc(x.app)}">${esc(x.app)}</b></div><h3>${esc(x.title)}</h3>${tipBody(x)}<div class="td-tried"><button class="tried-btn" data-tried="${esc(x.id)}" aria-pressed="false">I tried this</button></div></div>`;
  el.innerHTML = `<div class="td-track" id="tdTrack">${items.map(card).join('')}</div>
    <div class="td-foot">${items.length > 1 ? `<span class="td-hint">Swipe for earlier tips</span><span class="td-dots">${items.slice(0, 12).map((_, k) => `<i class="${k ? '' : 'on'}"></i>`).join('')}</span><span class="td-nav"><button class="td-arrow" id="tdPrev" aria-label="Newer tip" disabled>‹</button><button class="td-arrow" id="tdNext" aria-label="Earlier tip">›</button></span>` : '<span class="td-hint">A new tip every day</span>'}${canManage() ? '<a class="btn small ghost" href="#tips">Manage tips →</a>' : ''}</div>`;
  const tr = $('#tdTrack');
  const sync = () => { const k = Math.round(tr.scrollLeft / tr.clientWidth); el.querySelectorAll('.td-dots i').forEach((d, i) => d.classList.toggle('on', i === Math.min(k, 11)));
    if ($('#tdPrev')) { $('#tdPrev').disabled = k <= 0; $('#tdNext').disabled = k >= items.length - 1; } };
  tr.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  $('#tdPrev')?.addEventListener('click', () => tr.scrollBy({ left: -tr.clientWidth, behavior: 'smooth' }));
  $('#tdNext')?.addEventListener('click', () => tr.scrollBy({ left: tr.clientWidth, behavior: 'smooth' }));
  el.insertAdjacentHTML('beforeend', '<p class="td-tally" id="tdTally" hidden></p>');
  el.querySelectorAll('[data-tried]').forEach(b => b.addEventListener('click', () => setTried(b.dataset.tried, !triedMap()[b.dataset.tried])));
  renderTipDayTally();
  renderHome3();
  if (!logged) ensureTodayTip();
}
function tipUses(id) {   // all dates a tip was used: as Tip of the day, or marked by the editor
  const out = [];
  Object.entries(TIPLOG || {}).forEach(([day, tid]) => { if (tid === id) out.push({ day, how: 'Tip of the day' }); });
  (TIPSTATE.used[id] || []).forEach(day => out.push({ day, how: 'Marked as used' }));
  return out.sort((a, b) => b.day.localeCompare(a.day));
}
function tipAdminHTML(t) {
  const uses = tipUses(t.id);
  const usedLine = uses.length ? `<div class="tip-used"><b>Used ${uses.length}×</b> · ${uses.slice(0, 3).map(u => `${fmtDay(u.day)} <span>(${u.how === 'Tip of the day' ? 'tip of the day' : 'marked'})</span>`).join(', ')}${uses.length > 3 ? '…' : ''}</div>` : '<div class="tip-used none">Not used yet</div>';
  return `${usedLine}<div class="tip-admin">${t.custom ? '<span class="muted">Added by you</span>' : ''}${TIPLOG && TIPLOG[todayKey()] === t.id ? '<span class="tip-today">Today’s tip</span>' : `<button class="btn small primary" data-tiptoday="${esc(t.id)}">Use this today</button>`}<button class="btn small" data-tipused="${esc(t.id)}">Mark as used today</button><button class="btn small" data-tippic="${esc(t.id)}">${(TIPSTATE.img || {})[t.id] ? 'Replace screenshot' : 'Add screenshot'}</button>${(TIPSTATE.img || {})[t.id] ? `<button class="btn small" data-tippicrm="${esc(t.id)}">${(window.NL_TIP_SHOTS || {})[t.title] ? 'Back to built-in screenshot' : (window.NL_SKILL_ART || {})[t.title] ? 'Back to drawing' : 'Remove screenshot'}</button>` : ''}<button class="btn small" data-tiphide="${esc(t.id)}">Hide</button></div>`;
}
function saveTipState(patch, msg) {
  if (!ADMIN || !DB) return toast('Sign in at Staff admin to change tips');
  setDoc(doc(DB, 'newsletter', 'state'), { releases: {}, ...patch, updated: serverTimestamp() }, { merge: true }).then(() => msg && toast(msg)).catch(e => toast('Couldn’t save: ' + (e.code || e.message)));
}
function renderTips() {
  const apps = [...new Set((canManage() ? allTips() : releasedTips()).map(t => t.app))];
  if (!tipsWired) {
    tipsWired = true;
    $('#tipChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; tipFilt.app = b.dataset.a; renderTips(); });
    $('#tipQ').addEventListener('input', e => { tipFilt.q = e.target.value.toLowerCase(); renderTips(); });
    $('#tipLvl').addEventListener('change', e => { tipFilt.level = e.target.value; renderTips(); });
  }
  $('#tipChips').innerHTML = ['All', ...apps].map(a => { const v = a === 'All' ? '' : a; return `<button class="chip${tipFilt.app === v ? ' on' : ''}" data-a="${esc(v)}">${esc(a)}</button>`; }).join('');
  const vis = canManage() ? visibleTips() : releasedTips();
  const list = vis.filter(t => (!tipFilt.app || t.app === tipFilt.app) && (!tipFilt.level || t.level === tipFilt.level) && (!tipFilt.used || !canManage() || (tipFilt.used === 'used') === (tipUses(t.id).length > 0)) && (!tipFilt.q || (t.app + ' ' + t.title + ' ' + t.why + ' ' + t.steps.join(' ')).toLowerCase().includes(tipFilt.q)));
  $('#tipCount').textContent = `${list.length} of ${vis.length} tips`;
  // editor tools
  const hidden = allTips().filter(t => TIPSTATE.hidden[t.id]);
  const ab = $('#tipAdmin'); ab.hidden = !canManage();
  if (canManage()) {
    const hist = Object.entries(TIPLOG || {}).sort((a, b) => b[0].localeCompare(a[0]));
    const marked = []; Object.entries(TIPSTATE.used).forEach(([id, days]) => (days || []).forEach(d => marked.push([d, id])));
    const usedIds = new Set([...hist.map(h => h[1]), ...marked.map(m => m[1])]);
    const tipTitle = id => { const t = allTips().find(x => x.id === id); return t ? `<b>${esc(t.app)}</b> · ${esc(t.title)}` : '<span class="muted">(tip removed)</span>'; };
    ab.innerHTML = `<div class="adminbar"><b>Editor</b><span>Staff see ${releasedTips().length} of ${visibleTips().length} tips – each one appears for them after its day as Tip of the day (or after you mark it as used). Hide, mark or add tips here.</span><span class="spacer"></span>
        <select id="tipUsedSel" aria-label="Usage"><option value="">All tips</option><option value="unused"${tipFilt.used === 'unused' ? ' selected' : ''}>Not used yet</option><option value="used"${tipFilt.used === 'used' ? ' selected' : ''}>Already used</option></select>
        <button class="btn small primary" id="tipAddBtn">${tipFormOpen ? 'Close' : '+ Add a tip'}</button></div>
      <details class="panel tip-history"><summary><b>Usage history</b> <span class="muted">· ${usedIds.size} of ${vis.length} tips used · ${hist.length} tips of the day logged</span></summary>
        ${[...hist.map(([d, id]) => [d, id, 'Tip of the day']), ...marked.map(([d, id]) => [d, id, 'Marked as used'])].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 120).map(([d, id, how]) => `<div class="th-row"><span class="th-date">${fmtDay(d)}</span><span class="th-tip">${tipTitle(id)}</span><span class="th-how">${how}</span></div>`).join('') || '<p class="muted">Nothing used yet – today’s Tip of the day is logged as soon as anyone opens the home page.</p>'}
      </details>
      ${tipFormOpen ? `<form class="panel tipform" id="tipForm">
        <div class="row"><div class="field"><label>App</label><input name="app" list="tipApps" required placeholder="e.g. Google Classroom"><datalist id="tipApps">${apps.map(a => `<option value="${esc(a)}">`).join('')}</datalist></div>
        <div class="field" style="flex:0 1 180px"><label>Level</label><select name="level"><option>New to this</option><option>Next step</option></select></div></div>
        <div class="field"><label>Title</label><input name="title" required maxlength="80"></div>
        <div class="field"><label>Why it helps</label><textarea name="why" rows="2" maxlength="300"></textarea></div>
        <div class="field"><label>Steps (one per line)</label><textarea name="steps" rows="4" maxlength="800"></textarea></div>
        <button class="btn primary" type="submit">Save tip</button></form>` : ''}`;
    $('#tipAddBtn').onclick = () => { tipFormOpen = !tipFormOpen; renderTips(); };
    $('#tipUsedSel').onchange = e => { tipFilt.used = e.target.value; renderTips(); };
    $('#tipForm')?.addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target), g = k => (f.get(k) || '').toString().trim();
      const t = { app: g('app'), level: g('level'), title: g('title'), why: g('why'), steps: g('steps').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8) };
      const id = 'c-' + slug(t.app + '-' + t.title) + '-' + Date.now().toString(36);
      tipFormOpen = false; saveTipState({ customTips: { [id]: t } }, 'Tip added');
    });
  }
  const emptyMsg = !vis.length ? '<p class="empty">A new tip appears on the home page each day. Once a tip has had its day, it’s kept here for you to come back to.</p>' : '<p class="empty">No tips match that search.</p>';
  $('#tipGrid').innerHTML = (list.length ? list.map(tipCard).join('') : emptyMsg) +
    (canManage() && hidden.length ? `<div class="tip-hidden"><h3>Hidden tips (${hidden.length})</h3><p class="muted">Staff can’t see these.</p>${hidden.map(t => `<div class="th-row"><span><b>${esc(t.app)}</b> · ${esc(t.title)}</span><button class="btn small" data-tipshow="${esc(t.id)}">Restore</button></div>`).join('')}</div>` : '');
  document.querySelectorAll('[data-tiphide]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.tiphide, t = allTips().find(x => x.id === id);
    if (t && t.custom) saveTipState({ customTips: { [id]: null } }, 'Tip removed');
    else saveTipState({ hiddenTips: { [id]: true } }, 'Tip hidden – restore it at the bottom of the page');
  }));
  document.querySelectorAll('[data-tiptoday]').forEach(b => b.addEventListener('click', async () => {
    if (!ADMIN || !DB) return toast('Sign in at Staff admin to change tips');
    const id = b.dataset.tiptoday, day = todayKey(); b.disabled = true;
    try {
      await setDoc(doc(DB, 'newsletterTipLog', day), { id, at: serverTimestamp(), t: await visitToken() });
      TIPLOG = { ...(TIPLOG || {}), [day]: id }; toast('Set as today’s Tip of the day'); renderTips(); renderTipDay();
    } catch (e) { b.disabled = false; toast('Couldn’t set it: ' + (e.code || e.message)); }
  }));
  document.querySelectorAll('[data-tipused]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.tipused, days = [...new Set([...(TIPSTATE.used[id] || []), todayKey()])];
    saveTipState({ usedTips: { [id]: days } }, 'Marked as used today');
  }));
  document.querySelectorAll('[data-tipshow]').forEach(b => b.addEventListener('click', () => saveTipState({ hiddenTips: { [b.dataset.tipshow]: false } }, 'Tip restored')));
  document.querySelectorAll('[data-tippic]').forEach(b => b.addEventListener('click', () => {
    if (!ADMIN || !DB) return toast('Sign in at Staff admin to change tips');
    const id = b.dataset.tippic, inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return; b.disabled = true; b.textContent = 'Uploading…';
      try {
        const bmp = await createImageBitmap(f), sc = Math.min(1, 1400 / bmp.width), c = document.createElement('canvas');
        c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const docId = 'tip-' + id.slice(0, 60) + '-' + Date.now().toString(36), old = (TIPSTATE.img || {})[id];
        await setDoc(doc(DB, 'newsletterImgs', docId), { data: b64e(await enc(await fitJpeg(c))) });
        await saveTipState({ tipImgs: { [id]: docId } }, 'Screenshot added');
        if (old) deleteDoc(doc(DB, 'newsletterImgs', old)).catch(() => {});
      } catch (e) { toast('Couldn’t add the screenshot: ' + (e.code || e.message)); b.disabled = false; }
    };
    inp.click();
  }));
  document.querySelectorAll('[data-tippicrm]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.tippicrm, old = (TIPSTATE.img || {})[id];
    await saveTipState({ tipImgs: { [id]: null } }, 'Screenshot removed');
    if (old) deleteDoc(doc(DB, 'newsletterImgs', old)).catch(() => {});
  }));
}
/* ---------- anonymous usage: one record per device that has unlocked the site ----------
   Stores a random device id, first/last visit, visit count, installed-app and phone flags. No names or emails.
   The token is derived from the staff key, so only devices that know the password can write. Only the editor can read. */
async function visitToken() {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', KEY));
  const pre = new TextEncoder().encode('ainl-visit:'); const buf = new Uint8Array(pre.length + raw.length); buf.set(pre); buf.set(raw, pre.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
async function trackVisit() {
  try {
    if (!DB || !KEY) return;
    let id = LS.get('ergsNL.dev'); if (!id) { id = 'd' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''); LS.set('ergsNL.dev', id); }
    const name = LS.get('ergsNL.name') || '';
    const lastSent = +LS.get('ergsNL.devT') || 0; if (Date.now() - lastSent < 6 * 3600e3 && LS.get('ergsNL.nameSent') === name) return;   // at most every 6 hours (sooner if the name is new)
    const t = await visitToken(), ref = doc(DB, 'newsletterVisits', id);
    const app = standalone(), mob = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let prev = null; try { const s = await getDoc(ref); if (s.exists()) prev = s.data(); } catch (e) {}
    const nm = name ? { name } : (prev && prev.name ? { name: prev.name } : {});
    if (prev) await setDoc(ref, { t, first: prev.first, last: serverTimestamp(), n: (prev.n || 1) + 1, app: app || !!prev.app, mob, ...nm });
    else await setDoc(ref, { t, first: serverTimestamp(), last: serverTimestamp(), n: 1, app, mob, ...nm });
    LS.set('ergsNL.devT', String(Date.now())); LS.set('ergsNL.nameSent', name);
  } catch (e) { console.warn('visit', e.code || e); }
}
async function renderUsage() {
  const el = $('#usagePanel'); if (!el) return;
  try {
    const snap = await getDocs(collection(DB, 'newsletterVisits'));
    let TR = {}; try { (await getDocs(collection(DB, 'newsletterTried'))).docs.forEach(d => { TR[d.id] = d.data().c || 0; }); } catch (e) {}
    const now = Date.now(), day = 864e5, rows = snap.docs.map(d => ({ ...d.data(), _id: d.id })).map(x => ({ tried: TR[x._id] || 0, name: x.name || '', first: x.first?.toMillis?.() || 0, last: x.last?.toMillis?.() || 0, n: x.n || 1, app: !!x.app, mob: !!x.mob }));
    const total = rows.length, a7 = rows.filter(r => now - r.last < 7 * day).length, a30 = rows.filter(r => now - r.last < 30 * day).length;
    const n7 = rows.filter(r => now - r.first < 7 * day).length, apps = rows.filter(r => r.app).length, phones = rows.filter(r => r.mob).length, visits = rows.reduce((t, r) => t + r.n, 0);
    const weeks = Array.from({ length: 8 }, (_, k) => rows.filter(r => r.first && now - r.first >= (7 - k) * 7 * day && now - r.first < (8 - k) * 7 * day).length);
    const mx = Math.max(1, ...weeks);
    // one row per person: devices that gave the same name (ignoring case and spacing) are grouped
    const key = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
    const groups = new Map();
    rows.forEach((r, i) => { const k = r.name.trim() ? 'n:' + key(r.name) : 'd:' + i; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    const people = [...groups.values()].map(devs => {
      const vs = devs.map(d => d.name.trim().replace(/\s+/g, ' ')).filter(Boolean), cap = vs.find(v => /[A-Z]/.test(v)) || (vs[0] || '').replace(/\b\w/g, c => c.toUpperCase());
      return { name: cap, devs, first: Math.min(...devs.map(d => d.first || Infinity)), last: Math.max(...devs.map(d => d.last)), n: devs.reduce((t, d) => t + d.n, 0), tried: devs.reduce((t, d) => t + d.tried, 0), app: devs.filter(d => d.app).length }; })
      .sort((x, y) => (!!y.name - !!x.name) || y.last - x.last);
    const devMix = ds => { const m = ds.filter(d => d.mob).length, c = ds.length - m; return '(' + [c && c + (c > 1 ? ' computers' : ' computer'), m && m + (m > 1 ? ' phones/tablets' : ' phone/tablet')].filter(Boolean).join(', ') + ')'; };
    const fmtD = t => t && isFinite(t) ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '–';
    el.innerHTML = `<h2>Staff usage</h2><p class="muted">Each device that has entered the staff password is counted once. Staff give their name the first time they log in.</p>
      <div class="usage-grid">
        <div><b>${people.filter(p => p.name).length}</b><span>named staff</span></div>
        <div><b>${total}</b><span>devices unlocked</span></div>
        <div><b>${rows.reduce((t, r) => t + r.tried, 0)}</b><span>tips tried</span></div>
        <div><b>${a7}</b><span>active in the last 7 days</span></div>
        <div><b>${a30}</b><span>active in the last 30 days</span></div>
        <div><b>${apps}</b><span>using the installed app</span></div>
      </div>
      <div class="usage-bars" aria-label="New devices per week, last 8 weeks">${weeks.map((w, k) => `<div title="${w} new"><i style="height:${Math.round(w / mx * 100)}%"></i><small>${k === 7 ? 'This wk' : (7 - k) + 'w'}</small><em>${w || ''}</em></div>`).join('')}</div>
      <p class="muted usage-note">New devices per week · ${phones} of ${total} are phones or tablets. One person may use more than one device.</p>
      <h3 style="margin:22px 0 0;font:600 18px var(--serif);color:var(--navy)">Who’s using ERGS AI</h3>
      <p class="muted" style="margin:4px 0 0">${people.filter(p => p.name).length} named ${people.filter(p => p.name).length === 1 ? 'person' : 'people'}. Devices logged in with the same name are grouped together.</p>
      <div style="overflow-x:auto"><table class="who"><thead><tr><th>Name</th><th>Devices</th><th>First used</th><th>Last used</th><th>Visits</th><th>Tips tried</th><th>App installed</th></tr></thead><tbody>
      ${people.map(p => `<tr><td>${p.name ? esc(p.name) : '<span class="muted">Not given yet</span>'}</td><td><b>${p.devs.length}</b> <span class="muted">${devMix(p.devs)}</span></td><td>${fmtD(p.first)}</td><td>${fmtD(p.last)}</td><td>${p.n}</td><td>${p.tried || '–'}</td><td>${p.app ? `<span class="yes">✓ ${p.devs.length > 1 ? p.app + ' of ' + p.devs.length : 'Yes'}</span>` : 'No'}</td></tr>`).join('')}
      </tbody></table></div>`;
  } catch (e) {
    el.innerHTML = /permission/.test(String(e.code || e.message))
      ? `<h2>Staff usage</h2><p class="note">Usage counting needs a one-off Firebase rules update. Add the <b>newsletterVisits</b> block from <code>firestore-rules-snippet.txt</code> to your Firestore rules – counting starts as soon as it’s published.</p>`
      : `<h2>Staff usage</h2><p class="muted">Couldn’t load usage figures (${esc(e.code || e.message)}).</p>`;
  }
}
/* ---------- download the whole series as one PDF (editor) ---------- */
async function loadJsPDF() {
  if (window.jspdf) return window.jspdf;
  await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
  return window.jspdf;
}
const blobURLtoDataURL = u => fetch(u).then(r => r.blob()).then(b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }));
const imgSize = u => new Promise(r => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.onerror = () => r([1240, 1754]); im.src = u; });
async function downloadSeries() {
  const btn = $('#dlBtn'), msg = $('#dlMsg'), which = $('#dlWhich').value;
  const list = allIssues().filter(i => which === 'all' ? status(i) !== 'removed' : status(i) === 'live').filter(i => (i.imgs || i.pageDocs || []).length);
  if (!list.length) return msg.textContent = 'No issues to include.';
  btn.disabled = true;
  try {
    msg.textContent = 'Preparing…';
    const { jsPDF } = await loadJsPDF();
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    // cover page
    pdf.setFillColor(20, 40, 75); pdf.rect(0, 0, 210, 297, 'F');
    pdf.setFillColor(184, 149, 90); pdf.rect(0, 0, 210, 2, 'F');
    try { const cr = await new Promise((ok, no) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); ok([c.toDataURL('image/png'), im.naturalWidth, im.naturalHeight]); }; im.onerror = no; im.src = window.ERGS_CREST; });
      const ch = 44, cw = ch * cr[1] / cr[2]; pdf.addImage(cr[0], 'PNG', 105 - cw / 2, 58, cw, ch); } catch (e) {}
    pdf.setTextColor(217, 192, 140); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text('ENNISKILLEN ROYAL GRAMMAR SCHOOL', 105, 120, { align: 'center', charSpace: 1 });
    pdf.setTextColor(255, 255, 255); pdf.setFont('times', 'bold'); pdf.setFontSize(40); pdf.text('Digital Skills & AI', 105, 140, { align: 'center' });
    pdf.setFont('times', 'italic'); pdf.setFontSize(20); pdf.setTextColor(201, 212, 230); pdf.text("A Teacher's Guide", 105, 152, { align: 'center' });
    pdf.setDrawColor(184, 149, 90); pdf.setLineWidth(0.6); pdf.line(85, 162, 125, 162);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); pdf.setTextColor(214, 222, 234);
    pdf.text(`Whole-School AI Skills CPD Portfolio · ${list.length} issues`, 105, 174, { align: 'center' });
    pdf.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 105, 182, { align: 'center' });
    // contents
    pdf.addPage(); pdf.setTextColor(20, 40, 75); pdf.setFont('times', 'bold'); pdf.setFontSize(24); pdf.text('Contents', 20, 28);
    pdf.setDrawColor(20, 40, 75); pdf.line(20, 32, 190, 32);
    let pageNo = 3; const rows = list.map(i => { const r = [i.n, String(i.title).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/–/g, '-'), pageNo]; pageNo += (i.imgs || i.pageDocs).length; return r; });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
    rows.forEach((r, k) => { const col = k < 34 ? 0 : 1, y = 42 + (k % 34) * 7.2, x = 20 + col * 88;
      pdf.setTextColor(31, 79, 143); pdf.text(String(r[0]), x, y); pdf.setTextColor(28, 36, 48);
      pdf.text(pdf.splitTextToSize(r[1], 66)[0], x + 8, y); pdf.setTextColor(93, 104, 120); pdf.text(String(r[2]), x + 80, y, { align: 'right' }); });
    // pages
    let done = 0; const total = list.reduce((t, i) => t + (i.imgs || i.pageDocs).length, 0);
    for (const i of list) {
      for (const p of (i.imgs || i.pageDocs)) {
        msg.textContent = `Adding page ${++done} of ${total}…`;
        const url = await (i.fsPages ? customPageImg(p) : fileImg(p));
        const data = await blobURLtoDataURL(url), [w, h] = await imgSize(url);
        pdf.addPage(); const k = Math.min(210 / w, 297 / h), W = w * k, H = h * k;
        pdf.addImage(data, 'JPEG', (210 - W) / 2, (297 - H) / 2, W, H, undefined, 'FAST');
      }
    }
    msg.textContent = 'Saving…';
    pdf.save(`ERGS Digital Skills & AI - ${which === 'all' ? 'Full series' : 'Released issues'} (${list.length} issues).pdf`);
    msg.textContent = `Downloaded ${list.length} issues (${total + 2} pages).`;
  } catch (e) { console.warn(e); msg.textContent = 'Couldn’t build the PDF: ' + (e.message || e); }
  btn.disabled = false;
}
/* ---------- help sheets ---------- */
const SHEETS = (window.NL_SHEETS || []).map((x, k) => ({ ...x, n: k + 1, id: slug(x.app + '-' + x.title) }));
let SHEETHIDE = {}, shFilt = { q: '', app: '', level: '' }, shWired = false;
const visibleSheets = () => SHEETS.filter(x => !SHEETHIDE[x.id]);
const appFamily = a => /google|gmail/i.test(a) ? 'g' : /word|powerpoint|excel|teams|onenote|outlook/i.test(a) ? 'm' : /\bai\b/i.test(a) ? 'ai' : 'it';
function renderSheets() {
  const apps = [...new Set(SHEETS.map(x => x.app))];
  if (!shWired) {
    shWired = true;
    $('#shChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; shFilt.app = b.dataset.a; renderSheets(); });
    $('#shQ').addEventListener('input', e => { shFilt.q = e.target.value.toLowerCase(); renderSheets(); });
    $('#shLvl').addEventListener('change', e => { shFilt.level = e.target.value; renderSheets(); });
  }
  $('#shChips').innerHTML = ['All', ...apps].map(a => { const v = a === 'All' ? '' : a; return `<button class="chip${shFilt.app === v ? ' on' : ''}" data-a="${esc(v)}">${esc(a)}</button>`; }).join('');
  const vis = visibleSheets();
  const list = vis.filter(x => (!shFilt.app || x.app === shFilt.app) && (!shFilt.level || x.level === shFilt.level) && (!shFilt.q || [x.app, x.title, x.intro, ...x.steps.flat()].join(' ').toLowerCase().includes(shFilt.q)));
  $('#shCount').textContent = `${list.length} of ${vis.length} help sheets`;
  const hidden = SHEETS.filter(x => SHEETHIDE[x.id]);
  $('#sheetAdmin').hidden = !canManage();
  if (canManage()) $('#sheetAdmin').innerHTML = `<div class="adminbar"><b>Editor</b><span>Hide sheets that don’t suit your staff – restore them at the bottom of the page. Staff never see these controls.</span></div>`;
  $('#shGrid').innerHTML = (list.length ? list.map(x => `<a class="shcard fam-${appFamily(x.app)}" href="#sheet-${x.n}"><span class="shnum">Sheet ${x.n}</span><div class="tip-top"><span class="tip-app">${esc(x.app)}</span><span class="tip-lvl${x.level === 'New to this' ? ' new' : ''}">${esc(x.level)}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.intro)}</p>${canManage() ? `<span class="tip-admin"><button class="btn small" data-shhide="${esc(x.id)}">Hide</button></span>` : ''}</a>`).join('') : '<p class="empty">No help sheets match that search.</p>') +
    (canManage() && hidden.length ? `<div class="tip-hidden"><h3>Hidden help sheets (${hidden.length})</h3><p class="muted">Staff can’t see these.</p>${hidden.map(x => `<div class="th-row"><span><b>${esc(x.app)}</b> · ${esc(x.title)}</span><button class="btn small" data-shshow="${esc(x.id)}">Restore</button></div>`).join('')}</div>` : '');
  document.querySelectorAll('[data-shhide]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); saveTipState({ hiddenSheets: { [b.dataset.shhide]: true } }, 'Help sheet hidden'); }));
  document.querySelectorAll('[data-shshow]').forEach(b => b.addEventListener('click', () => saveTipState({ hiddenSheets: { [b.dataset.shshow]: false } }, 'Help sheet restored')));
}
function sheetHTML(x) {
  return `<article class="hs fam-${appFamily(x.app)}">
    <header class="hs-head"><div class="hs-hl"><p class="hs-kick">Staff help sheet · No. ${x.n}</p><h1>${esc(x.title)}</h1><p class="hs-tags"><span>${esc(x.app)}</span><span>${esc(x.level)}</span></p></div><img class="hs-crest" src="${window.ERGS_CREST || ''}" alt=""></header>
    <div class="hs-body">
      <p class="hs-intro">${esc(x.intro)}</p>
      <div class="hs-cols">
        <div>
          ${x.before?.length ? `<div class="hs-before"><h4>Before you start</h4><ul>${x.before.map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>` : ''}
          <h4 class="hs-sec">Step by step</h4>
          <ol class="hs-steps">${x.steps.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol>
        </div>
        <aside>
          <div class="hs-tip"><h4>Top tip</h4><p>${esc(x.tip)}</p></div>
          <div class="hs-trouble"><h4>If it doesn’t work</h4>${x.trouble.map(([p, f]) => `<p><b>${esc(p)}</b>${esc(f)}</p>`).join('')}</div>
          <div class="hs-try"><h4>Try it now</h4><p>${esc(x.tryit)}</p></div>
        </aside>
      </div>
    </div>
    <footer class="hs-foot"><span>ERGS Digital Skills &amp; AI · Staff help sheets</span><span>Approved AI tools: Copilot · Gemini · NotebookLM</span></footer>
  </article>`;
}
function fitSheet(el) {   // size the type so each sheet fills one A4 page without spilling over
  const body = el.querySelector('.hs-body');
  const over = () => el.scrollHeight > el.clientHeight + 1 || body.scrollHeight > body.clientHeight + 1;
  let k = 1.18; el.style.setProperty('--k', k);
  while (over() && k > 0.6) { k -= 0.02; el.style.setProperty('--k', k.toFixed(2)); }
}
function renderSheet(n) {
  const vis = canManage() ? SHEETS : visibleSheets(), x = vis.find(s => s.n === n);
  if (!x) { $('#hsWrap').innerHTML = '<p class="empty">That help sheet isn’t available.</p>'; return; }
  $('#hsWrap').innerHTML = sheetHTML(x); document.title = `${x.title} · Help sheet`;
  const el = $('#hsWrap .hs'); requestAnimationFrame(() => fitSheet(el)); document.fonts?.ready.then(() => fitSheet(el));
  const i = vis.indexOf(x);
  $('#shPrev').disabled = i <= 0; $('#shNext').disabled = i >= vis.length - 1;
  $('#shPrev').onclick = () => { location.hash = 'sheet-' + vis[i - 1].n; };
  $('#shNext').onclick = () => { location.hash = 'sheet-' + vis[i + 1].n; };
  $('#shPrint').onclick = () => window.print();
}
boot();

/* ======================================================================
   Staff features: saved prompts, "did it work?" ratings, shared prompts,
   and a one-page CPD record (PDF via print).
   ====================================================================== */
var RATINGS = null, ratingsUnsub = null, SHARED = [], sharedUnsub = null;
const jget = (k, d) => { try { return JSON.parse(LS.get(k) || '') ?? d; } catch (e) { return d; } };
const savedKeys = () => jget('ergsNL.saved', []);
const myVersions = () => jget('ergsNL.mine', []);
const usedLog = () => jget('ergsNL.used', []);
const ratedMap = () => jget('ergsNL.rated', {});
const safeKey = k => String(k).replace(/[^\w:-]/g, '_').slice(0, 100);

function logUse(card, go) {
  const k = card.dataset.key; if (!k) return;
  const log = usedLog(); log.unshift({ k, title: card.querySelector('h3')?.textContent || 'Prompt', subj: (card.dataset.subj || '').split('|')[0] || '', d: todayKey(), tool: go && go !== 'copy' ? go : 'Copied' });
  LS.set('ergsNL.used', JSON.stringify(log.slice(0, 400)));
}
// after a prompt is used: a quiet "Did it work?" row on the card
function askRating(card) {
  const k = card.dataset.key; if (!k || !card.isConnected || card.hidden || ratedMap()[k]) return;
  card.querySelector('.pl-rate')?.remove();
  const r = document.createElement('div'); r.className = 'pl-rate';
  r.innerHTML = `<span>Did it work?</span><button data-rate="1">👍 It worked</button><button data-rate="-1">👎 Needed fixing</button><button class="pr-x" aria-label="Not now">×</button>`;
  card.querySelector('.pl-sendrow').after(r);
  r.addEventListener('click', async e => {
    e.stopPropagation(); const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('pr-x')) return r.remove();
    const v = +b.dataset.rate, m = ratedMap(); m[k] = v; LS.set('ergsNL.rated', JSON.stringify(m));
    r.innerHTML = `<span>${v > 0 ? 'Thanks – that helps colleagues find the best prompts.' : 'Thanks – we’ll look at improving this one.'}</span>`; setTimeout(() => r.remove(), 2600);
    try { const dev = LS.get('ergsNL.dev'); if (DB && KEY && dev) await setDoc(doc(DB, 'newsletterRatings', safeKey(dev + '_' + k)), { t: await visitToken(), p: String(k).slice(0, 120), v, at: serverTimestamp() }); } catch (er) { console.warn('rate', er.code || er); }
  });
}
function watchRatings() {
  if (ratingsUnsub || !DB) return;
  ratingsUnsub = onSnapshot(collection(DB, 'newsletterRatings'), s => {
    const m = {}; s.docs.forEach(d => { const x = d.data(); if (!x.p) return; const r = (m[x.p] ||= { up: 0, down: 0 }); x.v > 0 ? r.up++ : r.down++; });
    const first = RATINGS === null; RATINGS = m; if (first && location.hash === '#prompts') renderPrompts();
  }, e => { console.warn('ratings', e.code || e); RATINGS = RATINGS || {}; ratingsUnsub = null; });
}
const ratingOf = k => (RATINGS || {})[k] || { up: 0, down: 0 };

// staff-shared prompts: encrypted with the staff key; the editor approves them in Workflow
function watchShared() {
  if (sharedUnsub || !DB) return;
  sharedUnsub = onSnapshot(collection(DB, 'newsletterShared'), async s => {
    const out = [];
    for (const d of s.docs) { try { const x = await decJSON(d.data().enc); out.push({ ...x, docId: d.id, st: d.data().st || 'pending', at: d.data().at?.toMillis?.() || 0 }); } catch (e) {} }
    SHARED = out.sort((a, b) => b.at - a.at);
    if (location.hash === '#prompts') renderPrompts(); if (location.hash === '#flow') renderFlow(); if (!location.hash || location.hash === '#home' || location.hash === '#library') renderHome3?.();
  }, e => { console.warn('shared', e.code || e); sharedUnsub = null; });
}
const sharedLive = () => SHARED.filter(x => x.st === 'live').map(x => ({ tool: x.tool || 'Gemini or Copilot', title: x.title, text: noDash(x.text || ''), cat: PL_CATS.includes(x.cat) ? x.cat : 'Resources', subj: [x.subj || 'All subjects'], stage: x.stage || 'Any', key: 'S' + x.docId, issue: null, by: x.name || 'a colleague', fit: `${x.stage && x.stage !== 'Any' ? x.stage + ' ' : ''}${x.subj && x.subj !== 'All subjects' ? x.subj : 'Any subject'} · shared by ${x.name || 'a colleague'}` }));

function savedPrompts() {
  const keys = savedKeys(), all = allPrompts();
  const starred = keys.map(k => all.find(p => p.key === k)).filter(Boolean);
  const mine = myVersions().map(m => ({ tool: m.tool || 'Gemini or Copilot', title: m.title, text: m.text, cat: m.cat || 'Resources', subj: [m.subj || 'All subjects'], stage: m.stage || 'Any', key: 'M' + m.id, issue: null, mine: m, fit: `Your own version${m.d ? ' · saved ' + fmtDay(m.d) : ''}` }));
  return [...mine, ...starred];
}
function toggleStar(k, b) {
  const s = savedKeys(), i = s.indexOf(k); if (i >= 0) s.splice(i, 1); else s.unshift(k);
  LS.set('ergsNL.saved', JSON.stringify(s.slice(0, 300)));
  if (b) { const on = i < 0; b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; b.setAttribute('aria-pressed', on); b.title = on ? 'Saved – tap to remove' : 'Save this prompt'; }
  toast(i < 0 ? 'Saved to My saved prompts' : 'Removed from My saved prompts');
}
function saveMyVersion(card, text) {
  const list = myVersions(); const title = (card.querySelector('h3')?.textContent || 'My prompt').replace(/^My version: /, '');
  list.unshift({ id: Date.now().toString(36), title: 'My version: ' + title, text, subj: (card.dataset.subj || '').split('|')[0] || 'All subjects', cat: card.dataset.cat || 'Resources', stage: card.dataset.stage || 'Any', tool: card.dataset.tool || 'Gemini or Copilot', d: todayKey() });
  LS.set('ergsNL.mine', JSON.stringify(list.slice(0, 100))); toast('Saved – find it under My saved prompts');
}
function deleteMine(id) { LS.set('ergsNL.mine', JSON.stringify(myVersions().filter(m => m.id !== id))); toast('Deleted'); renderPrompts(); }

// "Share a prompt that worked" sheet
function openSharePrompt(pre) {
  const main = (mySubjects() || [])[0] || '';
  const sheet = document.createElement('div'); sheet.className = 'fill-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML = `<form class="fill-card share-card"><header><span class="eyebrow">Share with colleagues</span><h3>Share a prompt that worked</h3><button type="button" class="fill-x" aria-label="Close">×</button></header>
    <p class="muted sh-intro">It goes straight into the Prompt Bank for everyone, with your name on it.</p>
    <div class="fill-fields">
      <label for="shTitle">Short title</label><input id="shTitle" maxlength="80" required placeholder="e.g. Year 10 river landforms quiz" value="${esc(pre?.title?.replace(/^My version: /, '') || '')}">
      <label for="shSubj">Subject</label><select id="shSubj"><option>All subjects</option>${SUBJECTS.map(s => `<option ${(pre?.subj || main) === s[0] ? 'selected' : ''}>${esc(s[0])}</option>`).join('')}</select>
      <label for="shStage">Stage</label><select id="shStage">${['Any', 'KS3', 'GCSE', 'A Level'].map(s => `<option ${pre?.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label for="shCat">Area</label><select id="shCat">${PL_CATS.map(c => `<option ${pre?.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label for="shText">The prompt</label><textarea id="shText" rows="8" required maxlength="4000" placeholder="Paste the prompt that worked. Use [brackets] for anything colleagues should change, e.g. [topic] or [Year group=Year 10].">${esc(pre?.text || '')}</textarea>
    </div>
    <label class="fill-tidy sh-ok"><input type="checkbox" id="shOk" required><span><b>No pupil names or personal data</b><small>I’ve checked the prompt doesn’t include any pupil or staff personal information.</small></span></label>
    <footer><button type="submit" class="btn primary">Share with everyone</button></footer></form>`;
  document.body.appendChild(sheet); document.body.classList.add('sp-open');
  const close = () => { sheet.remove(); document.body.classList.remove('sp-open'); };
  sheet.querySelector('.fill-x').onclick = close; sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
  sheet.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault(); if (!DB || !KEY) return toast('Can’t share right now – check your connection');
    const b = e.target.querySelector('[type=submit]'); b.disabled = true;
    const x = { title: $('#shTitle').value.trim().slice(0, 80), text: $('#shText').value.trim().slice(0, 4000), subj: $('#shSubj').value, stage: $('#shStage').value, cat: $('#shCat').value, tool: 'Gemini or Copilot', name: (LS.get('ergsNL.name') || '').slice(0, 60) };
    try { const st = await putShared(await encJSON(x), await visitToken()); close(); toast(st === 'live' ? 'Thanks! It’s now in the Prompt Bank for everyone' : 'Thanks! Sent to the editor'); }
    catch (er) { console.warn(er); toast('Couldn’t send – try again'); b.disabled = false; }
  });
  setTimeout(() => $('#shTitle').focus(), 60);
}
// share straight to live; if the database rules still only allow 'pending', fall back so nothing is lost
async function putShared(enc, t) {
  try { await setDoc(doc(collection(DB, 'newsletterShared')), { enc, t, st: 'live', at: serverTimestamp() }); return 'live'; }
  catch (e) { await setDoc(doc(collection(DB, 'newsletterShared')), { enc, t, st: 'pending', at: serverTimestamp() }); return 'pending'; }
}
async function moderateShared(id, ok) {
  try { if (ok) await setDoc(doc(DB, 'newsletterShared', id), { st: 'live' }, { merge: true }); else await deleteDoc(doc(DB, 'newsletterShared', id)); toast(ok ? 'Approved – now in the Prompt Bank' : 'Removed'); }
  catch (er) { toast('Couldn’t update – check you’re signed in'); }
}
function sharedQueueHTML() {
  const pend = SHARED.filter(x => x.st === 'pending'), live = SHARED.filter(x => x.st === 'live');
  return `<section class="fl-lane fl-shared"><header><h3>Prompts shared by staff</h3><p>${pend.length ? `${pend.length} waiting for you to check` : 'Nothing waiting'} · ${live.length} live in the Prompt Bank</p></header>
    ${pend.length ? `<ul class="sq-list">${pend.map(x => `<li><div><b>${esc(x.title)}</b><span>${esc(x.name || 'A colleague')} · ${esc(x.subj)} · ${esc(x.stage)} · ${esc(x.cat)}</span><pre>${esc(x.text)}</pre></div><p><button class="btn primary small" data-sq-ok="${esc(x.docId)}">Approve</button><button class="btn small" data-sq-no="${esc(x.docId)}">Remove</button></p></li>`).join('')}</ul>` : ''}
    ${live.length ? `<details class="sq-live"><summary>Live shared prompts (${live.length})</summary><ul class="sq-list">${live.map(x => `<li><div><b>${esc(x.title)}</b><span>${esc(x.name || 'A colleague')} · ${esc(x.subj)}</span></div><p><button class="btn small" data-sq-no="${esc(x.docId)}">Take down</button></p></li>`).join('')}</ul></details>` : ''}</section>`;
}
document.addEventListener('click', e => {
  const ok = e.target.closest('[data-sq-ok]'), no = e.target.closest('[data-sq-no]');
  if (ok) moderateShared(ok.dataset.sqOk, true); else if (no) moderateShared(no.dataset.sqNo, false);
});

// ---------- My CPD record: a one-page summary to print or save as PDF ----------
function openCPD() {
  const name = LS.get('ergsNL.name') || 'Member of staff', tried = triedMap(), tips = allTips();
  const triedList = Object.entries(tried).map(([id, d]) => ({ t: tips.find(x => x.id === id), d })).filter(x => x.t).sort((a, b) => String(b.d).localeCompare(String(a.d)));
  const used = usedLog(), seen = new Set(), usedU = used.filter(u => { const k = u.k + u.d; if (seen.has(k)) return false; seen.add(k); return true; });
  const mineUses = Object.entries(USES || {}).flatMap(([iid, arr]) => arr.filter(u => (u.name || '').trim().toLowerCase() === name.trim().toLowerCase()).map(u => ({ ...u, issue: allIssues().find(i => i.id === iid) })));
  const myShared = SHARED.filter(x => (x.name || '').trim().toLowerCase() === name.trim().toLowerCase() && x.st === 'live');
  const days = [...new Set([...triedList.map(x => x.d), ...usedU.map(u => u.d)])].sort();
  const span = days.length ? `${fmtDay(days[0])} to ${fmtDay(days[days.length - 1])}` : 'No activity recorded yet';
  const apps = [...new Set(triedList.map(x => x.t.app))];
  const subjCount = {}; usedU.forEach(u => { if (u.subj && u.subj !== 'All subjects') subjCount[u.subj] = (subjCount[u.subj] || 0) + 1; });
  const sheet = document.createElement('div'); sheet.className = 'cpd-sheet'; sheet.id = 'cpdSheet';
  sheet.innerHTML = `<div class="cpd-bar"><button class="btn primary" id="cpdPrint">Save as PDF / Print</button><button class="btn" id="cpdClose">Close</button><span>Tip: choose “Save as PDF” as the printer.</span></div>
  <article class="cpd-page">
    <header>${window.ERGS_CREST ? `<img src="${window.ERGS_CREST}" alt="">` : ''}<div><span>Enniskillen Royal Grammar School · ERGS Digital Skills &amp; AI</span><h1>Digital Skills &amp; AI CPD record</h1><p><b>${esc(name)}</b> · ${esc(span)} · produced ${fmtDay(todayKey())}</p></div></header>
    <section class="cpd-stats"><div><b>${triedList.length}</b><span>digital skills tips tried</span></div><div><b>${usedU.length}</b><span>AI prompts used</span></div><div><b>${mineUses.length + myShared.length}</b><span>contributions shared with colleagues</span></div><div><b>${apps.length}</b><span>apps practised</span></div></section>
    <section><h2>Summary</h2><p>${esc(name.split(' ')[0])} has engaged with the school’s Digital Skills &amp; AI CPD programme, trying ${triedList.length} practical digital skills tip${triedList.length === 1 ? '' : 's'}${apps.length ? ` across ${apps.slice(0, 6).join(', ')}` : ''} and using ${usedU.length} AI prompt${usedU.length === 1 ? '' : 's'} with school-approved tools${Object.keys(subjCount).length ? ` for ${Object.keys(subjCount).slice(0, 4).join(', ')}` : ''}. All AI use followed the school’s guidance: no pupil names or personal data.</p></section>
    <section><h2>Digital skills tips tried</h2>${triedList.length ? `<table><thead><tr><th>Date</th><th>App</th><th>Tip</th></tr></thead><tbody>${triedList.slice(0, 18).map(x => `<tr><td>${fmtDay(x.d)}</td><td>${esc(x.t.app)}</td><td>${esc(x.t.title)}</td></tr>`).join('')}</tbody></table>${triedList.length > 18 ? `<p class="cpd-more">and ${triedList.length - 18} more</p>` : ''}` : '<p class="cpd-none">None marked yet – tap “I tried this” on a tip.</p>'}</section>
    <section><h2>AI prompts used</h2>${usedU.length ? `<table><thead><tr><th>Date</th><th>Prompt</th><th>Subject</th><th>Tool</th></tr></thead><tbody>${usedU.slice(0, 18).map(u => `<tr><td>${fmtDay(u.d)}</td><td>${esc(u.title)}</td><td>${esc(u.subj && u.subj !== 'All subjects' ? u.subj : 'General')}</td><td>${esc(u.tool)}</td></tr>`).join('')}</tbody></table>${usedU.length > 18 ? `<p class="cpd-more">and ${usedU.length - 18} more</p>` : ''}` : '<p class="cpd-none">None yet – prompts you send or copy from the Prompt Bank are recorded here.</p>'}</section>
    ${mineUses.length || myShared.length ? `<section><h2>Reflections and contributions</h2><ul>${mineUses.map(u => `<li>“${esc(u.text)}”${u.issue ? ` <span>(Issue ${u.issue.n}: ${esc(u.issue.title)})</span>` : ''}</li>`).join('')}${myShared.map(x => `<li>Shared the prompt “${esc(x.title)}” with colleagues</li>`).join('')}</ul></section>` : ''}
    <footer><p>Reflection / next step (optional): ____________________________________________________________</p><p class="cpd-small">Generated from this device’s activity in ERGS Digital Skills &amp; AI. Suitable as evidence for professional review (PRSD).</p></footer>
  </article>`;
  document.body.appendChild(sheet); document.body.classList.add('cpd-open'); scrollTo(0, 0);
  const close = () => { sheet.remove(); document.body.classList.remove('cpd-open'); };
  $('#cpdClose').onclick = close; $('#cpdPrint').onclick = () => window.print();
}


// ---------- editor: change, hide or restore any prompt for everyone ----------
function openPromptEditor(key) {
  if (!canManage()) return;
  const p = allPrompts().find(x => x.key === key) || (savedPrompts().find(x => x.key === key)); if (!p) return toast('Prompt not found');
  const edited = !!EDITS[key];
  const sheet = document.createElement('div'); sheet.className = 'fill-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML = `<form class="fill-card share-card"><header><span class="eyebrow">Editor</span><h3>Edit prompt for everyone</h3><button type="button" class="fill-x" aria-label="Close">×</button></header>
    <p class="muted sh-intro">Changes go live for all staff straight away.${edited ? ' This prompt has already been edited – you can restore the original below.' : ''} Tip: write inputs as <b>[Label=default]</b>, e.g. [Topic=Rivers], so staff get a pre-filled box.</p>
    <div class="fill-fields">
      <label for="peTitle">Title</label><input id="peTitle" maxlength="100" value="${esc(p.title)}">
      <label for="peSubj">Subject</label><select id="peSubj"><option ${p.subj[0] === 'All subjects' ? 'selected' : ''}>All subjects</option>${SUBJECTS.map(x => `<option ${p.subj[0] === x[0] ? 'selected' : ''}>${esc(x[0])}</option>`).join('')}</select>
      <label for="peStage">Stage</label><select id="peStage">${['Any', 'KS3', 'GCSE', 'A Level'].map(x => `<option ${(p.stage || 'Any') === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <label for="peCat">Area</label><select id="peCat">${PL_CATS.map(c => `<option ${p.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label for="peTool">AI tool</label><select id="peTool">${['Gemini or Copilot', 'Gemini', 'Copilot', 'NotebookLM'].map(x => `<option ${p.tool === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <label for="peText">Prompt wording</label><textarea id="peText" rows="12">${esc(p.text)}</textarea>
    </div>
    <footer><button type="submit" class="btn primary">Save for everyone</button><button type="button" class="btn" data-pe-hide>Hide this prompt</button>${edited ? '<button type="button" class="linkbtn" data-pe-reset>Restore the original</button>' : ''}</footer></form>`;
  document.body.appendChild(sheet); document.body.classList.add('sp-open');
  const close = () => { sheet.remove(); document.body.classList.remove('sp-open'); };
  sheet.querySelector('.fill-x').onclick = close; sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
  const save = async data => { try { await setDoc(doc(DB, 'newsletterPromptEdits', safeKey(key)), { enc: await encJSON({ key, ...data }), at: serverTimestamp() }); close(); toast(data.hidden ? 'Hidden for everyone – restore it from Workflow' : 'Saved – live for all staff'); } catch (e) { console.warn(e); toast('Couldn’t save – check you’re signed in as editor'); } };
  sheet.querySelector('form').addEventListener('submit', e => { e.preventDefault(); save({ title: $('#peTitle').value.trim(), text: $('#peText').value.trim(), subj: $('#peSubj').value, stage: $('#peStage').value, cat: $('#peCat').value, tool: $('#peTool').value }); });
  sheet.querySelector('[data-pe-hide]').onclick = () => save({ hidden: true, title: p.title });
  sheet.querySelector('[data-pe-reset]')?.addEventListener('click', async () => { try { await deleteDoc(doc(DB, 'newsletterPromptEdits', safeKey(key))); close(); toast('Original restored'); } catch (e) { toast('Couldn’t restore'); } });
}
function editsPanelHTML() {
  const list = Object.values(EDITS || {}); if (!list.length) return '';
  const hid = list.filter(x => x.hidden), chg = list.filter(x => !x.hidden);
  return `<section class="fl-lane fl-shared"><header><h3>Prompts you’ve edited</h3><p>${chg.length} edited · ${hid.length} hidden</p></header>
    <ul class="sq-list">${list.map(x => `<li><div><b>${esc(x.title || x.key)}</b><span>${x.hidden ? 'Hidden from staff' : 'Edited'}</span></div><p><button class="btn small" data-pe-restore="${esc(x.docId)}">${x.hidden ? 'Show again' : 'Restore original'}</button></p></li>`).join('')}</ul></section>`;
}
document.addEventListener('click', async e => {
  const r = e.target.closest('[data-pe-restore]'); if (!r) return;
  try { await deleteDoc(doc(DB, 'newsletterPromptEdits', r.dataset.peRestore)); toast('Restored'); } catch (er) { toast('Couldn’t restore – check you’re signed in'); }
});


// ---------- My settings: change or reset this device's choices ----------
function openSettings() {
  const name = LS.get('ergsNL.name') || '', roles = myRoles(), subs = mySubjects() || [], lv = myLevels(), dark = document.documentElement.classList.contains('dark');
  const lvText = subs.filter(x => !NOLEVEL.includes(x)).map(x => `${x}${lv[x] && lv[x].length ? ' (' + lv[x].join(', ') + ')' : ''}`).join(' · ');
  const sheet = document.createElement('div'); sheet.className = 'fill-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'My settings');
  sheet.innerHTML = `<div class="fill-card set-card"><header><span class="eyebrow">This device</span><h3>Settings &amp; sharing</h3><button type="button" class="fill-x" aria-label="Close">×</button></header>
    <section class="set-sec set-share"><h4>Share the app</h4><p class="set-val">Get the link or QR code for colleagues, or install it on this device.</p><button class="btn primary small" id="setShare">Share or install</button></section>
    <section class="set-sec"><h4>Your name</h4><div class="set-row"><input id="setName" maxlength="60" value="${esc(name)}" placeholder="First and last name"><button class="btn small" id="setNameSave">Save</button></div></section>
    <section class="set-sec"><h4>Role, subjects and levels</h4><p class="set-val">${esc(roles.join(', ') || 'No role chosen')}<br>${esc(lvText || subs.join(', ') || 'No subjects chosen')}</p><button class="btn small" id="setSubj">Change role, subjects and levels</button></section>
    ${isTeaching() ? `<section class="set-sec"><h4>My AI licence</h4><div class="tp-seg" id="setTool">${toolPick(myTool(), 'data-st')}</div></section>` : ''}
    <section class="set-sec"><h4>Appearance</h4><div class="tp-seg"><button type="button" class="tp-opt${dark ? '' : ' on'}" data-th="light">☀️ Light</button><button type="button" class="tp-opt${dark ? ' on' : ''}" data-th="dark">🌙 Dark</button></div></section>
    <section class="set-sec"><h4>My data on this device</h4><p class="set-val">${savedKeys().length + myVersions().length} saved prompts · ${usedLog().length} prompts used · ${Object.keys(triedMap()).length} tips tried</p>
      <div class="set-btns"><button class="btn small" data-clear="saved">Clear saved prompts</button><button class="btn small" data-clear="history">Clear my CPD history</button></div></section>
    <section class="set-sec set-danger"><h4>Start again</h4><p class="set-val">Reset your choices (role, subjects, levels, AI tool and theme) and go through the welcome screens again. Your saved prompts and history are kept.</p>
      <div class="set-btns"><button class="btn small" id="setReset">Reset my settings</button><button class="btn small set-red" id="setSignout">Remove everything from this device</button></div></section>
  </div>`;
  document.body.appendChild(sheet); document.body.classList.add('sp-open');
  const close = () => { sheet.remove(); document.body.classList.remove('sp-open'); };
  sheet.querySelector('.fill-x').onclick = close; sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
  $('#setNameSave').onclick = () => { const v = $('#setName').value.trim().replace(/\s+/g, ' '); if (v.split(' ').length < 2) return toast('Please enter your first and last name'); LS.set('ergsNL.name', v.slice(0, 60)); LS.del('ergsNL.nameSent'); trackVisit?.(); toast('Name saved'); render(); };
  $('#setSubj').onclick = () => { close(); askSubjects(true); };
  $('#setShare').onclick = () => { close(); openShare(null); };
  if ($('#setTool')) $('#setTool').onclick = e => { const b = e.target.closest('[data-st]'); if (!b) return; setMyTool(b.dataset.st); $('#setTool').innerHTML = toolPick(myTool(), 'data-st'); toast(b.dataset.st ? `Prompts will open in ${b.dataset.st}` : 'Licence not allocated yet – both shown'); };
  sheet.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { const d = b.dataset.th === 'dark'; LS.set('ergsNL.theme', d ? 'dark' : 'light'); applyTheme(d); sheet.querySelectorAll('[data-th]').forEach(x => x.classList.toggle('on', x === b)); });
  sheet.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to confirm'; return; }
    if (b.dataset.clear === 'saved') { LS.del('ergsNL.saved'); LS.del('ergsNL.mine'); toast('Saved prompts cleared'); } else { LS.del('ergsNL.used'); LS.del('ergsNL.rated'); toast('CPD history cleared'); }
    close(); openSettings();
  });
  $('#setReset').onclick = e => {
    const b = e.currentTarget; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to reset'; return; }
    ['ergsNL.subjects', 'ergsNL.roles', 'ergsNL.levels', 'ergsNL.tool', 'ergsNL.theme', 'ergsNL.fill', 'ergsNL.sv'].forEach(k => LS.del(k));
    applyTheme(false); Object.assign(plFilt, { q: '', cat: null, subj: '', stage: '', tool: '', subjSet: false }); close(); toast('Settings reset'); render(); askSubjects(true);
  };
  $('#setSignout').onclick = e => {
    const b = e.currentTarget; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again: removes your name, choices, saved prompts and history'; return; }
    try { Object.keys(localStorage).filter(k => k.startsWith('ergsNL.') && k !== 'ergsNL.dev').forEach(k => localStorage.removeItem(k)); sessionStorage.clear(); } catch (er) {}
    location.reload();
  };
}
$('#settingsBtn')?.addEventListener('click', openSettings);
