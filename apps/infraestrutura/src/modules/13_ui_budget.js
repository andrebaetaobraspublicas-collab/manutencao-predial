/* ==== 13_ui_budget.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 13_ui_budget.js
 * Orçamento em EAP (etapas/subetapas/serviços): quantidades editáveis em
 * tempo real, reordenar, avançar/recuar nível, trocar variante pela
 * árvore mantendo a quantidade, BDI, arredondamento e Curva ABC.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app; const E = OP.engine; const esc = U.esc;
  const mvBtns = (r) => `<button class="ib sm" data-act="mv" data-id="${r.id}" data-d="-1" title="Mover para cima">${UI.icon('up', 15)}</button><button class="ib sm" data-act="mv" data-id="${r.id}" data-d="1" title="Mover para baixo">${UI.icon('down', 15)}</button><button class="ib sm" data-act="outdent" data-id="${r.id}" title="Recuar um nível">${UI.icon('left', 15)}</button><button class="ib sm" data-act="indent" data-id="${r.id}" title="Avançar um nível (entra na etapa acima)">${UI.icon('right', 15)}</button>`;
  const stageRow = (r, dif) => `<tr class="st d${Math.min(r.depth, 2)} ${A.sel.stage === r.id ? 'on' : ''}" data-act="selStage" data-id="${r.id}"><td class="num">${r.num}</td>
    <td colspan="3"><input class="stn" data-fk="stn-${r.id}" data-in="stname" data-id="${r.id}" value="${esc(r.node.name)}" style="margin-left:${r.depth * 12}px;width:calc(100% - ${r.depth * 12}px)" aria-label="Nome da etapa"></td>
    <td></td><td></td><td></td>${dif ? '<td></td>' : ''}<td class="r">${U.brl(r.total / 100)}</td><td class="r">${U.pct(r.weight)}</td><td class="r">${r.days}</td>
    <td class="acts">${mvBtns(r)}<button class="ib sm" data-act="palette" data-stage="${r.id}" title="Adicionar serviço nesta etapa">${UI.icon('plus', 15)}</button><button class="ib sm danger" data-act="del" data-id="${r.id}" title="Excluir etapa">${UI.icon('trash', 15)}</button></td></tr>`;
  const itemRow = (r, dif) => `<tr class="it${r.crit ? ' is-crit' : ''}"><td class="num">${r.num}</td><td class="codec">${r.comp || r.input ? `<button class="lnk code" data-act="${r.input?'regInspectInput':'openComp'}" data-code="${esc(r.node.code)}">${esc(r.node.code)}</button>` : `<button class="lnk code" data-act="itemInfo" data-id="${r.id}">${esc(r.node.code || '—')}</button>`}${r.fonte && r.fonte !== 'SICRO' ? `<span class="fonte">${esc(r.fonte)}</span>` : ''}${r.memo ? `<button class="ib sm" data-act="memo" data-id="${r.id}" title="Memória de cálculo do custo">${UI.icon('list', 13)}</button>` : ''}</td>
    <td class="desc" title="${esc(r.desc)}">${r.comp || r.input ? `<span style="padding-left:${r.depth * 12}px">${esc(r.desc)}</span>` : `<input class="fdesc" data-fk="d-${r.id}" data-in="descItem" data-id="${r.id}" value="${esc(r.desc)}" style="margin-left:${r.depth * 12}px" aria-label="Descrição do item">`}</td><td>${r.comp || r.input ? esc(r.unit) : `<input class="fun" data-fk="u-${r.id}" data-in="unitItem" data-id="${r.id}" value="${esc(r.unit)}" aria-label="Unidade">`}</td>
    <td class="r"><input class="qty" data-fk="q-${r.id}" data-in="qty" data-ch="qty" data-id="${r.id}" inputmode="decimal" value="${U.num(r.qty, 4, 2)}" aria-label="Quantidade"></td>
    <td class="r">${r.fixo ? `<input class="qty cst" data-fk="c-${r.id}" data-in="custoItem" data-ch="custoItem" data-id="${r.id}" inputmode="decimal" value="${U.num(r.unitCost / 100, 6, 2)}" title="Custo unitário informado${r.comp ? ' (a base SICRO ativa tem ' + UI.money(r.ucBase) + ')' : ''}" aria-label="Custo unitário">` : (r.unitCost == null ? '—' : U.num(r.unitCost / 100, 2))}</td><td class="r">${r.unitPrice == null ? '—' : U.num(r.unitPrice / 100, 2)}</td>${dif ? `<td><button class="bdit${r.bdiDif ? ' d' : ''}" data-act="bdiToggle" data-id="${r.id}" title="${r.bdiDif ? 'BDI diferenciado' : 'BDI principal'} — clique para alternar">${r.bdiDif ? 'D' : 'P'}</button></td>` : ''}
    <td class="r"><b>${U.num(r.total / 100, 2)}</b></td><td class="r">${U.pct(r.weight)}</td>
    <td class="r">${r.days}${r.prod.noProd && r.qty > 0 ? '<span class="tag sm" title="Sem coeficientes de produtividade: duração padrão de 1 dia — ajuste em Equipes">*</span>' : ''}</td>
    <td class="acts">${mvBtns(r)}${r.fixo && r.comp ? `<button class="ib sm" data-act="custoBase" data-id="${r.id}" title="Voltar ao custo da base SICRO ativa (${UI.money(r.ucBase)})">↺</button>` : (!r.fixo && r.comp ? `<button class="ib sm" data-act="custoFix" data-id="${r.id}" title="Informar custo unitário (cotação ou composição ajustada)">R$</button>` : '')}<button class="ib sm" data-act="swapItem" data-id="${r.id}" title="Trocar variante pela árvore (mantém a quantidade)">${UI.icon('swap', 15)}</button><button class="ib sm" data-act="crewOf" data-id="${r.id}" title="Equipe e produtividade">${UI.icon('crew', 15)}</button><button class="ib sm danger" data-act="del" data-id="${r.id}" title="Excluir serviço">${UI.icon('trash', 15)}</button></td></tr>`;
  UI.views.budget = { render: () => {
    const m = UI.model(); const pj = A.pj; const t = m.tot; const dif = pj.bdi2 != null;
    if (!m.flat.length) return `<div class="hero"><h1>Orçamento vazio</h1><p>Monte a EAP com etapas e adicione composições pelo <b>Catálogo</b> (árvores dos grupos do SICRO) ou pela <b>busca</b> (Ctrl+K). Durações, cronograma, histogramas e Curva S são calculados automaticamente.</p><div class="row"><button class="btn pri" data-act="addStage">${UI.icon('plus')} Criar primeira etapa</button><button class="btn" data-act="demo">Carregar projeto demonstração</button><button class="btn" data-act="demo2">Exemplo com eventograma</button><button class="btn ghost" data-act="go" data-v="catalog">${UI.icon('catalog')} Ir ao catálogo</button></div></div>`;
    const selSt = A.sel.stage && m.byId.get(A.sel.stage);
    const stk = [['mo', 'MO', t.mo], ['mat', 'MAT', t.mat], ['eq', 'EQ', t.eq], ['out', 'Outros', t.out]].filter((x) => x[2] > 0); const sd = U.sum(stk, (x) => x[2]) || 1;
    return `<div class="vh"><div><h1>Orçamento</h1><p class="muted">${pj.info ? `${esc(pj.info.local)} · preço base ${esc(pj.info.precoBase)} (custos informados) · ` : ''}${esc(A.base.raw.fonte || 'SICRO')} ${esc(A.base.raw.ref)} · ${pj.uf} · ${OP.sicro.REGIMES[pj.rg]} · BDI ${U.pct(pj.bdi, 2)}${dif ? ` (diferenciado ${U.pct(pj.bdi2, 2)})` : ''} · clique numa etapa para torná-la o destino dos novos serviços</p></div>
      <div class="vh-a"><button class="btn" data-act="addStage">${UI.icon('plus')} Etapa</button><button class="btn" data-act="addSubStage" ${selSt ? '' : 'disabled title="Selecione uma etapa"'}>${UI.icon('plus')} Subetapa</button><button class="btn pri" data-act="palette" ${selSt ? `data-stage="${selSt.id}"` : ''}>${UI.icon('search')} Serviço</button><button class="btn" data-act="addFree" title="Item de cotação, outra tabela de referência ou composição ajustada, com custo unitário informado">${UI.icon('plus')} Item com custo</button>
      <span class="abc-buttons"><button class="btn ghost" data-act="abc">Curva ABC de serviços</button><button class="btn ghost" data-act="abcInputs">Curva ABC de insumos</button></span><button class="btn ghost" data-act="exportXLSX">${UI.icon('dl')} Excel</button><button class="btn ghost" data-act="exportCSV">${UI.icon('dl')} CSV</button><button class="btn ghost" data-act="print">${UI.icon('pdf')} PDF</button></div></div>
      <div class="cards"><div class="card"><small>Custo direto</small><b>${U.brl(t.direct / 100)}</b></div><div class="card"><small>BDI ${U.pct(pj.bdi, 2)}${dif ? ` · dif. ${U.pct(pj.bdi2, 2)}` : ''}</small><b>${U.brl(t.bdi / 100)}</b><button class="lnk sm" data-act="go" data-v="bdi">calcular / editar o BDI →</button></div><div class="card hl"><small>Preço total</small><b>${U.brl(t.price / 100)}</b></div>
      <div class="card"><small>Custo direto por natureza</small><div class="stk">${stk.map(([k, n, v]) => `<i class="${k}" style="width:${(v / sd * 100).toFixed(2)}%"></i>`).join('')}</div><div class="stl">${stk.map(([k, n, v]) => `<span><i class="dot ${k}"></i>${n} ${U.pct(v / sd, 0)}</span>`).join('')}</div></div>
      <div class="card"><small>Prazo (caminho crítico)</small><b>${m.T} dias úteis</b><span class="muted">${U.fmtDate(m.start)} → ${U.fmtDate(m.end)}</span></div></div>
      <div class="tblw" data-keep="bud"><table class="tbl bud"><thead><tr><th>Item</th><th>Código</th><th>Descrição</th><th>Und</th><th class="r">Quant.</th><th class="r">Custo unit.</th><th class="r">Preço unit.</th>${dif ? '<th title="BDI do item: P = principal, D = diferenciado">BDI</th>' : ''}<th class="r">Total</th><th class="r">Peso</th><th class="r">Dias</th><th></th></tr></thead>
      <tbody>${m.flat.map((r) => (r.isStage ? stageRow(r, dif) : itemRow(r, dif))).join('')}</tbody>
      <tfoot><tr><td colspan="${dif ? 8 : 7}">PREÇO TOTAL · custo direto ${U.brl(t.direct / 100)} + BDI ${U.brl(t.bdi / 100)}</td><td class="r">${U.brl(t.price / 100)}</td><td class="r">100%</td><td class="r">${m.T}</td><td></td></tr></tfoot></table></div>
      <div class="opts"><label class="fld sm"><span>Preço unitário com BDI</span><select data-ch="round"><option value="round" ${(!pj.round || pj.round === 'round') ? 'selected' : ''}>arredondado (2 casas)</option><option value="trunc" ${pj.round === 'trunc' ? 'selected' : ''}>truncado (2 casas)</option><option value="none" ${pj.round === 'none' ? 'selected' : ''}>sem arredondar (total truncado, como na planilha)</option></select></label><span class="muted">Total = quantidade × preço unitário com BDI · nº em vermelho = serviço no caminho crítico · * = sem coeficiente de produtividade</span></div>`;
  } };
  const qtySet = (id, v) => { const f = E.find(A.pj, id); if (!f) return; const n = U.parseNum(v); if (!isFinite(n) || n < 0 || f.node.qty === n) return; f.node.qty = n; UI.commit(); };
  UI.inp.qty = (el) => { const id = el.dataset.id, v = el.value; UI.later('q' + id, () => qtySet(id, v), 350); };
  UI.chg.qty = (el) => qtySet(el.dataset.id, el.value);
  UI.inp.stname = (el) => { const id = el.dataset.id, v = el.value; UI.later('s' + id, () => { const f = E.find(A.pj, id); if (f) { f.node.name = v.trim() || 'ETAPA'; UI.commit(); } }, 500); };
  UI.act.selStage = (el) => { if (A.sel.stage === el.dataset.id) return; A.sel.stage = el.dataset.id; UI.render(); };
  const focusName = (id) => { const i = UI.$(`[data-fk="stn-${id}"]`); if (i) { i.focus(); i.select(); } };
  UI.act.addStage = () => { if (A.view !== 'budget') A.view = 'budget'; const s = E.addStage(A.pj, null, 'NOVA ETAPA'); A.sel.stage = s.id; UI.commit(); focusName(s.id); };
  UI.act.addSubStage = () => { const s = E.addStage(A.pj, A.sel.stage, 'NOVA SUBETAPA'); A.sel.stage = s.id; UI.commit(); focusName(s.id); };
  UI.act.mv = (el) => { if (E.move(A.pj, el.dataset.id, +el.dataset.d)) UI.commit(); };
  UI.act.indent = (el) => { if (E.indent(A.pj, el.dataset.id)) UI.commit(); else UI.toast('Para avançar o nível, a linha logo acima deve ser uma etapa.', 'warn'); };
  UI.act.outdent = (el) => { if (E.outdent(A.pj, el.dataset.id)) UI.commit(); else UI.toast('Já está no primeiro nível.', 'warn'); };
  UI.act.del = (el) => {
    const f = E.find(A.pj, el.dataset.id); if (!f) return;
    if (f.node.kind === 'stage' && f.node.children.length && !confirm(`Excluir a etapa “${f.node.name}” e todo o seu conteúdo?`)) return;
    E.remove(A.pj, el.dataset.id); if (A.sel.stage === el.dataset.id) A.sel.stage = null; UI.commit();
  };
  UI.act.bdiToggle = (el) => { const f = E.find(A.pj, el.dataset.id); if (!f) return; f.node.bdiDif = !f.node.bdiDif; UI.commit(); };
  UI.inp.descItem = (el) => { const id = el.dataset.id, v = el.value; UI.later('d' + id, () => { const f = E.find(A.pj, id); if (f) { f.node.desc = v; UI.commit(); } }, 500); };
  UI.inp.unitItem = (el) => { const id = el.dataset.id, v = el.value; UI.later('u' + id, () => { const f = E.find(A.pj, id); if (f) { f.node.unit = v.toUpperCase(); UI.commit(); } }, 500); };
  const custoSet = (id, v) => { const f = E.find(A.pj, id); if (!f) return; const n = U.parseNum(v); if (!isFinite(n) || n < 0 || +f.node.custo === n) return; f.node.custo = n; UI.commit(); };
  UI.inp.custoItem = (el) => { const id = el.dataset.id, v = el.value; UI.later('c' + id, () => custoSet(id, v), 400); };
  UI.chg.custoItem = (el) => custoSet(el.dataset.id, el.value);
  UI.act.custoBase = (el) => { const f = E.find(A.pj, el.dataset.id); if (f) { delete f.node.custo; UI.commit(); UI.toast('Custo unitário da base SICRO ativa restabelecido.'); } };
  UI.act.custoFix = (el) => { const r = UI.model().byId.get(el.dataset.id); if (!r) return; r.node.custo = Math.round(r.unitCost || 0) / 100; if (!r.node.fonte) r.node.fonte = 'SICRO (ajustada)'; UI.commit(); const i = UI.$(`[data-fk="c-${r.id}"]`); if (i) { i.focus(); i.select(); } };
  UI.act.addFree = () => { const it = E.freeItem('NOVO ITEM (COTAÇÃO)', 'UN', 1, 0, 'Cotação'); const r = E.addItem(A.pj, A.sel.stage, '', 1); Object.assign(r.item, it, { id: r.item.id }); A.sel.stage = r.stage.id; UI.commit(); const i = UI.$(`[data-fk="d-${r.item.id}"]`); if (i) { i.focus(); i.select(); } };
  const memoHTML = (mm) => `<div class="tblw"><table class="tbl sm">${mm.rows.map((row, i) => `<tr>${row.map((c) => (i ? `<td${typeof c === 'number' ? ' class="r"' : ''}>${typeof c === 'number' ? U.num(c, 2, 2) : esc(String(c))}</td>` : `<th>${esc(String(c))}</th>`)).join('')}</tr>`).join('')}</table></div>`;
  UI.act.memo = (el) => { const r = UI.model().byId.get(el.dataset.id); const mm = r && r.memo && A.pj.memos && A.pj.memos[r.memo]; if (!mm) return; UI.modal(mm.titulo, `<p class="note">${esc(r.num)} · ${esc(r.desc)} — custo unitário ${U.brl(r.unitCost / 100)}</p>${memoHTML(mm)}`, { wide: true }); };
  UI.act.itemInfo = (el) => {
    const r = UI.model().byId.get(el.dataset.id); if (!r) return; const mm = r.memo && A.pj.memos && A.pj.memos[r.memo];
    UI.modal('Item ' + r.num, `<dl class="meta"><dt>Código</dt><dd>${esc(r.node.code || '—')}</dd><dt>Fonte</dt><dd>${esc(r.fonte || '—')}</dd><dt>Descrição</dt><dd>${esc(r.desc)}</dd><dt>Unidade / quantidade</dt><dd>${esc(r.unit)} · ${U.num(r.qty, 4, 2)}</dd>
      <dt>Custo unitário informado</dt><dd>${U.brl(r.unitCost / 100)}</dd><dt>Preço unitário (com BDI)</dt><dd>${U.num(r.unitPrice / 100, 6, 2)}</dd><dt>Total</dt><dd><b>${U.brl(r.total / 100)}</b></dd><dt>Evento</dt><dd>${esc(OP.evt.efetiva(r).a || '—')}</dd></dl>
      <p class="note">Item sem composição na base SICRO ativa: custo e descrição editáveis diretamente no orçamento; duração padrão de 1 dia (ajuste em Equipes).</p>${mm ? `<h4 class="sub">${esc(mm.titulo)}</h4>${memoHTML(mm)}` : ''}`, { wide: !!mm });
  };
  UI.act.crewOf = (el) => { A.sel.item = el.dataset.id; A.view = 'crews'; UI.render(); };
  UI.chg.round = (el) => { A.pj.round = el.value; UI.commit(); };
  UI.act.swapItem = (el) => {
    const f = E.find(A.pj, el.dataset.id); if (!f) return; const loc = OP.factors.locate(A.base, f.node.code);
    if (!loc) { UI.toast('Esta composição não pertence a uma árvore (própria/avulsa). Use a busca para trocar.', 'warn'); return; }
    A.trees.swap = { gi: loc.group.gi, fam: loc.family.id, path: loc.path, itemId: f.node.id };
    UI.modal('Trocar variante — a quantidade é mantida', `<div id="swapBox">${OP.catalog.treeHTML('swap')}</div>`, { wide: true, after: () => OP.catalog.drawArrows('swap') });
  };
  UI.act.swapApply = (el) => {
    const T = A.trees.swap; const f = T && E.find(A.pj, T.itemId);
    if (f) {
      const it = f.node, next = UI.code(el.dataset.code);
      if (String(it.code) !== String(next)) {
        if (it.custo != null && !confirm('A nova variante usará seu próprio custo na base ativa. O custo informado, a descrição e a unidade anteriores serão removidos. A quantidade será mantida. Prosseguir?')) return;
        ['custo', 'desc', 'unit', 'fonte', 'memo'].forEach((k) => delete it[k]);
        it.code = next; it.crew = null;
      }
    }
    UI.closeModal(); UI.commit(); UI.toast('Composição substituída; quantidade mantida.');
  };
  UI.act.abc = () => {
    const m = UI.model(); const its = [...m.items].sort((a, b) => b.total - a.total); const T = m.tot.price || 1; let acc = 0;
    const rows = its.map((r, i) => { const prev = acc / T; acc += r.total; const cls = prev < 0.8 ? 'A' : prev < 0.95 ? 'B' : 'C';
      return `<tr><td>${i + 1}</td><td>${r.num}</td><td class="code">${esc(r.node.code)}</td><td class="desc" title="${esc(r.desc)}">${esc(r.desc)}</td><td class="r">${U.num(r.total / 100, 2)}</td><td class="r">${U.pct(r.total / T)}</td><td class="r">${U.pct(acc / T)}</td><td><span class="abc ${cls}">${cls}</span></td></tr>`; }).join('');
    UI.modal('Curva ABC de serviços', `<p class="note">Classe A: serviços que somam até 80% do preço; B: de 80% a 95%; C: restante.</p><div class="tblw"><table class="tbl sm"><thead><tr><th>#</th><th>Item</th><th>Código</th><th>Descrição</th><th class="r">Total (R$)</th><th class="r">%</th><th class="r">% acum.</th><th>Classe</th></tr></thead><tbody>${rows}</tbody></table></div>`, { wide: true });
  };
})(typeof window !== 'undefined' ? window : globalThis);


