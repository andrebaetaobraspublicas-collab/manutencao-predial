/* ==== 23_ui_bdi2.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 23_ui_bdi2.js
 * Menu BDI — parte 2: método EXATO (matriz de creditamento, com
 * importação direta dos insumos do orçamento), método SIMPLES NACIONAL,
 * relatório (PDF/Word) e exportações CSV no formato do BDIPro.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const UI = OP.ui; const A = OP.app; const BD = OP.bdi; const W = OP.bdiui; const esc = U.esc;
  const pa = BD.A, B = BD.B; const P2 = W.P2, RS = W.RS, PE = W.PE;
  const setT = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  const QT = (x) => Number(x || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  /* =================== MÉTODO EXATO =================== */
  const exatoMem = (e, x) => [['Ano', x.ano], ['Tipo de obra', B.TABELA_BDI_EXATO[e.tipo]?.nome || e.tipo], ['Quartil do BDI', BD.QUARTIS[e.quartil] || e.quartil], ['IVA nominal (CBS+IBS)', P2(x.ivaCheiaNominal)],
    ['Fator setorial', P2(e.fatorSetorial)], ['Redutor de compras governamentais', P2(e.redutorGov)], ['IVA aplicável = IVA × (1 − fator) × (1 − redutor)', P2(x.ivaApl)], ['Alíquota média de ICMS em 2027', P2(x.icms2027)],
    ['ICMS residual do ano', P2(x.icmsResidual)], ['ISS municipal', P2(x.issMunicipal)], ['Redução do ISS para BDI (α)', P2(x.alpha)], ['ISS_BDI = ISS × (1 − α)', P2(x.issBdi)], ['CPRB efetiva', P2(x.cprbEfetiva)],
    ['PIS/Cofins anual', P2(x.pis)], ['T = ISS_BDI + CPRB + PIS/Cofins', P2(x.T)], ['K', x.K.toFixed(6)], ['CD — custo direto (matriz)', RS(x.CD)], ['Cr — crédito de IVA', RS(x.Cr)], ['Cr / CD', P2(x.crCD)],
    ['%MATcd = base creditável / CD', P2(x.matPct)], ['%MATcd ajustado = %MATcd × (1 − ICMS residual)', P2(x.matPctAjustado)], ['IVAeq = máx(0; IVA × (K × f − %MATcd ajustado) / K)', P2(x.IVAeq)],
    ['BDI sem IVAeq = K/(1 − T) − 1', P2(x.BDIclassico)], ['BDI = K × (1 + IVAeq)/(1 − T) − 1', P2(x.BDIreal)], ['BDI de origem', P2(x.bdiOrigem)], ['Fator de reequilíbrio', P2(x.fatorReeq)],
    ['Valor reequilibrado', RS(x.valorAjustado)], ['Preço de venda = CD × (1 + BDI)', RS(x.precoVenda)]];
  W.M.exato = {
    calc: (c) => {
      const e = c.exato; const x = BD.exatoCompute(e);
      const rows = pa.bdiBreakdownRows({ ano: x.ano, ac: x.ac, r: x.r, sg: x.sg, df: x.df, lucro: x.lucro, T: x.T, issBdi: x.issBdi, pisCofins: x.pis, cprbEfetiva: x.cprbEfetiva, ivaeq: x.IVAeq, bdi: x.BDIreal });
      return { mode: 'exato', x, e, bdi: x.BDIreal, ivaeq: x.IVAeq, ano: x.ano, rows, eq: B.bdiEquationHtmlEx(x.ano), dif: e.tipo === 'bdi_materiais', memoria: exatoMem(e, x) };
    },
    view: (c, k) => `<div class="bdi-grid"><aside class="bdi-in">${exatoIn(c, k)}</aside><section class="bdi-out"><div class="panel" id="bdiMtx">${matrix(c, k)}</div><div id="bdiOut">${W.M.exato.out(c, k)}</div></section></div>`,
    out: (c, k) => {
      const x = k.x;
      return `<div class="panel"><h3>Resultados do cálculo exato</h3>${W.kpis([['CD — custo direto', RS(x.CD), 'Σ custos parciais'], ['Cr — crédito de IVA', RS(x.Cr), 'Σ (valor p/ crédito × alíquota)'], ['Cr / CD', P2(x.crCD), 'crédito relativo ao custo'],
        ['BDI sem IVAeq', P2(x.BDIclassico), 'K/(1 − T) − 1'], ['BDI', P2(x.BDIreal), 'K × (1 + IVAeq)/(1 − T) − 1', 'hl'], ['Preço de venda', RS(x.precoVenda), 'CD × (1 + BDI)'],
        ['Valor reequilibrado', RS(x.valorAjustado), `${RS(x.valorBase)} × (1 ${x.fatorReeq >= 0 ? '+' : '-'} ${P2(Math.abs(x.fatorReeq))})`], ['%MATcd', P2(x.matPct), 'base creditável / CD'], ['%MATcd ajustado', P2(x.matPctAjustado), '%MATcd × (1 − ICMS residual)'],
        ['IVA equivalente', P2(x.IVAeq), 'máx(0; IVA × (K × f − %MATcd aj.)/K)', 'hl'], ['Fator de reequilíbrio', P2(x.fatorReeq), '((1 + BDI)/(1 + BDI origem)) − 1']])}
        <div class="bdi-two">${W.breakdown(k.rows, x.ano, k.eq)}<div class="formula">Lógica (conforme planilha):\nPreço de venda = CD · (1 + BDI)\nValor reequilibrado = Valor contratual · (1 + fator de reequilíbrio)\nIVAeq = máx(0; IVA nominal · (K · f − %MATcd ajustado) / K)</div></div></div>`;
    },
    live: (c, k) => {
      const x = k.x; x.linhas.forEach((l, i) => { setT('mxp-' + i, P2(l.pct)); setT('mxb-' + i, RS(l.base)); setT('mxc-' + i, RS(l.cr)); });
      setT('mxtCD', RS(x.CD)); setT('mxtB', RS(x.baseCredTotal)); setT('mxtC', RS(x.Cr)); setT('bdiExK', x.K.toFixed(6)); setT('bdiExPis', P2(x.pis)); setT('bdiExIva', P2(x.ivaApl));
    },
    onInput: (c, key) => { if (key === 'ivaCheia') { BD.exatoSyncIva(c.exato); c.exato.rows.forEach((r, i) => { const el = document.querySelector(`[data-fk="mx-${i}-iva"]`); if (el && el !== document.activeElement) el.value = PE(r.iva); }); } return false; },
    onSelect: (c, key) => { const e = c.exato; if (key === 'ano') BD.exatoAno(e); else if (key === 'tipo' || key === 'quartil') BD.exatoTipo(e); else BD.exatoNormaliza(e); },
  };
  function exatoIn(c, k) {
    const e = c.exato, x = k.x; const bloq = Number(e.ano) >= 2028; const anos = B.TRANSICAO_EXATO.map((y) => y.ano); const orig = anos.filter((a) => a < Number(e.ano));
    return W.card(c, 'e1', '1', 'Obra e período', `<p class="note">Definem o ano simulado, o tipo de obra e o quartil de referência usado nos parâmetros do BDI.</p><div class="fg">${W.sel('exato', 'ano', 'Ano de referência', anos.map((a) => [a, a]), e.ano, 'Alíquotas anuais de CBS/IBS, PIS/Cofins e ISS')}
        ${W.sel('exato', 'tipo', 'Tipo de obra', Object.entries(B.TABELA_BDI_EXATO).map(([kk, v]) => [kk, v.nome]), e.tipo, 'Base referencial usada no BDI')}${W.sel('exato', 'quartil', 'Quartil do BDI', W.quartis(true), e.quartil, 'Preenche AC, R, S+G, DF e Lucro')}</div>
        ${e.tipo === 'bdi_materiais' ? `<p class="note bdi-note">${W.NOTA_RED}</p>` : ''}${x.teste2026 ? `<p class="note bdi-note">${W.NOTA_2026}</p>` : ''}`)
      + W.card(c, 'e2', '2', 'Parâmetros de BDI', `<div class="fg">${W.pct('exato', 'ac', 'Administração Central (AC)', e.ac, { slider: 20 })}${W.pct('exato', 'risco', 'Risco (R)', e.risco, { slider: 20 })}${W.pct('exato', 'sg', 'Seguros e Garantias (S+G)', e.sg, { slider: 20 })}
        ${W.pct('exato', 'df', 'Despesas Financeiras (DF)', e.df, { slider: 20 })}${W.pct('exato', 'lucro', 'Lucro Bruto (L)', e.lucro, { slider: 25 })}<div class="fld"><span>Fator K</span><div class="derived" id="bdiExK">${x.K.toFixed(6)}</div></div></div>`)
      + W.card(c, 'e3', '3', 'Tributos e reduções', `<p class="note">IVA efetivo = IVA nominal × (1 − fator setorial) × (1 − redutor governamental)</p><div class="fg">${W.pct('exato', 'ivaCheia', 'IVA nominal (CBS+IBS)', e.ivaCheia, { help: 'Preenchido pelo ano, mas editável' })}
        ${W.pct('exato', 'fatorSetorial', 'Fator setorial', e.fatorSetorial, { slider: 100, help: 'Ex.: 50 = redução setorial de 50%' })}${W.pct('exato', 'redutorGov', 'Redutor compras governamentais', e.redutorGov, { slider: 100, help: 'Art. 370 LC 214/2025' })}
        ${W.pct('exato', 'icms2027', 'Alíquota média de ICMS em 2027', e.icms2027, { slider: 30, help: 'Mantida em 2028; reduzida até 2032; zero a partir de 2033' })}${W.pct('exato', 'iss', 'ISS municipal', e.iss, { slider: 10 })}
        ${W.pct('exato', 'alpha', 'Redução do ISS para BDI (α)', e.alpha, { slider: 100, help: 'ISS_BDI = ISS × (1 − α)' })}${W.pct('exato', 'cprb', 'CPRB', e.cprb, { slider: 10, disabled: bloq, help: bloq ? 'CPRB zerada automaticamente a partir de 2028' : '' })}
        <div class="fld"><span>PIS/Cofins anual</span><div class="derived" id="bdiExPis">${P2(x.pis)}</div></div><div class="fld"><span>Alíquota IVA aplicável</span><div class="derived" id="bdiExIva">${P2(x.ivaApl)}</div></div></div>`)
      + W.card(c, 'e4', '4', 'Reequilíbrio do contrato', `<p class="note">Compara o BDI do ano simulado com o BDI de origem informado manualmente ou calculado para o ano anterior.</p><div class="fg">${W.money('exato', 'valorContrato', 'Valor contratual/remanescente', e.valorContrato, UI.model().tot.price > 0 ? 'bdiUseTotal' : null)}
        ${W.sel('exato', 'anoOrigem', 'Ano de origem do BDI', orig.length ? orig.map((a) => [a, a]) : [['', 'Sem ano anterior']], e.anoOrigem, 'Deve ser anterior ao ano simulado', !orig.length)}
        ${W.sel('exato', 'usarBdiOriginal', 'BDI original manual?', [[0, 'Não'], [1, 'Sim']], e.usarBdiOriginal)}${W.pct('exato', 'bdiOriginalManual', 'BDI original manual', e.bdiOriginalManual)}</div>`, true);
  }
  function matrix(c, k) {
    const e = c.exato, x = k.x;
    return `<div class="vh" style="margin:0 0 8px"><div><h3 style="margin:0">Matriz de creditamento</h3><p class="note" style="margin:2px 0 0">A geração de crédito (%) indica a fração do custo parcial considerada para crédito de IVA.</p></div>
      <div class="vh-a"><button class="btn pri sm" data-act="bdiRowsBudget" title="Explode as composições do orçamento em insumos e recursos (materiais, mão de obra e equipamentos)">${UI.icon('budget', 15)} Importar do orçamento</button>
      <button class="btn sm" data-act="bdiRowAdd">${UI.icon('plus', 15)} Insumo</button><button class="btn ghost sm" data-act="bdiRowsFile" title="Colunas: Descrição | Unidade | Quantidade | Custo Parcial | Tipo de Insumo | Geração de crédito | Alíquota IVA">Importar .xlsx/.csv</button>
      <button class="btn ghost sm" data-act="bdiRowsCsv">Exportar CSV</button><button class="btn ghost sm" data-act="bdiRowsSort">Ordenar ↓</button><button class="btn ghost sm" data-act="bdiRowsEx">Exemplo</button><button class="btn ghost sm danger" data-act="bdiRowsClear">Limpar</button></div></div>
      ${e.fonte ? `<p class="note">${esc(e.fonte)}</p>` : ''}
      <div class="tblw mtx" data-keep="mtx"><table class="tbl sm"><thead><tr><th>Descrição do insumo</th><th>Un.</th><th class="r">Quantidade</th><th class="r">Custo parcial</th><th class="r">%</th><th>Tipo de insumo</th><th class="r">Geração de crédito (%)</th><th class="r">Valor p/ crédito</th><th class="r">Alíquota IVA (%)</th><th class="r">Crédito de IVA</th><th></th></tr></thead>
      <tbody>${e.rows.length ? e.rows.map((r, i) => `<tr><td><input class="mi w" data-fk="mx-${i}-desc" data-in="bdiRow" data-i="${i}" data-k="desc" value="${esc(r.desc)}"></td><td><input class="mi s" data-fk="mx-${i}-un" data-in="bdiRow" data-i="${i}" data-k="un" value="${esc(r.un)}"></td>
        <td class="r"><input class="mi n" data-fk="mx-${i}-qt" data-in="bdiRow" data-ch="bdiRowFmt" data-i="${i}" data-k="qt" value="${QT(r.qt)}"></td><td class="r"><input class="mi n" data-fk="mx-${i}-custo" data-in="bdiRow" data-ch="bdiRowFmt" data-i="${i}" data-k="custo" value="${RS(Number(r.custo || 0))}"></td>
        <td class="r" id="mxp-${i}">${P2(x.linhas[i].pct)}</td><td><select class="mi" data-ch="bdiRowSel" data-i="${i}">${B.TIPOS.map((t) => `<option${t === r.tipo ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
        <td class="r"><input class="mi p" data-fk="mx-${i}-ger" data-in="bdiRow" data-ch="bdiRowFmt" data-i="${i}" data-k="ger" value="${PE(r.ger)}"></td><td class="r" id="mxb-${i}">${RS(x.linhas[i].base)}</td>
        <td class="r"><input class="mi p" data-fk="mx-${i}-iva" data-in="bdiRow" data-ch="bdiRowFmt" data-i="${i}" data-k="iva" value="${PE(r.iva)}"></td><td class="r" id="mxc-${i}">${RS(x.linhas[i].cr)}</td>
        <td><button class="ib sm danger" data-act="bdiRowDel" data-i="${i}" title="Remover">${UI.icon('trash', 14)}</button></td></tr>`).join('') : '<tr><td colspan="11" class="muted" style="text-align:center;padding:18px">Matriz vazia — importe os insumos do orçamento, de uma planilha ou adicione manualmente.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3">TOTAL · ${e.rows.length} insumo(s)</td><td class="r" id="mxtCD">${RS(x.CD)}</td><td class="r">${e.rows.length ? '100,00%' : '—'}</td><td></td><td></td><td class="r" id="mxtB">${RS(x.baseCredTotal)}</td><td></td><td class="r" id="mxtC">${RS(x.Cr)}</td><td></td></tr></tfoot></table></div>`;
  }
  /* explode o orçamento em insumos/recursos: mão de obra (H) e equipamentos (CHP/CHI) são recursos; auxiliares descem até o insumo */
  W.budgetRows = () => {
    const m = UI.model(); const b = A.base, uf = A.pj.uf, rg = A.pj.rg; const c = W.cfg(); const iva = BD.exatoIvaPadrao(c.exato); const memo = new Map();
    const unit = (code) => {
      const key = String(code); if (memo.has(key)) return memo.get(key); const res = new Map(); memo.set(key, res);
      for (const r of b.itemsOf(code, uf, rg)) {
        if (r.price == null || !r.coef) continue;
        if (r.type === 'I' || r.labor || r.equip) {
          const kk = r.type + ':' + r.code; const tipo = r.type === 'I' ? (r.cat === 'mo' ? 'Mão de Obra' : r.cat === 'eq' ? 'Equipamento' : 'Material') : (r.labor ? 'Mão de Obra' : 'Equipamento');
          const x = res.get(kk) || { code: r.code, desc: r.desc, un: r.unit, qt: 0, custo: 0, tipo }; x.qt += r.coef; x.custo += r.coef * r.price / 100; res.set(kk, x);
        } else for (const [kk, s] of unit(r.code)) { const x = res.get(kk) || { ...s, qt: 0, custo: 0 }; x.qt += r.coef * s.qt; x.custo += r.coef * s.custo; res.set(kk, x); }
      }
      return res;
    };
    const acc = new Map();
    for (const it of m.items) {
      if (!(it.qty > 0) || !it.unitCost) continue;
      if (!it.comp) { const kk = 'F:' + it.id; acc.set(kk, { code: it.node.code || it.fonte || 'item', desc: it.desc, un: it.unit, qt: it.qty, custo: it.direct / 100, tipo: 'Material' }); continue; }
      const kf = it.fixo && it.ucBase ? it.unitCost / it.ucBase : 1;   // custo informado: escala a explosão da base
      for (const [kk, s] of unit(it.node.code)) { const x = acc.get(kk) || { ...s, qt: 0, custo: 0 }; x.qt += it.qty * s.qt; x.custo += it.qty * s.custo * kf; acc.set(kk, x); }
    }
    const credeq = Number(c.param.credeq); const ger = { Material: 1, 'Mão de Obra': 0.1, Equipamento: isFinite(credeq) ? credeq : 0.4 };
    const rows = [...acc.values()].filter((x) => x.custo >= 0.005).sort((a, z) => z.custo - a.custo)
      .map((x) => ({ desc: `${x.desc} (${x.code})`, un: x.un, qt: Math.round(x.qt * 10000) / 10000, custo: Math.round(x.custo * 100) / 100, tipo: x.tipo, ger: ger[x.tipo], iva, ivaCustom: false }));
    return { rows, total: rows.reduce((a, r) => a + r.custo, 0), direto: m.tot.direct / 100, credeq: ger.Equipamento };
  };
  const parseCSV = (txt) => {
    txt = String(txt).replace(/^\uFEFF/, ''); const first = txt.split(/\r?\n/)[0] || '';
    const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  };
  UI.inp.bdiRow = (el) => {
    const e = W.cfg().exato; const i = +el.dataset.i, k = el.dataset.k; const r = e.rows[i]; if (!r) return;
    r[k] = (k === 'desc' || k === 'un') ? el.value : ((k === 'ger' || k === 'iva') ? B.parsePercent(el.value) : B.num(el.value));
    if (k === 'iva') r.ivaCustom = true; W.soon();
  };
  UI.chg.bdiRowFmt = (el) => { const r = W.cfg().exato.rows[+el.dataset.i]; if (!r) return; const k = el.dataset.k; el.value = k === 'qt' ? QT(r.qt) : k === 'custo' ? RS(Number(r.custo || 0)) : PE(r[k]); };
  UI.chg.bdiRowSel = (el) => { const r = W.cfg().exato.rows[+el.dataset.i]; if (r) { r.tipo = el.value; W.refresh(); } };
  UI.act.bdiRowDel = (el) => { W.cfg().exato.rows.splice(+el.dataset.i, 1); UI.saveSoon(); UI.render(); };
  UI.act.bdiRowAdd = () => { const e = W.cfg().exato; e.rows.push(BD.exatoNovaLinha(e)); UI.saveSoon(); UI.render(); const el = UI.$(`[data-fk="mx-${e.rows.length - 1}-desc"]`); if (el) el.focus(); };
  UI.act.bdiRowsClear = () => { if (!confirm('Limpar todos os insumos da matriz?')) return; const e = W.cfg().exato; e.rows = []; e.fonte = ''; UI.saveSoon(); UI.render(); };
  UI.act.bdiRowsEx = () => { const e = W.cfg().exato; e.rows = B.EXEMPLO.map((r) => ({ ...r })); BD.exatoFillIva(e); e.fonte = 'Exemplo da planilha de referência do BDIPro (obra rodoviária).'; UI.saveSoon(); UI.render(); };
  UI.act.bdiRowsSort = () => { W.cfg().exato.rows.sort((a, b) => Number(b.custo || 0) - Number(a.custo || 0)); UI.saveSoon(); UI.render(); };
  UI.act.bdiRowsBudget = () => {
    const r = W.budgetRows(); if (!r.rows.length) { UI.toast('O orçamento não tem serviços com quantidade e custo.', 'warn'); return; }
    const e = W.cfg().exato; if (e.rows.length && !confirm(`Substituir os ${e.rows.length} insumos da matriz pelos ${r.rows.length} insumos/recursos do orçamento?`)) return;
    e.rows = r.rows;
    e.fonte = `Importado do orçamento em ${new Date().toLocaleDateString('pt-BR')}: ${r.rows.length} insumos/recursos (${A.pj.uf}, ${OP.sicro.REGIMES[A.pj.rg]}). Geração de crédito inicial: material 100%, mão de obra 10% e equipamento ${P2(r.credeq, 1)} (o % de crédito de equipamentos do paramétrico). Soma explodida ${RS(r.total)} × custo direto do orçamento ${RS(r.direto)} — diferença de centavos pelo truncamento item a item das composições.`;
    UI.saveSoon(); UI.render(); UI.toast(`${r.rows.length} insumos/recursos do orçamento importados para a matriz.`);
  };
  UI.act.bdiRowsFile = async () => {
    const f = await UI.pickFile('.xlsx,.csv,text/csv'); if (!f) return;
    try {
      let arr;
      if (/\.csv$/i.test(f.name) || f.type === 'text/csv') arr = parseCSV(await f.text());
      else { const wb = await OP.xlsx.readWorkbook(f); arr = []; await OP.xlsx.readSheet(wb, wb.sheets[0], (rn, v) => arr.push(v.map((x) => (x == null ? '' : x)))); }
      const e = W.cfg().exato; const out = B.parseImportedPuro(arr, BD.exatoIvaPadrao(e));
      if (!out.length) { UI.toast('Nenhum insumo reconhecido. Verifique as colunas Descrição, Custo Parcial e Geração de crédito.', 'warn'); return; }
      e.rows = out; e.fonte = `Importado de ${f.name}: ${out.length} insumo(s).`; UI.saveSoon(); UI.render(); UI.toast(`${out.length} insumo(s) importado(s).`);
    } catch (err) { console.error(err); UI.toast('Falha ao ler o arquivo: ' + err.message, 'warn'); }
  };
  W.exatoCsv = () => {
    const e = W.cfg().exato; const ano = Number(e.ano); const ivaCheia = ano === 2026 ? 0 : Number(e.ivaCheia || 0); const icmsResidual = B.icmsResidualExatoPorAno(ano, e.icms2027);
    const lines = [['Descrição', 'Unidade', 'Quantidade', 'Custo Parcial', 'Tipo de Insumo', 'Geração de crédito', 'Valor considerado para crédito', 'Alíquota IVA', 'Crédito de IVA'].join(';')];
    e.rows.forEach((r) => { const baseCredito = r.ger * r.custo * (1 - icmsResidual); const aliqIva = Number(r.iva ?? ivaCheia); const credito = baseCredito * aliqIva;
      lines.push([`"${String(r.desc).replace(/"/g, '""')}"`, r.un, r.qt, r.custo, r.tipo, B.fmtPctInput(r.ger), baseCredito, B.fmtPctInput(aliqIva), credito].join(';')); });
    OP.exp.download('matriz_creditamento.csv', '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8');
  };
  UI.act.bdiRowsCsv = () => W.exatoCsv();

  /* =================== SIMPLES NACIONAL =================== */
  const sp = (v) => pa.simPct(v), sm = (v) => pa.simMoeda(v);
  const simplesRows = (y) => [['Administração Central (AC)', y.ac, 'rub'], ['Seguros e Garantias (S+G)', y.sg, 'rub'], ['Risco (R)', y.r, 'rub'], ['Despesas Financeiras (DF)', y.df, 'rub'], ['Lucro Bruto (L)', y.lucro, 'rub'],
    ['IRPJ - incluído no lucro bruto', y.tributos.irpj, 'sub'], ['CSLL - incluída no lucro bruto', y.tributos.csll, 'sub'], ['PIS', y.tributos.pis, 'sub'], ['Cofins', y.tributos.cofins, 'sub'], ['CBS', y.tributos.cbs, 'sub'],
    ['IBS', y.tributos.ibs, 'sub'], ['ISS', y.tributos.iss, 'sub'], ['CPRB', y.tributos.cprb, 'sub'], ['CPP embutida no DAS', y.tributos.cpp, 'sub'], ['IVA equivalente', y.ivaeq, 'rub'], ['BDI (%)', y.bdi, 'total-name']];
  const simplesEq = (y) => (y.modelo === 'hibrido'
    ? `K = (1+AC+R+S+G) × (1+DF) × (1+L) = ${pa.simNum(y.K, 6)}\nf = (1-redutor setorial) × (1-redutor governamental) = ${sp(y.f)}\nICMS residual = ${sp(y.icmsResidual)}\n%MATcd ajustado = %MATcd × (1 - ICMS residual) = ${sp(y.matcdAjustado)}\nIVAt anual = CBS informada + IBS do ano = ${sp(y.cbsIvaeq)} + ${sp(y.ibsIvaeq)} = ${sp(y.ivatCheio)}\nIVAeq = max(0; IVAt anual × (K × f - %MATcd ajustado) / K) = ${sp(y.ivaeq)}\nT = demais tributos do DAS, sem IRPJ/CSLL e sem CBS/IBS, + CPRB = ${sp(y.T)}\nBDI = K × (1 + IVAeq) / (1 - T) - 1 = ${sp(y.bdi)}`
    : `K = (1+AC+R+S+G) × (1+DF) × (1+L) = ${pa.simNum(y.K, 6)}\nT Simples = DAS sem IRPJ/CSLL + CPRB aplicável = ${sp(y.T)}\nIVAeq = 0,00% no modelo DAS unificado\nBDI Simples = K / (1 - T Simples) - 1 = ${sp(y.bdi)}`);
  const h = (y) => y.modelo === 'hibrido';
  const simplesMem = (y) => [['Modelo', h(y) ? 'Híbrido — IBS/CBS por fora' : 'DAS unificado'], ['Tipo de obra', pa.tabelaBdi[y.tipoObra]?.nome || y.tipoObra], ['Quartil do BDI', BD.QUARTIS[y.quartilBdi] || 'Média'], ['Receita Bruta', sm(y.rbt12)],
    ['Faixa', `Faixa ${y.faixa.faixa}`], ['Alíquota nominal', sp(y.faixa.aliquota)], ['Parcela a deduzir', sm(y.faixa.deduzir)], ['Alíquota efetiva', sp(y.aliqEf)], ['IRPJ - incluído no lucro bruto', sp(y.tributos.irpj)],
    ['CSLL - incluída no lucro bruto', sp(y.tributos.csll)], ['PIS', sp(y.tributos.pis)], ['Cofins', sp(y.tributos.cofins)], ['CBS', sp(y.tributos.cbs)], ['IBS', sp(y.tributos.ibs)], ['ISS', sp(y.tributos.iss)],
    ['CPRB efetiva', sp(y.tributos.cprb)], ['T usado no BDI, sem IRPJ/CSLL', sp(y.T)], ['Total tributário efetivo', sp(y.total)], ['CBS informada para IVAeq', h(y) ? sp(y.cbsCheia) : 'Não aplicável'],
    ['IBS cheio 2033 informado', h(y) ? sp(y.ibsCheio) : 'Não aplicável'], ['IBS do ano usado no IVAeq', h(y) ? sp(y.ibsIvaeq) : 'Não aplicável'], ['IVAt anual usado no IVAeq', h(y) ? sp(y.ivatCheio) : 'Não aplicável'],
    ['ICMS residual aplicado ao ano', h(y) ? sp(y.icmsResidual) : 'Não aplicável'], ['%MATcd bruto', sp(y.matcd)], ['%MATcd ajustado = %MATcd × (1 − ICMS residual)', h(y) ? sp(y.matcdAjustado) : 'Não aplicável'],
    ['IVAeq', sp(y.ivaeq)], ['BDI', sp(y.bdi)], ['Preço de venda / valor final', sm(y.precoVenda)]];
  W.M.simples = {
    calc: (c) => { const y = BD.simplesCompute(c.simples); return { mode: 'simples', y, bdi: y.bdi, ivaeq: y.ivaeq, ano: y.ano, rows: simplesRows(y), eq: simplesEq(y), dif: c.simples.tipoObra === 'bdi_materiais', memoria: simplesMem(y) }; },
    view: (c, k) => `<div class="bdi-grid"><aside class="bdi-in">${simplesIn(c)}</aside><section class="bdi-out" id="bdiOut">${W.M.simples.out(c, k)}</section></div>`,
    out: (c, k) => {
      const y = k.y, tab = c.tab.simples || 'aliq';
      const resumo = [['Modelo de cálculo', h(y) ? 'Híbrido — IBS/CBS por fora' : 'DAS unificado'], ['Faixa identificada', `Faixa ${y.faixa.faixa} (${sm(y.faixa.de)} a ${sm(y.faixa.ate)})`], ['Alíquota nominal', sp(y.faixa.aliquota)], ['Parcela a deduzir', sm(y.faixa.deduzir)],
        ['T usado no BDI', sp(y.T)], ['K', pa.simNum(y.K, 6)], ['Fator efetivo', sp(y.f)], ['IVAt anual para IVAeq', h(y) ? `${sp(y.cbsIvaeq)} CBS + ${sp(y.ibsIvaeq)} IBS = ${sp(y.ivatCheio)}` : 'Não aplicável'],
        ['ICMS residual do ano', h(y) ? sp(y.icmsResidual) : 'Não aplicável'], ['%MATcd ajustado', h(y) ? sp(y.matcdAjustado) : 'Não aplicável']];
      return W.kpis([['BDI Simples', sp(y.bdi), '', 'hl'], ['Faixa', 'Faixa ' + y.faixa.faixa], ['Alíquota efetiva', sp(y.aliqEf)], ['IVA equivalente', sp(y.ivaeq)], ['Preço de venda', sm(y.precoVenda)]])
        + `<div class="panel"><h3>Resumo automático</h3><div class="resumo">${resumo.map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('')}</div></div>`
        + W.tabs('simples', [['aliq', '4. Alíquota efetiva'], ['dec', '5. Decomposição'], ['bdi', '6. Cálculo do BDI'], ['cmp', '7. Comparação']], tab) + `<div class="bdi-tab">${ST[tab](c, k)}</div>`;
    },
    live: (c) => { const al = UI.$('#bdiSimAlert'); if (al) al.hidden = !(c.simples.rbt12 > pa.TabelasTributarias.simples.limite); },
    onSelect: (c, k) => { if (k === 'tipoObra' || k === 'quartilBdi') BD.simplesTipo(c.simples); },
  };
  function simplesIn(c) {
    const s = c.simples; const t = UI.model().tot;
    return W.card(c, 's1', '1', 'Obra e período', `<div class="fg">${W.sel('simples', 'ano', 'Ano de cálculo', [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034].map((a) => [a, a === 2034 ? '2034+' : a]), s.ano)}
        ${W.sel('simples', 'tipoObra', 'Tipo de obra', W.tipos(), s.tipoObra)}${W.sel('simples', 'quartilBdi', 'Quartil do BDI', W.quartis(), s.quartilBdi)}${W.money('simples', 'custoDireto', 'Custo direto/remanescente', s.custoDireto, t.direct > 0 ? 'bdiUseCD' : null)}</div>`)
      + W.card(c, 's2', '2', 'Parâmetros de BDI', `<div class="fg">${W.pct('simples', 'ac', 'Administração Central (AC)', s.ac, { slider: 20 })}${W.pct('simples', 'r', 'Risco (R)', s.r, { slider: 20 })}${W.pct('simples', 'sg', 'Seguros e Garantias (S+G)', s.sg, { slider: 20 })}
        ${W.pct('simples', 'df', 'Despesas Financeiras (DF)', s.df, { slider: 20 })}${W.pct('simples', 'lucro', 'Lucro (L)', s.lucro, { slider: 25 })}${W.pct('simples', 'matcd', '%MATcd do contrato', s.matcd)}${W.pct('simples', 'fatorSetorial', 'Fator setorial', s.fatorSetorial)}
        ${W.pct('simples', 'redutorGov', 'Redutor governamental', s.redutorGov)}${W.pct('simples', 'icms2027', 'Alíquota média de ICMS em 2027', s.icms2027)}${W.pct('simples', 'cbsCheia', 'CBS', s.cbsCheia)}${W.pct('simples', 'ibsCheio', 'IBS cheio 2033', s.ibsCheio)}</div>
        <p class="note">Pré-preenchidos pelo tipo de obra e quartil, mas editáveis.</p>`)
      + W.card(c, 's3', '3', 'Dados da empresa', `<div class="fg">${W.sel('simples', 'modelo', 'Modelo', [['das', 'DAS unificado'], ['hibrido', 'Híbrido — IBS/CBS por fora']], s.modelo)}${W.sel('simples', 'anexo', 'Anexo do Simples', [['III', 'Anexo III'], ['IV', 'Anexo IV'], ['V', 'Anexo V']], s.anexo)}
        ${W.money('simples', 'rbt12', 'Receita bruta 12 meses (RBT12)', s.rbt12)}${W.sel('simples', 'cprbOpt', 'Opção pela CPRB', [['sim', 'Sim'], ['nao', 'Não']], s.cprbOpt ? 'sim' : 'nao')}
        ${W.txt('simples', 'razao', 'Razão social', s.razao)}${W.txt('simples', 'cnpj', 'CNPJ', s.cnpj)}${W.txt('simples', 'cnae', 'CNAE principal', s.cnae)}${W.txt('simples', 'cnaeSec', 'CNAE secundários', s.cnaeSec)}${W.txt('simples', 'municipio', 'Município', s.municipio)}${W.txt('simples', 'estado', 'Estado', s.estado)}</div>
        <div id="bdiSimAlert" class="alertbox"${s.rbt12 > pa.TabelasTributarias.simples.limite ? '' : ' hidden'}>A Receita Bruta informada supera o limite da Faixa 6 do Simples Nacional. Avalie Lucro Presumido ou Lucro Real.</div>`, true);
  }
  const ST = {
    aliq: (c, k) => { const y = k.y; const an = pa.TabelasTributarias.simples.anexos[y.anexo];
      return `<div class="bdi-two"><div><h4 class="sub" style="margin-top:0">Passo a passo</h4>${W.memo([['Receita Bruta dos últimos 12 meses', sm(y.rbt12)], ['Anexo selecionado', an.nome], ['Faixa identificada', 'Faixa ' + y.faixa.faixa], ['Alíquota nominal', sp(y.faixa.aliquota)], ['Parcela a deduzir', sm(y.faixa.deduzir)], ['Fórmula', '(RBT12 × Alíquota nominal − Parcela a deduzir) / RBT12'], ['Cálculo', `(${sm(y.rbt12)} × ${sp(y.faixa.aliquota)} − ${sm(y.faixa.deduzir)}) / ${sm(y.rbt12)}`], ['Alíquota efetiva', sp(y.aliqEf)]])}</div>
        <div><h4 class="sub" style="margin-top:0">Tabela do ${esc(an.nome)}</h4><div class="tblw"><table class="tbl sm"><thead><tr><th>Faixa</th><th class="r">Limite inferior</th><th class="r">Limite superior</th><th class="r">Alíquota nominal</th><th class="r">Parcela a deduzir</th></tr></thead><tbody>${an.faixas.map((f) => `<tr${f.faixa === y.faixa.faixa ? ' class="hlrow"' : ''}><td>Faixa ${f.faixa}</td><td class="r">${sm(f.de)}</td><td class="r">${sm(f.ate)}</td><td class="r">${sp(f.aliquota)}</td><td class="r">${sm(f.deduzir)}</td></tr>`).join('')}</tbody></table></div><p class="note">${esc(an.observacao)}</p></div></div>`; },
    dec: (c, k) => { const y = k.y; const tl = h(y) ? 'T usado no BDI (demais tributos do DAS, sem IRPJ/CSLL e sem CBS/IBS, + CPRB)' : 'T usado no BDI (DAS sem IRPJ/CSLL + CPRB quando aplicável)';
      const notaAnexo = y.anexo === 'IV' ? 'No Anexo IV, a CPRB é apresentada separadamente quando aplicável.' : 'Nos Anexos III e V, a contribuição previdenciária patronal permanece embutida no DAS.';
      const regra = (a) => (a === 2026 ? 'PIS/Cofins e ISS integral' : a <= 2028 ? 'PIS/Cofins convertidos em CBS/IBS; ISS integral' : a === 2029 ? 'CBS; 10% do ISS migra ao IBS' : a === 2030 ? 'CBS; 20% do ISS migra ao IBS' : a === 2031 ? 'CBS; 30% do ISS migra ao IBS' : a === 2032 ? 'CBS; 40% do ISS migra ao IBS' : 'CBS; ISS extinto e substituído pelo IBS');
      return `<div class="bdi-two"><div><div class="tblw"><table class="tbl sm"><thead><tr><th>Tributo</th><th class="r">Carga efetiva</th><th class="r">Valor estimado</th></tr></thead><tbody>${pa.tributosSimples(y).map(([n, v]) => `<tr><td>${n}</td><td class="r">${sp(v)}</td><td class="r">${sm(y.custoDireto * v)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total tributário efetivo</td><td class="r">${sp(y.total)}</td><td class="r">${sm(y.custoDireto * y.total)}</td></tr><tr><td>${tl}</td><td class="r">${sp(y.T)}</td><td class="r">${sm(y.custoDireto * y.T)}</td></tr></tfoot></table></div>
        <p class="note">${esc(y.cron.obs)} ${pa.notaAjusteIssSimples(y)} IRPJ e CSLL são exibidos para transparência, mas não integram o termo T do BDI; podem ser considerados pelo usuário na taxa de lucro bruto. ${notaAnexo} ${h(y) ? 'No modelo híbrido, CBS e IBS são tratados por fora e entram no IVA equivalente.' : 'No DAS unificado, não há IVA equivalente: o termo T usa apenas os tributos do DAS que entram no BDI.'}</p></div>
        <div><h4 class="sub" style="margin-top:0">Composição dos tributos</h4>${W.donut(pa.tributosSimples(y).filter((x) => x[1] > 0))}</div></div>
        <h4 class="sub">Motor cronológico da Reforma Tributária</h4><div class="tblw"><table class="tbl sm"><thead><tr><th>Ano</th><th>Regra de transição aplicada ao DAS</th><th class="r">CPRB Anexo IV</th><th>Observação</th></tr></thead><tbody>${[2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034].map((a) => { const cr = BD.simplesCron(a); return `<tr${a === y.ano ? ' class="hlrow"' : ''}><td>${a === 2034 ? '2034+' : a}</td><td>${regra(a)}</td><td class="r">${sp(cr.cprb || 0)}</td><td>${esc(cr.obs)}</td></tr>`; }).join('')}</tbody></table></div>`; },
    bdi: (c, k) => `<div class="bdi-two">${W.breakdown(k.rows, k.y.ano, k.eq)}<div><h4 class="sub" style="margin-top:0">Memória de cálculo</h4>${W.memo(k.memoria)}</div></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="bdiSimplesApply" title="Usa o IVA equivalente do Simples no cálculo paramétrico do mesmo ano">Aplicar IVAeq ao BDI paramétrico</button><button class="btn ghost" data-act="bdiCsv">${UI.icon('dl', 15)} Exportar CSV</button><button class="btn ghost" data-act="bdiReport">${UI.icon('pdf', 15)} Relatório</button></div>`,
    cmp: (c, k) => {
      const y = k.y, s = c.simples; const cm = BD.simplesComparacao(y, s.cenRbt12, s.cenAnexo); const cen = cm.cenario;
      return `<div class="fg" style="max-width:560px">${W.money('simples', 'cenRbt12', 'Cenário: nova RBT12', s.cenRbt12)}${W.sel('simples', 'cenAnexo', 'Cenário: novo anexo', [['III', 'Anexo III'], ['IV', 'Anexo IV'], ['V', 'Anexo V'], ['LP', 'Sai do Simples: Lucro Presumido'], ['LR', 'Sai do Simples: Lucro Real']], s.cenAnexo)}</div>
        <div class="tblw"><table class="tbl sm"><thead><tr><th>Cenário</th><th>Regime/Anexo</th><th class="r">RBT12</th><th class="r">Faixa</th><th class="r">Alíquota efetiva</th><th class="r">BDI</th><th class="r">Preço</th><th class="r">Impacto</th></tr></thead><tbody>
        <tr><td>Atual</td><td>Simples Anexo ${y.anexo}</td><td class="r">${sm(y.rbt12)}</td><td class="r">${y.faixa.faixa}</td><td class="r">${sp(y.aliqEf)}</td><td class="r">${sp(y.bdi)}</td><td class="r">${sm(y.precoVenda)}</td><td class="r">—</td></tr>
        <tr><td>Simulado</td><td>${cen.anexo && String(cen.anexo).startsWith('Lucro') ? cen.anexo : 'Simples Anexo ' + cen.anexo}</td><td class="r">${sm(cen.rbt12)}</td><td class="r">${cen.faixa.faixa}</td><td class="r">${sp(cen.aliqEf)}</td><td class="r">${sp(cen.bdi)}</td><td class="r">${sm(cen.precoVenda)}</td><td class="r">${sm(cen.precoVenda - y.precoVenda)}</td></tr>
        <tr><td>Saída do Simples</td><td>Lucro Presumido</td><td class="r">—</td><td class="r">—</td><td class="r">—</td><td class="r">${sp(cm.lp.bdi)}</td><td class="r">${sm(cm.lp.precoVenda)}</td><td class="r">${sm(cm.lp.precoVenda - y.precoVenda)}</td></tr></tbody></table></div>
        <div class="bdi-two" style="margin-top:12px"><div><h4 class="sub" style="margin-top:0">Comparação de BDI por regime</h4>${W.bars(cm.regimes.map((r) => [r.regime, r.bdi]))}</div>
        <div><h4 class="sub" style="margin-top:0">Evolução 2026 a 2034</h4>${W.line([{ pts: cm.evol.map(([a, v]) => [+a, v]), color: OP.charts.pal().blue, label: 'BDI Simples' }], { fx: (v) => String(Math.round(v)), xticks: cm.evol.map(([a]) => +a), dots: 1, w: 520, h: 240 })}</div></div>
        <h4 class="sub">Comparação tributária por regime</h4><div class="tblw"><table class="tbl sm"><thead><tr><th>Regime</th><th class="r">Tributação</th><th class="r">IVAeq</th><th class="r">BDI</th><th class="r">Preço de venda</th><th class="r">Diferença vs. Simples</th></tr></thead><tbody>${cm.regimes.map((r) => `<tr><td>${r.regime}</td><td class="r">${sp(r.T)}</td><td class="r">${sp(r.ivaeq)}</td><td class="r">${sp(r.bdi)}</td><td class="r">${sm(r.precoVenda)}</td><td class="r">${sm(r.precoVenda - cm.sn.precoVenda)}</td></tr>`).join('')}</tbody></table></div>`;
    },
  };
  UI.act.bdiUseCD = () => { W.cfg().simples.custoDireto = Math.round(UI.model().tot.direct) / 100; UI.saveSoon(); UI.render(); };
  UI.act.bdiSimplesApply = () => {
    const c = W.cfg(); const y = BD.simplesCompute(c.simples);
    c.simplesAplicado = { ano: y.ano, ivaeq: y.ivaeq, bdi: y.bdi, totalTribEfetivo: y.T, origem: 'Simples Nacional' }; c.mode = 'param';
    if (Number(c.param.ano) !== Number(y.ano)) { c.param.ano = y.ano; BD.paramNormaliza(c.param); }
    UI.saveSoon(); UI.render(); UI.$('#main').scrollTop = 0; UI.toast(`IVA equivalente do Simples Nacional (${P2(y.ivaeq)}, ano ${y.ano}) aplicado ao cálculo paramétrico.`);
  };

  /* =================== relatório, Word e CSV =================== */
  W.reportHTML = () => {
    const c = W.cfg(); const k = W.calc(); const pj = A.pj;
    const css = '*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#15202B;margin:32px;font-size:12px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 6px;border-bottom:2px solid #15202B;padding-bottom:4px}table{border-collapse:collapse;width:100%;margin:4px 0 10px}td,th{border-bottom:1px solid #D4D8DD;padding:5px 8px;text-align:left;vertical-align:top}td.r,th.r{text-align:right}tr.rub td{font-weight:700}tr.sub td:first-child{padding-left:22px;color:#4A5563}tr.total-name td{font-weight:700;border-top:2px solid #15202B;background:#FFF1C2}.kpis{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.kpi{border:1px solid #D4D8DD;border-left:4px solid #FFC21A;padding:8px 14px;min-width:150px}.kpi small{display:block;color:#7C8591;text-transform:uppercase;font-size:10px}.kpi b{font-size:18px}.muted{color:#7C8591}pre{background:#F5F6F7;border-left:3px solid #FFC21A;padding:8px 10px;white-space:pre-wrap;font-size:11px}';
    const tbl = (rows) => `<table><tbody>${rows.map((r) => `<tr><td>${esc(String(r[0]))}</td><td class="r">${esc(String(r[1]))}</td></tr>`).join('')}</tbody></table>`;
    const extra = c.mode === 'param' ? ['Fator de reequilíbrio', P2(k.r.res.fatorReeq)] : c.mode === 'exato' ? ['Preço de venda', RS(k.x.precoVenda)] : ['Alíquota efetiva do Simples', pa.simPct(k.y.aliqEf)];
    let b = `<h1>Composição do BDI — método ${W.LABEL[c.mode]}</h1><p class="muted">${esc(pj.name)} · base ${esc(A.base.raw.fonte || 'SICRO')} ${esc(A.base.raw.ref)} · ano de referência ${k.ano} · emitido em ${new Date().toLocaleString('pt-BR')}</p>
      <div class="kpis"><div class="kpi"><small>BDI</small><b>${P2(k.bdi)}</b></div><div class="kpi"><small>IVA equivalente</small><b>${P2(k.ivaeq)}</b></div><div class="kpi"><small>${extra[0]}</small><b>${extra[1]}</b></div></div>
      <h2>Composição do BDI</h2><table><thead><tr><th>Discriminação</th><th class="r">Taxa (%)</th></tr></thead><tbody>${k.rows.map(([l, v, c1]) => `<tr class="${c1}"><td>${esc(l)}</td><td class="r">${P2(v)}</td></tr>`).join('')}</tbody></table><pre>${esc(k.eq)}</pre>
      <h2>Memória de cálculo</h2>${tbl(k.memoria)}`;
    if (c.mode === 'param') b += `<h2>Reequilíbrio econômico-financeiro</h2>${tbl(W.reeqMem(k.r.res))}`;
    if (c.mode === 'exato') b += `<h2>Matriz de creditamento (${k.e.rows.length} insumos)</h2><table><thead><tr><th>Descrição</th><th>Tipo</th><th class="r">Custo parcial</th><th class="r">Geração de crédito</th><th class="r">Crédito de IVA</th></tr></thead><tbody>${k.e.rows.map((r, i) => `<tr><td>${esc(r.desc)}</td><td>${esc(r.tipo)}</td><td class="r">${RS(Number(r.custo || 0))}</td><td class="r">${P2(r.ger)}</td><td class="r">${RS(k.x.linhas[i].cr)}</td></tr>`).join('')}</tbody></table>`;
    if (c.mode === 'simples') { const s = c.simples; b += `<h2>Dados da empresa</h2>${tbl([['Razão social', s.razao], ['CNPJ', s.cnpj], ['CNAE principal', s.cnae], ['CNAE secundários', s.cnaeSec || '—'], ['Município/UF', `${s.municipio}/${s.estado}`]])}<h2>Decomposição dos tributos</h2>${tbl(pa.tributosSimples(k.y).map(([n, v]) => [n, pa.simPct(v)]))}`; }
    b += '<p class="muted" style="margin-top:20px">Cálculo pelo motor do BDIPro (regras de transição da Reforma Tributária, LC 214/2025), integrado ao OrçaPro · SICRO. Valores estimativos, dependentes do enquadramento tributário e da documentação da empresa.</p>';
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>BDI — ${esc(pj.name)}</title><style>${css}</style></head><body>${b}</body></html>`;
  };
  UI.act.bdiReport = () => { const w = G.open('', '_blank'); if (!w) { UI.toast('Permita pop-ups para gerar o relatório.', 'warn'); return; } w.document.write(W.reportHTML() + '<scr' + 'ipt>setTimeout(function(){print()},400)</scr' + 'ipt>'); w.document.close(); };
  const fname = () => 'BDI_' + (U.deaccent(A.pj.name || 'orcamento').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'orcamento');
  UI.act.bdiWord = () => OP.exp.download(fname() + '.doc', '\uFEFF' + W.reportHTML(), 'application/msword;charset=utf-8');
  UI.act.bdiCsv = () => {
    const c = W.cfg(); const k = W.calc();
    if (c.mode === 'exato') { W.exatoCsv(); return; }
    let rows;
    if (c.mode === 'simples') {
      const y = k.y, s = c.simples;
      rows = [['Seção', 'Campo', 'Valor'], ['Empresa', 'Razão Social', s.razao || ''], ['Empresa', 'CNPJ', s.cnpj || ''], ['Alíquota', 'RBT12', sm(y.rbt12)], ['Alíquota', 'Faixa', 'Faixa ' + y.faixa.faixa], ['Alíquota', 'Alíquota efetiva', sp(y.aliqEf)],
        ['BDI', 'CBS informada para IVAeq', h(y) ? sp(y.cbsCheia) : 'Não aplicável'], ['BDI', 'IBS cheio 2033 informado', h(y) ? sp(y.ibsCheio) : 'Não aplicável'], ['BDI', 'IBS do ano usado no IVAeq', h(y) ? sp(y.ibsIvaeq) : 'Não aplicável'],
        ['BDI', 'IVAt anual usado no IVAeq', h(y) ? sp(y.ivatCheio) : 'Não aplicável'], ['BDI', 'ICMS residual do ano', h(y) ? sp(y.icmsResidual) : 'Não aplicável'], ['BDI', '%MATcd bruto', sp(y.matcd)],
        ['BDI', '%MATcd ajustado', h(y) ? sp(y.matcdAjustado) : 'Não aplicável'], ['BDI', 'IVAeq', sp(y.ivaeq)], ['BDI', 'BDI', sp(y.bdi)], ['BDI', 'Preço', sm(y.precoVenda)]];
      pa.tributosSimples(y).forEach(([n, v]) => rows.push(['Tributo', n, sp(v)]));
    } else {
      rows = [['Seção', 'Campo', 'Valor']].concat(k.memoria.map((r) => ['Memória', r[0], r[1]]), k.rows.map((r) => ['Composição', r[0], P2(r[1])]), W.reeqMem(k.r.res).map((r) => ['Reequilíbrio', r[0], r[1]]),
        k.r.pts.map((p) => ['Tabela paramétrica', 'MATcd ' + pa.pct(p.matcd), `ajustado ${pa.pct(p.matcdAjustado)} · IVAeq ${pa.pct(p.ivaeq)} · BDI ${pa.pct(p.bdi)}`]));
    }
    OP.exp.download(`${fname()}_${c.mode}.csv`, '\uFEFF' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv;charset=utf-8');
  };
})(typeof window !== 'undefined' ? window : globalThis);


