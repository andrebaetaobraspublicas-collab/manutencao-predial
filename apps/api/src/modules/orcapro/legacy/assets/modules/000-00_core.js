/* ==== 00_core.js ==== */
/* =====================================================================
 * OrçaPlan SINAPI — 00_core.js
 * Namespace global (OP), utilitários de texto, números pt-BR, datas e
 * um barramento de eventos simples. Sem dependências: roda no navegador
 * e no Node (testes automatizados).
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = (G.OP = G.OP || {});
  const U = (OP.util = {});

  /* ---------- Texto ---------- */
  // Remove acentos (NFD + faixa de diacríticos combinantes)
  U.deaccent = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Chave de comparação: sem acento, caixa alta, espaços simples
  U.norm = (s) => U.deaccent(s).toUpperCase().replace(/\s+/g, ' ').trim();
  U.esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // "PEDREIRO COM ENCARGOS COMPLEMENTARES" -> "Pedreiro"
  U.cap = (s) => {
    const low = String(s || '').toLowerCase();
    return low.charAt(0).toUpperCase() + low.slice(1);
  };

  /* ---------- Números (pt-BR) ---------- */
  const nfCache = {};
  const nf = (min, max) => (nfCache[min + ':' + max] ||= new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: min, maximumFractionDigits: max }));
  U.num = (v, d = 2, dmin = d) => (v == null || !isFinite(v)) ? '—' : nf(dmin, d).format(v);
  U.brl = (v) => (v == null || !isFinite(v)) ? '—' : 'R$ ' + nf(2, 2).format(v);
  U.brlCents = (c) => (c == null) ? '—' : U.brl(c / 100);
  U.pct = (v, d = 1) => (v == null || !isFinite(v)) ? '—' : nf(d, d).format(v * 100) + '%';
  U.int = (v) => (v == null || !isFinite(v)) ? '—' : nf(0, 0).format(Math.round(v));
  // Compacto: 1,2 mi / 350 mil
  U.brlShort = (v) => {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return 'R$ ' + nf(1, 1).format(v / 1e9) + ' bi';
    if (a >= 1e6) return 'R$ ' + nf(1, 2).format(v / 1e6) + ' mi';
    if (a >= 1e4) return 'R$ ' + nf(0, 1).format(v / 1e3) + ' mil';
    return U.brl(v);
  };
  // Aceita "1.234,56", "1234,56", "1234.56", "1,5e3"
  U.parseNum = (s) => {
    if (typeof s === 'number') return s;
    let t = String(s == null ? '' : s).trim().replace(/\s/g, '');
    if (!t) return NaN;
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    else if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
    else if (t.includes(',')) t = t.replace(',', '.');
    return Number(t);
  };
  U.round = (v, d = 2) => { const f = Math.pow(10, d); return Math.round((v + Number.EPSILON) * f) / f; };
  U.trunc = (v, d = 2) => { const f = Math.pow(10, d); return Math.trunc(v * f + 1e-9) / f; };
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);

  /* ---------- Datas (ISO local, sem fuso) ---------- */
  U.iso = (d) => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  U.parseISO = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12); };
  U.addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  U.fmtDate = (d) => d ? d.toLocaleDateString('pt-BR') : '—';
  U.fmtDateShort = (d) => d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
  U.MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /* ---------- Diversos ---------- */
  U.uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  U.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.deepClone = (o) => JSON.parse(JSON.stringify(o));
  U.groupBy = (arr, key) => arr.reduce((m, x) => { const k = key(x); (m[k] ||= []).push(x); return m; }, {});

  /* ---------- Barramento de eventos ---------- */
  // Mudanças no projeto disparam 'change' e as telas se recalculam (reatividade).
  const handlers = {};
  OP.on = (ev, fn) => { (handlers[ev] ||= new Set()).add(fn); return () => handlers[ev].delete(fn); };
  OP.emit = (ev, data) => { (handlers[ev] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); };
})(typeof window !== 'undefined' ? window : globalThis);

