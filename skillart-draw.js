// Draws the computer-skills illustrations (window.NL_SKILL_ART specs) as small SVG pictures.
(() => {
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const BLUE = '#1d5a9e', HL = '#e3eefb', INK = '#1b2430', MUT = '#6b7685', LINE = '#d9dee6';
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-family="Segoe UI,Inter,Arial,sans-serif" font-size="${o.size || 11}" font-weight="${o.w || 400}" fill="${o.fill || INK}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.style ? ` style="${o.style}"` : ''}>${E(s)}</text>`;
const R = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 4}" fill="${o.fill || '#fff'}" stroke="${o.stroke || 'none'}" stroke-width="${o.sw || 1}"/>`;
const tw = (s, size = 11) => String(s).length * size * 0.56;

function keysRow(k, W) {
  if (!k) return { svg: '', h: 0 };
  const combos = k.split(' / ');
  let x = 0, y = 0, out = '', lineH = 34;
  const items = combos.map(c => c.split('+').map(p => p.trim() === 'plus' ? '+' : p.trim()));
  const widthOf = keys => keys.reduce((t, s) => t + Math.max(30, tw(s, 12) + 18) + 16, -16);
  const rows = [[]]; let rw = 0;
  items.forEach(keys => { const w = widthOf(keys) + 28; if (rw + w > W - 20 && rows[rows.length - 1].length) { rows.push([]); rw = 0; } rows[rows.length - 1].push(keys); rw += w; });
  rows.forEach((row, ri) => {
    const total = row.reduce((t, keys) => t + widthOf(keys), 0) + (row.length - 1) * 28;
    x = (W - total) / 2; y = 8 + ri * lineH;
    row.forEach((keys, ci) => {
      if (ci) { out += T(x - 14, y + 18, 'or', { size: 10, fill: MUT, anchor: 'middle' }); }
      keys.forEach((s, i) => {
        const w = Math.max(30, tw(s, 12) + 18);
        out += `<rect x="${x}" y="${y + 3}" width="${w}" height="24" rx="5" fill="#c9d1dc"/>` + R(x, y, w, 24, { rx: 5, fill: '#fff', stroke: '#b9c2cf' }) + T(x + w / 2, y + 16, s, { size: 12, w: 600, anchor: 'middle' });
        x += w;
        if (i < keys.length - 1) { out += T(x + 8, y + 17, '+', { size: 13, w: 700, fill: MUT, anchor: 'middle' }); x += 16; }
      });
      x += 28;
    });
  });
  return { svg: out, h: rows.length * lineH + 8 };
}

function screen(s, X, Y, W, H) {
  let o = '';
  const dark = s.options || s.black || s.desktop;
  o += R(X, Y, W, H, { rx: 8, fill: dark ? '#0f2c52' : '#fff', stroke: '#c3cad5' });
  // title bar
  if (!s.phone && !s.options && !s.fullscreen) {
    o += `<path d="M${X} ${Y + 8} a8 8 0 0 1 8 -8 h${W - 16} a8 8 0 0 1 8 8 v18 h${-W} z" fill="#eef1f5"/>` + `<line x1="${X}" y1="${Y + 26}" x2="${X + W}" y2="${Y + 26}" stroke="${LINE}"/>`;
    o += `<circle cx="${X + 14}" cy="${Y + 13}" r="5" fill="${BLUE}"/>` + T(X + 25, Y + 17, s.app, { size: 11, w: 600 });
    o += T(X + W - 44, Y + 17, '–   ☐   ✕', { size: 10, fill: MUT });
  }
  let cy = Y + (s.phone || s.options || s.fullscreen ? 0 : 26), cx = X, cw = W;
  const ch = () => Y + H - cy;
  if (s.addr !== undefined) {
    o += R(cx + 10, cy + 6, cw - 20, 22, { rx: 11, fill: '#f1f3f6', stroke: s.addrSel ? BLUE : LINE, sw: s.addrSel ? 1.5 : 1 });
    o += T(cx + 32, cy + 21, s.app === 'Start' ? '🔍  ' + s.addr : s.addr, { size: 11, style: s.addrSel ? 'stroke:#b9d5f5;stroke-width:14px;paint-order:stroke;stroke-linejoin:round' : '' });
    if (s.star) o += T(cx + cw - 30, cy + 22, '★', { size: 14, fill: '#e9a800' });
    cy += 32;
  }
  if (s.bookmarks) {
    let bx = cx + 12;
    s.bookmarks.forEach((b, i) => { const w = tw(b, 10) + 14; if (i === s.hl) o += R(bx - 3, cy, w, 18, { fill: HL, stroke: BLUE }); o += T(bx + 4, cy + 13, b, { size: 10 }); bx += w + 6; });
    cy += 24;
  }
  if (s.ribbon) {
    let bx = cx + 12;
    s.ribbon.forEach((b, i) => { const w = tw(b, 10.5) + 18; o += T(bx + 6, cy + 15, b, { size: 10.5, w: i === s.hl ? 700 : 400, fill: i === s.hl ? BLUE : INK }); if (i === s.hl) o += `<rect x="${bx}" y="${cy + 20}" width="${w - 6}" height="2.5" fill="${BLUE}"/>`; bx += w; });
    o += `<line x1="${cx}" y1="${cy + 23}" x2="${cx + cw}" y2="${cy + 23}" stroke="${LINE}"/>`; cy += 28;
  }
  if (s.buttons && !s.phone && !s.form && !s.annotate) {
    let bx = cx + 12;
    s.buttons.forEach((b, i) => { const w = tw(b, 10.5) + 20; o += R(bx, cy, w, 22, { fill: i === s.hlBtn ? HL : '#f6f7f9', stroke: i === s.hlBtn ? BLUE : LINE, sw: i === s.hlBtn ? 1.6 : 1 }) + T(bx + w / 2, cy + 15, b, { size: 10.5, w: i === s.hlBtn ? 700 : 400, anchor: 'middle' }); bx += w + 8; });
    cy += 30;
  }
  if (s.styles) {
    let bx = cx + 12;
    s.styles.forEach((b, i) => { o += R(bx, cy, 74, 30, { fill: i === s.hl ? HL : '#fff', stroke: i === s.hl ? BLUE : LINE, sw: i === s.hl ? 1.6 : 1 }) + T(bx + 8, cy + 19, b, { size: i === 1 ? 12 : i === 2 ? 11 : 10, w: i ? 600 : 400, fill: i ? '#1f4f8f' : INK }); bx += 80; });
    cy += 38;
  }
  if (s.search) { const sw2 = Math.min(cw - 24, Math.max(158, tw(s.search, 11) + 40)); o += R(cx + cw - sw2 - 12, cy + 4, sw2, 22, { stroke: BLUE, sw: 1.5 }) + T(cx + cw - sw2 - 2, cy + 19, '🔍 ' + s.search, { size: 11 }); cy += 30; }
  let mx = cx, mw = cw;
  if (s.side) {
    o += R(cx + 1, cy, 128, ch() - 2, { rx: 0, fill: '#f6f7f9' });
    s.side.forEach((b, i) => { const hl = (s.hlSide || []).includes(i); if (hl) o += R(cx + 6, cy + 6 + i * 20, 118, 18, { fill: HL, stroke: BLUE }); o += T(cx + 12, cy + 19 + i * 20, b, { size: 10.5, w: hl ? 700 : 400 }); });
    mx = cx + 136; mw = cw - 140;
  }
  if (s.panel) {
    const px = cx + cw - 168;
    o += R(px, cy + 4, 160, ch() - 12, { fill: '#fafbfc', stroke: LINE }) + R(px + 14, cy + 14, 132, ch() - 32, { rx: 2, stroke: LINE });
    s.panel.forEach((l, i) => o += T(px + 22, cy + 32 + i * 16, l, { size: i ? 9.5 : 11, w: i ? 400 : 700 }));
    mw -= 172;
  }
  if (s.rows) {
    s.rows.forEach((b, i) => {
      const ry = cy + 6 + i * 24, hl = (s.hlRows || []).includes(i);
      if (s.edit === i) { o += R(mx + 8, ry, Math.min(mw - 16, 260), 20, { rx: 2, stroke: BLUE, sw: 1.6 }) + T(mx + 34, ry + 14, s.editText, { size: 11 }) + `<line x1="${mx + 34 + tw(s.editText, 11)}" y1="${ry + 4}" x2="${mx + 34 + tw(s.editText, 11)}" y2="${ry + 16}" stroke="${INK}"/>`; }
      else { if (hl) o += R(mx + 8, ry, mw - 16, 20, { rx: 3, fill: HL, stroke: BLUE }); o += T(mx + 34, ry + 14, b, { size: 11, w: hl ? 600 : 400 }); }
      o += R(mx + 14, ry + 4, 12, 12, { rx: 2, fill: /pdf/i.test(b) ? '#d9573b' : /ppt/i.test(b) ? '#d38a2d' : /xls/i.test(b) ? '#2f8f4f' : /doc/i.test(b) ? '#2b5cad' : '#9aa6b5' });
    });
  }
  if (s.text && !s.phone) {
    s.text.forEach((l, i) => {
      const ty = cy + 26 + i * 20, lx = mx + 18;
      const mark = (str, part, style) => { const a = str.indexOf(part); return a < 0 ? null : [str.slice(0, a), part, str.slice(a + part.length), style]; };
      const m = (s.sel && mark(l, s.sel, `fill:${INK};stroke:#b9d5f5;stroke-width:15px;paint-order:stroke;stroke-linejoin:round`))
        || (s.link && mark(l, s.link, `fill:${BLUE};text-decoration:underline`))
        || (s.strike && i === 0 && mark(l, s.strike, 'fill:#d1342f;text-decoration:line-through'));
      if (m) o += `<text x="${lx}" y="${ty}" font-family="Segoe UI,Inter,Arial,sans-serif" font-size="12" fill="${INK}">${E(m[0])}<tspan style="${m[3]}">${E(m[1])}</tspan>${E(m[2])}</text>`;
      else o += T(lx, ty, l, { size: 12 });
    });
    if (s.tooltip) o += R(mx + 40, cy + 62, tw(s.tooltip, 10.5) + 16, 22, { fill: '#2b3442' }) + T(mx + 48, cy + 77, s.tooltip, { size: 10.5, fill: '#fff' });
  }
  if (s.form) {
    s.form.forEach(([a, b], i) => { const fy = cy + 10 + i * 30; if (i === s.hl) o += R(mx + 8, fy - 4, mw - 16, 28, { fill: HL, stroke: BLUE }); o += T(mx + 18, fy + 14, a, { size: 11, fill: MUT }) + R(mx + 170, fy, Math.min(240, mw - 190), 20, { stroke: LINE }) + T(mx + 178, fy + 14, b, { size: 11, w: i === s.hl ? 700 : 400 }); });
    if (s.buttons) { let bx = X + W - 16; s.buttons.slice().reverse().forEach((b, j) => { const i = s.buttons.length - 1 - j, w = tw(b, 11) + 26; bx -= w; o += R(bx, Y + H - 34, w, 24, { fill: i === s.hlBtn ? BLUE : '#fff', stroke: i === s.hlBtn ? BLUE : LINE }) + T(bx + w / 2, Y + H - 18, b, { size: 11, w: 600, fill: i === s.hlBtn ? '#fff' : INK, anchor: 'middle' }); bx -= 8; }); }
  }
  if (s.options) {
    s.options.forEach((b, i) => { const oy = Y + 34 + i * 26, hl = i === s.hl; if (hl) o += R(X + W / 2 - 90, oy - 15, 180, 22, { fill: 'rgba(255,255,255,.18)', stroke: '#fff' }); o += T(X + W / 2, oy, b, { size: 13, w: hl ? 700 : 400, fill: '#fff', anchor: 'middle' }); });
  }
  if (s.desktop) {
    [['📁', 'Resources'], ['📄', 'Notes'], ['🗑', 'Recycle bin']].forEach(([ic, l], i) => o += T(X + 34, Y + 60 + i * 46, ic, { size: 20 }) + T(X + 44, Y + 76 + i * 46, l, { size: 9.5, fill: '#fff', anchor: 'middle' }));
  }
  if (s.taskbar) {
    o += R(X + 1, Y + H - 34, W - 2, 33, { rx: 0, fill: '#e9edf2' });
    const n = s.taskbar.length, bx0 = X + W / 2 - n * 26;
    s.taskbar.forEach((b, i) => { const bx = bx0 + i * 52, hl = i === s.hl; o += R(bx, Y + H - 30, 44, 26, { fill: hl ? HL : '#fff', stroke: hl ? BLUE : LINE, sw: hl ? 1.6 : 1 }) + T(bx + 22, Y + H - 13, b, { size: 8.5, w: 600, anchor: 'middle' }) + T(bx + 22, Y + H - 40, String(i + 1), { size: 11, w: 700, fill: hl ? BLUE : MUT, anchor: 'middle' }); });
  }
  if (s.phone) {
    const px = X + W / 2 - 70, py = Y + 6;
    o += R(px, py, 140, H - 12, { rx: 18, fill: '#1b2430' }) + R(px + 8, py + 14, 124, H - 40, { rx: 6, fill: '#fff' });
    s.text.forEach((l, i) => o += T(px + 70, py + 50 + i * 18, l, { size: i ? 10 : 12, w: i ? 400 : 700, anchor: 'middle' }));
    s.buttons.forEach((b, i) => { const bx = px + 16 + i * 58; o += R(bx, py + H - 76, 50, 24, { fill: i === s.hlBtn ? '#d1342f' : '#f1f3f6', stroke: i === s.hlBtn ? '#d1342f' : LINE }) + T(bx + 25, py + H - 60, b, { size: 11, w: 700, fill: i === s.hlBtn ? '#fff' : INK, anchor: 'middle' }); });
  }
  if (s.desktops) {
    s.desktops.forEach((b, i) => { const dx = X + 30 + i * 158, hl = i === s.hl; o += R(dx, Y + 70, 140, 84, { fill: hl ? HL : '#f1f3f6', stroke: hl ? BLUE : LINE, sw: hl ? 1.8 : 1 }) + T(dx + 70, Y + 170, b, { size: 11, w: 600, anchor: 'middle' }); if (!hl) o += R(dx + 14, Y + 82, 70, 40, { stroke: LINE }) + R(dx + 50, Y + 100, 76, 44, { stroke: LINE }); });
  }
  if (s.quarters) {
    const qw = (W - 30) / 2, qh = (H - 44) / 2;
    s.quarters.forEach((b, i) => { const qx = X + 10 + (i % 2) * (qw + 10), qy = Y + 34 + Math.floor(i / 2) * (qh + 6); o += R(qx, qy, qw, qh, { fill: HL, stroke: BLUE }) + T(qx + qw / 2, qy + qh / 2 + 4, b, { size: 12, w: 600, anchor: 'middle' }); });
  }
  if (s.annotate) {
    let bx = X + 12; s.buttons.forEach((b, i) => { const w = tw(b, 10.5) + 18; o += R(bx, cy + 4, w, 22, { fill: i === s.hlBtn ? HL : '#f6f7f9', stroke: i === s.hlBtn ? BLUE : LINE }) + T(bx + w / 2, cy + 19, b, { size: 10.5, anchor: 'middle' }); bx += w + 8; });
    o += R(X + 20, cy + 36, W - 40, H - (cy - Y) - 46, { stroke: LINE, fill: '#fafbfc' }) + `<text x="${X + 40}" y="${cy + 66}" font-family="Segoe UI,Inter,Arial,sans-serif" font-size="11" fill="${INK}">File   Home   <tspan style="stroke:#ffe14d;stroke-width:13px;paint-order:stroke;stroke-linejoin:round">Insert</tspan>   Layout</text>` + `<ellipse cx="${X + 200}" cy="${cy + 100}" rx="60" ry="22" fill="none" stroke="#d1342f" stroke-width="3"/>` + T(X + 200, cy + 104, 'Save as PDF', { size: 11, anchor: 'middle' });
  }
  if (s.black) o += T(X + W / 2, Y + H / 2, 'Screen blanked – pupils see nothing', { size: 12, fill: '#8aa0bf', anchor: 'middle' });
  if (s.warn) { o += R(cx + 10, cy + 2, cw - 20, ch() - 12, { fill: '#fdeceb', stroke: '#e3a19b' }) + T(cx + 26, cy + 26, '⚠  Sign in to keep your C2k account', { size: 12, w: 700, fill: '#b8352a' }); s.steps.forEach((l, i) => o += T(cx + 40, cy + 56 + i * 22, l, { size: 12, w: 600 })); }
  if (s.reading) {
    o += R(cx + 10, cy + 4, cw / 2 - 20, ch() - 12, { stroke: LINE }); for (let i = 0; i < 4; i++) o += R(cx + 20, cy + 14 + i * 28, 70, 20, { fill: '#f6c7c2' }) + R(cx + 100, cy + 16 + i * 28, cw / 2 - 130, 6, { fill: '#d6dbe3' });
    const rx = cx + cw / 2; o += R(rx, cy + 4, cw / 2 - 10, ch() - 12, { fill: '#fffaf0', stroke: BLUE }) + T(rx + 14, cy + 24, 'Reading mode', { size: 11, w: 700, fill: BLUE });
    for (let i = 0; i < 6; i++) o += R(rx + 14, cy + 36 + i * 14, cw / 2 - 50 - (i % 3) * 20, 6, { fill: '#9aa6b5' });
  }
  if (s.fullscreen) { o += R(X, Y, W, H, { rx: 8, fill: '#fdfdfd', stroke: '#c3cad5' }) + T(X + 30, Y + 50, 'The water cycle', { size: 22, w: 700, fill: '#0f2c52' }); for (let i = 0; i < 5; i++) o += R(X + 30, Y + 70 + i * 18, W - 140 - (i % 2) * 60, 8, { fill: '#d6dbe3' }); o += R(X + W / 2 - 110, Y + 12, 220, 22, { rx: 11, fill: 'rgba(27,36,48,.85)' }) + T(X + W / 2, Y + 27, 'Press F11 to exit full screen', { size: 10.5, fill: '#fff', anchor: 'middle' }); }
  if (s.say) s.say.forEach((l, i) => { const sx = cx + 20 + (i % 2) * 230, sy = cy + 4 + Math.floor(i / 2) * 44; o += R(sx, sy, 200, 32, { rx: 16, fill: HL, stroke: BLUE }) + T(sx + 100, sy + 21, '🗣 ' + l, { size: 12, anchor: 'middle' }); });
  if (s.chat) {
    let by = cy + 8;
    s.chat.forEach(([who, msg]) => {
      const me = who === 'me', lines = [], words = String(msg).split(' '); let cur = '';
      words.forEach(w => { if (tw(cur + ' ' + w, 11) > 300 && cur) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }); if (cur) lines.push(cur);
      const bw = Math.min(330, Math.max(...lines.map(l => tw(l, 11))) + 24), bh = lines.length * 15 + 12, bx = me ? X + W - bw - 14 : X + 14;
      if (by + bh > Y + H - 6) return;
      o += R(bx, by, bw, bh, { rx: 10, fill: me ? '#dbe8fb' : '#f1f3f6', stroke: me ? '#b9d0f0' : LINE });
      lines.forEach((l, i) => o += T(bx + 12, by + 19 + i * 15, l, { size: 11, w: me ? 600 : 400 }));
      by += bh + 8;
    });
  }
  if (s.grid) {
    const g = s.grid, gx = s.side ? mx + 22 : cx + 40, cwid = Math.min(110, (cx + cw - gx - 16) / g.cols.length), gy = cy + 6;
    g.cols.forEach((h, j) => { o += R(gx + j * cwid, gy, cwid, 20, { rx: 0, fill: '#eef1f5', stroke: LINE }) + T(gx + j * cwid + 6, gy + 14, h + (g.filter ? '  ▾' : ''), { size: 10.5, w: 700 }); });
    g.rows.forEach((r, i) => {
      o += T(gx - 14, gy + 34 + i * 20, String(i + 2), { size: 9.5, fill: MUT, anchor: 'middle' });
      r.forEach((v, j) => { const hl = (g.hl || []).some(([a, b]) => a === i && b === j), sc = g.scale === j && typeof v === 'number' ? (v >= 70 ? '#c6efce' : v >= 50 ? '#ffeb9c' : '#ffc7ce') : null;
        o += R(gx + j * cwid, gy + 20 + i * 20, cwid, 20, { rx: 0, fill: sc || (hl ? HL : '#fff'), stroke: hl ? BLUE : LINE, sw: hl ? 1.6 : 1 }) + T(gx + j * cwid + 6, gy + 34 + i * 20, String(v), { size: 10.5, w: hl ? 700 : 400 }); });
    });
    if (g.freeze) o += `<line x1="${gx}" y1="${gy + 20}" x2="${gx + g.cols.length * cwid}" y2="${gy + 20}" stroke="#2f6f3e" stroke-width="2.5"/><line x1="${gx + cwid}" y1="${gy}" x2="${gx + cwid}" y2="${gy + 20 + g.rows.length * 20}" stroke="#2f6f3e" stroke-width="2.5"/>`;
  }
  if (s.slide) {
    const sx = cx + (s.side ? 136 : 20), sw = cw - (s.side ? 156 : 40), sh = Math.min(ch() - 16, sw * 0.56);
    o += R(sx, cy + 8, sw, sh, { fill: s.slide.dark ? '#0b0b0b' : '#fff', stroke: LINE }) + T(sx + 16, cy + 34, s.slide.title || '', { size: 14, w: 700, fill: s.slide.dark ? '#fff' : '#0f2c52' });
    (s.slide.lines || []).forEach((l, i) => o += T(sx + 22, cy + 56 + i * 16, l, { size: 11, fill: s.slide.dark ? '#ddd' : INK }));
    if (s.slide.laser) o += `<circle cx="${sx + sw * 0.62}" cy="${cy + 8 + sh * 0.55}" r="7" fill="#ff2a2a" opacity=".9"/><circle cx="${sx + sw * 0.62}" cy="${cy + 8 + sh * 0.55}" r="13" fill="#ff2a2a" opacity=".25"/>`;
    if (s.slide.caption) o += R(sx + 20, cy + sh - 22, sw - 40, 22, { fill: 'rgba(0,0,0,.75)' }) + T(sx + sw / 2, cy + sh - 7, s.slide.caption, { size: 11, fill: '#fff', anchor: 'middle' });
    if (s.slide.big) o += T(sx + sw / 2, cy + 8 + sh / 2 + 14, s.slide.big, { size: 40, w: 800, fill: '#0f2c52', anchor: 'middle' });
  }
  if (s.menu) {
    const [ax, ay] = s.menu.at, w = Math.max(...s.menu.items.map(i => tw(i, 11))) + 34, mxx = X + ax, myy = Y + ay;
    o += `<rect x="${mxx + 3}" y="${myy + 3}" width="${w}" height="${s.menu.items.length * 22 + 8}" rx="6" fill="rgba(0,0,0,.15)"/>` + R(mxx, myy, w, s.menu.items.length * 22 + 8, { rx: 6, stroke: '#c3cad5' });
    s.menu.items.forEach((b, i) => { if (i === s.menu.hl) o += R(mxx + 4, myy + 4 + i * 22, w - 8, 22, { fill: HL, stroke: BLUE }); o += T(mxx + 14, myy + 19 + i * 22, b, { size: 11, w: i === s.menu.hl ? 700 : 400 }); });
  }
  if (s.note) { const w = tw(s.note, 10.5) + 22, nx = X + W - w - 10, ny = s.taskbar ? Y + 34 : Y + H - 32; o += R(nx, ny, w, 24, { rx: 12, fill: '#fff3c4', stroke: '#e0b400' }) + T(nx + w / 2, ny + 16, s.note, { size: 10.5, w: 600, anchor: 'middle', fill: '#5a4300' }); }
  return o;
}

window.skillArtSVG = spec => {
  if (!spec) return '';
  const W = 520, keys = keysRow(spec.k, W), H = spec.s ? 200 : 0, top = keys.h ? keys.h + (H ? 6 : 0) : 4;
  const total = top + H + 6;
  return `<svg viewBox="0 0 ${W} ${total}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Illustration">${keys.svg}${H ? screen(spec.s, 10, top, W - 20, H) : ''}</svg>`;
};
})();
