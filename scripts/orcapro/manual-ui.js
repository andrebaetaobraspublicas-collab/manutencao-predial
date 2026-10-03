window.installOrcaProManual = function installOrcaProManual() {
  'use strict';
  const O = window.OP, UI = O.ui, D = window.ORCAPRO_MANUAL;
  const esc = O.util.esc, key = 'orcapro.manual.read.v1';
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let saved = [];
  try { saved = JSON.parse(window.localStorage.getItem(key) || '[]'); } catch (_) { /* Reading works without browser storage. */ }
  const S = { tab: 'guide', chapter: 'inicio', query: '', category: '', journey: '', size: 1,
    read: new Set(Array.isArray(saved) ? saved.filter(id => D.chapters.some(c => c.id === id)) : []), answers: {},
    lab: { qty: 100, unit: 50, bdi: 25, coef: 0.5, people: 2, teams: 1, hours: 8,
      base: 100000, target: 108000, ac: 4, sg: 0.4, df: 1, profit: 8, revenueTax: 5,
      value: 100, year: 2033, ibs: 19.2, cbs: 8.8, legacy: 18, share: 100, included: 'no', annex: '', profile: 'material' } };
  const getChapter = id => D.chapters.find(c => c.id === id);
  const button = (id, label, attrs = '') => `<button type="button" class="btn sm" data-act="manualChapter" data-id="${esc(id)}" ${attrs}>${esc(label)}</button>`;
  const money = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + '%';
  function matches(c) {
    return (!S.category || c.category === S.category) && (!S.journey || D.journeys.find(j => j.id === S.journey).chapters.includes(c.id)) &&
      norm(JSON.stringify(c)).includes(norm(S.query.trim()));
  }
  function sources(ids = D.sources.map(s => s.id)) {
    return `<ul class="manual-sources">${D.sources.filter(s => ids.includes(s.id)).map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a></li>`).join('')}</ul>`;
  }
  function section(s, i) {
    return `<section class="manual-section" id="manual-section-${i}"><h3>${esc(s.title)}</h3>${s.body ? `<p>${esc(s.body)}</p>` : ''}
      ${s.formula ? `<pre class="manual-formula">${esc(s.formula)}</pre>` : ''}
      ${s.steps ? `<ol class="manual-steps">${s.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      ${s.table ? `<div class="manual-table" tabindex="0" role="region" aria-label="${esc(s.title)}"><table><thead><tr>${s.table.headers.map(x => `<th scope="col">${esc(x)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map(row => `<tr>${row.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
      ${s.expected ? `<p class="manual-expected"><strong>Resultado esperado.</strong> ${esc(s.expected)}</p>` : ''}</section>`;
  }
  function article(c, exporting = false) {
    return `<article class="manual-article"><p class="manual-eyebrow">${esc(c.category)}</p><h2>${esc(c.title)}</h2><p class="manual-lead">${esc(c.summary)}</p>
      ${exporting ? '' : `<div class="manual-toolbar"><button class="btn pri sm" data-act="manualOpen" data-id="${esc(c.id)}">Abrir ${c.target === 'portal' ? 'Meus orçamentos' : 'este módulo'}</button><button class="btn sm" data-act="manualRead" aria-pressed="${S.read.has(c.id)}">${S.read.has(c.id) ? '✓ Leitura concluída' : 'Marcar como lido'}</button></div><details class="manual-outline"><summary>Neste capítulo · ${c.sections.length} seções</summary><ol>${c.sections.map((s, i) => `<li><a href="#manual-section-${i}">${esc(s.title)}</a></li>`).join('')}</ol></details>`}
      ${c.sections.map(section).join('')}${c.sources ? `<details class="manual-source-box" ${exporting ? 'open' : ''}><summary>Fontes e referências</summary>${sources(c.sources)}</details>` : ''}
      ${exporting ? '' : `<footer class="manual-related"><strong>Continue o raciocínio</strong><div class="manual-toolbar">${c.related.map(id => button(id, getChapter(id).title)).join('')}</div></footer>`}</article>`;
  }
  function journeys() {
    return `<div class="manual-journeys">${D.journeys.map(j => `<button class="manual-journey ${S.journey === j.id ? 'selected' : ''}" data-act="manualJourney" data-id="${j.id}" aria-pressed="${S.journey === j.id}"><strong>${esc(j.title)}</strong><span>${j.chapters.filter(id => S.read.has(id)).length}/${j.chapters.length} capítulos lidos →</span></button>`).join('')}</div>`;
  }
  function guide() {
    const list = D.chapters.filter(matches), c = getChapter(S.chapter), j = D.journeys.find(x => x.id === S.journey);
    const sequence = j ? j.chapters.map(getChapter) : D.chapters, pos = sequence.indexOf(c);
    return `${journeys()}${j ? `<div class="manual-trail"><strong>Trilha: ${esc(j.title)}</strong><button class="btn sm" data-act="manualAll">Ver todos os capítulos</button></div>` : ''}
      <div class="manual-layout"><aside class="manual-index"><label for="manual-search">Pesquisar no manual</label><input id="manual-search" type="search" data-fk="manual-search" data-in="manualSearch" value="${esc(S.query)}" placeholder="Ex.: crédito, predecessoras, Monte Carlo…"><label for="manual-category">Assunto</label><select id="manual-category" data-ch="manualCategory"><option value="">Todos os assuntos</option>${[...new Set(D.chapters.map(c => c.category))].map(x => `<option value="${esc(x)}"${x === S.category ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select><p class="manual-count" role="status">${list.length} capítulos encontrados</p><nav aria-label="Capítulos do manual">${list.map(x => `<button data-act="manualChapter" data-id="${x.id}" ${x.id === c.id ? 'aria-current="page"' : ''}><span>${S.read.has(x.id) ? '✓ ' : ''}${esc(x.title)}</span><small>${esc(x.summary)}</small></button>`).join('') || '<p>Nenhum capítulo encontrado. Tente outro termo ou assunto.</p>'}</nav></aside>
      <div class="manual-reading" data-keep="manual-reading">${article(c)}<div class="manual-toolbar manual-pagination">${pos > 0 ? button(sequence[pos - 1].id, '← Capítulo anterior') : ''}<span>${pos >= 0 ? `${pos + 1} de ${sequence.length}` : 'Fora da trilha selecionada'}</span>${pos >= 0 && pos < sequence.length - 1 ? button(sequence[pos + 1].id, 'Próximo capítulo →') : ''}</div></div></div>`;
  }
  function map() {
    const flows = [
      ['Da quantidade ao prazo', [['orcamento', 'Orçamento', 'Quantidades e estrutura da obra'], ['equipes', 'Equipes', 'Coeficientes, capacidade e produtividade'], ['cronograma', 'Cronograma', 'Durações, vínculos e calendário'], ['recursos', 'Recursos e Curva S', 'Capacidade e distribuição no tempo']]],
      ['Do cenário tributário à decisão', [['tributos', 'Reforma Tributária', 'Ano, alíquotas, perfis e enquadramento'], ['abc-insumos', 'ABC e memória', 'Ocorrências, base e crédito conhecido'], ['bdi-tributos', 'Conferência no BDI', 'Matriz/participações e premissas independentes'], ['orcamento', 'Preço aplicado', 'Só muda após aplicar a taxa de BDI']]],
      ['Da incerteza ao preço', [['riscos', 'Fotografia', 'Custo direto da versão salva'], ['riscos', 'Monte Carlo e tornado', 'Distribuições, eventos e percentil'], ['risco-bdi', 'Prévia do BDI', 'Substituir ou somar a parcela R'], ['bdi', 'Aplicar e conferir', 'Preço, memória e histórico da decisão']]]
    ];
    return `<div class="manual-map"><h2>Como os módulos conversam</h2><p>Toque em cada etapa para ler o procedimento. As setas indicam fluxo de trabalho; o texto informa onde há cálculo automático e onde você precisa decidir.</p>${flows.map(([title, nodes]) => `<section><h3>${title}</h3><div class="manual-flow">${nodes.map(([id, title, text]) => `<button data-act="manualChapter" data-id="${id}"><strong>${title}</strong><span>${text}</span></button>`).join('')}</div></section>`).join('')}<p class="manual-expected">A taxa de risco altera R dentro do método BDI. O crédito estimado na Reforma Tributária requer conciliação das hipóteses do BDI. A rede do cronograma requer conferência de recursos: sobreposição não garante capacidade.</p>${button('integracoes', 'Ler a matriz completa de integrações')}${button('bdi-tributos', 'Conferir a integração tributária')}</div>`;
  }
  function number(name, label, min = 0, max = 1e12, step = 'any') {
    return `<label class="manual-field">${label}<input type="number" data-in="manualLab" data-key="${name}" data-fk="manual-lab-${name}" min="${min}" max="${max}" step="${step}" value="${S.lab[name]}"></label>`;
  }
  function select(name, label, opts) {
    return `<label class="manual-field">${label}<select data-ch="manualLab" data-key="${name}" data-fk="manual-lab-${name}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(S.lab[name]) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  }
  function didacticCost(x) {
    const direct = x.qty * x.unit, price = direct * (1 + x.bdi / 100);
    return { direct, price, work: x.qty * x.coef, days: Math.ceil(x.qty * x.coef / (x.people * x.teams * x.hours)) };
  }
  function didacticRisk(x) {
    const contingency = Math.max(0, x.target - x.base), r = contingency / x.base;
    const K = (1 + x.ac / 100 + r + x.sg / 100) * (1 + x.df / 100) * (1 + x.profit / 100);
    return { contingency, r, K, bdi: K / (1 - x.revenueTax / 100) - 1 };
  }
  function didacticTax(x) {
    // Fresh configuration and a synthetic occurrence: never use or edit project premises.
    const M = window.MOTOR;
    if (!M) throw new Error('Motor tributário indisponível neste carregamento. Reabra o editor.');
    const cfg = M.cfgInicial(['SP']), i = x.year - 2026;
    cfg.ibs[i] = x.ibs; cfg.cbs[i] = x.cbs;
    cfg.base.modo = x.included === 'yes' ? 'comIVA' : 'semIVA';
    cfg.base.porInsumo['3'] = { legadoTipo: 'ICMS', legadoPct: x.legacy, fatorCredito: x.share, fatorAliquota: 100, fonte: 'Exemplo didático do manual' };
    cfg.regimeInsumo['3'] = x.annex;
    const oc = { cod: '3', desc: 'Material didático', un: 'UN', qtd: 1, valor: x.value, perfil: x.profile, caminho: 'Manual / exemplo isolado' };
    return M.avaliarOcorrencia(oc, M.validarCfg(cfg, ['SP']), 'SP', x.year);
  }
  function labs() {
    return `<div class="manual-labs"><h2>Laboratório de aprendizagem</h2><p class="manual-expected"><strong>Exemplos didáticos isolados.</strong> Estes campos não alteram o orçamento, o BDI nem as premissas fiscais do projeto. Os valores iniciais são hipóteses para estudo.</p>
      <section class="manual-lab"><h3>1. Da quantidade ao preço e à duração</h3><p>Exemplo de um recurso dominante; equipes reais usam todos os recursos e o gargalo da composição.</p><div class="manual-fields">${number('qty', 'Quantidade física', 0)}${number('unit', 'Custo unitário (R$)', 0)}${number('bdi', 'BDI aplicado (%)', 0, 1000)}${number('coef', 'Coeficiente (h/unidade)', 0)}${number('people', 'Pessoas por equipe', 1, 1000, 1)}${number('teams', 'Equipes', 1, 1000, 1)}${number('hours', 'Jornada (h/dia)', 0.1, 24)}</div><div id="manual-cost-result" aria-live="polite"></div>${button('equipes', 'Entender o gargalo')}${button('cronograma', 'Montar a rede e o calendário')}</section>
      <section class="manual-lab"><h3>2. Do percentil escolhido à parcela de risco do BDI</h3><p>Informe o valor do percentil que veio de uma simulação. Este exemplo não executa Monte Carlo e não calcula IVAeq; mostra a inclusão de R na fórmula clássica.</p><div class="manual-fields">${number('base', 'Custo direto base (R$)', 1)}${number('target', 'Valor do percentil escolhido (R$)', 0)}${number('ac', 'Administração central (%)', 0, 100)}${number('sg', 'Seguros/garantias (%)', 0, 100)}${number('df', 'Despesas financeiras (%)', 0, 100)}${number('profit', 'Lucro (%)', 0, 100)}${number('revenueTax', 'Tributos sobre receita T (%)', 0, 99.9)}</div><div id="manual-risk-result" aria-live="polite"></div>${button('risco-bdi', 'Ver o passo a passo de aplicação ao BDI')}</section>
      <section class="manual-lab"><h3>3. IBS/CBS — acompanhe a memória do motor</h3><p>Este exemplo utiliza o mesmo motor tributário do editor, com uma ocorrência sintética monetária. Combustíveis e depreciação possuem regras próprias, descritas nos capítulos. Alterar o ano aqui mantém as alíquotas que você digitou.</p><div class="manual-fields">${number('value', 'Valor da ocorrência V (R$)', 0)}${select('year', 'Ano do cenário', Array.from({ length: 8 }, (_, i) => [2026 + i, String(2026 + i)]))}${number('ibs', 'IBS nominal — hipótese (%)', 0, 100)}${number('cbs', 'CBS nominal — hipótese (%)', 0, 100)}${number('legacy', 'Carga legada ICMS (%)', 0, 100)}${number('share', 'Aproveitamento (%)', 0, 100)}${select('included', 'O preço inclui IVA?', [['no', 'Não: adicionar IVA'], ['yes', 'Sim: remover IVA por divisão']])}${select('annex', 'Fator do anexo', [['', 'Integral — 100%'], ['IX', 'IX — fator 40%'], ['XIII', 'XIII — fator 0%']])}${select('profile', 'Perfil', [['material', 'Material'], ['maoObra', 'Salário: não incidente']])}</div><div id="manual-tax-result" aria-live="polite"></div>${button('credito', 'Ler fórmulas e exemplos completos')}${button('parametros', 'Quais variáveis posso editar?')}${button('combustiveis', 'Entender o ramo de combustíveis')}</section></div>`;
  }
  function results() {
    if (S.tab !== 'labs') return;
    const table = rows => `<dl class="manual-results">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
    const x = S.lab, c = didacticCost(x), r = didacticRisk(x);
    const set = (id, html) => { const el = UI.$('#' + id); if (el) el.innerHTML = html; };
    if (Object.values(x).some(v => typeof v === 'number' && !Number.isFinite(v))) return;
    set('manual-cost-result', table([['Custo direto = quantidade × custo unitário', money(c.direct)], ['Preço = custo direto × (1 + BDI)', money(c.price)], ['Trabalho = quantidade × coeficiente', c.work.toLocaleString('pt-BR') + ' h'], ['Duração = teto(trabalho ÷ capacidade diária)', c.days + ' dias úteis']]) + '<p>Calendário, vínculos, feriados e recursos compartilhados são conferidos no cronograma.</p>');
    set('manual-risk-result', table([['Contingência = máximo(0, percentil − base)', money(r.contingency)], ['R = contingência ÷ custo direto', pct(r.r * 100)], ['K = (1 + AC + R + S/G) × (1 + DF) × (1 + L)', r.K.toFixed(6)], ['BDI clássico = K ÷ (1 − T) − 1', pct(r.bdi * 100)], ['Preço de exemplo = base × (1 + BDI)', money(x.base * (1 + r.bdi))]]) + '<p>A taxa R não é simplesmente somada ao percentual final do BDI. O projeto usa o método selecionado, com a memória e hipóteses dele.</p>');
    try {
      const t = didacticTax(x);
      set('manual-tax-result', table([['1. Remanescente legado do ano (protegido)', pct(t.remanescente * 100)], ['2. Tributo legado residual E', money(t.residual)], ['3. Base monetária B após depuração', money(t.baseLegal)], ['4. Base antes do anexo (B × aproveitamento)', money(t.baseAntesAnexos)], ['5. Base ponderada após anexo', money(t.baseCreditavel)], ['6. IBS efetivo / CBS efetiva', pct(t.ibsEfetivo * 100) + ' / ' + pct(t.cbsEfetivo * 100)], ['7. Crédito IBS', money(t.creditoIbs)], ['8. Crédito CBS', money(t.creditoCbs)], ['9. Crédito total', money(t.credito)], ['10. Custo do cenário / líquido do cenário', money(t.custoCenario) + ' / ' + money(t.custoLiquido)]]) + `<p>${esc(t.status)}. ${esc(t.avisos.join(' '))} Base ponderada e alíquota efetiva expressam o mesmo fator do anexo: não aplique a redução duas vezes. Crédito estimado não é comprovação de crédito fiscal nem desconto automático no orçamento.</p>`);
    } catch (e) { set('manual-tax-result', `<p role="alert">${esc(e.message)}</p>`); }
  }
  function glossary() {
    return `<div class="manual-glossary"><h2>Glossário e fontes</h2><label for="manual-glossary-search">Pesquisar conceito</label><input id="manual-glossary-search" type="search" data-in="manualSearch" data-fk="manual-glossary-search" value="${esc(S.query)}" placeholder="Ex.: EAP, IVAeq, P80…"><dl>${D.glossary.filter(x => norm(x.join(' ')).includes(norm(S.query))).map(([term, meaning]) => `<div><dt>${esc(term)}</dt><dd>${esc(meaning)}</dd></div>`).join('')}</dl><h3>Fontes primárias para consulta</h3><p>Conteúdo revisto em ${D.reviewedAt}. As hipóteses do programa e exemplos de alíquotas futuras precisam ser conferidos com a legislação e os documentos da operação.</p>${sources()}</div>`;
  }
  function quiz() {
    return `<div class="manual-quiz"><h2>Confira seu entendimento</h2><p>Escolha uma resposta para ver a explicação. Este exercício não modifica o projeto.</p>${D.quiz.map((q, i) => `<fieldset><legend>${i + 1}. ${esc(q.question)}</legend>${q.options.map((x, n) => `<button class="btn ${S.answers[i] === n ? 'pri' : ''}" data-act="manualAnswer" data-index="${i}" data-answer="${n}" aria-pressed="${S.answers[i] === n}">${esc(x)}</button>`).join('')}${S.answers[i] !== undefined ? `<p role="status" class="manual-feedback"><strong>${S.answers[i] === q.answer ? 'Correto.' : 'Revise este ponto.'}</strong> ${esc(q.explanation)}</p>` : ''}</fieldset>`).join('')}</div>`;
  }
  UI.views.manual = {
    render: () => `<div class="manual-page" style="--manual-scale:${S.size}"><header class="manual-hero"><div><p class="manual-eyebrow">APRENDER · PLANEJAR · CONFERIR</p><h1>${esc(D.title)}</h1><p>Do orçamento ao prazo, do risco ao BDI, do insumo à memória de IBS e CBS.</p><div class="manual-progress"><progress value="${S.read.size}" max="${D.chapters.length}" aria-label="Progresso de leitura"></progress><span>${S.read.size}/${D.chapters.length} capítulos lidos neste navegador</span></div></div><div class="manual-toolbar"><button class="btn sm" data-act="manualSize" data-value="-0.1" aria-label="Diminuir fonte">A−</button><button class="btn sm" data-act="manualSize" data-value="0.1" aria-label="Aumentar fonte">A+</button><button class="btn sm" data-act="manualExport">Baixar manual completo</button></div></header><nav class="manual-tabs" aria-label="Áreas do manual">${[['guide', 'Capítulos e trilhas'], ['map', 'Mapa entre módulos'], ['labs', 'Exemplos interativos'], ['glossary', 'Glossário e fontes'], ['quiz', 'Teste seu entendimento']].map(([id, title]) => `<button data-act="manualTab" data-id="${id}" ${S.tab === id ? 'aria-current="page"' : ''}>${title}</button>`).join('')}</nav><div id="manual-content">${({ guide, map, labs, glossary, quiz })[S.tab]()}</div><p class="manual-edition">Edição ${D.version} · Revisão ${D.reviewedAt} · Documenta o comportamento do OrçaPro; exemplos não substituem a decisão técnica ou a documentação da operação.</p></div>`,
    after: results
  };
  function repaint(top = false) { UI.render(); if (top) UI.$('#main')?.scrollTo({ top: 0 }); }
  UI.act.manualTab = el => { if (!['guide', 'map', 'labs', 'glossary', 'quiz'].includes(el.dataset.id)) return; S.tab = el.dataset.id; S.query = ''; repaint(true); };
  UI.act.manualChapter = el => { if (!getChapter(el.dataset.id)) return; S.chapter = el.dataset.id; S.tab = 'guide'; repaint(true); };
  UI.act.manualJourney = el => { const j = D.journeys.find(x => x.id === el.dataset.id); if (!j) return; Object.assign(S, { tab: 'guide', journey: j.id, category: '', query: '', chapter: j.chapters[0] }); repaint(true); };
  UI.act.manualAll = () => { S.journey = ''; S.category = ''; S.query = ''; repaint(); };
  UI.inp.manualSearch = el => {
    S.query = el.value;
    // Preserve the active input node and caret throughout typing.
    if (S.tab === 'guide') {
      const list = D.chapters.filter(matches), nav = UI.$('.manual-index nav'), count = UI.$('.manual-count');
      if (nav) nav.innerHTML = list.map(x => `<button data-act="manualChapter" data-id="${x.id}" ${x.id === S.chapter ? 'aria-current="page"' : ''}><span>${S.read.has(x.id) ? '✓ ' : ''}${esc(x.title)}</span><small>${esc(x.summary)}</small></button>`).join('') || '<p>Nenhum capítulo encontrado. Tente outro termo ou assunto.</p>';
      if (count) count.textContent = list.length + ' capítulos encontrados';
    } else if (S.tab === 'glossary') {
      const dl = UI.$('.manual-glossary dl');
      if (dl) dl.innerHTML = D.glossary.filter(x => norm(x.join(' ')).includes(norm(S.query))).map(([term, meaning]) => `<div><dt>${esc(term)}</dt><dd>${esc(meaning)}</dd></div>`).join('');
    }
  };
  UI.chg.manualCategory = el => { S.category = el.value; repaint(); };
  UI.act.manualRead = () => { S.read.has(S.chapter) ? S.read.delete(S.chapter) : S.read.add(S.chapter); try { window.localStorage.setItem(key, JSON.stringify([...S.read])); } catch (_) { /* Progress is optional. */ } repaint(); };
  UI.act.manualSize = el => { S.size = Math.max(0.9, Math.min(1.4, Math.round((S.size + Number(el.dataset.value)) * 10) / 10)); repaint(); };
  UI.act.manualAnswer = el => { const i = Number(el.dataset.index), n = Number(el.dataset.answer); if (!D.quiz[i]?.options[n]) return; S.answers[i] = n; repaint(); };
  const bounds = { qty: [0, 1e12], unit: [0, 1e12], bdi: [0, 1000], coef: [0, 1e12], people: [1, 1000], teams: [1, 1000], hours: [0.1, 24], base: [1, 1e12], target: [0, 1e12], ac: [0, 100], sg: [0, 100], df: [0, 100], profit: [0, 100], revenueTax: [0, 99.9], value: [0, 1e12], ibs: [0, 100], cbs: [0, 100], legacy: [0, 100], share: [0, 100] };
  UI.inp.manualLab = UI.chg.manualLab = el => {
    const k = el.dataset.key;
    if (el.type === 'number') {
      const n = Number(el.value), b = bounds[k];
      if (!b || !el.value.trim() || !Number.isFinite(n) || n < b[0] || n > b[1] || (['people', 'teams'].includes(k) && !Number.isInteger(n))) { el.setCustomValidity?.('Informe um valor dentro dos limites do campo.'); return; }
      el.setCustomValidity?.(''); S.lab[k] = n;
    } else {
      const allowed = { year: ['2026', '2027', '2028', '2029', '2030', '2031', '2032', '2033'], included: ['yes', 'no'], annex: ['', 'IX', 'XIII'], profile: ['material', 'maoObra'] };
      if (!allowed[k]?.includes(el.value)) return; S.lab[k] = k === 'year' ? Number(el.value) : el.value;
    }
    results();
  };
  UI.act.manualOpen = el => {
    const c = getChapter(el.dataset.id); if (!c) return;
    if (c.target === 'portal') { window.top.location.href = '/orcapro/gerenciar/'; return; }
    if (['catalog', 'inputs', 'compositions', 'budget', 'bdi', 'crews', 'schedule', 'resources', 'evento', 'reforma', 'risks', 'base'].includes(c.target)) UI.act.go({ dataset: { v: c.target } });
  };
  UI.act.manualExport = () => {
    const css = 'body{font:16px/1.65 system-ui,sans-serif;color:#172631;max-width:1100px;margin:auto;padding:32px}h1,h2,h3{line-height:1.3}article{break-before:page;margin-top:60px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #bbc5ce;padding:10px;text-align:left;vertical-align:top}pre{white-space:pre-wrap;background:#f2f4f6;padding:20px}li{margin-bottom:12px}a{color:#17528b}summary{font-weight:bold}.manual-expected{border-left:4px solid #e8b500;padding:16px;background:#fffae3}@media print{body{padding:0}a{color:inherit}details{display:block}article{break-before:page}}';
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(D.title)}</title><style>${css}</style><body><h1>${esc(D.title)}</h1><p>Edição ${D.version} · Revisão ${D.reviewedAt}. Manual completo para consulta offline e impressão. Use a opção Imprimir do navegador para gerar PDF.</p><p>Exemplos didáticos e hipóteses de modelagem devem ser conferidos com o projeto e a documentação da operação.</p><nav><h2>Índice</h2><ol>${D.chapters.map(c => `<li><a href="#chapter-${c.id}">${esc(c.title)}</a></li>`).join('')}</ol></nav>${D.chapters.map(c => `<div id="chapter-${c.id}">${article(c, true)}</div>`).join('')}<h2>Glossário</h2><dl>${D.glossary.map(([k, v]) => `<dt><strong>${esc(k)}</strong></dt><dd>${esc(v)}</dd>`).join('')}</dl><h2>Fontes primárias</h2>${sources()}</body></html>`;
    O.exp.download('OrcaPro-Manual-Completo.html', html, 'text/html;charset=utf-8');
  };
  O.manual = { state: S, didacticCost, didacticRisk, didacticTax };
};
