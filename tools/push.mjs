// Sends a push notification to every subscribed device when a new issue goes live in the binder.
// Run by .github/workflows/push.yml every 15 minutes. Keeps track of what it has already announced in push-state.json.
import webpush from 'web-push';
import fs from 'node:fs';

const KEY = 'AIzaSyBXg8-D_AIJPbMIB88S8UCnXk40_tJLfd8';
const BASE = 'https://firestore.googleapis.com/v1/projects/ergs-ai/databases/(default)/documents';
const SITE = 'https://popcorn483.github.io/ergs-ai/';
const STATE = new URL('../push-state.json', import.meta.url);
const PUB = 'BEe7rUELYZBgozXUrPCd1SW5w9vp5MHI_v_4MeI2LhOrmcg7J6pEw1HbR9ZUJpmgxJVVP-RtztOEX2dlNzFQ2zU';
if (!process.env.VAPID_PRIVATE) { console.log('No VAPID_PRIVATE secret set – nothing to do.'); process.exit(0); }
webpush.setVapidDetails('mailto:jbutler483@gmail.com', PUB, process.env.VAPID_PRIVATE);

const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());   // YYYY-MM-DD

const st = (await get(`${BASE}/newsletter/state?key=${KEY}`)).fields || {};
const rel = st.releases?.mapValue?.fields || {};
const order = (st.order?.arrayValue?.values || []).map(v => v.stringValue);
const live = Object.entries(rel).filter(([, v]) => { const f = v.mapValue?.fields || {}; const s = f.s?.stringValue; return s === 'live' || (s === 'sched' && f.d?.stringValue && f.d.stringValue <= today); }).map(([id]) => id);

let state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null;
if (!state) { fs.writeFileSync(STATE, JSON.stringify({ notified: live, gone: [] }, null, 1)); console.log('First run: recorded', live.length, 'live issues, nothing sent.'); process.exit(0); }
const fresh = live.filter(id => !state.notified.includes(id));
if (!fresh.length) { console.log('No new issues.'); process.exit(0); }

const num = id => { const k = order.indexOf(id); return k >= 0 ? k + 1 : null; };
const nums = fresh.map(num).filter(Boolean).sort((a, b) => a - b);
const payload = JSON.stringify(fresh.length === 1
  ? { title: `📘 Issue ${nums[0] || ''} is now live`.replace('  ', ' '), body: 'A new issue of ERGS Digital Skills & AI is in the binder. Tap to read it.', url: `${SITE}#issue-${fresh[0]}`, tag: 'issue-' + fresh[0] }
  : { title: `📘 ${fresh.length} new issues are live`, body: `Issues ${nums.join(', ')} are now in the binder. Tap to read them.`, url: `${SITE}#binder`, tag: 'issues-' + fresh.join('-') });

let subs = [], token = '';
do { const r = await get(`${BASE}/newsletterPush?pageSize=300&key=${KEY}${token ? '&pageToken=' + token : ''}`); subs.push(...(r.documents || [])); token = r.nextPageToken || ''; } while (token);
let sent = 0, gone = 0;
for (const d of subs) {
  const id = d.name.split('/').pop(), f = d.fields || {};
  if (f.off?.booleanValue || !f.sub?.stringValue || state.gone.includes(id)) continue;
  try { await webpush.sendNotification(JSON.parse(f.sub.stringValue), payload, { TTL: 86400 }); sent++; }
  catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { state.gone.push(id); gone++; } else console.warn(id, e.statusCode || e.message); }
}
state.notified.push(...fresh);
fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
console.log(`Announced ${fresh.join(', ')} – sent to ${sent} devices, ${gone} expired.`);
