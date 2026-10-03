/* ==== 02_sicro.js ==== */
/* =====================================================================
 * OrçaPro Infraestrutura — 02_sicro.js
 * 1) Importação dos relatórios do SICRO/DNIT (.xlsx) de uma UF e mês:
 *    Analítico de Composições de Custos (obrigatório) e, quando
 *    disponíveis, os sintéticos de Materiais, Equipamentos e Mão de Obra
 *    (com e sem desoneração), Origem de Preços e Encargos Sociais.
 * 2) Classe Base: índices, custo EXATO das composições pela regra do
 *    SICRO, decomposição MO/MAT/EQ, recursos de mão de obra e
 *    equipamentos (horas produtivas e improdutivas), transporte (DMT).
 *
 * REGRA DE CÁLCULO (conferida com o relatório oficial: 6.619 de 6.619
 * composições de SP 07/2026, linha a linha):
 *   A) linha de equipamento = r4( q × (UO×CHP + UI×CHI) )
 *   B) linha de mão de obra = r4( q × custo horário )
 *   custo unitário de execução = r4( (ΣA + ΣB) / produção da equipe )
 *   FIC = r4( FIC × r4( (Σ r4(q×CHI) + ΣB) / produção ) )
 *   C) material = Σ r4(q × preço) ; D) auxiliares = Σ r4(q × custo da aux.)
 *   E) tempo fixo = Σ r4(q × custo da composição de carga/descarga)
 *   F) momento de transporte = Σ r4(q × Σ DMTₖ × custo da composição ₖ)
 *   total = r2( execução + FIC + C + D + E + F )
 *   r4/r2 = arredondamento “meio para cima” em 4/2 casas, em aritmética
 *   decimal exata (BigInt) — sem erros de ponto flutuante.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP; const U = OP.util; const X = OP.xlsx;
  const S = (OP.sicro = {});
  OP.sinapi = S; // nome herdado pelos módulos de interface

  S.SOURCE = 'SICRO';
  S.REGIMES = { SD: 'Sem desoneração', CD: 'Com desoneração' };
  S.CAT = { mo: 'Mão de obra', mat: 'Material', eq: 'Equipamento', serv: 'Serviços', out: 'Outros' };
  const CLS2CAT = { MATERIAL: 'mat', 'MAO DE OBRA': 'mo', EQUIPAMENTO: 'eq', 'EQUIPAMENTO (AQUISICAO)': 'eq',
    'EQUIPAMENTO (LOCACAO)': 'eq', SERVICOS: 'serv', 'ENCARGOS COMPLEMENTARES': 'mo', ESPECIAIS: 'out' };
  S.catOfClass = (cls) => CLS2CAT[U.norm(cls)] || 'out';
  S.DMT = ['LN', 'RP', 'P', 'FE'];
  S.DMT_NAME = { LN: 'Leito natural', RP: 'Revestimento primário', P: 'Pavimentado', FE: 'Ferrovia' };
  S.EQ_PARTS = ['Valor de aquisição', 'Depreciação', 'Oportunidade de capital', 'Seguros e impostos', 'Manutenção', 'Operação', 'Mão de obra de operação', 'Custo produtivo', 'Custo improdutivo'];

  /* Códigos: composições do SICRO têm 7 dígitos (com zeros à esquerda);
   * insumos: M#### (material), E#### (equipamento), P#### (mão de obra). */
  S.code = (x) => {
    if (x == null) return '';
    if (typeof x === 'number') return Number.isInteger(x) && x >= 0 && x < 1e7 ? String(x).padStart(7, '0') : String(x);
    const s = String(x).trim();
    if (/^\d{1,7}$/.test(s)) return s.padStart(7, '0');
    return /^[a-z]\d{4}$/.test(s) ? s.toUpperCase() : s;
  };
  OP.code = S.code;
  const EQH = /^(E\d{4})-(CHP|CHI)$/; // custo horário do equipamento (pseudocomposição)
  S.isEqHour = (c) => EQH.test(String(c));
  const EQP = /^(E\d{4})-(DEP|JUR|ISE|MAN|OPE)$/, PINS = /^(E\d{4})\.(DEP|JUR|ISE|MAN|OPE|MOP)$/;
  const PIX = { DEP: 1, JUR: 2, ISE: 3, MAN: 4, OPE: 5, MOP: 6 };
  const PNAME = { DEP: 'DEPRECIAÇÃO', JUR: 'JUROS (oportunidade de capital)', ISE: 'IMPOSTOS E SEGUROS', MAN: 'MANUTENÇÃO', OPE: 'MATERIAIS NA OPERAÇÃO', MOP: 'MÃO DE OBRA DE OPERAÇÃO' };
  const ELETR = /EL[EÉ]TRIC|MOTOR EL|SUBMERS|VIBRADOR DE IMERS|BETONEIRA|SERRA CIRC|POLICORTE/;
  S.PART_NAME = PNAME;

  /* Grupos do SICRO pelo prefixo do código (nomes descritivos do conteúdo) */
  S.GROUPS = {
    '03': 'Aparelhos de apoio e juntas de dilatação', '04': 'Emendas e acessórios de armação', '06': 'Bueiros e arcos metálicos',
    '07': 'Bueiros celulares de concreto moldados no local', '08': 'Bueiros tubulares de concreto', '09': 'Edificações, canteiro e instalações',
    '11': 'Concretos e argamassas', '12': 'Concreto projetado', '14': 'Estruturas metálicas — corte, furação e solda',
    '15': 'Geossintéticos, enrocamentos e muros segmentais', '16': 'Demolições, perfurações e remoções', '17': 'Derrocagem subaquática',
    '18': 'Levantamentos hidrográficos', '19': 'Dragagem', '20': 'Drenagem superficial e dispositivos', '21': 'Escoramentos de valas',
    '23': 'Fundações — estacas, tubulões e camisas metálicas', '24': 'Pintura anticorrosiva, jateamento e solda',
    '26': 'Ferrovia — aparelhos de mudança de via (AMV)', '28': 'Ferrovia — demolição de via e AMV', '29': 'Ferrovia — nivelamento e lastro',
    '30': 'Ferrovia — trilhos e materiais de via', '31': 'Fôrmas', '32': 'Gabiões', '36': 'Obras marítimas — materiais pétreos e molhes',
    '37': 'Barreiras, defensas e dispositivos de segurança', '38': 'OAE — recuperação, reforço e serviços especiais', '40': 'Pavimentação',
    '42': 'OAE estaiadas — estais, gruas e acessórios', '44': 'Proteção ambiental e revestimento vegetal', '45': 'Protensão — bainhas, ancoragens e cordoalhas',
    '48': 'Drenagem — tubos, valas e serviços auxiliares', '49': 'Conservação rodoviária', '52': 'Sinalização viária',
    '53': 'Sinalização náutica, suportes e obras complementares', '54': 'Muros de contenção e solo reforçado', '55': 'Terraplenagem',
    '56': 'Tirantes, grampos e chumbadores', '59': 'Transportes, cargas e descargas', '61': 'Escavação de tubulões e valas',
    '62': 'Túneis', '64': 'Usinagem de misturas', '68': 'Bueiros celulares pré-moldados', '71': 'Obras portuárias — fundeio e equipamentos'
  };
  S.groupName = (code) => { const p = String(code).slice(0, 2); return (S.GROUPS[p] || 'Outros serviços') + ' (' + p + ')'; };

  /* ---------------- aritmética decimal exata ---------------- */
  const B10 = 10n ** 10n, B4 = 10n ** 4n;
  const P10 = [1n]; for (let i = 1; i <= 40; i++) P10[i] = P10[i - 1] * 10n;
  /* número/texto -> inteiro escalado por 1e10 */
  const toS = (x) => {
    if (x == null || x === '' || x === '-') return 0n;
    let s = typeof x === 'number' ? (Number.isFinite(x) ? x.toFixed(10) : '0') : String(x).trim().replace(/\s/g, '').replace(',', '.');
    if (/e/i.test(s)) s = Number(s).toFixed(10);
    const neg = s.startsWith('-'); if (neg) s = s.slice(1);
    let [a, b = ''] = s.split('.'); b = (b + '0000000000').slice(0, 10);
    const v = BigInt(a || '0') * B10 + BigInt(b || '0');
    return neg ? -v : v;
  };
  S.toS = toS;
  /* divisão inteira com arredondamento meio para cima (simétrico) */
  const divR = (n, d) => { if (d === 0n) return 0n; if (n < 0n) return -divR(-n, d); return (n * 2n + d) / (2n * d); };
  S.divR = divR;
  /* valor em unidades de 1e-4 (BigInt) -> reais (Number) */
  const r4n = (v) => Number(v) / 1e4;
  S.r4n = r4n;
  /* compatibilidade com composições próprias (regra genérica do app) */
  const COEF_SCALE = 1e8;
  function mulTrunc(cs, cents) {
    const p = cs * cents;
    if (Math.abs(p) <= 9007199254740991) { let q = Math.floor(p / COEF_SCALE); if (q * COEF_SCALE > p) q--; else if ((q + 1) * COEF_SCALE <= p) q++; return q; }
    return Number((BigInt(Math.round(cs)) * BigInt(Math.round(cents))) / BigInt(COEF_SCALE));
  }
  S.mulTrunc = mulTrunc;
  /* parcela de composição própria: r4(coef × preço) em centavos (0,01 centavo = 1e-4 R$) */
  S.ownPart = (coef, cents) => Math.round(coef * cents * 100 + 1e-9) / 100;
  S.stripAF = (d) => String(d || '').trim();
  S.afOf = () => null;

  /* ================= IMPORTAÇÃO ================= */
  const fileKind = (name) => {
    const n = U.norm(name).replace(/[^A-Z0-9]+/g, ' ');
    const cd = /COM DESONERA/.test(n);
    if (/ANALITICO DE COMPOSIC/.test(n)) return 'AN';
    if (/SINTETICO DE COMPOSIC/.test(n)) return 'CS';
    if (/SINTETICO DE MATERIA/.test(n)) return 'MAT';
    if (/SINTETICO DE EQUIPAMENTO/.test(n)) return cd ? 'EQCD' : 'EQ';
    if (/SINTETICO DE MAO DE OBRA/.test(n)) return cd ? 'MOCD' : 'MO';
    if (/ORIGEM DE PRECO/.test(n)) return 'ORIG';
    if (/ENCARGOS SOCIAIS/.test(n)) return cd ? 'ENCCD' : 'ENC';
    if (/ANALITICO DE MAO DE OBRA/.test(n)) return cd ? 'MOACD' : 'MOA';
    return '';
  };
  S.fileKind = fileKind;
  const UFN = { AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
    MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
    RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins' };
  S.UF_NAMES = UFN;
  const ufOfName = (n) => { const k = U.norm(n); for (const [s, v] of Object.entries(UFN)) if (U.norm(v) === k) return s; return /^[A-Z]{2}$/.test(k) ? k : ''; };
  const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  const refOf = (t) => { const m = /([A-ZÇ]+)\s*\/\s*(\d{4})/.exec(U.norm(t)); if (!m) return ''; const i = MESES.indexOf(m[1]); return i < 0 ? '' : String(i + 1).padStart(2, '0') + '/' + m[2]; };
  const str = (v) => (v == null ? '' : String(v).trim());
  const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(8) : null);

  /* files: [File|Blob com .name] — retorna o objeto "raw" compacto */
  S.importFiles = async function (files, onProgress = () => {}) {
    const t0 = Date.now();
    const by = {};
    for (const f of files) { const k = fileKind(f.name || ''); if (k && !by[k]) by[k] = f; }
    if (!by.AN) throw new Error('Selecione o “Relatório Analítico de Composições de Custos” do SICRO (.xlsx). Os relatórios sintéticos de materiais, equipamentos e mão de obra são recomendados.');
    const sheetRows = async (blob, label, a, b) => {
      onProgress(`Abrindo ${label}…`, a);
      const wb = await X.readWorkbook(blob); const sh = wb.sheets[0]; const rows = [];
      await X.readSheet(wb, sh, (rn, v) => { rows.push(v); }, { onProgress: (n) => onProgress(`Lendo ${label}…`, a + (b - a) * Math.min(1, n / 3e7)) });
      return rows;
    };
    const raw = { v: 1, fonte: 'SICRO', ref: '', emissao: '', uf: '', ufs: [], cidades: [], regimes: ['SD'], un: [], cls: ['MATERIAL', 'MAO DE OBRA', 'EQUIPAMENTO'],
      grupos: [], ct: [], orig: [''], origLeg: {}, encargos: {}, encGrp: {},
      ins: { c: [], k: [], d: [], u: [], o: [], p: [], lab: {}, v: [], vcd: [] }, eq: {}, eqCD: {}, eqOp: {},
      comp: { c: [], g: [], d: [], u: [], s: [], P: [], F: [], K: [], A: [], B: [], C: [], D: [], E: [], T: [], X: [], o: [] }, obs: {}, valid: null, files: [] };
    const unIdx = new Map(); const unitId = (u) => { u = str(u); if (!unIdx.has(u)) { unIdx.set(u, raw.un.length); raw.un.push(u); } return unIdx.get(u); };
    const ins = new Map(); // code -> {k,d,u,v,vcd,o}
    const putIns = (code, k, d, u) => { code = S.code(code); let o = ins.get(code); if (!o) { o = { k, d: str(d), u: str(u), v: null, vcd: null, o: '' }; ins.set(code, o); } else { if (!o.d && d) o.d = str(d); if (!o.u && u) o.u = str(u); } return o; };
    const kindOf = (code) => code[0] === 'M' ? 0 : code[0] === 'P' ? 1 : code[0] === 'E' ? 2 : 0;

    /* ---- Analítico de composições ---- */
    const AN = await sheetRows(by.AN, 'analítico de composições', 0.02, 0.55);
    raw.files.push(by.AN.name || 'Analítico de composições');
    onProgress('Interpretando composições…', 0.56);
    const comps = []; const HDR = 'SISTEMA DE CUSTOS REFERENCIAIS DE OBRAS';
    let i = 0; const n = AN.length; const get = (r, c) => (r ? r[c] : undefined);
    while (i < n) {
      const r = AN[i];
      if (!(typeof get(r, 0) === 'string' && U.norm(r[0]).startsWith(HDR))) { i++; continue; }
      const r1 = r, r2 = AN[i + 1] || [], r3 = AN[i + 2] || [];
      if (!raw.uf) { raw.uf = ufOfName(get(r1, 3)); raw.ufName = str(get(r1, 3)); raw.ref = refOf(str(get(r2, 3))); }
      const c = { code: S.code(get(r3, 0)), desc: str(get(r3, 1)), fic: U.norm(get(r1, 6)) === 'FIC' ? numOrNull(get(r1, 7)) : null,
        P: numOrNull(get(r2, 7)), unit: str(get(r2, 8)), A: [], B: [], C: [], D: [], E: [], T: [], X: [], K: 0, rep: {}, obs: '' };
      i += 3; let sec = '';
      while (i < n) {
        const row = AN[i]; const a = get(row, 0);
        if (typeof a === 'string' && U.norm(a).startsWith(HDR)) break;
        const na = typeof a === 'string' ? U.norm(a) : '';
        if (na.startsWith('A - EQUIP')) { sec = 'A'; i += 2; continue; }
        if (na.startsWith('B - MAO DE OBRA')) { sec = 'B'; i++; continue; }
        if (na.startsWith('C - MATERIA')) { sec = 'C'; i++; continue; }
        if (na.startsWith('D - ATIVIDADES')) { sec = 'D'; i++; continue; }
        if (na.startsWith('E - TEMPO FIXO')) { sec = 'E'; i++; continue; }
        if (na.startsWith('F - MOMENTO')) { sec = 'F'; const sub = AN[i + 1] || []; c.K = sub.some((x) => U.norm(x) === 'FE') ? 1 : 0; i += 2; continue; }
        if (na === 'OBS.' || na === 'OBS') { c.obs = (row || []).slice(1).filter((x) => x != null && x !== '').map(str).join(' '); i++; continue; }
        if (a == null || a === '') {
          const l2 = U.norm(get(row, 2)), l4 = U.norm(get(row, 4)), l6 = U.norm(get(row, 6)), v8 = get(row, 8);
          if (l4.startsWith('CUSTO UNITARIO DIRETO TOTAL')) c.rep.total = v8;
          else if (l6.startsWith('CUSTO HORARIO TOTAL DE EQUIP')) c.rep.eqH = v8;
          else if (l2.startsWith('CUSTO HORARIO TOTAL DE MAO')) c.rep.moH = v8;
          else if (l2.startsWith('CUSTO HORARIO TOTAL DE EXEC')) c.rep.exH = v8;
          else if (l2.startsWith('CUSTO UNITARIO DE EXEC')) c.rep.cuEx = v8;
          else if (l6.startsWith('CUSTO DO FIC')) c.rep.fic = v8;
          else if (l6 === 'SUBTOTAL') c.rep.sub = v8;
          else if (l2.startsWith('CUSTO') || l6.startsWith('CUSTO')) { /* demais totais de seção */ }
          else if (get(row, 6) && typeof v8 === 'number') {
            const m = /\(([\d.,]+)\s*%\)/.exec(str(get(row, 6)));
            if (m && ['B', 'C', 'D'].includes(sec)) c.X.push([sec, +String(m[1]).replace(',', '.') / 100, str(get(row, 6))]);
          }
          i++; continue;
        }
        const code = S.code(a);
        if (sec === 'A') { const o = putIns(code, 2, get(row, 1), 'h'); if (o.v == null) { o.v = numOrNull(get(row, 5)); o.chi = numOrNull(get(row, 6)); } c.A.push([code, numOrNull(get(row, 2)), numOrNull(get(row, 3)), numOrNull(get(row, 4))]); }
        else if (sec === 'B') { const o = putIns(code, 1, get(row, 1), get(row, 3)); if (o.v == null) o.v = numOrNull(get(row, 5)); c.B.push([code, numOrNull(get(row, 2))]); }
        else if (sec === 'C') { const o = putIns(code, 0, get(row, 1), get(row, 3)); if (o.v == null) o.v = numOrNull(get(row, 5)); c.C.push([code, numOrNull(get(row, 2))]); }
        else if (sec === 'D') { c.D.push([code, numOrNull(get(row, 2)), str(get(row, 3)), str(get(row, 1))]); }
        else if (sec === 'E') { if (/^[A-Z]\d{4}$/.test(code)) putIns(code, kindOf(code), String(get(row, 1) || '').replace(/\s+-\s+[^-]+$/, ''), ''); c.E.push([code, S.code(get(row, 2)), numOrNull(get(row, 3)), str(get(row, 1))]); }
        else if (sec === 'F') { if (/^[A-Z]\d{4}$/.test(code)) putIns(code, kindOf(code), String(get(row, 1) || '').replace(/\s+-\s+[^-]+$/, ''), ''); c.T.push([code, numOrNull(get(row, 2)), S.code(get(row, 4) || ''), S.code(get(row, 5) || ''), S.code(get(row, 6) || ''), c.K ? S.code(get(row, 7) || '') : '', str(get(row, 1)), str(get(row, 3))]); }
        i++;
      }
      comps.push(c);
    }
    if (!comps.length) throw new Error('Nenhuma composição encontrada no relatório analítico. Confira se o arquivo é o “Relatório Analítico de Composições de Custos” do SICRO.');
    raw.ufs = [raw.uf || 'SP']; raw.cidades = [raw.ufName || ''];

    /* ---- Sintéticos de insumos (preços oficiais, descrições, componentes) ---- */
    const readList = async (key, label, a, b, fn) => { if (!by[key]) return; const rows = await sheetRows(by[key], label, a, b); raw.files.push(by[key].name || label); rows.forEach((r) => { const c = r && typeof r[0] === 'string' ? r[0].trim() : ''; if (/^[A-Z]\d{4}$/.test(c)) fn(c, r); }); };
    await readList('MAT', 'materiais', 0.58, 0.62, (c, r) => { const o = putIns(c, 0, r[1], r[2]); o.d = str(r[1]); o.u = str(r[2]); o.v = numOrNull(r[3]); o.prz = typeof r[3] !== 'number'; });
    await readList('MO', 'mão de obra', 0.62, 0.65, (c, r) => { const o = putIns(c, 1, r[1], r[2]); o.d = str(r[1]); o.u = str(r[2]); o.v = numOrNull(r[3]); });
    await readList('MOCD', 'mão de obra (com desoneração)', 0.65, 0.68, (c, r) => { const o = putIns(c, 1, r[1], r[2]); o.vcd = numOrNull(r[3]); raw.regimes = ['SD', 'CD']; });
    await readList('EQ', 'equipamentos', 0.68, 0.71, (c, r) => { const o = putIns(c, 2, r[1], 'h'); o.d = str(r[1]); o.u = 'h'; raw.eq[c] = r.slice(2, 11).map((x) => numOrNull(x) ?? 0); o.v = raw.eq[c][7]; o.chi = raw.eq[c][8]; });
    await readList('EQCD', 'equipamentos (com desoneração)', 0.71, 0.74, (c, r) => { const v = r.slice(2, 11).map((x) => numOrNull(x) ?? 0); if (raw.eq[c] && v.join() !== raw.eq[c].join()) raw.eqCD[c] = v; else if (!raw.eq[c]) raw.eqCD[c] = v; raw.regimes = ['SD', 'CD']; });
    if (by.ORIG) {
      const rows = await sheetRows(by.ORIG, 'origem de preços', 0.74, 0.78); raw.files.push(by.ORIG.name || 'Origem de preços');
      let col = -1;
      for (const r of rows) {
        if (!r) continue;
        if (col < 0 && r.some((x) => U.norm(x) === 'CODIGO')) { col = r.findIndex((x) => U.norm(x) === (raw.uf || 'SP')); continue; }
        const c = typeof r[0] === 'string' ? r[0].trim() : '';
        if (col >= 0 && /^[A-Z]\d{4}$/.test(c) && ins.has(c)) { ins.get(c).o = str(r[col]); continue; }
        const cells = r.map(str).filter(Boolean);
        for (let k = 0; k < cells.length - 1; k++) if (/^[A-Z]{2,3}$/.test(cells[k]) && cells[k + 1].length > 6 && !/^\d/.test(cells[k + 1])) raw.origLeg[cells[k]] = cells[k + 1];
      }
    }
    for (const [k, rg] of [['ENC', 'SD'], ['ENCCD', 'CD']]) {
      if (!by[k]) continue;
      const rows = await sheetRows(by[k], 'encargos sociais', 0.78, 0.8); raw.files.push(by[k].name || 'Encargos');
      const hdr = rows[1] || []; const tot = (rows[0] || []).findIndex((x) => /^TOTAL/.test(U.norm(x)));
      const grp = { A: [], B: [], C: [], D: [] }; hdr.forEach((x, j) => { const m = /^([A-D])\d+$/.exec(str(x)); if (m) grp[m[1]].push(j); });
      const enc = {}; for (const r of rows) { const c = r && typeof r[0] === 'string' ? r[0].trim() : ''; if (/^P\d{4}$/.test(c) && tot >= 0) enc[c] = { t: +r[tot] || 0, u: str(r[2]), g: Object.fromEntries(Object.entries(grp).map(([g, cols]) => [g, +cols.reduce((s, j) => s + (+r[j] || 0), 0).toFixed(6)])) }; }
      const pick = (unit) => Object.values(enc).find((x) => U.norm(x.u) === unit);
      const h = pick('H'), m = pick('MES');
      raw.encargos[rg] = { h: [h ? h.t : null], m: [m ? m.t : null] };
      raw.encGrp[rg] = { h: h ? h.g : null, m: m ? m.g : null };
      raw.ins.enc = raw.ins.enc || {}; for (const [c, x] of Object.entries(enc)) (raw.ins.enc[c] ||= {})[rg] = x.t;
    }

    /* ---- Monta os vetores compactos ---- */
    onProgress('Organizando a base…', 0.82);
    const insCodes = [...ins.keys()].sort((a, b) => (a[0] === b[0] ? a.localeCompare(b) : 'MEP'.indexOf(a[0]) - 'MEP'.indexOf(b[0])));
    const origIdx = new Map([['', 0]]);
    const insIx = new Map();
    for (const code of insCodes) {
      const o = ins.get(code); insIx.set(code, raw.ins.c.length);
      raw.ins.c.push(code); raw.ins.k.push(o.k); raw.ins.d.push(o.d || code); raw.ins.u.push(unitId(o.k === 2 ? 'h' : o.u));
      if (!origIdx.has(o.o)) { origIdx.set(o.o, raw.orig.length); raw.orig.push(o.o); }
      raw.ins.o.push(origIdx.get(o.o));
      const v = o.k === 0 && o.prz ? null : o.v;
      raw.ins.v.push(v); raw.ins.vcd.push(o.vcd != null && o.vcd !== v ? o.vcd : null);
      raw.ins.p.push([v == null ? null : Math.round(v * 1e6) / 1e4]);
      if (o.k === 1 && o.vcd != null) raw.ins.lab[code] = { CD: [Math.round(o.vcd * 1e6) / 1e4] };
      if (o.k === 2 && !raw.eq[code]) raw.eq[code] = [0, 0, 0, 0, 0, 0, 0, o.v || 0, o.chi || 0];
    }
    /* operador embutido no custo horário: categoria de mão de obra de mesmo custo */
    const laborByCost = new Map();
    raw.ins.c.forEach((c, k) => { if (raw.ins.k[k] === 1 && raw.ins.v[k] != null && U.norm(raw.un[raw.ins.u[k]]) === 'H') { const key = raw.ins.v[k].toFixed(4); if (!laborByCost.has(key)) laborByCost.set(key, c); } });
    for (const [c, v] of Object.entries(raw.eq)) { const mo = v[6]; if (mo > 0) raw.eqOp[c] = laborByCost.get(mo.toFixed(4)) || ''; }
    const compIx = new Map(); comps.forEach((c, j) => compIx.set(c.code, j));
    raw.tmat = {}; // item transportado -> [descrição, veículo]
    const tdesc = (m, d, u) => { const s0 = String(d || ''); const k = s0.lastIndexOf(' - '); const v = k > 0 ? [s0.slice(0, k).trim(), s0.slice(k + 3).trim()] : [s0, '']; if (!raw.tmat[m]) raw.tmat[m] = [v[0], v[1], u || '']; else if (u && !raw.tmat[m][2]) raw.tmat[m][2] = u; };
    const grpIdx = new Map();
    for (const c of comps) {
      const g = S.groupName(c.code);
      if (!grpIdx.has(g)) { grpIdx.set(g, raw.grupos.length); raw.grupos.push(g); raw.ct.push(''); }
      const C = raw.comp;
      C.c.push(c.code); C.g.push(grpIdx.get(g)); C.d.push(c.desc); C.u.push(unitId(c.unit)); C.s.push(0);
      C.P.push(c.P || 0); C.F.push(c.fic || 0); C.K.push(c.K);
      C.A.push(c.A.map(([code, q, uo, ui]) => [insIx.get(code), q, uo, ui]));
      C.B.push(c.B.map(([code, q]) => [insIx.get(code), q]));
      C.C.push(c.C.map(([code, q]) => [insIx.get(code), q]));
      C.D.push(c.D.map(([code, q]) => [compIx.has(code) ? compIx.get(code) : -1, q, code]));
      C.E.push(c.E.map(([m, code, q, d]) => { tdesc(m, d); return [m, compIx.has(code) ? compIx.get(code) : -1, q, code]; }));
      C.T.push(c.T.map(([m, q, ln, rp, pv, fe, d, u]) => { tdesc(m, d, u); return [m, q, ...[ln, rp, pv, fe].map((x) => (x && compIx.has(x) ? compIx.get(x) : -1))]; }));
      C.X.push(c.X);
      C.o.push(typeof c.rep.total === 'number' ? Math.round(c.rep.total * 100) : null);
      if (c.obs) raw.obs[c.code] = c.obs;
    }
    onProgress('Conferindo custos com o relatório oficial…', 0.9);
    const base = new S.Base(raw);
    raw.valid = S.validate(base);
    raw.importMs = Date.now() - t0;
    onProgress('Concluído', 1);
    return raw;
  };

  /* Confere o custo calculado (SD, sem transporte) com o total publicado */
  S.validate = function (base) {
    const out = { total: 0, ok: 0, byRegime: {}, sample: [], mismatch: 0 };
    const t = base.costTable(base.ufs[0], 'SD', true).cost; const o = base.raw.comp.o;
    for (let j = 0; j < base.nComp; j++) {
      if (o[j] == null) continue; out.total++;
      if (t[j] === o[j]) out.ok++; else { out.mismatch++; if (out.sample.length < 20) out.sample.push({ code: base.raw.comp.c[j], off: o[j], calc: t[j] }); }
    }
    out.byRegime.SD = { total: out.total, ok: out.ok };
    return out;
  };

  /* Mapa de códigos tolerante: aceita 307731, '307731' ou '0307731' */
  class CodeMap extends Map {
    get(k) { return super.get(S.code(k)); }
    has(k) { return super.has(S.code(k)); }
    set(k, v) { return super.set(S.code(k), v); }
    delete(k) { return super.delete(S.code(k)); }
  }
  S.CodeMap = CodeMap;

  /* ================= BASE (modelo em memória) ================= */
  S.Base = class Base {
    constructor(raw, id) {
      this.raw = raw; this.id = id || `SICRO-${raw.ufs[0]}-${String(raw.ref).split('/').reverse().join('-')}`;
      this.ufs = raw.ufs; this.spIdx = 0; this.source = 'SICRO';
      const I = raw.ins, C = raw.comp;
      this.insIdx = new CodeMap(); I.c.forEach((c, i) => this.insIdx.set(c, i));
      this.compIdx = new CodeMap(); C.c.forEach((c, j) => this.compIdx.set(c, j));
      this.nIns = I.c.length; this.nComp = C.c.length;
      this.nOfficialIns = this.nOfficialIns || I.v.length;
      this.insCat = I.k.map((k) => (typeof k === 'number' && k <= 2 ? ['mat', 'mo', 'eq'][k] : S.catOfClass(raw.cls[k])));
      this.isLabor = C.c.map(() => false); this.isEquip = C.c.map(() => false);
      // valores exatos (escala 1e10) dos parâmetros das composições
      this._P = C.P.map(toS); this._F = C.F.map(toS);
      this.custom = new Map();
      this._costCache = new Map(); this._transport = null; this._tsig = '';
      this.quoteByCode = new Map(); this.planningAggregate = true;
      if (!Object.getOwnPropertyDescriptor(C, 'it')) Object.defineProperty(C, 'it', { value: null, writable: true, enumerable: false, configurable: true });
      if (!Object.getOwnPropertyDescriptor(C, '_itSig')) Object.defineProperty(C, '_itSig', { value: null, writable: true, enumerable: false, configurable: true });
      C.it = C.c.map((_, j) => this.flatItems(j)); C._itSig = '';
    }
    /* ---- acesso ---- */
    ufIndex() { return 0; }
    unit(j) { return this.raw.un[this.raw.comp.u[j]]; }
    insUnit(i) { return this.raw.un[this.raw.ins.u[i]]; }
    group(j) { return this.raw.grupos[this.raw.comp.g[j]]; }
    caderno() { return ''; }
    insClass(i) { const k = this.raw.ins.k[i]; return i < this.nOfficialIns ? this.raw.cls[k] : (this.raw.cls[k] || 'MATERIAL'); }
    insKind(i) { return this.insCat[i]; }
    production(code) { const cpx = this.custom.get(code); if (cpx && cpx.mode === 'sicro') { const jb = this.compIdx.get(cpx.sicro.base); return jb == null ? null : { P: cpx.sicro.P, unit: this.unit(jb), fic: this.raw.comp.F[jb] }; } const j = this.compIdx.get(code); return j == null ? null : { P: this._Pn(j), unit: this.unit(j), fic: this.raw.comp.F[j] }; }
    comp(code) {
      if (this.custom.has(code)) return this.custom.get(code);
      const c = String(code); const mp = EQP.exec(c);
      if (mp) { const i = this.insIdx.get(mp[1]); if (i == null) return null; return { code: c, j: null, desc: this.raw.ins.d[i] + ' - ' + PNAME[mp[2]], unit: 'h', group: 'Custos horários de equipamentos', sit: 0, src: 'SICRO', resourceKind: 'service', eq: mp[1] }; }
      const m = EQH.exec(c);
      if (m) { const i = this.insIdx.get(m[1]); if (i == null) return null; return { code: c, j: null, desc: this.raw.ins.d[i] + ' — custo horário ' + (m[2] === 'CHP' ? 'produtivo' : 'improdutivo'), unit: m[2], group: 'Custos horários de equipamentos', sit: 0, src: 'SICRO', resourceKind: 'equipment', eq: m[1] }; }
      const j = this.compIdx.get(code); if (j == null) return null;
      const C = this.raw.comp;
      return { code: C.c[j], j, desc: C.d[j], unit: this.unit(j), group: this.group(j), sit: C.s[j], src: 'SICRO', P: C.P[j], fic: C.F[j] };
    }
    ins(code) {
      const i = this.insIdx.get(code); if (i == null) return null;
      const I = this.raw.ins;
      return { code: I.c[i], i, desc: I.d[i], unit: this.insUnit(i), cls: this.insClass(i), cat: this.insCat[i], origem: this.raw.orig?.[I.o[i]] || '', prz: i < this.nOfficialIns && this.insCat[i] === 'mat' && I.v[i] == null };
    }
    /* preço exato (escala 1e10) de insumo para o regime; null = sem preço */
    insValue(i, rg) {
      const vc = this._vc || (this._vc = { SD: new Map(), CD: new Map() }); const mm = vc[rg === 'CD' ? 'CD' : 'SD'];
      if (mm.has(i)) return mm.get(i);
      const v = this._insValue(i, rg); mm.set(i, v); return v;
    }
    _insValue(i, rg) {
      const I = this.raw.ins, code = I.c[i];
      const q = this.quoteByCode.get(code);
      if (i < this.nOfficialIns) {
        let v = I.v[i];
        if (rg === 'CD' && I.vcd[i] != null) v = I.vcd[i];
        if (v == null && q && Number.isFinite(q.value)) return toS(q.value);
        return v == null ? null : toS(v);
      }
      const arr = rg !== 'SD' && I.lab[code] && I.lab[code][rg] ? I.lab[code][rg] : I.p[i];
      const c = arr ? arr[0] : null; return c == null ? null : toS(c / 100);
    }
    /* preço de insumo em centavos (com frações) — interface herdada */
    insPrice(i, ui, rg) { const v = this.insValue(i, rg); return [v == null ? null : Number(divR(v, 10n ** 6n)) / 100, false]; }
    /* componentes do custo horário do equipamento (reais) */
    /* parcelas do custo horário; quando o SICRO não publica a decomposição (49 equipamentos,
       sobretudo caminhões), estima-as pela média dos equipamentos com decomposição publicada
       (veículos ou geral) e marca o resultado (est = true). CHI = fator × (dep. + oport. + seg. + operador). */
    eqShares() {
      if (this._shares) return this._shares; const acc = { veh: [0, 0, 0, 0, 0, 0, 0], gen: [0, 0, 0, 0, 0, 0, 0] };
      for (const [code, v] of Object.entries(this.raw.eq)) {
        if (!/^E\d{4}$/.test(code) || !(v[7] > 0) || !v.slice(1, 7).some((x) => x > 0)) continue;
        const i = this.insIdx.get(code); const d = i == null ? '' : U.norm(this.raw.ins.d[i]);
        for (const g of /^(CAMINH|CAVALO|VEICULO|ONIBUS|CARRETA)/.test(d) ? ['veh', 'gen'] : ['gen']) { for (let k = 0; k < 6; k++) acc[g][k] += (v[k + 1] || 0) / v[7]; acc[g][6]++; }
      }
      const fin = (a) => { const n = a[6] || 1, sh = a.slice(0, 6).map((x) => x / n), t = sh.reduce((x, y) => x + y, 0) || 1; return sh.map((x) => x / t); };
      return (this._shares = { veh: acc.veh[6] ? fin(acc.veh) : fin(acc.gen), gen: fin(acc.gen) });
    }
    eqParts(code, rg) {
      const e = (rg === 'CD' && this.raw.eqCD[code]) || this.raw.eq[code]; if (!e) return null;
      if (e.slice(1, 7).some((x) => x > 0) || !(e[7] > 0)) return e;
      const cache = this._estParts || (this._estParts = new Map()), key = code + '|' + rg; if (cache.has(key)) return cache.get(key);
      const i = this.insIdx.get(code), d = i == null ? '' : U.norm(this.raw.ins.d[i]);
      const sh = this.eqShares()[/^(CAMINH|CAVALO|VEICULO|ONIBUS|CARRETA)/.test(d) ? 'veh' : 'gen'], chp = e[7], chi = e[8] || 0;
      const p = sh.map((x) => Math.round(x * chp * 1e4) / 1e4); p[5] = Math.round((chp - p[0] - p[1] - p[2] - p[3] - p[4]) * 1e4) / 1e4;
      const out = [e[0] || 0, ...p, chp, chi]; const b = p[0] + p[1] + p[2] + p[5];
      out.est = true; out.chiScale = b > 0 ? chi / b : 0; cache.set(key, out); return out;
    }
    eqRates(i, rg) {
      const ec = this._ec || (this._ec = { SD: new Map(), CD: new Map() }); const mm = ec[rg === 'CD' ? 'CD' : 'SD'];
      if (mm.has(i)) return mm.get(i);
      const code = this.raw.ins.c[i]; const e = this.eqParts(code, rg);
      const v = this.insValue(i, rg); const r = e ? [toS(e[7]), toS(e[8])] : [v || 0n, v || 0n]; mm.set(i, r); return r;
    }
    /* ---- transporte (DMT do projeto) ---- */
    setTransport(cfg) {
      const sig = JSON.stringify(cfg || null);
      if (sig === this._tsig) return; this._tsig = sig; this._transport = cfg || null;
      this._costCache.clear(); this._bdCache = new Map(); this._customCostCache = new Map(); this._anCache = null;
      this.ensureIt(); if (OP.prod) OP.prod.clearCache(this);
    }
    /* produções horárias editadas (Demonstrativo de Produções Horárias): j -> {P, A} */
    _Pn(j) { const o = this._pem && this._pem.get(j); return o ? o.P : this.raw.comp.P[j]; }
    _PSj(j) { const o = this._pem && this._pem.get(j); return o ? (o.PS || (o.PS = toS(o.P))) : this._P[j]; }
    _Aj(j) { const o = this._pem && this._pem.get(j); return o ? o.A : this.raw.comp.A[j]; }
    setPem(sig, map) {
      sig = map && map.size ? String(sig || 'x') : ''; if (sig === (this._psig || '')) return;
      this._psig = sig; this._pem = sig ? map : null;
      this._costCache.clear(); this._bdCache = new Map(); this._customCostCache = new Map(); this._usage = null;
      const C = this.raw.comp; C.it = null; C._itSig = null; this.ensureIt(); if (OP.prod) OP.prod.clearCache(this);
    }
    /* FIC do projeto (Volume 04): vetor de FIC por composição ou null (FIC publicado) */
    setFic(sig, arr) {
      sig = arr ? String(sig || 'x') : ''; if (sig === (this._fsig || '')) return;
      this._fsig = sig; this._ficN = arr || null; this._ficOv = arr ? arr.map((x) => toS(x || 0)) : null;
      this._costCache.clear(); this._bdCache = new Map(); this._customCostCache = new Map(); this._usage = null;
      const C = this.raw.comp; C.it = null; this.ensureIt(); if (OP.prod) OP.prod.clearCache(this);
    }
    dmtFor(matCode) {
      const t = this._transport; if (!t) return null;
      const own = t.byMat && t.byMat[matCode]; const d = own || t.def || null; if (!d) return null;
      const out = {}; let any = false; for (const k of S.DMT) { const v = +d[k] || 0; out[k] = v; if (v > 0) any = true; }
      return any ? out : null;
    }
    /* ---- custo de TODAS as composições para o regime (memo) ----
     * noTransport=true reproduz o relatório oficial (DMT não definida). */
    costTable(uf, rg, noTransport) {
      rg = rg === 'CD' ? 'CD' : 'SD';
      const key = rg + '|' + (noTransport ? '0' : this._tsig) + '|' + (this._fsig || '') + '|' + (this._psig || '');
      if (this._costCache.has(key)) return this._costCache.get(key);
      const n = this.nComp, cost = new Array(n).fill(null), as = new Array(n).fill(0), state = new Uint8Array(n);
      const memo4 = new Array(n).fill(null);
      for (let seed = 0; seed < n; seed++) {
        if (state[seed] === 2) continue;
        const stack = [seed];
        while (stack.length) {
          const j = stack[stack.length - 1];
          if (state[j] === 2) { stack.pop(); continue; }
          state[j] = 1;
          const deps = this._deps(j, noTransport); let pending = false;
          for (const d of deps) if (d >= 0 && state[d] === 0) { stack.push(d); pending = true; }
          if (pending) continue;
          const r = this._calc(j, rg, (d) => (d >= 0 && state[d] === 2 ? cost[d] : null), noTransport);
          memo4[j] = r; cost[j] = r ? Number(r.totalC) : null; state[j] = 2; stack.pop();
        }
      }
      const t = { cost, as, detail: memo4 }; this._costCache.set(key, t); return t;
    }
    _deps(j, noTransport) {
      const C = this.raw.comp, out = [];
      for (const x of C.D[j]) out.push(x[0]);
      for (const x of C.E[j]) out.push(x[1]);
      if (!noTransport && this._transport) for (const x of C.T[j]) for (let k = 2; k < x.length; k++) out.push(x[k]);
      return out;
    }
    /* cálculo SICRO de uma composição (valores em 1e-4 R$, BigInt) */
    _calc(j, rg, costOf, noTransport, ov) {
      const C = this.raw.comp, P = ov ? toS(ov.P) : this._PSj(j), F = this._ficOv ? this._ficOv[j] : this._F[j];
      const r = { eq: [], mo: [], mat: [], aux: [], tf: [], mt: [], extra: [] };
      let eqH = 0n, moH = 0n, imp = 0n;
      for (const [i, q, uo, ui] of (ov ? ov.A : this._Aj(j))) {
        const [chp, chi] = this.eqRates(i, rg); const qS = toS(q), uoS = toS(uo), uiS = toS(ui);
        const line = divR(qS * (uoS * chp + uiS * chi), P10[26]); eqH += line; imp += divR(qS * chi, P10[16]);
        r.eq.push({ i, code: this.raw.ins.c[i], q, uo, ui, chp, chi, line });
      }
      for (const [i, q] of C.B[j]) {
        const p = this.insValue(i, rg) || 0n; const line = divR(toS(q) * p, P10[16]); moH += line;
        r.mo.push({ i, code: this.raw.ins.c[i], q, p, line });
      }
      for (const [sec, pct, label] of C.X[j]) if (sec === 'B') { const v = divR(moH * toS(pct), B10); r.extra.push({ sec, pct, label, v }); moH += v; }
      const exH = eqH + moH;
      const cuEx = P > 0n ? divR(exH * B10, P) : 0n;
      let fic = 0n; if (F > 0n && P > 0n) { const u = divR((imp + moH) * B10, P); fic = divR(F * u, B10); }
      let mat = 0n, przq = false;
      for (const [i, q] of C.C[j]) {
        const pv = this.insValue(i, rg); if (pv == null) przq = true;
        const line = divR(toS(q) * (pv || 0n), P10[16]); mat += line; r.mat.push({ i, code: this.raw.ins.c[i], q, p: pv, line });
      }
      for (const [sec, pct, label] of C.X[j]) if (sec === 'C') { const v = divR(mat * toS(pct), B10); r.extra.push({ sec, pct, label, v }); mat += v; }
      let aux = 0n;
      for (const [d, q, code] of C.D[j]) {
        const c = costOf(d); const cu = c == null ? 0n : BigInt(c) * 100n;
        const line = divR(toS(q) * cu, B10); aux += line; r.aux.push({ j: d, code, q, cu, line, missing: c == null });
      }
      for (const [sec, pct, label] of C.X[j]) if (sec === 'D') { const v = divR(aux * toS(pct), B10); r.extra.push({ sec, pct, label, v }); aux += v; }
      const sub = cuEx + fic + mat + aux;
      let tf = 0n;
      for (const [m, d, q, code] of C.E[j]) {
        const c = costOf(d); const cu = c == null ? 0n : BigInt(c) * 100n;
        const line = divR(toS(q) * cu, B10); tf += line; r.tf.push({ j: d, code, mat: m, q, cu, line });
      }
      let mt = 0n;
      for (const x of C.T[j]) {
        const [mc, q] = x; const dmt = noTransport ? null : this.dmtFor(mc);
        let acc = 0n; const parts = [];
        S.DMT.forEach((k, kk) => {
          const d = x[2 + kk]; if (d == null || d < 0) return;
          const km = dmt ? dmt[k] || 0 : 0; const c = km > 0 ? costOf(d) : null; const cu = c == null ? 0n : BigInt(c) * 100n;
          if (km > 0) acc += toS(km) * cu; parts.push({ k, j: d, code: this.raw.comp.c[d], km, cu });
        });
        const line = divR(toS(q) * acc, P10[20]); mt += line; r.mt.push({ mat: mc, q, parts, line, dmt });
      }
      const total4 = sub + tf + mt;
      Object.assign(r, { P: ov ? ov.P : this._Pn(j), fic: this._ficN ? this._ficN[j] : this.raw.comp.F[j], eqH, moH, exH, cuEx, ficV: fic, matV: mat, auxV: aux, sub, tfV: tf, mtV: mt, total4, totalC: divR(total4, 100n), przq });
      return r;
    }
    /* custo unitário (centavos) de composição SICRO, de custo horário ou própria */
    compCost(code, uf, rg) {
      if (this.custom.has(code)) return this.customCost(this.custom.get(code), uf, rg).cost;
      const mp = EQP.exec(String(code));
      if (mp) { const e = this.eqParts(mp[1], rg); return e ? Math.round(e[PIX[mp[2]]] * 1e6) / 1e4 : null; }
      const m = EQH.exec(String(code));
      if (m) { const i = this.insIdx.get(m[1]); if (i == null) return null; const [chp, chi] = this.eqRates(i, rg); return Number(divR(m[2] === 'CHP' ? chp : chi, 10n ** 6n)) / 100; }
      const j = this.compIdx.get(code); if (j == null) return null;
      return this.costTable(uf, rg).cost[j];
    }
    /* custo com FIT (fração) aplicado ao custo unitário de execução do item do orçamento */
    compCostFit(code, uf, rg, fit) {
      const j = this.compIdx.get(code); if (j == null || !(fit > 0)) return this.compCost(code, uf, rg);
      const r = this.costTable(uf, rg).detail[j]; if (!r) return null;
      const f = divR(toS(fit) * r.cuEx, B10); return Number(divR(r.total4 + f, 100n));
    }
    fitValue(code, uf, rg, fit) { const j = this.compIdx.get(code); if (j == null) return 0; const r = this.costTable(uf, rg).detail[j]; return r ? Number(divR(toS(fit) * r.cuEx, B10)) / 1e4 : 0; }
    /* parcelas do custo horário (pseudoinsumos E####.DEP etc.), para a ABC e o motor de IVA */
    /* preço do combustível de referência (diesel M0043 em L; energia M0237 em kWh) */
    fuelRef(eletr, rg) {
      const code = eletr ? 'M0237' : 'M0043', i = this.insIdx.get(code); if (i == null) return null;
      const v = this.raw.ins.v[i]; return v > 0 ? { code, price: v, unit: eletr ? 'kWh' : 'L' } : null;
    }
    pseudoIns(code, rg) {
      const m = PINS.exec(String(code)); if (!m) return null; const i = this.insIdx.get(m[1]); if (i == null) return null;
      const e = this.eqParts(m[1], rg); if (!e) return null; const d = this.raw.ins.d[i], k = m[2], eletr = ELETR.test(U.norm(d));
      const desc = k === 'OPE' ? (eletr ? 'ENERGIA ELÉTRICA — operação do equipamento ' : 'ÓLEO DIESEL — combustível e lubrificantes na operação do equipamento ') + m[1] + ' ' + d : k === 'MOP' ? 'Operador incluso no custo horário — ' + d : d + ' - ' + PNAME[k];
      const cls = k === 'MOP' ? 'MAO DE OBRA' : k === 'OPE' ? (eletr ? 'ESPECIAIS' : 'MATERIAL') : 'EQUIPAMENTO';
      const fuel = k === 'OPE' ? this.fuelRef(eletr, rg) : null;
      const sfx = (fuel ? ' — equivalente em ' + fuel.unit + ' (custo de operação ÷ preço de ' + fuel.code + ')' : '') + (e.est ? ' (parcela estimada: o SICRO não publica a decomposição deste equipamento)' : '');
      if (fuel) return { code: String(code), desc: desc + sfx, unit: fuel.unit, cls, cat: 'eq', price: Math.round(fuel.price * 1e6) / 1e4, perHour: e[PIX[k]] / fuel.price, eletr, est: !!e.est };
      return { code: String(code), desc: desc + sfx, unit: 'h', cls, cat: k === 'MOP' ? 'mo' : 'eq', price: Math.round(e[PIX[k]] * 1e6) / 1e4, perHour: 1, eletr, est: !!e.est };
    }
    ivaPrice(code, rg) { const m = PINS.exec(String(code)); if (!m) return undefined; const ps = this.pseudoIns(code, rg); return ps ? ps.price / 100 : null; }
    ivaExtras() {
      const ins = [], comp = [], R = this.raw;
      for (let [code, e] of Object.entries(R.eq)) {
        if (!/^E\d{4}$/.test(code)) continue;
        const i = this.insIdx.get(code); if (i == null) continue; const d = R.ins.d[i];
        e = this.eqParts(code, 'SD'); const cd = R.eqCD[code] ? this.eqParts(code, 'CD') : null; const fchi = e.est ? e.chiScale : 1;
        const has = (k) => e[PIX[k]] > 0 || (cd && cd[PIX[k]] > 0);
        const per = {};
        for (const k of Object.keys(PIX)) { if (!has(k)) continue; const ps = this.pseudoIns(code + '.' + k, 'SD'); per[k] = ps.perHour; const pv = ps.price / 100; ins.push({ c: code + '.' + k, cls: ps.cls, un: ps.unit, d: ps.desc, p: [pv], ...(cd ? { pCD: [k === 'OPE' ? pv : cd[PIX[k]]] } : {}) }); }
        for (const k of ['DEP', 'JUR', 'ISE', 'MAN', 'OPE']) if (has(k)) comp.push({ c: code + '-' + k, un: 'h', d: d + ' - ' + PNAME[k], it: [{ t: 'I', c: code + '.' + k, k: per[k] || 1 }] });
        const it = (keys, f) => keys.filter(has).map((k) => ({ t: 'C', c: code + '-' + k, k: f })).concat(has('MOP') ? [{ t: 'I', c: code + '.MOP', k: f }] : []);
        comp.push({ c: code + '-CHP', un: 'CHP', d: d + ' - CHP ', it: it(['DEP', 'JUR', 'ISE', 'MAN', 'OPE'], 1) });
        comp.push({ c: code + '-CHI', un: 'CHI', d: d + ' - CHI ', it: it(['DEP', 'JUR', 'ISE'], fchi) });
      }
      return { ins, comp, cls: ['ESPECIAIS'] };
    }
    /* consumo por unidade, recursivo pelas atividades auxiliares (e composições próprias):
       mat = materiais (C) e tr = itens transportados (F), com as composições de transporte */
    usage(code, depth = 0) {
      const memo = this._usage || (this._usage = new Map()); const key = String(S.code(code));
      if (memo.has(key)) return memo.get(key);
      const out = { mat: new Map(), tr: new Map() }; memo.set(key, out); if (depth > 30) return out;
      const addM = (m, q) => out.mat.set(m, (out.mat.get(m) || 0) + q);
      const addT = (m, q, ks) => { const o = out.tr.get(m) || { q: 0, ks: {} }; o.q += q; S.DMT.forEach((k, kk) => { const d = ks[kk]; if (d != null && d >= 0 && o.ks[k] == null) o.ks[k] = d; }); out.tr.set(m, o); };
      const merge = (u, f) => { for (const [m, q] of u.mat) addM(m, q * f); for (const [m, o] of u.tr) addT(m, o.q * f, S.DMT.map((k) => o.ks[k])); };
      if (this.custom.has(code) && this.custom.get(code).mode === 'sicro') { const u = this.usage(this.custom.get(code).sicro.base, depth + 1); memo.set(key, u); return u; }
      if (this.custom.has(code)) { const cp = this.custom.get(code); if (cp.mode !== 'quoted') for (const x of cp.items || []) { if (x.type === 'I') { const i = this.insIdx.get(x.code); if (i != null && this.insCat[i] === 'mat') addM(this.raw.ins.c[i], x.coef); } else merge(this.usage(x.code, depth + 1), x.coef); } return out; }
      const j = this.compIdx.get(code); if (j == null) return out; const C = this.raw.comp;
      for (const [i, q] of C.C[j]) addM(this.raw.ins.c[i], q);
      for (const x of C.T[j]) addT(x[0], x[1], x.slice(2));
      for (const [d, q] of C.D[j]) if (d >= 0) merge(this.usage(C.c[d], depth + 1), q);
      return out;
    }
    compAS() { return 0; }
    costAllUF(code, rg) { return this.ufs.map((uf) => this.compCost(code, uf, rg)); }
    officialCost(code) { const j = this.compIdx.get(code); return j == null ? null : this.raw.comp.o[j]; }
    /* memória analítica completa (seções A–F), para a gaveta e exportações */
    /* composição própria derivada de uma composição SICRO com demonstrativo de produção editado */
    sicroCustom(cp, uf, rg) {
      const j = this.compIdx.get(cp.sicro && cp.sicro.base); if (j == null) return null; rg = rg === 'CD' ? 'CD' : 'SD';
      const t = this.costTable(uf, rg), r = this._calc(j, rg, (d) => (d >= 0 ? t.cost[d] : null), false, cp.sicro);
      return r ? Object.assign({ code: cp.code, desc: cp.desc, unit: cp.unit, group: 'Composições próprias', K: this.raw.comp.K[j], obs: 'Composição própria derivada da ' + cp.sicro.base + ' (demonstrativo de produção horária editado); a composição do SICRO permanece inalterada no catálogo.', official: null, base: cp.sicro.base }, r) : null;
    }
    analytic(code, uf, rg) {
      const cpx = this.custom.get(code); if (cpx && cpx.mode === 'sicro') return this.sicroCustom(cpx, uf, rg);
      const j = this.compIdx.get(code); if (j == null) return null;
      const t = this.costTable(uf, rg); const r = t.detail[j]; if (!r) return null;
      return Object.assign({ code: this.raw.comp.c[j], desc: this.raw.comp.d[j], unit: this.unit(j), group: this.group(j), K: this.raw.comp.K[j], obs: this.raw.obs[this.raw.comp.c[j]] || '', official: this.raw.comp.o[j] }, r);
    }

    /* ---- coeficientes equivalentes por unidade (para cópias, IVA e ABC) ----
     * mão de obra: q/P × (1 + FIC) h/un  · equipamento: CHP q·UO/P e
     * CHI q·(UI + FIC)/P  · material, auxiliares e tempo fixo: q
     * transporte: q × DMT (quando configurada). Percentuais especiais
     * multiplicam os coeficientes da seção. */
    flatItems(j, ov) {
      const C = this.raw.comp, P = (ov ? ov.P : this._Pn(j)) || 0, F = (this._ficN ? this._ficN[j] : C.F[j]) || 0, out = [];
      const pct = (sec) => C.X[j].filter((x) => x[0] === sec).reduce((s, x) => s * (1 + x[1]), 1);
      if (P > 0) {
        for (const [i, q, uo, ui] of (ov ? ov.A : this._Aj(j))) {
          const e = this.raw.ins.c[i];
          if (q * uo > 0) out.push([e + '-CHP', q * uo / P, 'C']);
          if (q * (ui + F) > 0) out.push([e + '-CHI', q * (ui + F) / P, 'C']);
        }
        const kb = pct('B'); for (const [i, q] of C.B[j]) out.push([this.raw.ins.c[i], q / P * (1 + F) * kb, 'I']);
      }
      const kc = pct('C'); for (const [i, q] of C.C[j]) out.push([this.raw.ins.c[i], q * kc, 'I']);
      const kd = pct('D'); for (const [d, q, code] of C.D[j]) out.push([code, q * kd, 'C']);
      for (const [, , q, code] of C.E[j]) out.push([code, q, 'C']);
      for (const x of C.T[j]) {
        const dmt = this.dmtFor(x[0]); if (!dmt) continue;
        S.DMT.forEach((k, kk) => { const d = x[2 + kk]; if (d >= 0 && dmt[k] > 0) out.push([this.raw.comp.c[d], x[1] * dmt[k], 'C']); });
      }
      return out;
    }
    ensureIt() {
      const C = this.raw.comp; const sig = this._tsig;
      if (!C.it || C._itSig !== sig + '|' + (this._fsig || '')) { C.it = C.c.map((_, j) => this.flatItems(j)); C._itSig = sig + '|' + (this._fsig || ''); }
      return C.it;
    }

    /* ---- itens analíticos com custo (1 nível), na forma herdada ---- */
    itemsOf(code, uf, rg) {
      if (this.custom.has(code)) return (this.custom.get(code).items || []).map((x) => this._itemRow(x.type === 'C' ? String(x.code) : String(x.code), x.coef, 0, uf, rg, x.type));
      const mp = EQP.exec(String(code));
      if (mp) { const ps = this.pseudoIns(mp[1] + '.' + mp[2], rg); return ps ? [{ type: 'I', code: mp[1] + '.' + mp[2], desc: ps.desc, unit: ps.unit, coef: ps.perHour, price: ps.price, total: ps.price * ps.perHour, cls: ps.cls, cat: ps.cat }] : []; }
      const m = EQH.exec(String(code));
      if (m) {
        const e = this.eqParts(m[1], rg); if (!e) return [];
        const keys = m[2] === 'CHP' ? ['DEP', 'JUR', 'ISE', 'MAN', 'OPE'] : ['DEP', 'JUR', 'ISE']; const rows = [];
        const f = m[2] === 'CHI' && e.est ? e.chiScale : 1;
        for (const k of keys) { const v = Math.round(e[PIX[k]] * 1e6) / 1e4; if (v > 0) rows.push({ type: 'C', code: m[1] + '-' + k, desc: this.comp(m[1] + '-' + k).desc, unit: 'h', coef: f, price: v, total: v * f, equip: false }); }
        const ps = this.pseudoIns(m[1] + '.MOP', rg); if (ps && ps.price > 0) rows.push({ type: 'I', code: m[1] + '.MOP', desc: ps.desc, unit: 'h', coef: f, price: ps.price, total: ps.price * f, cls: ps.cls, cat: ps.cat });
        return rows;
      }
      const j = this.compIdx.get(code); if (j == null) return [];
      return this.flatItems(j).map(([c, coef, t]) => this._itemRow(c, coef, 0, uf, rg, t));
    }
    _itemRow(c, coef, ui, uf, rg, type) {
      const isComp = type ? type === 'C' : (this.compIdx.has(c) || EQH.test(String(c)) || this.custom.has(c));
      if (isComp) {
        const info = this.comp(c) || { code: c, desc: '(composição não encontrada)', unit: '' };
        const p = this.compCost(c, uf, rg);
        return { type: 'C', code: info.code || c, desc: info.desc, unit: info.unit, coef, price: p, total: p == null ? null : coef * p,
          labor: false, equip: EQH.test(String(c)), group: info.group };
      }
      const i = this.insIdx.get(c); const info = this.ins(c) || { desc: '(insumo não encontrado)', unit: '' };
      const [p] = i == null ? [null] : this.insPrice(i, 0, rg);
      return { type: 'I', code: info.code || c, desc: info.desc, unit: info.unit, coef, price: p, sp: false, total: p == null ? null : coef * p, cls: info.cls, cat: info.cat, prz: info.prz };
    }

    /* ---- decomposição MO/MAT/EQ/SERV/OUT (centavos inteiros), recursiva ---- */
    breakdown(code, uf, rg, memo = new Map()) {
      const key = String(S.code(code));
      if (memo.has(key)) return memo.get(key);
      const cpx = this.custom.get(code), sic = cpx && cpx.mode === 'sicro';
      if (this.custom.has(code) && !sic) return this._customBreakdown(code, uf, rg, memo);
      const j = sic ? this.compIdx.get(cpx.sicro.base) : this.compIdx.get(code);
      const total = this.compCost(code, uf, rg);
      if (j == null || total == null) { const z = { mo: 0, mat: 0, eq: 0, serv: 0, out: total || 0 }; memo.set(key, z); return z; }
      const r = sic ? this.sicroCustom(cpx, uf, rg) : this.costTable(uf, rg).detail[j];
      const parts = { mo: 0, mat: 0, eq: 0, serv: 0, out: 0 };
      // execução e FIC: proporcional às parcelas de equipamento e mão de obra
      const ex = Number(r.cuEx + r.ficV) / 100, eqH = Number(r.eqH), moH = Number(r.moH), den = eqH + moH;
      if (den > 0) { parts.eq += ex * eqH / den; parts.mo += ex * moH / den; } else parts.out += ex;
      parts.mat += Number(r.matV) / 100;
      const sub = (rows) => { for (const x of rows) { const v = Number(x.line) / 100; if (!v) continue; const b = x.j != null && x.j >= 0 ? this.breakdown(this.raw.comp.c[x.j], uf, rg, memo) : null; const st = b ? b.mo + b.mat + b.eq + b.serv + b.out : 0; if (!st) { parts.out += v; continue; } for (const k of Object.keys(parts)) parts[k] += v * b[k] / st; } };
      sub(r.aux); sub(r.tf);
      for (const x of r.mt) {
        const v = Number(x.line) / 100; if (!v) continue;
        const w = x.parts.filter((p) => p.km > 0 && p.cu > 0n).map((p) => ({ j: p.j, w: p.km * Number(p.cu) })); const tw = w.reduce((a, b) => a + b.w, 0);
        if (!tw) { parts.out += v; continue; }
        for (const p of w) { const vv = v * p.w / tw; const b = this.breakdown(this.raw.comp.c[p.j], uf, rg, memo); const st = b ? b.mo + b.mat + b.eq + b.serv + b.out : 0; if (!st) { parts.out += vv; continue; } for (const k of Object.keys(parts)) parts[k] += vv * b[k] / st; }
      }
      for (const e of r.extra) if (e.sec === 'D') parts.out += Number(e.v) / 100;
      // ajuste para centavos inteiros (maiores restos)
      const keys = Object.keys(parts); let acc = 0; const rem = [];
      const res = {}; keys.forEach((k) => { const fl = Math.floor(parts[k] + 1e-9); res[k] = fl; acc += fl; rem.push([parts[k] - fl, k]); });
      rem.sort((a, b) => b[0] - a[0]); let left = Math.round(total - acc); for (let q = 0; left > 0 && q < 50; q++, left--) res[rem[q % rem.length][1]] += 1;
      memo.set(key, res); return res;
    }
    _customBreakdown(code, uf, rg, memo) {
      const rows = this.itemsOf(code, uf, rg); const res = { mo: 0, mat: 0, eq: 0, serv: 0, out: 0 };
      for (const r of rows) {
        if (r.total == null || !Number.isFinite(r.total)) continue;
        if (r.type === 'I') { res[r.cat || 'out'] += r.total; continue; }
        if (r.equip) { res.eq += r.total; continue; }
        const b = this.breakdown(r.code, uf, rg, memo); const st = b ? b.mo + b.mat + b.eq + b.serv + b.out : 0;
        if (!st) { res.out += r.total; continue; } for (const k of Object.keys(res)) res[k] += r.total * b[k] / st;
      }
      memo.set(String(code), res); return res;
    }

    /* ---- nomes de recursos ---- */
    laborName(desc) { return String(desc || '').replace(/\s+-\s+mensalista$/i, ' (mensalista)').trim(); }
    equipKey(desc) { return U.norm(desc).replace(/\s+-\s+CUSTO HORARIO.*$/, '').trim(); }
    equipName(desc) { return String(desc || '').replace(/\s+—\s+custo horário.*$/i, '').trim(); }
    operatorOf(j) { const code = typeof j === 'string' ? j : null; if (!code) return null; const p = this.raw.eqOp[code]; if (p === undefined) return null; if (!p) return 'Operador (incluso no custo horário)'; const i = this.insIdx.get(p); return i == null ? 'Operador' : this.laborName(this.raw.ins.d[i]); }

    /* ---- RECURSOS (produtividade) ----
     * Diretos: equipe da composição — mão de obra em h/un (q/P) e
     * equipamentos em horas produtivas (q·UO/P) e improdutivas (q·UI/P)
     * por unidade. Apoio: equipes das atividades auxiliares, do tempo fixo
     * e do transporte, com coeficientes multiplicados. */
    resources(code) {
      const direct = new Map(), support = new Map();
      const add = (map, key, obj, field, v) => { if (!map.has(key)) map.set(key, Object.assign({ key, h: 0, chp: 0, chi: 0, q: 0 }, obj)); map.get(key)[field] += v; };
      const C = this.raw.comp, cpx = this.custom.get(code), ov0 = cpx && cpx.mode === 'sicro' ? cpx.sicro : null;
      const walk = (j, factor, depth, active) => {
        const P = (depth === 0 && ov0 ? ov0.P : this._Pn(j)) || 0; const map = depth === 0 ? direct : support;
        if (P > 0) {
          for (const [i, q, uo, ui] of (depth === 0 && ov0 ? ov0.A : this._Aj(j))) {
            const ec = this.raw.ins.c[i], k = 'EQ:' + ec;
            add(map, k, { kind: 'eq', code: ec, name: this.raw.ins.d[i], operator: this.operatorOf(ec), team: q }, 'chp', factor * q * uo / P);
            add(map, k, {}, 'chi', factor * q * ui / P);
            if (depth === 0) map.get(k).q = q;
          }
          for (const [i, q] of C.B[j]) {
            const pc = this.raw.ins.c[i]; const un = U.norm(this.insUnit(i));
            const k = 'MO:' + pc; add(map, k, { kind: 'mo', code: pc, name: this.laborName(this.raw.ins.d[i]), monthly: un !== 'H', team: q }, 'h', factor * q / P);
            if (depth === 0) map.get(k).q = q;
          }
        }
        const sub = (d, f) => { if (d == null || d < 0 || active.has(d) || !(f > 0)) return; active.add(d); walk(d, f, depth + 1, active); active.delete(d); };
        for (const [d, q] of C.D[j]) sub(d, factor * q);
        for (const [, d, q] of C.E[j]) sub(d, factor * q);
        for (const x of C.T[j]) { const dmt = this.dmtFor(x[0]); if (!dmt) continue; S.DMT.forEach((k, kk) => { const d = x[2 + kk]; if (d >= 0 && dmt[k] > 0) sub(d, factor * x[1] * dmt[k]); }); }
      };
      const j = ov0 ? this.compIdx.get(ov0.base) : this.compIdx.get(code);
      if (j != null) walk(j, 1, 0, new Set([j]));
      const fin = (m) => [...m.values()].map((r) => { if (r.kind === 'eq') r.h = r.chp + r.chi; return r; }).filter((r) => r.h > 0);
      return { direct: fin(direct), support: fin(support), P: j != null ? (ov0 ? ov0.P : this._Pn(j)) : 0, unit: j != null ? this.unit(j) : '' };
    }

    /* ---- composições próprias ---- */
    setCustom(list) {
      this.custom = new Map(list.map((c) => [c.code, c])); this._usage = null;
      this._customCostCache = new Map(); this._bdCache = new Map();
      if (OP.prod) OP.prod.clearCache(this);
    }
    customCost(cp, uf, rg) {
      const all = this._customCostCache || (this._customCostCache = new Map()), ck = uf + '|' + rg + '|' + this._tsig;
      let cache = all.get(ck); if (!cache) all.set(ck, cache = new Map());
      const active = new Set(), stack = [{ cp, pos: 0, tot: 0 }];
      while (stack.length) {
        const f = stack[stack.length - 1], k = f.cp.code, items = f.cp.items || [];
        if (cache.has(k)) { stack.pop(); continue; }
        active.add(k); const finish = (v) => { cache.set(k, v); active.delete(k); stack.pop(); };
        if (f.cp.mode === 'quoted') { finish(Number.isFinite(f.cp.quote) ? Math.round(f.cp.quote * 100) : null); continue; }
        if (!items.length) { finish(null); continue; }
        if (f.pos >= items.length) { finish(f.tot); continue; }
        const x = items[f.pos];
        if (!Number.isFinite(x.coef) || x.coef < 0 || !['I', 'C'].includes(x.type)) { finish(null); continue; }
        if (!x.coef) { f.pos++; continue; }
        let p = null;
        if (x.type === 'C' && this.custom.has(x.code)) {
          if (active.has(x.code)) { finish(null); continue; }
          if (!cache.has(x.code)) { stack.push({ cp: this.custom.get(x.code), pos: 0, tot: 0 }); continue; }
          p = cache.get(x.code);
        } else if (x.type === 'C') p = this.compCost(x.code, uf, rg);
        else { const i = this.insIdx.get(x.code); if (i != null) p = this.insPrice(i, 0, rg)[0]; }
        if (p == null || !Number.isFinite(p) || p < 0) { finish(null); continue; }
        f.tot += S.ownPart(x.coef, p); f.pos++;
      }
      const v = cache.get(cp.code); return { cost: v == null ? v : Math.round(v) };
    }
  };
  /* raw.comp.it (lista equivalente de coeficientes) sob demanda */
  S.itOf = (base, j) => { const it = base.ensureIt(); return it[j] || []; };
  /* item [código, coef, tipo] -> {type, code, coef} (também aceita a forma antiga) */
  S.itx = (x) => Array.isArray(x) ? (x.length >= 3 ? { type: x[2], code: x[0], coef: x[1] } : { type: x[0] < 0 ? 'C' : 'I', code: S.code(Math.abs(x[0])), coef: x[1] }) : x;
})(typeof window !== 'undefined' ? window : globalThis);

