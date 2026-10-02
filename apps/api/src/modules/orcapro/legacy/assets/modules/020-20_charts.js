/* ==== 20_charts.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 20_charts.js
 * Gráficos em SVG nativo (sem bibliotecas, offline): Gantt com setas de
 * dependência e folgas, rede PERT (atividade no nó), histogramas
 * empilhados e Curva S. Cores explícitas -> exportação fiel (SVG/PNG).
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const esc = U.esc;
  const CH = (OP.charts = {});
  CH.pal = () => {
    const cs = G.document && G.getComputedStyle ? G.getComputedStyle(G.document.documentElement) : null;
    const g = (v, d) => (cs && cs.getPropertyValue(v).trim()) || d;
    return { bg: g('--surface', '#FFFFFF'), bg2: g('--surface-2', '#F5F6F7'), ink: g('--ink', '#15202B'), ink2: g('--ink-2', '#4A5563'), ink3: g('--ink-3', '#7C8591'),
      line: g('--line', '#D4D8DD'), line2: g('--line-2', '#E6E9EC'), blue: g('--blue', '#2457A6'), crit: g('--crit', '#D62839'), accent: g('--accent', '#FFC21A') };
  };
  CH.SERIES = ['#2457A6', '#E07B28', '#2E7D4F', '#7B4FB0', '#1C9AA8', '#C2185B', '#8A6D3B', '#D4A017', '#5C6B7A', '#3F51B5'];
  const FF = `font-family="'Barlow Semi Condensed','Arial Narrow',Arial,sans-serif"`;
  const open = (w, h, p) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${FF} font-size="12" font-weight="500"><rect width="${w}" height="${h}" fill="${p.bg}"/>`;
  const trunc = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);
  const fd = (d) => (d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2) : '');
  const niceMax = (v) => { if (!(v > 0)) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; };
  const DAY = 864e5;
  const marker = (id, col) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="${col}"/></marker>`;

  /* ---------- GANTT: retorna {left, right, full} ---------- */
  CH.gantt = function (m, o = {}) {
    const p = CH.pal(); const rows = m.flat; const RH = 24, HH = 46, LW = 462;
    const ppd = o.scale === 'day' ? 22 : o.scale === 'month' ? 3 : 8;
    const d0 = U.addDays(m.start, -((m.start.getDay() + 6) % 7));
    let last = m.end; for (const r of m.items) { if (r.end > last) last = r.end; if (o.late && r.lend > last) last = r.lend; }
    const nd = Math.max(21, Math.round((last - d0) / DAY) + 10);
    const W = Math.ceil(nd * ppd), H = HH + rows.length * RH + 8;
    const X = (d) => Math.round((d - d0) / DAY) * ppd;
    const rowY = new Map(rows.map((r, i) => [r.id, HH + i * RH]));
    let L = `<rect width="${LW}" height="${HH}" fill="${p.bg2}"/><line x1="0" x2="${LW}" y1="${HH}" y2="${HH}" stroke="${p.line}"/>`;
    [[8, 'ITEM', 'start'], [60, 'ATIVIDADE', 'start'], [338, 'DIAS', 'end'], [350, 'INÍCIO', 'start'], [406, 'TÉRMINO', 'start']]
      .forEach(([x, t, a]) => (L += `<text x="${x}" y="${HH - 14}" text-anchor="${a}" font-size="10.5" font-weight="700" fill="${p.ink3}">${t}</text>`));
    rows.forEach((r, i) => {
      const y = HH + i * RH; const name = r.isStage ? U.cap(r.node.name) : r.desc;
      if (o.sel === r.id) L += `<rect y="${y}" width="${LW}" height="${RH}" fill="${p.accent}" fill-opacity=".3"/>`;
      else if (r.isStage) L += `<rect y="${y}" width="${LW}" height="${RH}" fill="${p.ink}" fill-opacity=".05"/>`;
      L += `<g${r.isStage ? '' : ` data-act="selItem" data-id="${r.id}" style="cursor:pointer"`}><rect y="${y}" width="${LW}" height="${RH}" fill="${p.bg}" fill-opacity="0"/>`
        + `<text x="8" y="${y + 16}" font-size="11" fill="${p.ink3}">${esc(r.num)}</text>`
        + `<text x="${60 + r.depth * 10}" y="${y + 16}" font-weight="${r.isStage ? 700 : 500}" fill="${!r.isStage && r.crit ? p.crit : p.ink}">${esc(trunc(name, 44 - r.depth * 2))}</text>`
        + `<text x="338" y="${y + 16}" text-anchor="end" font-weight="700" fill="${p.ink2}">${r.days}</text>`
        + `<text x="350" y="${y + 16}" font-size="11" fill="${p.ink2}">${fd(r.start)}</text><text x="406" y="${y + 16}" font-size="11" fill="${p.ink2}">${fd(r.end)}</text></g>`
        + `<line x1="0" x2="${LW}" y1="${y + RH}" y2="${y + RH}" stroke="${p.line2}"/>`;
    });
    let R = `<rect width="${W}" height="${HH}" fill="${p.bg2}"/>`;
    if (ppd >= 6) for (let k = 0; k < nd; k++) { const d = U.addDays(d0, k); if (!m.cal.isWork(d)) R += `<rect x="${k * ppd}" y="${HH}" width="${ppd}" height="${H - HH}" fill="${p.ink}" fill-opacity=".05"/>`; }
    let ms = new Date(d0.getFullYear(), d0.getMonth(), 1, 12); const dEnd = U.addDays(d0, nd);
    while (ms < dEnd) {
      const next = new Date(ms.getFullYear(), ms.getMonth() + 1, 1, 12); const x1 = Math.max(0, X(ms)), x2 = Math.min(W, X(next));
      if (x2 > x1) { R += `<line x1="${x1}" x2="${x1}" y1="0" y2="${H}" stroke="${p.line}"/>`; if (x2 - x1 > 26) R += `<text x="${x1 + 5}" y="17" font-weight="700" font-size="11.5" fill="${p.ink2}">${x2 - x1 > 80 ? U.MESES[ms.getMonth()] + ' ' + ms.getFullYear() : U.MESES[ms.getMonth()] + '/' + String(ms.getFullYear()).slice(2)}</text>`; }
      ms = next;
    }
    for (let k = 0; k < nd; k++) {
      const d = U.addDays(d0, k), x = k * ppd;
      if (o.scale === 'day') { R += `<text x="${x + ppd / 2}" y="${HH - 10}" text-anchor="middle" font-size="10" fill="${m.cal.isWork(d) ? p.ink2 : p.ink3}">${d.getDate()}</text>`; if (d.getDay() === 1) R += `<line x1="${x}" x2="${x}" y1="${HH}" y2="${H}" stroke="${p.line2}"/>`; }
      else if (d.getDay() === 1) { R += `<line x1="${x}" x2="${x}" y1="${o.scale === 'month' ? HH : 26}" y2="${H}" stroke="${p.line2}"/>`; if (o.scale !== 'month') R += `<text x="${x + 3}" y="${HH - 10}" font-size="10" fill="${p.ink3}">${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}</text>`; }
    }
    R += `<line x1="0" x2="${W}" y1="${HH}" y2="${HH}" stroke="${p.line}"/>`;
    rows.forEach((r, i) => { const y = HH + i * RH; if (o.sel === r.id) R += `<rect y="${y}" width="${W}" height="${RH}" fill="${p.accent}" fill-opacity=".22"/>`; R += `<line x1="0" x2="${W}" y1="${y + RH}" y2="${y + RH}" stroke="${p.line2}" stroke-opacity=".7"/>`; });
    const today = new Date(); today.setHours(12, 0, 0, 0); const xt = X(today);
    if (xt > 0 && xt < W) R += `<line x1="${xt}" x2="${xt}" y1="${HH}" y2="${H}" stroke="${p.accent}" stroke-width="2" stroke-dasharray="4 3"/>`;
    const byId = new Map(m.items.map((r) => [r.id, r])); const xs = (r) => X(r.start), xe = (r) => X(r.end) + ppd;
    let AR = '';
    for (const l of m.links) {
      if (l.skip) continue; const a = byId.get(l.from), b = byId.get(l.to); if (!a || !b) continue;
      const ya = rowY.get(a.id) + 12, yb = rowY.get(b.id) + 12;
      const fromStart = l.type === 'SS' || l.type === 'SF', toEnd = l.type === 'FF' || l.type === 'SF';
      const xa = fromStart ? xs(a) : xe(a), xb = toEnd ? xe(b) : xs(b); const x1 = xa + (fromStart ? -6 : 6);
      const cr = a.crit && b.crit; let d;
      if (!toEnd) d = x1 <= xb - 6 ? `M${xa},${ya}H${x1}V${yb}H${xb - 1}` : `M${xa},${ya}H${x1}V${yb + (yb > ya ? -9 : 9)}H${xb - 8}V${yb}H${xb - 1}`;
      else { const xr = Math.max(x1, xb + 8); d = `M${xa},${ya}H${xr}V${yb}H${xb + 1}`; }
      AR += `<path d="${d}" fill="none" stroke="${cr ? p.crit : p.ink3}" stroke-width="${cr ? 1.4 : 1}" marker-end="url(#ga${cr ? 'c' : 'n'})"/>`;
    }
    let BS = '';
    rows.forEach((r) => {
      const y = rowY.get(r.id);
      if (r.isStage) { if (!r.leaf || !r.leaf.length) return; const x1 = xs(r), x2 = Math.max(x1 + 2, xe(r)); BS += `<rect x="${x1}" y="${y + 9}" width="${x2 - x1}" height="5" fill="${p.ink}"/><path d="M${x1},${y + 8}v10l6,-5zM${x2},${y + 8}v10l-6,-5z" fill="${p.ink}"/>`; return; }
      const x1 = xs(r), x2 = xe(r);
      if (o.late && r.TF > 0) { const l1 = X(r.lstart), l2 = X(r.lend) + ppd; BS += `<rect x="${l1}" y="${y + 4}" width="${Math.max(3, l2 - l1)}" height="16" rx="2" fill="none" stroke="${p.ink3}" stroke-dasharray="3 2"/>`; }
      else if (r.TF > 0) { const xf = X(r.lend) + ppd; BS += `<line x1="${x2}" x2="${xf}" y1="${y + 12}" y2="${y + 12}" stroke="${p.ink3}" stroke-width="1.2"/><line x1="${xf}" x2="${xf}" y1="${y + 8}" y2="${y + 16}" stroke="${p.ink3}" stroke-width="1.2"/>`; }
      const tip = `${r.num} ${r.desc}\n${fd(r.start)} → ${fd(r.end)} · ${r.days} dias úteis · folga total ${r.TF} · folga livre ${r.FF}`;
      if (r.workSegments && r.workSegments.length > 1) {
        BS += `<g data-act="selItem" data-id="${r.id}" style="cursor:pointer"><title>${esc(tip)} · campanhas de atuação</title><line x1="${x1}" x2="${x2}" y1="${y+12}" y2="${y+12}" stroke="${p.blue}" stroke-opacity=".35" stroke-width="3"/>`;
        for(const seg of r.workSegments){const sx=X(m.cal.date(seg.ES)),ex=X(m.cal.date(m.execution?Math.ceil(seg.EF-1e-8)-1:seg.EF-1))+ppd;BS+=`<rect x="${sx}" y="${y+5}" width="${Math.max(3,ex-sx)}" height="14" rx="2" fill="${r.crit?p.crit:p.blue}"/>`;}
        BS+='</g>';return;
      }
      BS += `<g data-act="selItem" data-id="${r.id}" style="cursor:pointer"><title>${esc(tip)}</title>` + (r.days === 0 ? `<path d="M${x1},${y + 4}l8,8l-8,8l-8,-8z" fill="${p.ink}"/>`
        : `<rect x="${x1}" y="${y + 5}" width="${Math.max(3, x2 - x1)}" height="14" rx="2" fill="${r.crit ? p.crit : p.blue}"/>${x2 - x1 >= 26 ? `<text x="${x1 + 5}" y="${y + 16}" font-size="10.5" font-weight="700" fill="#FFFFFF">${r.days}d</text>` : ''}`) + '</g>';
    });
    const defs = `<defs>${marker('gan', p.ink3)}${marker('gac', p.crit)}</defs>`;
    return { left: open(LW, H, p) + L + '</svg>', right: open(W, H, p) + defs + R + AR + BS + '</svg>',
      full: open(LW + W, H, p) + defs + L + `<g transform="translate(${LW},0)">${R}${AR}${BS}</g><line x1="${LW}" x2="${LW}" y1="0" y2="${H}" stroke="${p.line}"/></svg>` };
  };

  /* ---------- REDE PERT (atividade no nó) ---------- */
  CH.pert = function (m, o = {}) {
    const p = CH.pal(); const its = m.items; const n = its.length; const cp = m.cpm;
    const L = cp.links.filter((l) => !l.skip); const preds = its.map(() => []); L.forEach((l) => preds[l.j].push(l));
    const lvl = new Array(n).fill(0);
    for (const j of cp.order) for (const l of preds[j]) lvl[j] = Math.max(lvl[j], lvl[l.i] + 1);
    const levels = []; its.forEach((r, i) => (levels[lvl[i]] = levels[lvl[i]] || []).push(i));
    const pos = new Array(n).fill(0);
    levels.forEach((ls, k) => {
      if (!ls) return;
      if (k > 0) { const bc = new Map(ls.map((i) => { const ps = preds[i].map((l) => pos[l.i]); return [i, ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0]; })); ls.sort((a, b) => bc.get(a) - bc.get(b) || a - b); }
      ls.forEach((i, q) => (pos[i] = q));
    });
    const NW = 190, NH = 74, GX = 64, GY = 20, PX = 20, PY = 40;
    const nl = levels.length; const maxR = Math.max(1, ...levels.map((l) => (l ? l.length : 0)));
    const W = Math.max(640, PX * 2 + nl * NW + Math.max(0, nl - 1) * GX), H = PY + 16 + maxR * NH + Math.max(0, maxR - 1) * GY;
    const nx = (i) => PX + lvl[i] * (NW + GX), ny = (i) => PY + pos[i] * (NH + GY);
    const TP = { FS: 'TI', SS: 'II', FF: 'TT', SF: 'IT' };
    let s = open(W, H, p) + `<defs>${marker('pn', p.ink3)}${marker('pc', p.crit)}</defs>`
      + `<text x="${PX}" y="22" font-size="11" fill="${p.ink3}">Nó: [início cedo | duração | término cedo] · nome · [início tarde | folga total | término tarde], em dias úteis desde o início da obra. Vermelho = caminho crítico.</text>`;
    L.forEach((l) => {
      const x1 = nx(l.i) + NW, y1 = ny(l.i) + NH / 2, x2 = nx(l.j), y2 = ny(l.j) + NH / 2; const cr = its[l.i].crit && its[l.j].crit; const col = cr ? p.crit : p.ink3; const mx = (x1 + x2) / 2;
      s += `<path d="M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2 - 1},${y2}" fill="none" stroke="${col}" stroke-width="${cr ? 1.8 : 1.1}" marker-end="url(#p${cr ? 'c' : 'n'})"/>`;
      if (l.type !== 'FS' || l.lag) s += `<text x="${mx}" y="${(y1 + y2) / 2 - 5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${col}" stroke="${p.bg}" stroke-width="3" paint-order="stroke">${TP[l.type]}${l.lag ? (l.lag > 0 ? '+' : '') + l.lag : ''}</text>`;
    });
    its.forEach((r, i) => {
      const x = nx(i), y = ny(i); const c = r.crit ? p.crit : p.ink; const w3 = NW / 3; const sel = o.sel === r.id;
      const cell = (cx, cy, v, b) => `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="11" font-weight="${b ? 700 : 500}" fill="${p.ink}">${v}</text>`;
      const d1 = trunc(r.desc, 29), d2 = r.desc.length > 28 ? trunc(r.desc.slice(28).trim(), 34) : '';
      s += `<g data-act="selItem" data-id="${r.id}" style="cursor:pointer"><title>${esc(r.num + ' ' + r.desc)}</title>`
        + `<rect x="${x}" y="${y}" width="${NW}" height="${NH}" rx="3" fill="${sel ? p.accent : p.bg}" fill-opacity="${sel ? 0.3 : 1}" stroke="${c}" stroke-width="${r.crit ? 2 : 1.2}"/>`
        + `<path d="M${x},${y + 18}H${x + NW}M${x},${y + NH - 18}H${x + NW}M${x + w3},${y}V${y + 18}M${x + 2 * w3},${y}V${y + 18}M${x + w3},${y + NH - 18}V${y + NH}M${x + 2 * w3},${y + NH - 18}V${y + NH}" stroke="${p.line}" fill="none"/>`
        + cell(x + w3 / 2, y + 13, r.ES) + cell(x + w3 * 1.5, y + 13, r.days + 'd', true) + cell(x + w3 * 2.5, y + 13, r.EF)
        + `<text x="${x + 6}" y="${y + 32}" font-size="11" font-weight="700" fill="${c}">${esc(r.seq + ' · ' + d1)}</text><text x="${x + 6}" y="${y + 45}" font-size="10.5" fill="${p.ink2}">${esc(d2)}</text>`
        + cell(x + w3 / 2, y + NH - 5, r.LS) + cell(x + w3 * 1.5, y + NH - 5, 'FT ' + r.TF, true) + cell(x + w3 * 2.5, y + NH - 5, r.LF) + '</g>';
    });
    return s + '</svg>';
  };

  /* ---------- HISTOGRAMA empilhado (média por período + pico diário) ---------- */
  CH.hist = function (o) {
    const p = CH.pal(); const B = o.B; const top = o.series.slice(0, 9), rest = o.series.slice(9);
    const ser = rest.length ? [...top, { name: `Outros (${rest.length})`, avg: B.map((_, i) => U.sum(rest, (s) => s.avg[i])) }] : top;
    const tot = B.map((_, i) => U.sum(ser, (s) => s.avg[i])); const peak = o.peak || tot;
    const ymax = niceMax(Math.max(1, ...tot, ...peak));
    const H0 = o.height || 290, ML = 50, MR = 16, MT = 14, MB = 48; const bw = Math.max(12, Math.min(48, Math.floor(980 / Math.max(1, B.length)))); const PW = B.length * bw;
    const W = Math.max(620, ML + MR + PW); const perRow = Math.max(1, Math.floor((W - ML) / 200)); const LH = 18 * Math.ceil((ser.length + 1) / perRow) + 8;
    const H = H0 + LH; const ph = H0 - MT - MB; const Y = (v) => MT + ph - (v / ymax) * ph;
    let s = open(W, H, p);
    [0, 0.25, 0.5, 0.75, 1].forEach((f) => { const v = ymax * f; s += `<line x1="${ML}" x2="${ML + PW}" y1="${Y(v)}" y2="${Y(v)}" stroke="${p.line2}"/><text x="${ML - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="${p.ink3}">${U.num(v, ymax < 8 ? 1 : 0)}</text>`; });
    const step = Math.ceil(B.length / 45);
    B.forEach((b, i) => {
      const x = ML + i * bw + 2, w = bw - 4; let acc = 0;
      ser.forEach((se, k) => { const v = se.avg[i]; if (!(v > 0)) return; const y1 = Y(acc + v), y0 = Y(acc); s += `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(0.6, y0 - y1)}" fill="${CH.SERIES[k % CH.SERIES.length]}"><title>${esc(b.label)} · ${esc(se.name)}: ${U.num(v, 1)} ${esc(o.unit)} (média)</title></rect>`; acc += v; });
      if (peak[i] > tot[i] + 0.05) s += `<line x1="${x - 1}" x2="${x + w + 1}" y1="${Y(peak[i])}" y2="${Y(peak[i])}" stroke="${p.ink}" stroke-width="2"><title>${esc(b.label)} · pico diário: ${U.num(peak[i], 1)} ${esc(o.unit)}</title></line>`;
      if (i % step === 0) s += `<text x="${x + w / 2}" y="${MT + ph + 12}" text-anchor="end" font-size="10" fill="${p.ink3}" transform="rotate(-45 ${x + w / 2} ${MT + ph + 12})">${esc(b.label)}</text>`;
    });
    s += `<line x1="${ML}" x2="${ML + PW}" y1="${Y(0)}" y2="${Y(0)}" stroke="${p.ink3}"/><text x="14" y="${MT + ph / 2}" transform="rotate(-90 14 ${MT + ph / 2})" text-anchor="middle" font-size="11" fill="${p.ink3}">${esc(o.unit)}</text>`;
    ser.forEach((se, k) => { const lx = ML + (k % perRow) * 200, ly = H0 + 2 + Math.floor(k / perRow) * 18; s += `<rect x="${lx}" y="${ly}" width="10" height="10" rx="2" fill="${CH.SERIES[k % CH.SERIES.length]}"/><text x="${lx + 15}" y="${ly + 9}" font-size="11" fill="${p.ink2}">${esc(trunc(se.name, 32))}</text>`; });
    const k = ser.length, lx = ML + (k % perRow) * 200, ly = H0 + 2 + Math.floor(k / perRow) * 18;
    s += `<line x1="${lx}" x2="${lx + 12}" y1="${ly + 5}" y2="${ly + 5}" stroke="${p.ink}" stroke-width="2"/><text x="${lx + 17}" y="${ly + 9}" font-size="11" fill="${p.ink2}">pico diário (quando acima da média)</text>`;
    return s + '</svg>';
  };

  /* ---------- CURVA S ---------- */
  CH.scurve = function (o) {
    const p = CH.pal(); const R = o.rows; const n = R.length;
    const H0 = o.height || 320, ML = 62, MR = 50, MT = 16, MB = 48; const bw = Math.max(12, Math.min(48, Math.floor(980 / Math.max(1, n)))); const PW = n * bw; const W = Math.max(620, ML + MR + PW);
    const H = H0 + 24; const ph = H0 - MT - MB; const pmax = niceMax(Math.max(1, ...R.map((r) => Math.max(r.pe, r.pl))));
    const Yv = (v) => MT + ph - (v / pmax) * ph, Yp = (f) => MT + ph - f * ph;
    let s = open(W, H, p);
    [0, 0.25, 0.5, 0.75, 1].forEach((f) => { s += `<line x1="${ML}" x2="${ML + PW}" y1="${Yp(f)}" y2="${Yp(f)}" stroke="${p.line2}"/><text x="${ML + PW + 6}" y="${Yp(f) + 4}" font-size="11" fill="${p.ink3}">${Math.round(f * 100)}%</text><text x="${ML - 6}" y="${Yp(f) + 4}" text-anchor="end" font-size="10.5" fill="${p.ink3}">${esc(U.brlShort(pmax * f / 100).replace('R$ ', ''))}</text>`; });
    const step = Math.ceil(n / 45);
    R.forEach((r, i) => {
      const x = ML + i * bw + 3, w = bw - 6;
      s += `<rect x="${x}" y="${Yv(r.pe)}" width="${w}" height="${Math.max(0.6, Yv(0) - Yv(r.pe))}" fill="${p.blue}" fill-opacity=".28"><title>${esc(r.label)} · no período: ${U.brl(r.pe / 100)} (cedo) · ${U.brl(r.pl / 100)} (tarde)</title></rect>`;
      if (i % step === 0) s += `<text x="${x + w / 2}" y="${MT + ph + 12}" text-anchor="end" font-size="10" fill="${p.ink3}" transform="rotate(-45 ${x + w / 2} ${MT + ph + 12})">${esc(r.label)}</text>`;
    });
    const line = (k, col, dash) => { let d = `M${ML},${Yp(0)}`; R.forEach((r, i) => (d += `L${ML + (i + 1) * bw},${Yp(r[k])}`)); return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round"${dash ? ' stroke-dasharray="7 4"' : ''}/>`; };
    s += line('pcl', p.crit, true) + line('pce', p.blue);
    R.forEach((r, i) => (s += `<circle cx="${ML + (i + 1) * bw}" cy="${Yp(r.pce)}" r="3" fill="${p.blue}"><title>${esc(r.label)} · acumulado cedo ${U.pct(r.pce)} (${U.brl(r.ce / 100)}) · tarde ${U.pct(r.pcl)} (${U.brl(r.cl / 100)})</title></circle>`));
    s += `<line x1="${ML}" x2="${ML + PW}" y1="${Yp(0)}" y2="${Yp(0)}" stroke="${p.ink3}"/>`;
    const ly = H0 + 4;
    s += `<rect x="${ML}" y="${ly}" width="12" height="10" fill="${p.blue}" fill-opacity=".28"/><text x="${ML + 17}" y="${ly + 9}" font-size="11" fill="${p.ink2}">valor no período (R$)</text>`
      + `<line x1="${ML + 160}" x2="${ML + 184}" y1="${ly + 5}" y2="${ly + 5}" stroke="${p.blue}" stroke-width="2.4"/><text x="${ML + 190}" y="${ly + 9}" font-size="11" fill="${p.ink2}">acumulado — datas cedo</text>`
      + `<line x1="${ML + 330}" x2="${ML + 354}" y1="${ly + 5}" y2="${ly + 5}" stroke="${p.crit}" stroke-width="2.4" stroke-dasharray="7 4"/><text x="${ML + 360}" y="${ly + 9}" font-size="11" fill="${p.ink2}">acumulado — datas tarde</text>`;
    return s + '</svg>';
  };
})(typeof window !== 'undefined' ? window : globalThis);

