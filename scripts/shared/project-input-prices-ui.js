(function (G) {
  'use strict';
  G.installProjectInputPricesUI = function () {
    const O = G.OP, A = O.app, UI = O.ui, P = O.inputPrices, U = O.util, esc = U.esc;
    if (P.uiInstalled) return; P.uiInstalled = true;
    let editing = null, preview = null;
    const money = value => value == null ? 'Sem preço' : UI.money(value);
    const current = () => `${A.pj.uf} · ${A.base.raw.ref} · ${(O.sicro || O.sinapi).REGIMES[A.pj.rg]}`;
    const inputInfo = code => A.base.ins(O.code ? O.code(code) : code);
    const activePrice = code => { P.bind(A.base, A.pj); const info = inputInfo(code); return info ? A.base.insPrice(info.i, A.base.ufIndex(A.pj.uf), A.pj.rg)[0] : null; };
    function form(error = '') {
      const r = editing, own = P.find(A.base, A.pj, r.code), info = inputInfo(r.code);
      const equipment = !!(O.sicro && /^E\d{4}$/.test(r.code));
      UI.modal('Preço do insumo em todo o orçamento', `<div class="pip"><p><b>${esc(r.code)} — ${esc(info.desc)}</b> · ${esc(info.unit)}</p>
        <p class="pip-context">Orçamento: <b>${esc(A.pj.name)}</b><br>${esc(current())}</p>
        <p>Este preço será usado em todas as ocorrências do mesmo insumo neste orçamento, inclusive nas composições auxiliares. O catálogo oficial e os outros orçamentos serão preservados.</p>
        ${error ? `<p class="notice warn" role="alert">${esc(error)}</p>` : ''}
        <div class="pip-fields"><label class="fld"><span>${equipment ? 'Custo horário produtivo — CHP (R$)' : 'Novo preço unitário (R$)'}</span><input id="pip-price" inputmode="decimal" value="${esc(r.value)}"></label>
        ${equipment ? `<label class="fld"><span>Custo horário improdutivo — CHI (R$)</span><input id="pip-chi" inputmode="decimal" value="${esc(r.chi)}"></label>` : ''}
        <label class="fld"><span>Data da cotação</span><input id="pip-date" type="date" value="${esc(r.date)}"></label>
        <label class="fld"><span>Fonte ou justificativa</span><input id="pip-source" maxlength="500" value="${esc(r.source)}" placeholder="Fornecedor, documento ou justificativa do preço"></label></div>
        <p class="note">Preço vigente no orçamento: <b>${money(activePrice(r.code))}</b>. Informe o valor final para o regime indicado; os encargos sociais não serão adicionados novamente. Zero é um preço informado.</p>
        ${equipment ? '<p class="note">CHP e CHI são informados separadamente. A memória de parcelas e créditos do equipamento usará rateio proporcional estimado do novo custo; confira o enquadramento tributário.</p>' : ''}
        <p class="note">Itens com custo fixo informado serão relacionados na prévia e manterão o valor contratado. Análises de risco anteriores conservam sua fotografia.</p>
        <div class="pip-actions"><button class="btn" data-act="closeModal">Cancelar</button>${own ? '<button class="btn" data-act="pipRestorePreview">Restaurar preço anterior à substituição…</button>' : ''}<button class="btn pri" data-act="pipPreview">Conferir serviços afetados</button></div></div>`, { wide: true, after: () => UI.$('#pip-price')?.focus() });
    }
    const readForm = () => {
      editing.value = UI.$('#pip-price').value; editing.date = UI.$('#pip-date').value; editing.source = UI.$('#pip-source').value.trim();
      if (UI.$('#pip-chi')) editing.chi = UI.$('#pip-chi').value;
    };
    const parseCents = text => {
      const number = U.parseNum(text);
      if (!String(text).trim() || !Number.isFinite(number) || number < 0 || Math.abs(number * 100 - Math.round(number * 100)) > 0.00001) throw new Error('Informe um preço válido, não negativo, com no máximo duas casas decimais.');
      return Math.round(number * 100);
    };
    function showPreview(remove = false) {
      try {
        readForm();
        const change = { code: editing.code, source: editing.source, date: editing.date };
        if (!remove) { change.priceCents = parseCents(editing.value); if (O.sicro && /^E\d{4}$/.test(editing.code)) change.chiCents = parseCents(editing.chi); }
        preview = P.preview(A.base, A.pj, change, remove);
        const editable = preview.affected.filter(r => !r.fixed), fixed = preview.affected.filter(r => r.fixed);
        UI.modal(remove ? 'Conferir restauração do preço' : 'Conferir alteração de preço', `<div class="pip"><p><b>${esc(editing.code)} — ${esc(inputInfo(editing.code).desc)}</b><br>${esc(current())}</p>
          <p>${remove ? 'A substituição será retirada; voltará a valer o preço da referência ou do cadastro próprio.' : `Novo preço: <b>${money(change.priceCents)}</b>${change.chiCents !== undefined ? ` · CHI: <b>${money(change.chiCents)}</b>` : ''}.`}</p>
          <div class="pip-summary"><div>Serviços vinculados<b>${preview.affected.length}</b></div><div>Recalculáveis<b>${editable.length}</b></div><div>Com custo fixo preservado<b>${fixed.length}</b></div></div>
          <div class="tblw"><table class="tbl sm"><thead><tr><th>Comparativo</th><th class="r">Atual</th><th class="r">Após aplicar</th></tr></thead><tbody><tr><td>Custo direto do orçamento</td><td class="r">${money(preview.before.direct)}</td><td class="r">${money(preview.after.direct)}</td></tr><tr><td>Preço total com BDI</td><td class="r">${money(preview.before.price)}</td><td class="r">${money(preview.after.price)}</td></tr><tr><td>Variação do custo direto</td><td></td><td class="r">${money(preview.after.direct - preview.before.direct)}</td></tr></tbody></table></div>
          <h4>Ocorrências afetadas no orçamento</h4><div class="tblw pip-services"><table class="tbl sm"><thead><tr><th>Item / serviço</th><th>Quantidade</th><th class="r">Custo unit. atual</th><th class="r">Novo custo unit.</th><th class="r">Variação direta</th><th>Situação</th></tr></thead><tbody>${preview.affected.map(r => `<tr><td>${esc(r.num)} · ${esc(r.code)}<br>${esc(r.desc)}</td><td>${esc(U.num(r.qty, 4))}</td><td class="r">${money(r.oldUnit)}</td><td class="r">${money(r.newUnit)}</td><td class="r">${money(r.newDirect - r.oldDirect)}</td><td>${r.fixed ? 'Custo fixo preservado' : 'Recalcular'}</td></tr>`).join('') || '<tr><td colspan="6">Nenhum serviço utiliza este insumo atualmente. A substituição valerá para novas inclusões na mesma referência, UF e regime.</td></tr>'}</tbody></table></div>
          ${preview.missing ? `<p class="notice warn">Há ${preview.missing} item(ns) sem preço completo no orçamento. Valores parciais não representam um orçamento completo.</p>` : ''}
          <p>O BDI percentual, as quantidades, os coeficientes e as equipes serão mantidos. Custos, totais financeiros, curvas ABC e créditos tributários serão atualizados a partir dos novos preços. As análises de risco anteriores devem ser refeitas para considerar esta alteração.</p>
          <label class="pip-confirm"><input id="pip-consent" type="checkbox" data-ch="pipConsent"> Conferi os serviços e autorizo a alteração neste orçamento.</label>
          <div class="pip-actions"><button class="btn" data-act="pipBack">Voltar</button><button class="btn" data-act="closeModal">Cancelar</button><button class="btn pri" id="pip-apply" data-act="pipApply" disabled>${remove ? 'Confirmar restauração' : 'Aplicar ao orçamento'}</button></div></div>`, { wide: true });
      } catch (error) { preview = null; form(error.message); }
    }
    UI.act.pipEdit = async el => {
      const code = el.dataset.code;
      if (O.cloud?.loadCodes && !inputInfo(code)) await O.cloud.loadCodes([], [code]);
      const info = inputInfo(code);
      if (!info) { UI.toast('Este insumo não existe na referência do orçamento. Consulte a referência do orçamento para alterá-lo.', 'warn'); return; }
      const own = P.find(A.base, A.pj, code), eq = O.sicro && /^E\d{4}$/.test(code) ? A.base.eqParts(code, A.pj.rg) : null;
      editing = { code: String(info.code), value: U.num((own?.priceCents ?? activePrice(code)) / 100, 2),
        chi: U.num(own?.chiCents != null ? own.chiCents / 100 : eq?.[8] ?? 0, 2),
        source: own?.source || '', date: own?.date || new Date().toISOString().slice(0, 10) };
      if (activePrice(code) == null) editing.value = '';
      preview = null; form();
    };
    UI.act.pipPreview = () => showPreview();
    UI.act.pipRestorePreview = () => showPreview(true);
    UI.act.pipBack = () => { preview = null; form(); };
    UI.chg.pipConsent = el => { UI.$('#pip-apply').disabled = !el.checked || preview?.newlyMissing; };
    UI.act.pipApply = () => {
      if (!preview || !UI.$('#pip-consent')?.checked) return;
      try { P.apply(A.base, A.pj, preview); UI.closeModal(); UI.commit(); UI.toast('Preço aplicado a este orçamento. Acompanhe a confirmação de salvamento.'); preview = null; }
      catch (error) { UI.toast(error.message, 'warn'); }
    };
    UI.act.pipList = () => {
      const rows = P.validate(A.pj.inputPriceOverrides);
      UI.modal('Preços próprios deste orçamento', `<div class="pip"><p>Somente a combinação de UF, referência e regime correspondente fica ativa. Outra referência conserva seus preços até uma nova substituição explícita.</p><div class="tblw"><table class="tbl sm"><thead><tr><th>Insumo</th><th>Contexto</th><th>Preço</th><th>Fonte / data</th><th></th></tr></thead><tbody>${rows.map(r => {
        const active = r.uf === A.pj.uf && r.ref === O.register.month(A.base.raw.ref) && r.regime === A.pj.rg;
        return `<tr><td>${esc(r.code)}</td><td>${esc(r.uf)} · ${esc(r.ref)} · ${esc(r.regime)}${active ? ' · ativo' : ' · fora do contexto atual'}</td><td>${money(r.priceCents)}</td><td>${esc(r.source)}<br>${esc(r.date)}</td><td>${active ? `<button class="btn sm" data-act="pipEdit" data-code="${esc(r.code)}">Revisar / restaurar</button>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="5">Ainda não há substituições neste orçamento. No menu Insumos, utilize “Preço no orçamento”.</td></tr>'}</tbody></table></div></div>`, { wide: true });
    };
    const view = UI.views.inputs, render = view.render;
    view.render = (...args) => `<div class="pip-toolbar"><span>Substituições de preço válidas apenas para o orçamento aberto.</span><button class="btn" data-act="pipList">Preços deste orçamento</button></div>` + render(...args);
    function decorate() {
      if (A.view !== 'inputs') return;
      for (const row of document.querySelectorAll('#regResults tbody tr, #cloudCatalogResults tbody tr')) {
        const code = row.querySelector('[data-act="regInspectInput"]')?.dataset.code;
        if (!code || row.querySelector('[data-act="pipEdit"]')) continue;
        const button = document.createElement('button'); button.className = 'btn sm pip-edit'; button.dataset.act = 'pipEdit'; button.dataset.type = 'I'; button.dataset.code = code; button.textContent = 'Preço no orçamento';
        row.lastElementChild?.appendChild(button);
        const own = P.find(A.base, A.pj, code);
        if (own) { const badge = document.createElement('small'); badge.className = 'pip-context'; badge.textContent = 'Preço no orçamento: ' + U.brl(own.priceCents / 100); row.children[1]?.appendChild(badge); }
      }
    }
    const after = view.after;
    view.after = (...args) => { const result = after?.(...args); decorate(); return result; };
    const main = document.getElementById('main');
    if (main && typeof MutationObserver !== 'undefined') new MutationObserver(decorate).observe(main, { childList: true, subtree: true });
  };
})(typeof window !== 'undefined' ? window : globalThis);
