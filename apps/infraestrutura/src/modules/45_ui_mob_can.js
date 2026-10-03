/* ==== 45_ui_mob_can.js — menus Mobilização e Canteiro de Obras (integração com orçamento, cronograma e AL) ==== */
(function (G) {
  'use strict';
  const OP = G.OP, U = OP.util, UI = OP.ui, A = OP.app, MB = OP.mob, CN = OP.can, AL = OP.al, esc = U.esc;
  const money = (v) => U.brl(v), n2 = (v, d = 2) => U.num(v, d);
  const r2 = (v) => Math.round(v * 100) / 100;
  /* ---------- utilitários comuns ---------- */
  const findItems = (pj, codes) => { const out = []; const walk = (n) => { for (const c of n.children || []) { if (c.kind === 'stage') walk(c); else if (codes.includes(String(c.code))) out.push(c); } }; walk(pj.root); return out; };
  function applyQuoted(pj, code, olds, desc, total, source, durT) {
    const live = A.pj === pj && Array.isArray(A.customs), list = live ? A.customs : (pj.catalog = pj.catalog || { v: 1, inputs: [], compositions: [] }).compositions;
    const comp = { id: code, code, desc, unit: 'un', group: 'Composições próprias', mode: 'quoted', quote: r2(total), quoteUF: '*', quoteRef: '', quoteSource: source + ' — ' + new Date().toLocaleDateString('pt-BR'), src: 'PRÓPRIA', revision: 1, history: [], items: [] };
    const k = list.findIndex((x) => x.code === code); if (k >= 0) { comp.revision = (list[k].revision || 1) + 1; Object.assign(list[k], comp); } else list.push(comp);
    const it = findItems(pj, [code, ...olds])[0];
    if (it) { it.code = code; it.qty = 1; it.memo = null; } else { const st = pj.root.children.find((x) => x.kind === 'stage') || pj.root; const ni = OP.engine.item(code, 1); ni.dur = durT || 10; st.children.unshift(ni); }
    if (!live) for (const o of olds) { const i = list.findIndex((x) => x.code === o); if (i >= 0) list.splice(i, 1); }
    if (live) OP.register.rebuild();
  }
  const tabsBar = (cur, list, act) => `<div class="tabs">${list.map(([k, l]) => `<button class="tab ${cur === k ? 'on' : ''}" data-act="${act}" data-t="${k}">${l}</button>`).join('')}</div>`;
  const testsHTML = (t, note) => `<div class="cards"><div class="card hl"><small>Conferência com o caderno de aplicação</small><b>${t.filter((x) => x.pass).length} / ${t.length}</b><span class="muted">${note}</span></div></div>
    <div class="tblw"><table class="tbl sm"><thead><tr><th>Verificação</th><th class="r">Esperado</th><th class="r">Obtido</th><th>Resultado</th></tr></thead><tbody>${t.map((x) => `<tr><td>${esc((x.group ? x.group + ' — ' : '') + x.name)}</td><td class="r">${x.expected != null ? esc(typeof x.expected === 'number' ? n2(x.expected) : x.expected) : ''}</td><td class="r">${x.actual != null ? esc(typeof x.actual === 'number' ? n2(x.actual) : x.actual) : ''}</td><td>${x.pass ? '<b class="ok">aprovado</b>' : '<b class="bad">falhou</b> ' + esc(x.detail || '')}</td></tr>`).join('')}</tbody></table></div>`;
  const alResult = (pj, m) => { try { return AL.result(pj, m); } catch (e) { return null; } };

  /* =================== MOBILIZAÇÃO =================== */
  const TR = MB.TRANSPORTER_TECH;
  const pickTransporter = (tp) => { const mass = tp ? +tp.mass || 0 : 0; const fit = TR.filter((t) => t.loadUseful > 0 && t.transportClass !== 'water').sort((a, b) => a.loadUseful - b.loadUseful).find((t) => t.loadUseful >= mass); return fit ? fit.code : 'E9665'; };
  /* frota de pico por equipamento, a partir das equipes e do cronograma (CPM) */
  MB.fleet = (m) => {
    const ev = new Map();
    for (const r of m.items) {
      if (!r.prod || !r.prod.rows || !(r.days > 0)) continue; const teams = r.prod.m || +r.node.teams || 1;
      for (const x of r.prod.rows) { if (x.kind !== 'eq') continue; const code = String(x.key).replace(/^EQ:/, ''); if (!/^E\d{4}$/.test(code)) continue; const q = (x.n || 1) * teams; const L = ev.get(code) || []; L.push([r.ES, q], [r.EF, -q]); ev.set(code, L); }
    }
    const out = new Map(); for (const [code, L] of ev) { L.sort((a, b) => a[0] - b[0] || a[1] - b[1]); let c = 0, mx = 0; for (const [, d] of L) { c += d; if (c > mx) mx = c; } if (mx > 0) out.set(code, mx); }
    return out;
  };
  MB.state = (pj) => { pj.mob = pj.mob || {}; if (!pj.mob.s) pj.mob.s = MB.blankState(); pj.mob.tab = pj.mob.tab || 'geral'; pj.mob.s = MB.normalize(pj.mob.s); return pj.mob; };
  MB.sync = (pj, m) => {
    const st = MB.state(pj), s = st.s, b = m.base; s.meta.name = pj.name; s.meta.bdi = +(pj.bdi * 100).toFixed(4); s.meta.priceMode = 'sicro2026'; s.meta.workState = s.meta.priceState = b.ufs[0]; s.meta.priceReference = b.raw.ref;
    const routeId = s.routes[0].id, fleet = MB.fleet(m), keep = new Map(s.equipment.map((e) => [e.code, e]));
    s.equipment = [...fleet].sort((a, z) => a[0].localeCompare(z[0])).map(([code, qty]) => {
      const old = keep.get(code); if (old) return Object.assign(old, { quantity: qty });
      const tp = MB.TECH_BY_CODE.get(code), i = b.insIdx.get(code), desc = i != null ? b.raw.ins.d[i] : code, nd = U.norm(desc), road = /^(CAMINH|CAVALO|VEICULO|ONIBUS|MICRO|CARRETA|VAN)/.test(nd) || /AUTOPROPELID|GUINDASTE MOVEL/.test(nd), heavy = /ESTEIRA|ESCAVADEIRA|TRATOR|ROLO|MOTONIVELADORA|CARREGADEIRA|USINA|VIBROACABADORA|FRESADORA|RECICLADORA|PERFURATRIZ/.test(nd), auto = tp ? !!tp.autoLong : road;
      return { id: MB.id('eq'), code, description: desc, quantity: qty, area: tp ? tp.area : 0, mass: tp ? tp.mass : 0, length: 0, width: 0, sizeOverride: tp ? tp.sizeClass : 'large', referenceSizeClass: tp ? tp.sizeClass : '', autoLong: auto, fragmentable: tp ? !!tp.fragmentable : false, include: true,
        manualFu: tp || auto ? null : 1, transporterCode: auto ? code : tp ? pickTransporter(tp) : heavy ? 'E9666' : 'E9686', routeId, k: 2, drivers: 1, travelTimeOverride: null, restOverride: null, tollOneWay: 0, otherPerEq: 0, fixedCost: 0, customChp: null, customChi: null, historicalChp: null, historicalChi: null, cmdPublished: 0, estimated: !tp && !road };
    });
    const r = alResult(pj, m), a = pj.al && pj.al.params;
    if (r) {
      const w = s.workforce; w.npfv = r.QF + r.QVi; w.npvPeak = Math.ceil((r.QVaRaw || 0) * 1.33 - 1e-9); w.nmoPeak = Math.ceil(((a && a.ordinary) || 0) * 1.33 - 1e-9); w.rule = 'standard';
      const total = Math.ceil(w.npfv + w.variablePct / 100 * w.npvPeak + w.ordinaryPct / 100 * w.nmoPeak - (w.localCount || 0) - 1e-9);
      const g = (d, people, code, cap) => ({ id: MB.id('wg'), description: d, people, transporterCode: code, capacity: cap, routeId, k: 2, drivers: 1, travelTimeOverride: null, restOverride: null, tollOneWay: 0, otherPerEq: 0, fixedCost: 0, manualFu: null });
      w.groups = [g('Profissionais da parcela fixa — veículo leve', r.QF, 'E9093', 5), g('Parcelas vinculada e variável + mão de obra ordinária — ônibus', Math.max(0, total - r.QF), 'E9220', 50)];
    }
    st.synced = new Date().toISOString(); return s;
  };
  MB.apply = (pj, m) => { const st = MB.state(pj), r = MB.calculate(st.s); OP.analytic.write(pj, Object.assign(OP.analytic.mob(pj, r), { code: 'CP-MOB-SICRO', prefix: 'IP-MOB', olds: ['CP-ROD-MOB'], dur: 10, source: 'Menu Mobilização — ' + new Date().toLocaleDateString('pt-BR'), desc: 'Mobilização e desmobilização de equipamentos e pessoal — SICRO, Manual de Custos vol. 08 (composição analítica gerada pelo menu Mobilização)', notes: 'Horas de viagem (produtivas) e de descanso (improdutivas) dos transportadores e veículos, ida e volta.' })); st.applied = { total: r2(r.direct), at: new Date().toISOString() }; return r; };
  MB.initExample = (pj, m) => { const st = MB.state(pj); st.s.routes = [{ id: MB.id('route'), name: 'Origem dos equipamentos (região metropolitana) → canteiro', segments: [{ id: MB.id('seg'), type: 'road_paved', distance: 120, customSpeed: 0, description: 'Rodovias pavimentadas' }, { id: MB.id('seg'), type: 'road_natural', distance: 6, customSpeed: 0, description: 'Acesso ao canteiro' }] }]; MB.sync(pj, m); MB.apply(pj, m); };
  const SEGS = Object.entries(MB.SEG_LABEL).filter(([k]) => /^road|^rail|custom/.test(k));
  function mobView() {
    const pj = A.pj, m = UI.model(), st = MB.state(pj), s = st.s; let r, v;
    try { r = MB.calculate(s); v = MB.validations(s); } catch (e) { return `<div class="alertbox">Não foi possível calcular: ${esc(e.message)}</div>`; }
    const tab = st.tab, head = `<div class="vh"><div><h1>Mobilização e desmobilização</h1><p class="muted">Manual de Custos de Infraestrutura de Transportes — Volume 08 (SICRO/DNIT) · equipamentos ${U.int(s.equipment.length)} · grupos de pessoas ${U.int(s.workforce.groups.length)} · custo ${money(r.direct)} · <b>sincronizada automaticamente com o cronograma</b>${A.pj.sync && A.pj.sync.at ? ' (' + new Date(A.pj.sync.at).toLocaleTimeString('pt-BR') + ')' : ''}</p></div>
      <div class="row"><button class="btn" data-act="mobSync">${UI.icon('gantt')} Importar frota e efetivo</button><button class="btn pri" data-act="mobApply">${UI.icon('ok')} Aplicar ao orçamento</button></div></div>${tabsBar(tab, [['geral', 'Visão geral'], ['rotas', 'Rotas'], ['equip', 'Equipamentos'], ['mo', 'Mão de obra'], ['conf', 'Conferência']], 'mobTab')}`;
    if (tab === 'conf') return head + testsHTML(MB._t || (MB._t = MB.selfTests()), 'construção rodoviária de 50 km + OAE de 180 m (Tabelas 4, 6, 7 e 8)');
    if (tab === 'rotas') return head + `<p class="note">Tempo de viagem = Σ distância ÷ velocidade de referência do tipo de via (caminhão ou cavalo mecânico). Distâncias abaixo de 50 km exigem justificativa (Volume 08).</p>${s.routes.map((rt) => { const mt = MB.routeMetrics(s, rt.id, 'truck'); return `<div class="panel"><h3>${esc(rt.name)} · ${n2(mt.distance)} km · ${n2(mt.time)} h (caminhão)</h3><div class="tblw"><table class="tbl sm"><thead><tr><th>Trecho</th><th>Tipo de via</th><th class="r">Distância (km)</th><th></th></tr></thead><tbody>${rt.segments.map((g) => `<tr><td>${esc(g.description || '')}</td><td><select data-ch="mobSeg" data-r="${rt.id}" data-g="${g.id}" data-k="type">${SEGS.map(([k, t]) => `<option value="${k}"${k === g.type ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></td><td class="r"><input class="qty sm" data-ch="mobSeg" data-r="${rt.id}" data-g="${g.id}" data-k="distance" value="${n2(g.distance)}"></td><td><button class="lnk sm" data-act="mobSegDel" data-r="${rt.id}" data-g="${g.id}">remover</button></td></tr>`).join('')}</tbody></table></div><button class="btn sm" data-act="mobSegAdd" data-r="${rt.id}">${UI.icon('plus')} Trecho</button></div>`; }).join('')}`;
    if (tab === 'equip') {
      const trs = s.transporters.filter((t) => t.loadUseful > 0);
      return head + `<p class="note">Frota de pico calculada pelas equipes do orçamento ao longo do cronograma. FU = maior entre área e massa do equipamento ÷ área e carga úteis do transportador; equipamentos autopropelidos (FU = 1) seguem rodando; os pequenos não são remunerados. Custo = equipamentos equivalentes × ((TV × CHP + TD × CHI) × k + pedágio × k).${s.equipment.some((e) => e.estimated) ? ' <b>Itens marcados “estimado” não constam das tabelas técnicas do caderno: confira área, massa e transportador.</b>' : ''}</p>
        <div class="tblw"><table class="tbl sm"><thead><tr><th></th><th>Código</th><th>Equipamento</th><th class="r">Qtde</th><th>Porte</th><th>Autoprop.</th><th>Transportador</th><th class="r">FU</th><th class="r">TV (h)</th><th class="r">TD (h)</th><th class="r">CHP</th><th class="r">Custo</th></tr></thead><tbody>${r.equipment.map((x) => { const e = s.equipment.find((y) => y.id === x.id); return `<tr${e.estimated ? ' class="warnrow"' : ''}><td><input type="checkbox" data-ch="mobEq" data-id="${e.id}" data-k="include"${e.include ? ' checked' : ''}></td><td>${esc(x.code)}</td><td>${esc(String(x.description).slice(0, 60))}${e.estimated ? ' <span class="tag sm warn">estimado</span>' : ''}</td><td class="r"><input class="qty sm" style="width:60px" data-ch="mobEq" data-id="${e.id}" data-k="quantity" value="${n2(e.quantity, 0)}"></td>
          <td><select class="sm" data-ch="mobEq" data-id="${e.id}" data-k="sizeOverride">${[['auto', 'auto'], ['small', 'pequeno'], ['mixed', 'misto'], ['large', 'grande']].map(([k, t]) => `<option value="${k}"${(e.sizeOverride || 'auto') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></td><td><input type="checkbox" data-ch="mobEq" data-id="${e.id}" data-k="autoLong"${e.autoLong ? ' checked' : ''}></td>
          <td>${e.autoLong ? '<span class="muted">próprio</span>' : `<select class="sm" data-ch="mobEq" data-id="${e.id}" data-k="transporterCode">${trs.map((t) => `<option value="${t.code}"${t.code === e.transporterCode ? ' selected' : ''}>${esc(t.code + ' · ' + String(t.description).slice(0, 34))}</option>`).join('')}</select>`}</td>
          <td class="r">${n2(x.fu, 3)}</td><td class="r">${n2(x.route.time)}</td><td class="r">${n2(x.td)}</td><td class="r">${n2(x.chp)}</td><td class="r">${money(x.cost)}</td></tr>`; }).join('')}</tbody><tfoot><tr><td colspan="11">Equipamentos</td><td class="r"><b>${money(r.equipmentTotal)}</b></td></tr></tfoot></table></div>`;
    }
    if (tab === 'mo') {
      const w = s.workforce;
      return head + `<p class="note">Efetivo transportado pela regra do Volume 08: profissionais das parcelas fixa e vinculada + ${n2(w.variablePct, 0)}% da variável no pico + ${n2(w.ordinaryPct, 0)}% da mão de obra ordinária no pico, menos a mão de obra local. Valores importados da Administração Local e do histograma do cronograma.</p>
        <div class="pform">${[['Fixa + vinculada (NPFV)', 'npfv'], ['Variável no pico (NPV)', 'npvPeak'], ['Ordinária no pico (NMO)', 'nmoPeak'], ['% da variável', 'variablePct'], ['% da ordinária', 'ordinaryPct'], ['Contratados localmente', 'localCount']].map(([l, k]) => `<label class="fld"><span>${l}</span><input class="qty" data-ch="mobW" data-k="${k}" value="${n2(w[k], 0)}"></label>`).join('')}</div>
        <div class="tblw"><table class="tbl sm"><thead><tr><th>Grupo</th><th class="r">Pessoas</th><th>Transportador</th><th class="r">Capacidade</th><th class="r">Veículos</th><th class="r">TV (h)</th><th class="r">CHP</th><th class="r">Custo</th></tr></thead><tbody>${r.labor.map((x) => { const g = w.groups.find((y) => y.id === x.id); return `<tr><td>${esc(x.description)}</td><td class="r"><input class="qty sm" style="width:64px" data-ch="mobG" data-id="${g.id}" data-k="people" value="${n2(g.people, 0)}"></td><td>${esc(x.transporterCode)}</td><td class="r">${n2(x.capacity, 0)}</td><td class="r">${n2(x.operationalVehicles, 0)}</td><td class="r">${n2(x.route.time)}</td><td class="r">${n2(x.chp)}</td><td class="r">${money(x.cost)}</td></tr>`; }).join('')}</tbody><tfoot><tr><td colspan="7">Mão de obra</td><td class="r"><b>${money(r.laborTotal)}</b></td></tr></tfoot></table></div>`;
    }
    const errs = v.filter((x) => x.severity === 'error'), warns = v.filter((x) => x.severity !== 'error');
    return head + `<div class="cards"><div class="card hl"><small>Mobilização + desmobilização</small><b>${money(r.direct)}</b><span class="muted">${st.applied ? 'aplicada ao orçamento em ' + new Date(st.applied.at).toLocaleDateString('pt-BR') + (Math.abs(st.applied.total - r2(r.direct)) > .005 ? ' — <b>desatualizada</b>' : '') : 'ainda não aplicada ao orçamento'}</span></div>
      <div class="card"><small>Equipamentos</small><b>${money(r.equipmentTotal)}</b><span class="muted">${U.int(r.equipment.filter((x) => x.cost > 0).length)} remunerados</span></div><div class="card"><small>Mão de obra</small><b>${money(r.laborTotal)}</b><span class="muted">${U.int(U.sum(r.labor, (x) => x.quantity))} pessoas</span></div><div class="card"><small>Preço com BDI (${U.pct(pj.bdi, 2)})</small><b>${money(r.direct * (1 + pj.bdi))}</b><span class="muted">${n2(MB.routeMetrics(s, s.routes[0].id, 'truck').distance)} km de rota principal</span></div></div>
      ${errs.length ? `<div class="alertbox"><b>${errs.length} erro(s):</b> ${errs.map((x) => esc(x.title + ': ' + x.message)).join(' · ')}</div>` : ''}${warns.length ? `<p class="note">${warns.slice(0, 6).map((x) => esc(x.title + ': ' + x.message)).join(' · ')}</p>` : ''}
      <p class="note">Integração: a frota vem das equipes SICRO dos serviços do orçamento (máximo simultâneo no cronograma) e o efetivo, da Administração Local. CHP e CHI dos transportadores e equipamentos autopropelidos vêm da base ${esc(A.base.ufs[0] + ' ' + A.base.raw.ref)} (${A.pj.rg === 'CD' ? 'com' : 'sem'} desoneração). k = 2 (ida na mobilização e volta na desmobilização).</p>`;
  }
  UI.views.mob = { render: mobView };
  UI.act.mobTab = (el) => { MB.state(A.pj).tab = el.dataset.t; UI.render(); };
  UI.act.mobSync = () => { MB.sync(A.pj, UI.model()); UI.commit(); UI.toast('Frota e efetivo importados do orçamento, do cronograma e da Administração Local.'); };
  UI.act.mobApply = () => { const r = MB.apply(A.pj, UI.model()); UI.commit(); UI.toast('Mobilização aplicada ao orçamento: ' + money(r.direct)); };
  const numIn = (el) => { const v = U.parseNum(el.value); if (!Number.isFinite(v) || v < 0) { UI.toast('Valor inválido', 'warn'); return null; } return v; };
  UI.chg.mobSeg = (el) => { const s = MB.state(A.pj).s, g = s.routes.find((x) => x.id === el.dataset.r)?.segments.find((x) => x.id === el.dataset.g); if (!g) return; if (el.dataset.k === 'type') g.type = el.value; else { const v = numIn(el); if (v == null) return; g.distance = v; } UI.commit(); };
  UI.act.mobSegAdd = (el) => { const rt = MB.state(A.pj).s.routes.find((x) => x.id === el.dataset.r); if (rt) rt.segments.push({ id: MB.id('seg'), type: 'road_paved', distance: 0, customSpeed: 0, description: 'Novo trecho' }); UI.commit(); };
  UI.act.mobSegDel = (el) => { const rt = MB.state(A.pj).s.routes.find((x) => x.id === el.dataset.r); if (rt && rt.segments.length > 1) rt.segments = rt.segments.filter((x) => x.id !== el.dataset.g); UI.commit(); };
  UI.chg.mobEq = (el) => { const e = MB.state(A.pj).s.equipment.find((x) => x.id === el.dataset.id); if (!e) return; const k = el.dataset.k; if (el.type === 'checkbox') e[k] = el.checked; else if (k === 'quantity') { const v = numIn(el); if (v == null) return; e[k] = v; } else e[k] = el.value; if (k === 'autoLong') { e.transporterCode = e.autoLong ? e.code : pickTransporter(MB.TECH_BY_CODE.get(e.code)); e.manualFu = e.autoLong ? null : e.manualFu; } UI.commit(); };
  UI.chg.mobW = (el) => { const v = numIn(el); if (v == null) return; MB.state(A.pj).s.workforce[el.dataset.k] = v; UI.commit(); };
  UI.chg.mobG = (el) => { const g = MB.state(A.pj).s.workforce.groups.find((x) => x.id === el.dataset.id); const v = numIn(el); if (!g || v == null) return; g.people = v; UI.commit(); };

  /* =================== CANTEIRO DE OBRAS =================== */
  CN.state = (pj) => { pj.can = pj.can || {}; if (!pj.can.p) pj.can.p = CN.blankProject(); pj.can.tab = pj.can.tab || 'geral'; return pj.can; };
  CN.sync = (pj, m) => {
    const st = CN.state(pj), p = st.p, a = pj.al && AL.state(pj).params, r = alResult(pj, m);
    p.name = pj.name; p.meta.uf = m.base.ufs[0];
    if (a) { p.work.nature = a.nature === 'restoration' ? 'road_restoration' : a.nature === 'oae' ? 'oae_construction' : a.nature === 'oaeRecovery' ? 'oae_recovery' : a.nature === 'rail' ? 'railway_construction' : 'road_construction'; p.work.extension = a.length; p.work.durationMode = 'direct'; p.work.campMonths = Math.max(1, Math.ceil(a.execMonths - 1e-9)); p.work.contractMonths = a.contractMonths; }
    if (r) Object.assign(p.labor, { method: 'average', ordinaryAverage: (a && a.ordinary) || 0, fixed: r.QF, linked: r.QVi, variableAverage: r2(r.QVaRaw || 0) });
    const ind = []; for (const [type, code] of [['I', '0903804'], ['II', '0903805'], ['III', '0903806'], ['IV', '0903807'], ['VII', '0903810']]) {
      if (!findItems(pj, [code]).length) continue; const old = (p.industrials || []).find((x) => x.type === type); const it = old || CN.newIndustrial(type); const c = m.base.compCost(code, pj.uf, pj.rg);
      it.cdi = c == null ? it.cdi : r2(c / 100); it.cdiSource = 'Composição ' + code + ' — ' + m.base.ufs[0] + ' ' + m.base.raw.ref; ind.push(it);
    }
    p.industrials = ind; st.synced = new Date().toISOString(); return p;
  };
  CN.apply = (pj, m) => {
    const st = CN.state(pj), r = CN.calculate(st.p), total = r.grandTotal != null ? r.grandTotal : r.mainCost;
    OP.analytic.write(pj, Object.assign(OP.analytic.can(pj, r), { code: 'CP-CAN-SICRO', prefix: 'IP-CAN', olds: ['CP-ROD-CAN'], dur: m.T, source: 'Menu Canteiro de Obras — ' + new Date().toLocaleDateString('pt-BR'), desc: 'Canteiro de obras — instalação, manutenção e desmobilização, SICRO (composição analítica gerada pelo menu Canteiro de Obras)', notes: 'Áreas equivalentes do canteiro e canteiros das instalações industriais, pelas premissas da calculadora.' }));
    st.applied = { total: r2(total), at: new Date().toISOString() };
    if (pj.al) { const a = AL.state(pj).params; a.covered = r2(r.ac); a.uncovered = r2(r.ad); if (pj.al.applied) AL.apply(pj, m, AL.result(pj, m)); }
    return r;
  };
  CN.initExample = (pj, m) => { const st = CN.state(pj); Object.assign(st.p.work, { supplierDistance: 45, pavement: 'paved', cmcc: 1939.08, constructionPattern: 'provisional' }); CN.sync(pj, m); CN.apply(pj, m); };
  function canView() {
    const pj = A.pj, m = UI.model(), st = CN.state(pj), p = st.p; let r;
    try { r = CN.calculate(p); } catch (e) { return `<div class="alertbox">Não foi possível calcular: ${esc(e.message)}</div>`; }
    const total = r.grandTotal != null ? r.grandTotal : r.mainCost, tab = st.tab, w = p.work;
    const head = `<div class="vh"><div><h1>Canteiro de Obras</h1><p class="muted">Manual de Custos do SICRO — canteiro, acampamento e instalações industriais · ${esc(CN.natureLabel(w.nature))} · ${esc(CN.porteLabel(r.classification.porte))} · custo ${money(total)} · <b>sincronizada automaticamente com o cronograma</b>${A.pj.sync && A.pj.sync.at ? ' (' + new Date(A.pj.sync.at).toLocaleTimeString('pt-BR') + ')' : ''}</p></div>
      <div class="row"><button class="btn" data-act="canSync">${UI.icon('gantt')} Importar do orçamento e da AL</button><button class="btn pri" data-act="canApply">${UI.icon('ok')} Aplicar ao orçamento</button></div></div>${tabsBar(tab, [['geral', 'Visão geral'], ['dados', 'Dados'], ['areas', 'Áreas'], ['ind', 'Instalações industriais'], ['conf', 'Conferência']], 'canTab')}`;
    if (tab === 'conf') return head + testsHTML(CN._t || (CN._t = CN.selfTests()), 'exemplo oficial do caderno (rodovia de 50 km, OAE complementar e três instalações industriais)');
    if (tab === 'dados') {
      const fld = (l, k, v, o = '') => `<label class="fld"><span>${l}</span><input class="qty" data-ch="canW" data-k="${k}" value="${v == null ? '' : n2(+v)}" ${o}></label>`;
      return head + `<p class="note">Natureza, extensão, prazos e efetivo vêm da Administração Local (que por sua vez usa o orçamento e o cronograma). O CMCC (custo médio de construção civil por m²) deve ser o da UF e do mês de referência — o exemplo usa o valor do caderno (SP, jul/2023), a atualizar.</p>
        <div class="panel"><h3>Obra</h3><div class="pform"><label class="fld"><span>Natureza</span><select data-ch="canSel" data-k="nature">${['road_construction', 'road_restoration', 'oae_construction', 'oae_recovery', 'railway_construction'].map((k) => `<option value="${k}"${k === w.nature ? ' selected' : ''}>${esc(CN.natureLabel(k))}</option>`).join('')}</select></label>${fld('Extensão (km; OAE em m)', 'extension', w.extension)}${fld('Prazo do canteiro (meses)', 'campMonths', w.campMonths)}${fld('Prazo contratual (meses)', 'contractMonths', w.contractMonths)}${fld('CMCC (R$/m²)', 'cmcc', w.cmcc)}${fld('Distância ao fornecedor (km)', 'supplierDistance', w.supplierDistance)}
        <label class="fld"><span>Acesso</span><select data-ch="canSel" data-k="pavement">${[['paved', 'Pavimentado'], ['natural', 'Não pavimentado']].map(([k, t]) => `<option value="${k}"${k === w.pavement ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div></div>
        <div class="panel"><h3>Efetivo (média mensal)</h3><div class="pform">${[['Mão de obra ordinária média', 'ordinaryAverage'], ['Parcela fixa (NPF)', 'fixed'], ['Parcela vinculada', 'linked'], ['Parcela variável média', 'variableAverage']].map(([l, k]) => `<label class="fld"><span>${l}</span><input class="qty" data-ch="canL" data-k="${k}" value="${n2(p.labor[k])}"></label>`).join('')}
        <label class="fld"><span>NMO / NPV / NFA / NMAX</span><b>${r.labor.nmo} / ${r.labor.npv} / ${r.labor.nfa} / ${r.labor.nmax}</b><small class="muted">${esc(r.labor.methodNote)}</small></label></div></div>`;
    }
    if (tab === 'areas') return head + `<p class="note">Áreas pelas equações do manual em função do efetivo (escritório, alojamento, refeitório, ambulatório etc.), com fator de equivalência (FEAC) e fatores K1, K2, K3 e RCT. Área coberta AC = ${n2(r.ac)} m² · equivalente ${n2(r.eq)} m² · área total AT = ${n2(r.at)} m² · área descoberta AD = ${n2(r.ad)} m².</p>
      <div class="tblw"><table class="tbl sm"><thead><tr><th>Área</th><th>Fórmula</th><th class="r">Referência (m²)</th><th class="r">Adotada (m²)</th><th class="r">FEAC</th><th class="r">Equivalente (m²)</th><th>Fonte</th></tr></thead><tbody>${(r.rows || []).map((x) => `<tr><td>${esc(x.label)}</td><td><small>${esc(x.formula || '')}</small></td><td class="r">${n2(x.baseValue)}</td><td class="r">${n2(x.adopted)}</td><td class="r">${n2(x.feac)}</td><td class="r">${n2(x.equivalent)}</td><td><small class="muted">${esc(x.source || '')}</small></td></tr>`).join('')}</tbody></table></div>
      <div class="cards"><div class="card"><small>Custo da área coberta</small><b>${money(r.coveredCost)}</b></div><div class="card"><small>Custo da área descoberta</small><b>${money(r.uncoveredCost)}</b></div><div class="card"><small>Canteiro principal (CCOP)</small><b>${money(r.baseCost)}</b></div></div>`;
    if (tab === 'ind') return head + `<p class="note">Instalações industriais identificadas no orçamento pelas composições de instalação (central de concreto, britagem, usinas). O custo direto de instalação (CDI) vem da composição SICRO correspondente na base ativa.</p>${(r.industrials || []).length ? `<div class="tblw"><table class="tbl sm"><thead><tr><th>Tipo</th><th>Composição</th><th class="r">CDI</th><th class="r">Área equivalente (m²)</th><th class="r">Custo do canteiro industrial</th></tr></thead><tbody>${r.industrials.map((x) => `<tr><td>${esc(x.def.label)}</td><td>${esc(x.def.composition)}</td><td class="r">${money(x.cdi || (p.industrials.find((y) => y.id === x.id) || {}).cdi || 0)}</td><td class="r">${n2(x.eq)}</td><td class="r">${money(x.total)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhuma instalação industrial no orçamento.</div>'}`;
    return head + `<div class="cards"><div class="card hl"><small>Custo do canteiro</small><b>${money(total)}</b><span class="muted">${st.applied ? 'aplicado ao orçamento em ' + new Date(st.applied.at).toLocaleDateString('pt-BR') + (Math.abs(st.applied.total - r2(total)) > .005 ? ' — <b>desatualizado</b>' : '') : 'ainda não aplicado ao orçamento'}</span></div>
      <div class="card"><small>Área coberta (AC)</small><b>${n2(r.ac)} m²</b><span class="muted">equivalente ${n2(r.eq)} m² · CAC na AL</span></div><div class="card"><small>Área descoberta (AD)</small><b>${n2(r.ad)} m²</b><span class="muted">total ${n2(r.at)} m² · CAD na AL</span></div><div class="card"><small>Instalações industriais</small><b>${money(r.cii || 0)}</b><span class="muted">${(r.industrials || []).length} instalação(ões)</span></div></div>
      ${(r.warnings || []).length ? `<p class="note">${r.warnings.slice(0, 6).map((x) => esc(typeof x === 'string' ? x : x.message || x.text || '')).join(' · ')}</p>` : ''}
      <p class="note">Integração: efetivo e prazos vêm da Administração Local; as instalações industriais, das composições de instalação do orçamento. Ao aplicar, o custo grava a composição própria CP-CAN-SICRO e as áreas coberta e descoberta passam à Administração Local (manutenção do canteiro, CAC e CAD), que é recalculada se já estiver aplicada.</p>`;
  }
  UI.views.can = { render: canView };
  UI.act.canTab = (el) => { CN.state(A.pj).tab = el.dataset.t; UI.render(); };
  UI.act.canSync = () => { CN.sync(A.pj, UI.model()); UI.commit(); UI.toast('Dados importados do orçamento e da Administração Local.'); };
  UI.act.canApply = () => { const m = UI.model(), r = CN.apply(A.pj, m); UI.commit(); UI.toast('Canteiro aplicado ao orçamento: ' + money(r.grandTotal != null ? r.grandTotal : r.mainCost)); };
  UI.chg.canW = (el) => { const v = numIn(el); if (v == null) return; CN.state(A.pj).p.work[el.dataset.k] = v; UI.commit(); };
  UI.chg.canSel = (el) => { CN.state(A.pj).p.work[el.dataset.k] = el.value; UI.commit(); };
  UI.chg.canL = (el) => { const v = numIn(el); if (v == null) return; CN.state(A.pj).p.labor[el.dataset.k] = v; UI.commit(); };
})(typeof window !== 'undefined' ? window : globalThis);

