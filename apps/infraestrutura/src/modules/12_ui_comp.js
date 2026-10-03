/* ==== 12_ui_comp.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 12_ui_comp.js
 * Gaveta da composição: resumo (custo, MO/MAT/EQ, FIC, conferência),
 * analítico nas seções A–F do SICRO, equipe e produção, e editor de
 * composições próprias (CP-xxx) salvas no navegador.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app; const esc = U.esc;
  const D = (OP.drawer = {}); D.tabs = {};
  D.open = (code, tab) => { A.drawer = { code: UI.code(code), tab: tab || 'res', exp: new Set(), cq: '' }; D.render(); };
  D.close = () => { A.drawer = null; const el = UI.$('#drawer'); el.hidden = true; el.innerHTML = ''; };
  D.render = () => {
    const st = A.drawer; const el = UI.$('#drawer'); if (!st) return;
    const c = A.base.comp(st.code); if (!c) { D.close(); return; }
    const own = c.src !== 'SICRO'; el.hidden = false;
    const tabs = [['res', 'Resumo'], ['an', 'Analítico'], ['basic', 'Analítico - somente insumos básicos'], ['prod', 'Produtividade'], ['iva', 'Crédito de IVA'], ['taxmem', 'Memória tributária'], ['taxlaw', 'Legislação aplicável'], ['ivayears', 'Ano a ano'], ...(OP.pem && OP.pem.baseOf(c) ? [['pem', 'Demonstrativo de produção horária']] : []), ['ed', own ? 'Editar' : 'Criar própria']];
    el.innerHTML = `<div class="dr-h"><div><span class="code big">${esc(st.code)}</span><span class="tag">${own ? 'própria' : 'SICRO'}</span><span class="un">${esc(c.unit)}</span></div><div><button class="ib" data-act="quickAdd" data-code="${esc(st.code)}" title="Adicionar ao orçamento">${UI.icon('plus')}</button><button class="ib" data-act="drClose" title="Fechar (Esc)">${UI.icon('x')}</button></div></div>
      <p class="dr-d">${esc(c.desc)}</p><div class="tabs">${tabs.map(([k, t]) => `<button class="tab ${st.tab === k ? 'on' : ''}" data-act="drTab" data-t="${k}">${t}</button>`).join('')}</div>
      <div class="dr-b" data-keep="drb">${D.tabs[st.tab](c)}</div>`;
  };
  const n4 = (v) => U.num(Number(v) / 1e4, 4), n10 = (v) => (v == null ? '—' : U.num(Number(v) / 1e10, 4));
  const insD = (code) => { const x = A.base.ins(code); return x ? x.desc : (A.base.raw.tmat && A.base.raw.tmat[code] ? A.base.raw.tmat[code][0] : ''); };
  D.tabs.res = (c) => {
    const b = A.base, pj = A.pj; const cost = b.compCost(c.code, pj.uf, pj.rg);
    const bd = cost ? b.breakdown(c.code, pj.uf, pj.rg) : null; const tot = bd ? bd.mo + bd.mat + bd.eq + bd.serv + bd.out : 0;
    const an = c.j != null && b.analytic ? b.analytic(c.code, pj.uf, pj.rg) : null; const off = c.j != null ? b.officialCost(c.code) : null;
    const prz = an ? an.mat.filter((x) => x.p == null).length : 0;
    return `<div class="kv"><div><small>Custo unitário · ${esc(pj.uf)} · ${OP.sicro.REGIMES[pj.rg]}</small><b class="big">${cost == null ? 'sem custo' : U.brl(cost / 100)}</b></div><div><small>Preço com BDI (${U.pct(pj.bdi, 2)})</small><b>${cost == null ? '—' : U.brl(Math.round(cost * (1 + pj.bdi)) / 100)}</b></div>${an ? `<div><small>Produção da equipe</small><b>${U.num(an.P, 5, 0)} ${esc(c.unit)}/h</b></div>` : ''}</div>
      ${bd ? `<table class="tbl sm"><thead><tr><th>Parcela</th><th class="r">R$ / ${esc(c.unit)}</th><th class="r">%</th></tr></thead><tbody>${[['mo', 'Mão de obra'], ['mat', 'Material'], ['eq', 'Equipamento'], ['serv', 'Serviços'], ['out', 'Outros']].filter(([k]) => bd[k]).map(([k, t]) => `<tr><td><i class="dot ${k}"></i>${t}</td><td class="r">${U.num(bd[k] / 100, 2)}</td><td class="r">${U.pct(bd[k] / tot)}</td></tr>`).join('')}</tbody></table>` : ''}
      <dl class="meta"><dt>Grupo SICRO</dt><dd>${esc(c.group || '—')}</dd>
      ${an ? `<dt>FIC</dt><dd>${an.fic ? U.num(an.fic, 5) + ' — incide sobre o custo improdutivo (CHI e mão de obra)' : 'sem FIC'}</dd>
      <dt>Conferência</dt><dd>${off == null ? '—' : `custo publicado (sem transporte, sem desoneração): ${U.brl(off / 100)}${pj.rg === 'SD' && Number(an.mtV) === 0 ? (off === cost ? ' · <b class="ok">confere</b>' : ' · <b class="bad">diverge</b>') : ''}`}</dd>
      ${Number(an.mtV) ? `<dt>Momento de transporte</dt><dd>${U.brl(Number(an.mtV) / 1e4)} por ${esc(c.unit)} com as DMT do projeto</dd>` : (an.mt.length ? `<dt>Momento de transporte</dt><dd>DMT não definida — <button class="lnk" data-act="nav" data-v="transport">definir em Transportes (DMT)</button></dd>` : '')}
      ${prz ? `<dt>Materiais sem preço</dt><dd><span class="tag sm warn">PRZ</span> ${prz} material(is) com preço referencial zerado no SICRO — pago(s) em item próprio ou por cotação do projeto</dd>` : ''}
      ${an.obs ? `<dt>Observação</dt><dd>${esc(an.obs)}</dd>` : ''}` : ''}
      ${c.base ? `<dt>Origem</dt><dd>adaptada da ${esc(c.base)}</dd>` : ''}</dl>
      <div class="dr-a"><button class="btn pri" data-act="quickAdd" data-code="${esc(c.code)}">${UI.icon('plus')} Adicionar ao orçamento</button>${c.j != null ? `<button class="btn ghost" data-act="treeOf" data-code="${esc(c.code)}">${UI.icon('tree')} Ver na árvore</button>` : ''}</div>`;
  };
  /* Analítico no formato do relatório do SICRO (seções A a F) */
  D.sicroAnalytic = (c) => {
    const pj = A.pj, b = A.base, an = b.analytic(c.code, pj.uf, pj.rg); if (!an) return '<div class="empty">Composição sem analítico.</div>';
    const u = esc(an.unit), lnk = (code, t = 'C') => `<button class="lnk code" data-act="${t === 'C' ? 'openComp' : 'regInspectInput'}" data-code="${esc(code)}">${esc(code)}</button>`;
    const sec = (title, head, rows, foot) => `<tr class="san-h"><td colspan="${head.length}">${title}</td></tr>${rows.length ? `<tr class="san-c">${head.map((h) => `<th class="${h[1] || ''}">${h[0]}</th>`).join('')}</tr>${rows.join('')}` : `<tr><td colspan="${head.length}" class="muted">—</td></tr>`}${foot || ''}`;
    const tr = (cells) => `<tr>${cells.map((x) => `<td class="${x[1] || ''}">${x[0]}</td>`).join('')}</tr>`;
    const tot = (label, v, n) => `<tr class="san-t"><td colspan="${n - 1}">${label}</td><td class="r">${n4(v)}</td></tr>`;
    const extra = (s0) => an.extra.filter((x) => x.sec === s0).map((x) => tr([['', ''], [esc(x.label), ''], ['', ''], ['', ''], ['', ''], [n4(x.v), 'r']])).join('');
    const A8 = [['Código'], ['Equipamento'], ['Quant.', 'r'], ['Oper.', 'r'], ['Improd.', 'r'], ['CHP', 'r'], ['CHI', 'r'], ['Custo horário', 'r']];
    const rowsA = an.eq.map((x) => tr([[lnk(x.code, 'I')], [esc(insD(x.code))], [U.num(x.q, 5, 0), 'r mono'], [U.num(x.uo, 2), 'r mono'], [U.num(x.ui, 2), 'r mono'], [n10(x.chp), 'r'], [n10(x.chi), 'r'], [n4(x.line), 'r']]));
    const B6 = [['Código'], ['Mão de obra'], ['Quant.', 'r'], ['Unid.'], ['Custo horário', 'r'], ['Custo', 'r']];
    const rowsB = an.mo.map((x) => tr([[lnk(x.code, 'I')], [esc(insD(x.code))], [U.num(x.q, 5, 0), 'r mono'], [esc(b.ins(x.code)?.unit || 'h')], [n10(x.p), 'r'], [n4(x.line), 'r']]));
    const rowsC = an.mat.map((x) => tr([[lnk(x.code, 'I')], [esc(insD(x.code)) + (x.p == null ? ' <span class="tag sm warn" title="Preço referencial zerado no SICRO">PRZ</span>' : '')], [U.num(x.q, 5, 0), 'r mono'], [esc(b.ins(x.code)?.unit || '')], [x.p == null ? '—' : n10(x.p), 'r'], [n4(x.line), 'r']]));
    const rowsD = an.aux.map((x) => tr([[lnk(x.code)], [esc(b.comp(x.code)?.desc || '(não encontrada)')], [U.num(x.q, 5, 0), 'r mono'], [esc(b.comp(x.code)?.unit || '')], [n4(x.cu), 'r'], [n4(x.line), 'r']]));
    const rowsE = an.tf.map((x) => tr([[esc(x.mat)], [esc(insD(x.mat))], [lnk(x.code)], [U.num(x.q, 5, 0), 'r mono'], [n4(x.cu), 'r'], [n4(x.line), 'r']]));
    const rowsF = an.mt.map((x) => { const v = (A.base.raw.tmat || {})[x.mat] || []; return tr([[esc(x.mat)], [esc(v[0] || insD(x.mat)) + (v[1] ? `<br><small class="muted">${esc(v[1])}</small>` : '')], [U.num(x.q, 5, 0), 'r mono'],
      [x.parts.map((p) => `<span class="dmtp" title="${esc(OP.sicro.DMT_NAME[p.k])} · ${esc(p.code)}">${p.k} ${p.km ? U.num(p.km, 2) + ' km' : '—'}</span>`).join(' '), ''], [x.parts.filter((p) => p.km).map((p) => U.num(Number(p.cu) / 1e4, 2)).join(' / ') || '—', 'r'], [n4(x.line), 'r']]); });
    const dmtNote = an.mt.length ? `<p class="note">Momento de transporte: DMT por tipo de via definidas em <button class="lnk" data-act="nav" data-v="transport">Transportes (DMT)</button>. Sem DMT, o custo coincide com o relatório publicado (seção F em branco).</p>` : '';
    return `<p class="note">Regra do SICRO conferida com o relatório oficial: linhas em 4 casas (meio para cima), custo de execução = custo horário ÷ produção, FIC sobre o custo improdutivo, total em 2 casas. Clique num código para abrir a composição ou o insumo.</p>
      <div class="kv"><div><small>Produção da equipe</small><b>${U.num(an.P, 5, 0)} ${u}/h</b></div><div><small>FIC</small><b>${an.fic ? U.num(an.fic, 5) : '—'}</b></div><div><small>Custo unitário direto total</small><b>${U.brl(Number(an.totalC) / 100)}</b></div></div>
      <div class="tblw"><table class="tbl an san"><tbody>
      ${sec('A — Equipamentos', A8, rowsA, tot('Custo horário total de equipamentos', an.eqH, 8))}
      </tbody></table></div><div class="tblw"><table class="tbl an san"><tbody>
      ${sec('B — Mão de obra', B6, rowsB, extra('B') + tot('Custo horário total de mão de obra', an.moH, 6) + tot('Custo horário total de execução', an.exH, 6) + tot(`Custo unitário de execução (÷ ${U.num(an.P, 5, 0)} ${u}/h)`, an.cuEx, 6) + tot('Custo do FIC', an.ficV, 6))}
      ${sec('C — Material', [['Código'], ['Material'], ['Quant.', 'r'], ['Unid.'], ['Preço unitário', 'r'], ['Custo unitário', 'r']], rowsC, extra('C') + tot('Custo unitário total de material', an.matV, 6))}
      ${sec('D — Atividades auxiliares', [['Código'], ['Atividade'], ['Quant.', 'r'], ['Unid.'], ['Custo unitário', 'r'], ['Custo', 'r']], rowsD, extra('D') + tot('Custo total de atividades auxiliares', an.auxV, 6) + tot('Subtotal', an.sub, 6))}
      ${sec('E — Tempo fixo', [['Item'], ['Descrição'], ['Composição'], ['Quant.', 'r'], ['Custo unitário', 'r'], ['Custo', 'r']], rowsE, tot('Custo unitário total de tempo fixo', an.tfV, 6))}
      ${sec('F — Momento de transporte', [['Item'], ['Descrição / veículo'], ['Quant. (t)', 'r'], ['DMT (km)'], ['R$/tkm', 'r'], ['Custo', 'r']], rowsF, tot('Custo unitário total de transporte', an.mtV, 6))}
      <tr class="san-g"><td colspan="5">Custo unitário direto total</td><td class="r">${U.num(Number(an.totalC) / 100, 2)}</td></tr>
      </tbody></table></div>${dmtNote}`;
  };
  D.tabs.an = (c) => {
    if ((c.j != null || (A.base.custom.get(c.code) || {}).mode === 'sicro') && A.base.analytic) return D.sicroAnalytic(c);
    const st = A.drawer, pj = A.pj; const rows = [];
    const active = new Set([String(c.code)]), stack = [{ code: c.code, depth: 0, path: 'r', list: A.base.itemsOf(c.code, pj.uf, pj.rg), pos: 0 }];
    while (stack.length) {
      const f = stack[stack.length - 1];
      if (f.pos >= f.list.length) { active.delete(String(f.code)); stack.pop(); continue; }
      const i = f.pos++, r = { ...f.list[i] }, p = f.path + '.' + i;
      r.cycle = r.type === 'C' && active.has(String(r.code));
      const sc = r.type === 'C' ? A.base.comp(r.code) : null;
      const hasChildren = sc && (A.base.custom.has(r.code) ? (sc.items || []).length : A.base.itemsOf(r.code, pj.uf, pj.rg).length);
      r.expandable = !!(r.type === 'C' && hasChildren && !r.cycle);
      if (r.cycle) r.desc += ' [ciclo: expansão interrompida]';
      rows.push({ r, depth: f.depth, p });
      if (r.expandable && st.exp.has(p)) { active.add(String(r.code)); stack.push({ code: r.code, depth: f.depth + 1, path: p, list: A.base.itemsOf(r.code, pj.uf, pj.rg), pos: 0 }); }
    }
    const total = A.base.compCost(c.code, pj.uf, pj.rg);
    return `<p class="note">${OP.sicro.isEqHour(c.code) ? 'Parcelas do custo horário do equipamento (relatório sintético de equipamentos do SICRO).' : 'Composição própria: custo = Σ coeficiente × preço (parcelas em 4 casas), total em centavos. Itens SICRO usam o custo unitário completo da composição, inclusive transporte quando houver DMT.'} Clique em ▸ para abrir subcomposições.</p>
      <div class="tblw"><table class="tbl an"><thead><tr><th>Código</th><th>Descrição</th><th>Und</th><th class="r">Coef.</th><th class="r">Preço</th><th class="r">Total</th></tr></thead><tbody>${rows.map(({ r, depth, p }) => `<tr class="${r.type === 'C' ? 'sub' : ''}">
        <td style="padding-left:${6 + depth * 14}px;white-space:nowrap">${r.expandable ? `<button class="tg" data-act="anToggle" data-p="${p}" aria-label="expandir">${st.exp.has(p) ? '▾' : '▸'}</button>` : '<span class="tg0"></span>'}<button class="lnk code" data-act="${r.type === 'I' ? 'ivaIns' : 'ivaComp'}" data-code="${esc(r.code)}" title="Consultar crédito de IVA por unidade">${esc(r.code)}</button></td>
        <td>${esc(r.desc)}</td><td>${esc(r.unit)}</td><td class="r mono">${U.num(r.coef, 7, 2)}</td>
        <td class="r">${r.price == null ? '—' : U.num(r.price / 100, 4)}</td><td class="r ${depth ? 'muted' : ''}">${r.total == null ? '—' : U.num(r.total / 100, 4)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5">Custo unitário</td><td class="r">${total == null ? '—' : U.num(total / 100, 2)}</td></tr></tfoot></table></div>`;
  };
  D.tabs.prod = (c) => {
    const res = OP.prod.resources(A.base, c.code); const bc = OP.prod.baseCrew(res.direct); const J = +A.pj.calendar.hpd || 8.8; const u = esc(c.unit);
    const direct = res.direct.filter((r) => r.h > 0 && !r.monthly), monthly = res.direct.filter((r) => r.monthly);
    if (!direct.length && !res.support.length) return `<div class="empty">Esta composição não tem equipe produtiva própria${monthly.length ? ' (apenas pessoal mensalista)' : ''}: a duração deve ser informada no orçamento ou nas Equipes.</div>`;
    const P = A.base.production ? A.base.production(c.code) : null;
    return `<p class="note">Equipe publicada no SICRO para a produção de ${P ? U.num(P.P, 5, 0) : '—'} ${u}/h. Horas por ${u} = quantidade na equipe ÷ produção; para equipamentos, separadas em horas produtivas (utilização operativa) e improdutivas.</p>
      <div class="tblw"><table class="tbl sm"><thead><tr><th>Recurso</th><th class="r">Qtde na equipe</th><th class="r">h/${u}</th><th class="r">Produtivas</th><th class="r">Improdutivas</th><th class="r">Equipe base</th><th class="r">Ocupação</th></tr></thead><tbody>${direct.map((r) => { const n = bc.counts[r.key] || 1; const occ = bc.T ? (r.kind === 'eq' ? r.chp : r.h) / n / bc.T : 0; return `<tr><td><i class="dot ${r.kind}"></i>${esc(r.name)}${r.operator ? `<br><small class="muted">operador incluso no custo horário: ${esc(r.operator)}</small>` : ''}</td><td class="r mono">${U.num(r.q || 0, 5, 0)}</td><td class="r mono">${U.num(r.h, 7, 4)}</td><td class="r mono">${r.kind === 'eq' ? U.num(r.chp, 7, 4) : ''}</td><td class="r mono">${r.kind === 'eq' ? U.num(r.chi, 7, 4) : ''}</td><td class="r">${n}</td><td class="r"><div class="occ"><i style="width:${Math.min(100, occ * 100).toFixed(0)}%"></i><span>${U.pct(occ, 0)}</span></div></td></tr>`; }).join('')}</tbody></table></div>
      ${bc.T ? `<div class="kv" style="margin-top:12px"><div><small>h de equipe por ${u} (T)</small><b>${U.num(bc.T, 6, 4)}</b></div><div><small>Produção da equipe</small><b>${U.num(1 / bc.T, 3)} ${u}/h · ${U.num(J / bc.T, 2)} ${u}/dia</b></div><div><small>Eficiência</small><b>${U.pct(bc.eff, 0)}</b></div></div>` : ''}
      ${monthly.length ? `<p class="note">Pessoal mensalista (${monthly.map((r) => esc(r.name)).join(', ')}): custo por mês; não define produção.</p>` : ''}
      ${res.support.length ? `<h4 class="sub">Equipes de apoio (atividades auxiliares, tempo fixo e transporte)</h4><div class="tblw"><table class="tbl sm"><thead><tr><th>Recurso</th><th class="r">h/${u}</th></tr></thead><tbody>${res.support.filter((r) => r.h > 0).map((r) => `<tr><td><i class="dot ${r.kind}"></i>${esc(r.name)}</td><td class="r mono">${U.num(r.h, 7, 4)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  };
  D.tabs.uf = (c) => {
    const b = A.base; const arr = b.ufs.map((uf, i) => ({ uf, city: b.raw.cidades[i] || '', v: b.compCost(c.code, uf, A.pj.rg) }));
    const vals = arr.map((x) => x.v).filter((v) => v != null).sort((a, z) => a - z); if (!vals.length) return '<div class="empty">Sem custo publicado.</div>';
    const max = vals[vals.length - 1], min = vals[0], med = vals[Math.floor(vals.length / 2)];
    return `<div class="kv"><div><small>Mínimo</small><b>${U.brl(min / 100)}</b></div><div><small>Mediana</small><b>${U.brl(med / 100)}</b></div><div><small>Máximo</small><b>${U.brl(max / 100)}</b></div><div><small>Amplitude</small><b>${U.pct(max / min - 1, 0)}</b></div></div>
      <p class="note">${OP.sicro.REGIMES[A.pj.rg]} · clique numa UF para usá-la no orçamento.</p>
      <div class="ufb">${arr.map((x) => `<div class="ufr ${x.uf === A.pj.uf ? 'on' : ''}" data-act="setUF" data-uf="${x.uf}" title="${esc(x.city)}"><span>${x.uf}</span><i style="width:${x.v == null ? 0 : (x.v / max * 100).toFixed(1)}%"></i><b>${x.v == null ? '—' : U.num(x.v / 100, 2)}</b></div>`).join('')}</div>`;
  };
  function cpResults(q) {
    const b = A.base, pj = A.pj; const I = b.raw.ins; const ui = b.ufIndex(pj.uf);
    const ins = OP.search.insumos(b, q, 8).map((i) => { const [p] = b.insPrice(i, ui, pj.rg); return `<div class="res" data-act="cpAdd" data-t="I" data-code="${I.c[i]}"><span class="code">${I.c[i]}</span><span class="rd">${esc(I.d[i])}</span><span class="ru">${esc(b.insUnit(i))}</span><span class="rp">${p == null ? '—' : U.num(p / 100, 2)}</span><span class="ra">${UI.icon('plus', 16)}</span></div>`; }).join('');
    const cs = OP.search.query(b, q, 6).list.map((x) => { const code = b.raw.comp.c[x.j]; return `<div class="res" data-act="cpAdd" data-t="C" data-code="${code}"><span class="code">${code}</span><span class="rd">${esc(b.raw.comp.d[x.j])}</span><span class="ru">${esc(b.unit(x.j))}</span><span class="rp">${UI.money(b.compCost(code, pj.uf, pj.rg))}</span><span class="ra">${UI.icon('plus', 16)}</span></div>`; }).join('');
    return (ins ? `<div class="rsum" style="padding:6px 10px;margin:0">Insumos</div>${ins}` : '') + (cs ? `<div class="rsum" style="padding:6px 10px;margin:0">Composições</div>${cs}` : '') || '<div class="empty">Nada encontrado.</div>';
  }
  D.tabs.ed = (c) => {
    if (c.src === 'SICRO') return `<p>Crie uma <b>composição própria</b> a partir desta: itens e coeficientes são copiados e podem ser alterados, incluídos ou removidos. O custo é recalculado com os coeficientes equivalentes da composição SICRO (horas de mão de obra e de equipamento por unidade, materiais, auxiliares, tempo fixo e transporte) e a composição passa a aparecer na busca e no orçamento (código CP-xxx), salva neste navegador.</p><button class="btn pri" data-act="cpNew" data-code="${esc(c.code)}">${UI.icon('copy')} Criar composição própria</button>`;
    const pj = A.pj; const rows = A.base.itemsOf(c.code, pj.uf, pj.rg); const tot = A.base.compCost(c.code, pj.uf, pj.rg); const q = A.drawer.cq || '';
    return `<div class="pform"><label class="fld" style="flex:1;min-width:240px"><span>Descrição</span><input data-ch="cpDesc" value="${esc(c.desc)}" style="width:100%"></label><label class="fld"><span>Unidade</span><input data-ch="cpUnit" value="${esc(c.unit)}" style="width:80px"></label></div>
      <h4 class="sub">Itens</h4><div class="tblw"><table class="tbl sm"><thead><tr><th>Tipo</th><th>Código</th><th>Descrição</th><th>Und</th><th class="r">Coeficiente</th><th class="r">Total</th><th></th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${r.type === 'C' ? 'Comp.' : 'Insumo'}</td><td class="code">${esc(r.code)}</td><td>${esc(r.desc)}</td><td>${esc(r.unit)}</td><td class="r"><input class="qty" data-fk="cpc-${i}" data-ch="cpCoef" data-i="${i}" value="${U.num(r.coef, 7, 2)}" inputmode="decimal"></td><td class="r">${r.total == null ? '—' : U.num(r.total / 100, 2)}</td><td><button class="ib sm danger" data-act="cpDel" data-i="${i}" title="Remover item">${UI.icon('trash', 15)}</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5">Custo unitário (${pj.uf})</td><td class="r">${tot == null ? '—' : U.num(tot / 100, 2)}</td><td></td></tr></tfoot></table></div>
      <h4 class="sub">Incluir insumo ou composição</h4><input class="inp" data-fk="cpq" data-in="cpq" placeholder="Buscar insumo ou composição (descrição ou código)…" value="${esc(q)}">
      <div class="rlist" style="margin-top:8px">${q.trim() ? cpResults(q) : ''}</div>
      <div class="dr-a"><button class="btn ghost" data-act="cpRemove">${UI.icon('trash')} Excluir composição própria</button></div>`;
  };
  UI.act.openComp = (el) => { if (UI.$('#overlay.on')) UI.closeModal(); D.open(el.dataset.code); };
  UI.act.drClose = () => D.close();
  UI.act.drTab = (el) => { A.drawer.tab = el.dataset.t; D.render(); };
  UI.act.anToggle = (el) => { const s = A.drawer.exp, p = el.dataset.p; if (s.has(p)) s.delete(p); else s.add(p); D.render(); };
  UI.act.setUF = (el) => { A.pj.uf = el.dataset.uf; UI.commit(); };
  /* ---- composições próprias ---- */
  D.applyCustoms = () => { A.base.setCustom(A.customs); OP.prod.clearCache(A.base); A.base._bdCache = new Map(); A.model = null; };
  const saveCustom = (cp) => { cp.updated = Date.now(); OP.store.put('custom', cp).catch(() => {}); const i = A.customs.findIndex((x) => x.code === cp.code); if (i >= 0) A.customs[i] = cp; else A.customs.push(cp); D.applyCustoms(); };
  const cur = () => A.drawer && A.customs.find((x) => x.code === A.drawer.code);
  UI.act.cpNew = (el) => {
    const b = A.base; const j = b.compIdx.get(el.dataset.code); if (j == null) return;
    const n = A.customs.reduce((mx, c) => Math.max(mx, +((/CP-(\d+)/.exec(c.code) || [0, 0])[1])), 0) + 1; const code = 'CP-' + String(n).padStart(3, '0');
    const cp = { id: code, code, desc: b.raw.comp.d[j].replace(/\.?\s*AF_\S+\s*$/, '') + ' (ADAPTADA)', unit: b.unit(j), group: 'Composições próprias', src: 'PRÓPRIA', base: b.raw.comp.c[j],
      items: OP.sicro.itOf(b, j).map((x) => { const t = OP.sicro.itx(x); return { type: t.type, code: t.code, coef: t.coef }; }), created: Date.now() };
    saveCustom(cp); A.drawer = { code, tab: 'ed', exp: new Set(), cq: '' }; UI.render(); UI.toast(`Composição própria ${code} criada.`);
  };
  UI.chg.cpDesc = (el) => { const cp = cur(); if (!cp) return; cp.desc = el.value.trim() || cp.desc; saveCustom(cp); UI.commit(); };
  UI.chg.cpUnit = (el) => { const cp = cur(); if (!cp) return; cp.unit = el.value.trim() || cp.unit; saveCustom(cp); UI.commit(); };
  UI.chg.cpCoef = (el) => { const cp = cur(); const v = U.parseNum(el.value); if (!cp || !isFinite(v) || v < 0) { UI.toast('Coeficiente inválido', 'warn'); return; } cp.items[+el.dataset.i].coef = v; saveCustom(cp); UI.commit(); };
  UI.act.cpDel = (el) => { const cp = cur(); if (!cp) return; cp.items.splice(+el.dataset.i, 1); saveCustom(cp); UI.commit(); };
  UI.inp.cpq = (el) => UI.later('cpq', () => { if (A.drawer) { A.drawer.cq = el.value; UI.render(); } }, 220);
  UI.act.cpAdd = (el) => { const cp = cur(); if (!cp) return; cp.items.push({ type: el.dataset.t, code: OP.code(el.dataset.code), coef: 1 }); A.drawer.cq = ''; saveCustom(cp); UI.commit(); UI.toast('Item incluído com coeficiente 1 — ajuste o valor.'); };
  UI.act.cpRemove = () => {
    const cp = cur(); if (!cp || !confirm(`Excluir a composição própria ${cp.code}? Itens do orçamento que a usam ficarão sem custo.`)) return;
    A.customs = A.customs.filter((x) => x.code !== cp.code); OP.store.del('custom', cp.id).catch(() => {}); D.applyCustoms(); D.close(); UI.commit();
  };
})(typeof window !== 'undefined' ? window : globalThis);


