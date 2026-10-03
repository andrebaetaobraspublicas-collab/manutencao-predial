/* ==== 42_ui_al.js — menu Administração Local (integração com orçamento e cronograma) ==== */
(function (G) {
  'use strict';
  const OP = G.OP, U = OP.util, UI = OP.ui, A = OP.app, AL = OP.al, esc = U.esc;
  const PARCELS = ['Fixa', 'Fixa complementar', 'Vinculada', 'Vinculada complementar', 'Variável', 'Manutenção', 'Custos diversos', 'Complementos próprios'];
  const CODE = 'CP-AL-SICRO';
  const r2 = (v) => Math.round(v * 100) / 100;
  const DEF = () => Object.assign({}, AL.SEED.example.params, { nature: 'construction', length: 1, roundMode: 'full', costBasis: 'catalog', complement: false, oaeLength: 0, oaeMonths: 0, covered: 960, uncovered: 1800, ordinary: 40, bdi: 0 });
  AL.state = (pj) => { const s = (pj.al = pj.al || {}); s.params = s.params || {}; const d = DEF(); for (const k of Object.keys(d)) if (s.params[k] === undefined) s.params[k] = d[k]; s.rules = s.rules || {}; s.teamEdits = s.teamEdits || {}; s.rates = s.rates || {}; s.extras = s.extras || []; s.tab = s.tab || 'geral'; return s; };
  /* etapa de nível superior de cada item do orçamento */
  const tops = (pj) => { const m = new Map(); const walk = (n, top) => { for (const c of n.children || []) { if (c.kind === 'stage') walk(c, top || c.name); else m.set(c.id, top || ''); } }; walk(pj.root, ''); return m; };
  const alStage = (top, code) => {
    const n = U.norm(top), cc = String(code);
    if (/TERRAPLEN/.test(n)) return 'Terraplenagem';
    if (/ARTE ESPECIA|PONTE|VIADUTO|\bOAE\b/.test(n)) return 'Obras de arte especiais';
    if (/DRENAGEM|ARTE CORRENT/.test(n)) return /^(07|08|68)/.test(cc) ? 'Obras de arte correntes' : 'Drenagem';
    if (/PAVIMENT|BETUMIN|ASFALT/.test(n)) return 'Pavimentação';
    if (/SINALIZ/.test(n)) return 'Sinalização';
    if (/AMBIENT/.test(n) && /^44/.test(cc)) return 'Proteção ambiental';
    if (/COMPLEMENTAR|AMBIENT/.test(n)) return 'Obras complementares';
    if (/FERROV/.test(n)) return 'Superestrutura ferroviária';
    if (/CONTEN/.test(n)) return 'Outros serviços';
    return AL.stageGuess({ code: cc, name: '', stage: '' });
  };
  /* projeto no formato do motor: serviços = itens SICRO do orçamento */
  AL.build = (pj, m) => {
    const s = AL.state(pj), b = m.base, tp = tops(pj), items = [];
    for (const r of m.items) {
      const code = String(r.node.code); if (!/^\d{7}$/.test(code) || !(r.qty > 0)) continue;
      const j = b.compIdx.get(code); if (j == null) continue;
      const c = { code, name: b.raw.comp.d[j], unit: b.unit(j), prod: b.raw.comp.P[j] }, ov = s.rules[r.id] || {};
      const stage = ov.stage || alStage(tp.get(r.id) || '', code), auto = AL.ruleFor(c, stage);
      items.push(Object.assign({ id: r.id, num: r.num, code, name: c.name, unit: c.unit, qty: r.qty, stage, enabled: true }, auto, ov, { stage, auto }));
    }
    return { name: pj.name, location: s.location || '', params: Object.assign({}, s.params, { bdi: +(pj.bdi * 100).toFixed(4) }), items, teamEdits: s.teamEdits, rates: s.rates, extras: s.extras, overrides: {}, quotes: {} };
  };
  const months = (d1, d2) => r2(((d2 - d1) / 864e5 + 1) / 30.4375);
  /* prazos de cada parcela e mão de obra média a partir do cronograma (CPM) */
  AL.syncSchedule = (pj, m) => {
    const s = AL.state(pj), a = s.params, p = AL.build(pj, m), byId = new Map(m.items.map((r) => [r.id, r]));
    const span = (pred) => { let s0 = null, e0 = null; for (const it of p.items) { if (!pred(it)) continue; const r = byId.get(it.id); if (!r || !r.start || !r.end) continue; if (!s0 || r.start < s0) s0 = r.start; if (!e0 || r.end > e0) e0 = r.end; } return s0 ? months(s0, e0) : 0; };
    a.execMonths = months(m.start, m.end); a.contractMonths = Math.ceil(a.execMonths) + 3; a.fixedMonths = Math.max(0, r2(a.execMonths - 1));
    a.earthMonths = span((it) => it.stage === 'Terraplenagem'); a.paveMonths = span((it) => it.stage === 'Pavimentação');
    a.topoMonths = a.frontMonths = a.maintenanceMonths = a.safetyMonths = a.fixedMonths;
    a.forestMonths = span((it) => it.forest); a.soilMonths = span((it) => it.labMode !== 'none' && it.lab === 'soil');
    a.asphaltMonths = span((it) => it.labMode !== 'none' && it.lab === 'asphalt'); a.concreteMonths = span((it) => it.labMode !== 'none' && it.lab === 'concrete');
    a.oaeMonths = span((it) => it.stage === 'Obras de arte especiais'); a.dailyHours = +pj.calendar.hpd || 8.8;
    let hours = 0; for (const r of m.items) { if (!r.comp || !(r.qty > 0) || !/^\d{7}$/.test(String(r.node.code))) continue; const res = m.base.resources(r.node.code); for (const x of res.direct.concat(res.support)) if (x.kind === 'mo' && !x.monthly) hours += x.h * r.qty; }
    a.ordinary = m.T > 0 ? Math.max(1, Math.round(hours / (m.T * a.dailyHours))) : a.ordinary;
    s.synced = new Date().toISOString(); return a;
  };
  AL.result = (pj, m) => AL.calculate(AL.build(pj, m));
  /* grava o custo calculado como composição própria e no item de administração local do orçamento */
  AL.apply = (pj, m, r) => {
    const x = OP.analytic.al(pj, r);
    OP.analytic.write(pj, Object.assign(x, { code: CODE, prefix: 'IP-AL', olds: ['CP-ROD-ADM'], dur: m.T || 1, source: 'Menu Administração Local — ' + new Date().toLocaleDateString('pt-BR'),
      desc: 'Administração local — SICRO, Manual de Custos de Infraestrutura de Transportes, vol. 07 (composição analítica gerada pelo menu Administração Local)',
      notes: 'Profissionais em meses, veículos em horas produtivas e improdutivas e custos diversos, pelas premissas da calculadora.' }));
    pj.al.applied = { total: r.total, at: new Date().toISOString() };
  };
  /* exemplo da rodovia: AL calculada a partir do orçamento e do cronograma */
  AL.initExample = (pj, m) => {
    const s = AL.state(pj); Object.assign(s.params, { nature: 'construction', length: 6, complement: false, oaeLength: 40, covered: 960, uncovered: 1800, housing: true, costBasis: 'catalog', roundMode: 'full', risk: 4, peakMode: 'estimate', miscMode: 'percent', miscPct: 5 });
    s.location = 'São Paulo (SP)';
    const ids = (code) => { const out = []; const walk = (n) => { for (const c of n.children || []) { if (c.kind === 'stage') walk(c); else if (String(c.code) === code) out.push(c.id); } }; walk(pj.root); return out; };
    for (const id of ids('4011227')) s.rules[id] = { frontMode: 'prod', frontFactor: 1, labMode: 'capacity', lab: 'soil', labParam: 14600, review: false, ruleSource: 'Manual, Tabela 33 — sub-base de solo sem mistura (enquadramento do exemplo)' };
    for (const id of ids('5914622')) s.rules[id] = { frontMode: 'none', labMode: 'none', review: false, ruleSource: 'Transporte de material betuminoso: sem frente nem laboratório (enquadramento do exemplo)' };
    for (const id of ids('1207711')) s.rules[id] = { labMode: 'capacity', lab: 'concrete', labParam: 1000, review: false, ruleSource: 'Manual, Tabela 43 — concreto de central (enquadramento do exemplo)' };
    AL.syncSchedule(pj, m); AL.apply(pj, m, AL.result(pj, m));
    if (pj.memos) delete pj.memos.adm;
  };

  /* ---------------- interface ---------------- */
  const money = (v) => U.brl(v), n2 = (v, d = 2) => U.num(v, d);
  const tabs = [['geral', 'Visão geral'], ['dados', 'Dados e prazos'], ['servicos', 'Serviços e dimensionamento'], ['equipes', 'Equipes e preços'], ['orcamento', 'Orçamento da AL'], ['conferencia', 'Conferência']];
  const num = (label, k, v, help, d = 2) => `<label class="fld"><span>${label}</span><input class="qty" data-ch="alParam" data-k="${k}" inputmode="decimal" value="${Number.isFinite(+v) ? U.num(+v, d) : ''}">${help ? `<small class="muted">${help}</small>` : ''}</label>`;
  const sel = (label, k, v, opts, help) => `<label class="fld"><span>${label}</span><select data-ch="alParam" data-k="${k}">${opts.map(([x, t]) => `<option value="${esc(x)}"${String(x) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>${help ? `<small class="muted">${help}</small>` : ''}</label>`;
  const notices = (r) => (r.issues.length ? `<div class="alertbox"><b>${r.issues.length} ponto(s) para revisão.</b> ${r.issues.slice(0, 6).map(esc).join(' · ')}</div>` : '') + (r.warnings.length ? `<p class="note">${r.warnings.map(esc).join(' ')}</p>` : '');
  function geral(pj, m, r) {
    const s = pj.al, dir = m.tot.direct / 100, max = Math.max(...Object.values(r.parcels), 1);
    const app = s.applied ? `aplicada ao orçamento em ${new Date(s.applied.at).toLocaleDateString('pt-BR')} (${money(s.applied.total)})${Math.abs(s.applied.total - r.total) > 0.005 ? ' — <b>desatualizada</b>' : ''}` : 'ainda não aplicada ao orçamento';
    return `<div class="cards"><div class="card hl"><small>Custo da administração local</small><b>${money(r.total)}</b><span class="muted">${app}</span></div>
      <div class="card"><small>Participação no custo direto da obra</small><b>${dir ? U.pct(r.total / dir, 2) : '—'}</b><span class="muted">custo direto atual ${money(dir)}</span></div>
      <div class="card"><small>Preço com BDI (${U.pct(pj.bdi, 2)})</small><b>${money(r.price)}</b><span class="muted">BDI ${money(r.bdiValue)}</span></div>
      <div class="card"><small>Porte · pico de profissionais</small><b>${esc(r.size.label)} · ${U.int(r.QM)}</b><span class="muted">${n2(r.size.rate)} ${['oae', 'oaeRecovery'].includes(s.params.nature) ? 'm' : 'km'}/ano · fixa ${r.QF} · vinculada ${r.QVi} · variável ${r.QVa}</span></div></div>
      ${notices(r)}
      <div class="panel"><h3>Formação do custo por parcela</h3>${PARCELS.filter((k) => r.parcels[k]).map((k) => `<div style="display:grid;grid-template-columns:200px 1fr 150px;gap:10px;align-items:center;margin:6px 0"><span>${k}</span><div style="height:12px;background:var(--line,#e5e7eb);border-radius:6px;overflow:hidden"><i style="display:block;height:100%;width:${(100 * r.parcels[k] / max).toFixed(1)}%;background:var(--acc,#FFC21A)"></i></div><b class="r">${money(r.parcels[k])}</b></div>`).join('')}
      <p class="note">Metodologia do Manual de Custos de Infraestrutura de Transportes, Volume 07 (Administração Local): parcela fixa dimensionada pelo porte, parcelas vinculadas às fases de produção, parcela variável pelas frentes de serviço e laboratórios (equações 4 a 16), manutenção do canteiro (CAC/CAD) e custos diversos. Preços: ${esc(r.groups[0]?.details?.[0]?.rate?.source || 'base ativa')}.</p></div>
      <div class="row"><button class="btn" data-act="alSync">${UI.icon('gantt')} Importar prazos do cronograma</button><button class="btn pri" data-act="alApply">${UI.icon('ok')} Aplicar ao orçamento</button></div>`;
  }
  function dados(pj, m, r) {
    const a = pj.al.params, N = Object.entries(AL.NATURES);
    return `<p class="note">Os prazos podem ser importados do cronograma (CPM): execução, fixa (execução − 1 mês de mobilização/desmobilização), fases de terraplenagem, pavimentação e OAE, laboratórios e manejo florestal pelos serviços que os demandam, e mão de obra ordinária média pelo histograma de horas. Última importação: ${pj.al.synced ? new Date(pj.al.synced).toLocaleString('pt-BR') : 'nunca'}.</p>
      <div class="panel"><h3>Natureza e porte</h3><div class="pform">${sel('Natureza do empreendimento', 'nature', a.nature, N)}${num('Extensão principal (km; OAE em m)', 'length', a.length)}${num('Prazo contratual (meses)', 'contractMonths', a.contractMonths)}${num('Prazo de execução (meses)', 'execMonths', a.execMonths)}${num('Faixas (km) — conservação', 'laneKm', a.laneKm)}
        <label class="fld"><span>Enquadramento</span><b>${esc(r.size.label)}</b><small class="muted">${n2(r.size.rate)} por ano${r.size.limits ? ' · limites ' + r.size.limits.join(' / ') : ''}</small></label>
        ${sel('Complementação de OAE (seção 2.1.7)', 'complement', a.complement ? '1' : '0', [['0', 'Não'], ['1', 'Sim']])}${num('Extensão da OAE (m)', 'oaeLength', a.oaeLength)}${num('Prazo da OAE (meses)', 'oaeMonths', a.oaeMonths)}</div></div>
      <div class="panel"><h3>Períodos de atuação (meses)</h3><div class="pform">${[['Fixa principal', 'fixedMonths'], ['Produção de terraplenagem', 'earthMonths'], ['Produção de pavimentação', 'paveMonths'], ['Topografia', 'topoMonths'], ['Frentes de serviço', 'frontMonths'], ['Laboratório de solos', 'soilMonths'], ['Laboratório de asfaltos', 'asphaltMonths'], ['Laboratório de concreto', 'concreteMonths'], ['Manejo florestal', 'forestMonths'], ['Manutenção do canteiro', 'maintenanceMonths'], ['Segurança do trabalho', 'safetyMonths']].map(([l, k]) => num(l, k, a[k])).join('')}</div></div>
      <div class="panel"><h3>Canteiro, efetivo e jornada</h3><div class="pform">${num('Área coberta do canteiro (m²)', 'covered', a.covered, 'CAC = área ÷ ' + n2(AL.AREA_REFS.covered))}${num('Área descoberta, sem indústrias (m²)', 'uncovered', a.uncovered, 'CAD = área ÷ ' + n2(AL.AREA_REFS.uncovered))}${num('Mão de obra ordinária média (pessoas)', 'ordinary', a.ordinary, 'do histograma do cronograma', 0)}
        ${sel('Pico de profissionais', 'peakMode', a.peakMode, [['estimate', 'Estimado (equação do manual)'], ['informed', 'Informado (histograma)']])}${num('Profissionais no pico (informado)', 'peakInput', a.peakInput, '', 0)}${sel('Grau de risco (NR-4)', 'risk', a.risk, [['3', 'Grau 3'], ['4', 'Grau 4']])}
        ${num('Jornada diária (h)', 'dailyHours', a.dailyHours)}${num('Horas trabalháveis / mês', 'hours', a.hours)}${num('Horas operativas / mês (veículos)', 'hop', a.hop)}${num('Horas improdutivas / mês (veículos)', 'hip', a.hip)}${sel('Alojamento no canteiro', 'housing', a.housing ? '1' : '0', [['1', 'Sim'], ['0', 'Não']])}</div></div>
      <div class="panel"><h3>Preços e arredondamentos</h3><div class="pform">${sel('Base de preços da equipe', 'costBasis', a.costBasis, [['catalog', 'Base SICRO ativa (' + esc(A.base.ufs[0] + ' ' + A.base.raw.ref) + ')'], ['book', 'Caderno de aplicação (SICRO SP 07/2023)']])}${sel('Arredondamento', 'roundMode', a.roundMode, [['full', 'Precisão integral'], ['book', 'Demonstrativo do caderno (2 casas)']])}${sel('Custos diversos', 'miscMode', a.miscMode, [['percent', 'Percentual sobre o subtotal'], ['detailed', 'Detalhados']])}${num('Custos diversos (%)', 'miscPct', a.miscPct)}
        <label class="fld"><span>BDI</span><b>${U.pct(pj.bdi, 2)}</b><small class="muted">do orçamento (menu BDI)</small></label></div></div>`;
  }
  const modeSel = (id, k, v, opts) => `<select class="sm" data-ch="alRule" data-id="${esc(id)}" data-k="${k}">${opts.map(([x, t]) => `<option value="${x}"${x === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const parIn = (id, k, v) => `<input class="qty sm" style="width:92px" data-ch="alRule" data-id="${esc(id)}" data-k="${k}" inputmode="decimal" value="${v != null && v !== '' ? U.num(+v, 6, 0) : ''}">`;
  function servicos(pj, m, r, p) {
    const res = new Map(); for (const x of r.v.front) res.set(x.id, { f: x.value }); for (const x of r.v.labs) res.set(x.id, Object.assign(res.get(x.id) || {}, { l: x.value })); for (const x of r.v.forest) res.set(x.id, Object.assign(res.get(x.id) || {}, { fl: x.value }));
    const T = r.v.totals;
    return `<div class="cards">${[['Frentes de serviço', T.front, 'equipe × mês'], ['Laboratório de solos', T.soil, 'equipe × mês'], ['Laboratório de asfaltos', T.asphalt, 'equipe × mês'], ['Laboratório de concreto', T.concrete, 'equipe × mês'], ['Manejo florestal', T.forest, 'técnico × mês']].map(([t, v, u]) => `<div class="card"><small>${t}</small><b>${n2(v)}</b><span class="muted">${u}</span></div>`).join('')}</div>
      <p class="note">Serviços SICRO do orçamento com o enquadramento sugerido pela descrição (regras do aplicativo original, com a fonte de cada coeficiente). Frentes: produção = fator × quantidade ÷ (produção horária × horas/mês) ou coeficiente × quantidade; laboratórios: quantidade ÷ capacidade mensal ou coeficiente × quantidade. Ajuste o que não corresponder ao escopo; a regra automática pode ser restaurada.</p>
      <div class="tblw"><table class="tbl sm"><thead><tr><th>Item</th><th>Código</th><th>Serviço</th><th class="r">Quantidade</th><th>Etapa (AL)</th><th>Frentes</th><th class="r">Fator / coef.</th><th>Laboratório</th><th class="r">Capac. / coef.</th><th>Florestal</th><th class="r">Resultado</th><th></th></tr></thead><tbody>
      ${p.items.map((it) => { const x = res.get(it.id) || {}, ov = pj.al.rules[it.id];
        return `<tr${it.review ? ' class="warnrow"' : ''}><td>${esc(it.num)}</td><td><button class="lnk code" data-act="openComp" data-code="${esc(it.code)}">${esc(it.code)}</button></td><td title="${esc(it.ruleSource || '')}">${esc(it.name.slice(0, 70))}${it.review ? ' <span class="tag sm warn">revisar</span>' : ''}</td><td class="r">${n2(it.qty)} ${esc(it.unit)}</td>
        <td>${modeSel(it.id, 'stage', it.stage, AL.STAGES.map((s0) => [s0, s0]))}</td><td>${modeSel(it.id, 'frontMode', it.frontMode, [['none', '—'], ['prod', 'produção'], ['coef', 'coeficiente']])}</td><td class="r">${it.frontMode === 'coef' ? parIn(it.id, 'frontCoef', it.frontCoef) : it.frontMode === 'prod' ? parIn(it.id, 'frontFactor', it.frontFactor ?? 1) : ''}</td>
        <td>${modeSel(it.id, 'labMode', it.labMode, [['none', '—'], ['capacity', 'capacidade'], ['coef', 'coeficiente']])}${it.labMode !== 'none' ? modeSel(it.id, 'lab', it.lab, Object.entries(AL.LAB_TYPES).map(([k, t]) => [k, t.replace('Laboratório de ', '')])) : ''}</td><td class="r">${it.labMode !== 'none' ? parIn(it.id, 'labParam', it.labParam) : ''}</td>
        <td><input type="checkbox" data-ch="alRule" data-id="${esc(it.id)}" data-k="forest"${it.forest ? ' checked' : ''}></td><td class="r">${[x.f != null ? 'F ' + n2(x.f) : '', x.l != null ? 'L ' + n2(x.l) : '', x.fl != null ? 'M ' + n2(x.fl) : ''].filter(Boolean).join(' · ') || '—'}</td>
        <td>${ov ? `<button class="lnk sm" data-act="alRuleReset" data-id="${esc(it.id)}">automática</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function equipes(pj, m, r) {
    const a = pj.al.params, kindName = { labor: 'Profissional mensalista', vehicle: 'Veículo (CHP × h op. + CHI × h improd.)', productive: 'Equipamento (só horas produtivas)', composition: 'Composição', manual: 'Informado' };
    return `<p class="note">Equipes do Volume 07 com os preços de ${a.costBasis === 'book' ? 'caderno de aplicação (SICRO SP 07/2023)' : 'base SICRO ativa (' + esc(A.base.ufs[0] + ' ' + A.base.raw.ref) + ', ' + (A.pj.rg === 'CD' ? 'com' : 'sem') + ' desoneração)'}. Veículos: ${n2(a.hop)} h operativas e ${n2(a.hip)} h improdutivas por mês. Altere a quantidade de uma equipe somente com justificativa.</p>
      ${r.groups.map((g) => `<div class="panel"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 style="margin:0">${esc(g.name)}</h3><small class="muted">${esc(g.parcel)} · ${esc(g.ref)}</small></div>
        <div class="pform" style="margin:0"><label class="fld"><span>Quantidade (${esc(g.unit)})</span><input class="qty sm" data-ch="alTeamQty" data-g="${esc(g.id)}" inputmode="decimal" value="${U.num(g.qty, 2)}" placeholder="${U.num(g.autoQty, 2)}"><small class="muted">automática: ${U.num(g.autoQty, 2)}</small></label>
        ${g.edited ? `<label class="fld"><span>Justificativa</span><input data-ch="alTeamJust" data-g="${esc(g.id)}" value="${esc(g.justification)}"></label><button class="lnk sm" data-act="alTeamReset" data-g="${esc(g.id)}">restaurar</button>` : ''}</div></div>
        <div class="tblw"><table class="tbl sm"><thead><tr><th>Código</th><th>Recurso</th><th>Tipo</th><th class="r">Quant.</th><th class="r">Preço unitário</th><th class="r">Custo mensal</th><th>Fonte do preço</th></tr></thead><tbody>${g.details.map((x) => `<tr${x.missing ? ' class="warnrow"' : ''}><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${kindName[x.kind] || esc(x.kind)}</td><td class="r">${U.num(x.q, 4, 0)}</td><td class="r">${x.missing ? '<span class="tag sm warn">sem preço</span>' : n2(x.unitRate)}</td><td class="r">${n2(x.cost)}</td><td><small class="muted">${esc(x.rate?.source || '')}</small></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="5">Custo unitário da equipe × ${U.num(g.qty, 2)} ${esc(g.unit)}</td><td class="r"><b>${n2(g.costUnit)}</b></td><td class="r"><b>${money(g.total)}</b></td></tr></tfoot></table></div></div>`).join('')}`;
  }
  function orcamento(pj, m, r) {
    const rows = []; for (const k of PARCELS) { const gs = r.groups.filter((g) => g.parcel === k && g.qty > 0); if (!gs.length) continue; rows.push(`<tr class="stage"><td colspan="5"><b>${k}</b></td><td class="r"><b>${money(U.sum(gs, (g) => g.total))}</b></td></tr>`); for (const g of gs) rows.push(`<tr><td>${esc(g.name)}</td><td>${esc(g.unit)}</td><td class="r">${U.num(g.qty, 2)}</td><td class="r">${n2(g.costUnit)}</td><td><small class="muted">${esc(g.ref)}</small></td><td class="r">${money(g.total)}</td></tr>`); }
    return `<div class="tblw"><table class="tbl"><thead><tr><th>Equipe</th><th>Unid.</th><th class="r">Quantidade</th><th class="r">Custo unitário</th><th>Referência</th><th class="r">Total</th></tr></thead><tbody>${rows.join('')}
      <tr><td colspan="5">Subtotal</td><td class="r">${money(r.subtotal)}</td></tr><tr><td colspan="5">Custos diversos (${pj.al.params.miscMode === 'percent' ? U.num(pj.al.params.miscPct, 2) + '% do subtotal' : 'detalhados'})</td><td class="r">${money(r.misc)}</td></tr>
      <tr class="stage"><td colspan="5"><b>Custo da administração local</b></td><td class="r"><b>${money(r.total)}</b></td></tr><tr><td colspan="5">BDI (${U.pct(pj.bdi, 2)})</td><td class="r">${money(r.bdiValue)}</td></tr><tr><td colspan="5"><b>Preço</b></td><td class="r"><b>${money(r.price)}</b></td></tr></tbody></table></div>
      <div class="row"><button class="btn" data-act="alCsv">${UI.icon('dl')} CSV da administração local</button><button class="btn pri" data-act="alApply">${UI.icon('ok')} Aplicar ao orçamento</button></div>
      <p class="note">“Aplicar ao orçamento” grava o custo como a composição própria ${CODE} (quantidade 1) no item de administração local, mantendo sua duração no cronograma. Recalcule e aplique de novo se o orçamento ou o cronograma mudarem.</p>`;
  }
  function conferencia() {
    const t = AL._tests || (AL._tests = AL.selfTests()), ok = t.filter((x) => x.pass).length;
    return `<div class="cards"><div class="card hl"><small>Autotestes do motor</small><b>${ok} / ${t.length}</b><span class="muted">reprodução do caderno de aplicação do DNIT (construção rodoviária de 50 km + OAE de 180 m)</span></div><div class="card"><small>Total de referência do caderno</small><b>${money(AL.SEED.referenceTotal)}</b><span class="muted">SICRO SP 07/2023 · arredondamento demonstrativo</span></div></div>
      <div class="tblw"><table class="tbl sm"><thead><tr><th>Verificação</th><th>Resultado</th></tr></thead><tbody>${t.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.pass ? '<b class="ok">aprovado</b>' : '<b class="bad">falhou</b> ' + esc(x.detail || '')}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">Fontes: ${esc(AL.SEED.manuals.guide.name)} e ${esc(AL.SEED.manuals.book.name)} (DNIT). <button class="lnk" data-act="alRunTests">Executar novamente</button></p>`;
  }
  UI.views.al = { render: () => {
    const pj = A.pj, m = UI.model(), s = AL.state(pj); let p, r;
    try { p = AL.build(pj, m); r = AL.calculate(p); } catch (e) { return `<div class="vh"><div><h1>Administração Local</h1></div></div><div class="alertbox">Não foi possível calcular: ${esc(e.message)}</div>`; }
    const body = { geral, dados, servicos, equipes, orcamento, conferencia }[s.tab] || geral;
    return `<div class="vh"><div><h1>Administração Local</h1><p class="muted">Manual de Custos de Infraestrutura de Transportes — Volume 07 (SICRO/DNIT) · ${esc(AL.NATURES[s.params.nature] || '')} · ${p.items.length} serviços do orçamento · custo ${money(r.total)} · <b>sincronizada automaticamente com o cronograma</b>${A.pj.sync && A.pj.sync.at ? ' (' + new Date(A.pj.sync.at).toLocaleTimeString('pt-BR') + ')' : ''}</p></div>
      <div class="row"><button class="btn" data-act="alSync">${UI.icon('gantt')} Importar prazos do cronograma</button><button class="btn pri" data-act="alApply">${UI.icon('ok')} Aplicar ao orçamento</button></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${s.tab === k ? 'on' : ''}" data-act="alTab" data-t="${k}">${l}</button>`).join('')}</div>
      ${body(pj, m, r, p)}`;
  } };
  UI.act.alTab = (el) => { AL.state(A.pj).tab = el.dataset.t; UI.render(); };
  UI.chg.alParam = (el) => {
    const a = AL.state(A.pj).params, k = el.dataset.k;
    if (el.tagName === 'SELECT') { const v = el.value; a[k] = ['complement', 'housing'].includes(k) ? v === '1' : k === 'risk' ? +v : v; }
    else { const v = U.parseNum(el.value); if (!Number.isFinite(v) || v < 0) return UI.toast('Valor inválido', 'warn'); a[k] = v; }
    UI.commit();
  };
  UI.chg.alRule = (el) => {
    const s = AL.state(A.pj), id = el.dataset.id, k = el.dataset.k, o = (s.rules[id] = s.rules[id] || {});
    if (el.type === 'checkbox') o[k] = el.checked; else if (['frontCoef', 'frontFactor', 'labParam'].includes(k)) { const v = U.parseNum(el.value); if (!Number.isFinite(v) || v < 0) return UI.toast('Valor inválido', 'warn'); o[k] = v; } else o[k] = el.value;
    UI.commit();
  };
  UI.act.alRuleReset = (el) => { delete AL.state(A.pj).rules[el.dataset.id]; UI.commit(); };
  UI.chg.alTeamQty = (el) => { const s = AL.state(A.pj), v = U.parseNum(el.value); if (!Number.isFinite(v) || v < 0) return UI.toast('Quantidade inválida', 'warn'); const e = (s.teamEdits[el.dataset.g] = s.teamEdits[el.dataset.g] || {}); e.qtyOverride = v; if (!e.justification) e.justification = ''; UI.commit(); UI.toast('Registre a justificativa da alteração da equipe.'); };
  UI.chg.alTeamJust = (el) => { const e = AL.state(A.pj).teamEdits[el.dataset.g]; if (e) { e.justification = el.value.trim(); UI.commit(); } };
  UI.act.alTeamReset = (el) => { delete AL.state(A.pj).teamEdits[el.dataset.g]; UI.commit(); };
  UI.act.alSync = () => { AL.syncSchedule(A.pj, UI.model()); UI.commit(); UI.toast('Prazos e efetivo importados do cronograma.'); };
  UI.act.alApply = () => { const m = UI.model(), r = AL.result(A.pj, m); if (r.issues.length && !confirm(r.issues.length + ' ponto(s) para revisão. Aplicar mesmo assim?')) return; AL.apply(A.pj, m, r); UI.commit(); UI.toast('Administração local aplicada ao orçamento: ' + U.brl(r.total)); };
  UI.act.alRunTests = () => { AL._tests = null; UI.render(); };
  UI.act.alCsv = () => {
    const r = AL.result(A.pj, UI.model()), rows = [['Parcela', 'Equipe', 'Unidade', 'Quantidade', 'Custo unitário', 'Total', 'Referência']];
    for (const g of r.groups) if (g.qty > 0) rows.push([g.parcel, g.name, g.unit, g.qty, g.costUnit, g.total, g.ref]);
    rows.push(['', 'Subtotal', '', '', '', r.subtotal, ''], ['', 'Custos diversos', '', '', '', r.misc, ''], ['', 'Custo da administração local', '', '', '', r.total, ''], ['', 'BDI', '', '', '', r.bdiValue, ''], ['', 'Preço', '', '', '', r.price, '']);
    const csv = '\ufeff' + rows.map((x) => x.map((v) => (typeof v === 'number' ? String(r2(v)).replace('.', ',') : '"' + String(v ?? '').replace(/"/g, '""') + '"')).join(';')).join('\r\n');
    OP.exp.download('administracao_local.csv', csv, 'text/csv;charset=utf-8');
  };
})(typeof window !== 'undefined' ? window : globalThis);

