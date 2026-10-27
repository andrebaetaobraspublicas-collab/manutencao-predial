/* Project-scoped price overlays shared by SINAPI/SICRO, browser and server. */
(function (G) {
  'use strict';
  const O = G.OP, S = O.sicro || O.sinapi, N = O.register, E = O.engine;
  const P = O.inputPrices = {}, clone = x => JSON.parse(JSON.stringify(x));
  const key = x => [String(x.code), x.uf, x.ref, x.regime].join('|');
  const month = x => N.month(x);
  const cents = x => Number.isSafeInteger(x) && x >= 0 && x <= 100000000000;
  P.validate = rows => {
    if (rows === undefined) return [];
    if (!Array.isArray(rows) || rows.length > 2000) throw new Error('Lista de preços próprios inválida (máximo 2.000).');
    const seen = new Set();
    for (const r of rows) {
      if (!r || !/^(?:\d{1,12}|[A-Z]\d{4}|IP-[A-Z0-9_-]{1,54})$/.test(String(r.code)) ||
          !/^[A-Z]{2}$/.test(r.uf) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.ref) ||
          !['SD', 'CD', 'SE'].includes(r.regime) || !cents(r.priceCents) ||
          (r.chiCents !== undefined && !cents(r.chiCents)) ||
          typeof r.source !== 'string' || !r.source.trim() || r.source.length > 500 ||
          typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
          !Number.isFinite(Date.parse(r.date + 'T00:00:00Z')) || new Date(r.date + 'T00:00:00Z').toISOString().slice(0, 10) !== r.date) throw new Error('Preço próprio do orçamento inválido.');
      if (seen.has(key(r))) throw new Error('Preço próprio duplicado para o mesmo insumo, UF, referência e regime.');
      seen.add(key(r));
    }
    return rows;
  };
  P.find = (base, project, code, regime = project.rg) => P.validate(project.inputPriceOverrides)
    .find(r => key(r) === key({ code, uf: project.uf, ref: month(base.raw.ref), regime }));
  P.context = (base, project, code) => ({ code: String(code), uf: project.uf, ref: month(base.raw.ref), regime: project.rg });

  // Follow the analytical graph, including auxiliary compositions and SICRO A–F.
  // Quoted compositions deliberately remain terminals with their agreed price.
  P.uses = (base, code, target, type = 'C') => {
    const pending = [{ code, type }], seen = new Set();
    while (pending.length) {
      const x = pending.pop(), c = String(x.code), k = x.type + ':' + c;
      if (seen.has(k)) continue; seen.add(k);
      if (x.type === 'I') { if (c === String(target)) return true; continue; }
      if (O.sicro && /^E\d{4}-/.test(c) && c.slice(0, 5) === String(target)) return true;
      const own = base.custom.get(x.code) || base.custom.get(c);
      if (own?.mode === 'quoted') continue;
      for (const r of base.itemsOf(x.code, base.ufs[0], 'SD')) if (r.coef > 0) pending.push({ type: r.type, code: r.code });
    }
    return false;
  };
  P.bind = (base, project) => {
    const rows = P.validate(project.inputPriceOverrides).filter(r => r.uf === project.uf && base.ufs.includes(project.uf) && r.ref === month(base.raw.ref));
    const signature = JSON.stringify([project.uf, rows]);
    if (base._inputPriceSignature === signature) return base;
    base._inputPriceSignature = signature;
    base._projectInputPrices = new Map(rows.map(r => [String(r.code) + '|' + r.regime, r]));
    base._inputPriceUF = project.uf;
    // All dependent cost, resource and tax caches must use the new project prices.
    for (const name of ['_costCache', '_bdCache', '_customCostCache']) base[name] = new Map();
    for (const name of ['_vc', '_ec', '_estParts', '_usage', '_anCache']) delete base[name];
    if (O.prod?.clearCache) O.prod.clearCache(base);
    // The tax bridge also caches equipment decomposition by custom-map identity.
    base.custom = new Map(base.custom);
    if (!O.sicro) {
      base._officialPriceOvr ||= base.ovr;
      base.ovr = {};
      for (const [rg, values] of Object.entries(base._officialPriceOvr)) {
        const map = base.ovr[rg] = new Map(values);
        const targets = rows.filter(r => r.regime === rg).map(r => r.code);
        for (const [j, valuesByUF] of map) if (targets.some(code => P.uses(base, base.raw.comp.c[j], code))) {
          const values = valuesByUF.slice(); values[base.ufIndex(project.uf)] = null; map.set(j, values);
        }
      }
      // Dependency discovery reads analytical rows and may have warmed tables.
      base._costCache.clear(); base._bdCache.clear(); base._customCostCache.clear();
    }
    return base;
  };
  const proto = S.Base.prototype, price = proto.insPrice;
  proto.insPrice = function (i, ui, rg) {
    const r = this._projectInputPrices?.get(String(this.raw.ins.c[i]) + '|' + rg);
    if (r && (O.sicro || this.ufs[ui] === this._inputPriceUF)) return [r.priceCents, false];
    return price.call(this, i, ui, rg);
  };
  if (O.sicro) {
    const value = proto._insValue, parts = proto.eqParts;
    proto._insValue = function (i, rg) {
      const r = this._projectInputPrices?.get(String(this.raw.ins.c[i]) + '|' + rg);
      return r ? S.toS(r.priceCents / 100) : value.call(this, i, rg);
    };
    proto.eqParts = function (code, rg) {
      const original = parts.call(this, code, rg), r = this._projectInputPrices?.get(String(code) + '|' + rg);
      if (!r || !original) return original;
      const out = original.slice(), scale = original[7] > 0 ? (r.priceCents / 100) / original[7] : 0;
      for (let i = 1; i <= 6; i++) out[i] *= scale;
      if (!original[7] && r.priceCents) out[5] = r.priceCents / 100;
      out[7] = r.priceCents / 100; out[8] = (r.chiCents ?? r.priceCents) / 100;
      const idle = out[1] + out[2] + out[3] + out[6];
      out.est = true; out.chiScale = idle > 0 ? out[8] / idle : 0;
      return out;
    };
  }
  const compute = E.compute;
  E.compute = function (base, project) { P.bind(base, project); return compute(base, project); };
  const rebuild = N.rebuild;
  N.rebuild = function (...args) { const result = rebuild(...args); if (O.app.base && O.app.pj) P.bind(O.app.base, O.app.pj); return result; };

  P.preview = (base, project, change, remove = false) => {
    const context = P.context(base, project, change.code);
    const row = { ...change, ...context };
    if (!base.ins(row.code)) throw new Error('Insumo ausente na referência do orçamento.');
    if (!remove) P.validate([row]);
    const draft = clone(project), rows = P.validate(draft.inputPriceOverrides).filter(r => key(r) !== key(row));
    if (!remove) rows.push(row);
    draft.inputPriceOverrides = rows;
    const fresh = () => N.makeBase(base.officialRaw || base.raw, base.id, clone(project.catalog?.inputs || O.app.inputs || []), clone(project.catalog?.compositions || O.app.customs || []), clone(project[O.sicro ? 'sicroPriceQuotes' : 'sinapiPriceQuotes'] || []));
    const beforeBase = fresh(), nextBase = fresh();
    const before = E.compute(beforeBase, clone(project)), after = E.compute(nextBase, draft);
    const next = after.byId;
    const affected = before.items.filter(r => P.uses(beforeBase, r.node.code, row.code, r.node.resourceType || 'C')).map(r => {
      const to = next.get(r.id);
      return { id: r.id, num: r.num, code: String(r.node.code), desc: r.desc, qty: r.qty, fixed: r.fixo,
        oldUnit: r.unitCost, newUnit: to.unitCost, oldDirect: r.direct, newDirect: to.direct, oldPrice: r.total, newPrice: to.total };
    });
    return { fingerprint: JSON.stringify(project), baseId: base.id, row, remove, rows, affected,
      before: before.tot, after: after.tot, missing: after.items.filter(r => r.unitCost == null).length,
      newlyMissing: after.items.some(r => r.unitCost == null && before.byId.get(r.id)?.unitCost != null) };
  };
  P.apply = (base, project, preview) => {
    if (preview.baseId !== base.id || preview.fingerprint !== JSON.stringify(project)) throw new Error('O orçamento mudou após a prévia. Gere uma nova prévia antes de confirmar.');
    if (preview.newlyMissing) throw new Error('A alteração deixaria serviços sem preço. Revise a prévia.');
    P.validate(preview.rows);
    const previous = P.find(base, project, preview.row.code) || null;
    project.inputPriceOverrides = clone(preview.rows);
    (project.inputPriceHistory ||= []).push({ at: new Date().toISOString(), action: preview.remove ? 'restore' : 'set',
      context: P.context(base, project, preview.row.code), previous: clone(previous), next: preview.remove ? null : clone(preview.row),
      affectedIds: preview.affected.map(r => r.id), directBefore: preview.before.direct, directAfter: preview.after.direct });
    P.bind(base, project); O.app.model = null; O.iva?.invalidate();
    return project;
  };
})(typeof window !== 'undefined' ? window : globalThis);
