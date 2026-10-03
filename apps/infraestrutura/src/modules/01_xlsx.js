/* ==== 01_xlsx.js ==== */
/* =====================================================================
 * OrçaPro SICRO — 01_xlsx.js
 * Leitura de planilhas .xlsx SEM bibliotecas externas:
 *  - ZIP: diretório central lido do Blob; entradas descompactadas com a
 *    API nativa DecompressionStream('deflate-raw').
 *  - XML: parser em fluxo (streaming) linha a linha (<row>), para abas de
 *    dezenas de MB (a aba Analítico do SICRO tem ~23 MB de XML).
 * Escrita de .xlsx mínima (armazenamento sem compressão + CRC32) para
 * exportar o orçamento.
 * ===================================================================== */
(function (G) {
  'use strict';
  const OP = G.OP;
  const X = (OP.xlsx = {});

  /* ---------------- ZIP (leitura) ---------------- */
  const u16 = (dv, o) => dv.getUint16(o, true);
  const u32 = (dv, o) => dv.getUint32(o, true);

  X.openZip = async function (blob) {
    const size = blob.size;
    const tailLen = Math.min(size, 65557);
    const tail = new DataView(await blob.slice(size - tailLen).arrayBuffer());
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Arquivo não é um .xlsx válido (ZIP sem diretório central).');
    const cdSize = u32(tail, eocd + 12), cdOff = u32(tail, eocd + 16), count = u16(tail, eocd + 10);
    const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
    const dec = new TextDecoder('utf-8');
    const entries = new Map();
    let p = 0;
    for (let k = 0; k < count; k++) {
      if (u32(cd, p) !== 0x02014b50) break;
      const method = u16(cd, p + 10), csize = u32(cd, p + 20), usize = u32(cd, p + 24);
      const nlen = u16(cd, p + 28), elen = u16(cd, p + 30), clen = u16(cd, p + 32), off = u32(cd, p + 42);
      const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nlen));
      entries.set(name, { name, method, csize, usize, off });
      p += 46 + nlen + elen + clen;
    }
    return { blob, entries };
  };

  // Fluxo de TEXTO de uma entrada do ZIP
  X.entryStream = async function (zip, name) {
    const e = zip.entries.get(name);
    if (!e) throw new Error('Entrada ausente no .xlsx: ' + name);
    const lh = new DataView(await zip.blob.slice(e.off, e.off + 30).arrayBuffer());
    const start = e.off + 30 + u16(lh, 26) + u16(lh, 28);
    let s = zip.blob.slice(start, start + e.csize).stream();
    if (e.method === 8) s = s.pipeThrough(new DecompressionStream('deflate-raw'));
    else if (e.method !== 0) throw new Error('Método de compressão não suportado: ' + e.method);
    return s.pipeThrough(new TextDecoderStream('utf-8'));
  };

  X.entryText = async function (zip, name) {
    const r = (await X.entryStream(zip, name)).getReader();
    const parts = [];
    for (;;) { const { value, done } = await r.read(); if (done) break; parts.push(value); }
    return parts.join('');
  };

  /* ---------------- XML utilitários ---------------- */
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  X.unesc = (s) => s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, g) =>
    g[0] === '#' ? String.fromCodePoint(g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)) : (ENT[g] ?? m));
  X.colIndex = (letters) => { let n = 0; for (let i = 0; i < letters.length; i++) n = n * 26 + letters.charCodeAt(i) - 64; return n - 1; };

  // Varre um fluxo de texto entregando cada ocorrência completa de <tag ...>...</tag>.
  // endMark (opcional): a partir dele o restante do fluxo é guardado como "cauda"
  // (ex.: '</sheetData>' -> seção <hyperlinks> no fim da aba).
  async function scanTag(stream, tag, onEl, onProgress, endMark) {
    const open = '<' + tag, close = '</' + tag + '>';
    const keep = Math.max(open.length, endMark ? endMark.length : 0);
    const r = stream.getReader();
    let buf = '', read = 0, tail = null;
    for (;;) {
      const { value, done } = await r.read();
      if (value) read += value.length;
      if (tail !== null) { if (value) tail += value; if (onProgress) onProgress(read); if (done) break; continue; }
      if (value) buf += value;
      let pos = 0, lastEnd = 0;
      for (;;) {
        const a = buf.indexOf(open, pos);
        if (a < 0) { pos = Math.max(pos, buf.length - keep, lastEnd); break; }
        // o caractere após o nome da tag ainda não chegou: espera o próximo bloco
        if (a + open.length >= buf.length && !done) { pos = a; break; }
        const ch = buf.charCodeAt(a + open.length); // garante tag exata (<row, e não <rowX)
        if (ch !== 32 && ch !== 62 && ch !== 47) { pos = a + 1; continue; }
        const gt = buf.indexOf('>', a);
        if (gt < 0) { pos = a; break; }
        if (buf.charCodeAt(gt - 1) === 47) { onEl(buf.slice(a, gt + 1), true); pos = lastEnd = gt + 1; continue; } // auto-fechada
        const b = buf.indexOf(close, gt);
        if (b < 0) { pos = a; break; }
        onEl(buf.slice(a, b + close.length), false);
        pos = lastEnd = b + close.length;
      }
      if (endMark) {
        const e = buf.indexOf(endMark, lastEnd);
        if (e >= 0) { tail = buf.slice(e); buf = ''; if (onProgress) onProgress(read); if (done) break; continue; }
      }
      buf = buf.slice(pos);
      if (onProgress) onProgress(read);
      if (done) break;
    }
    return tail !== null ? tail : buf; // cauda (ex.: <hyperlinks> no fim da aba)
  }

  /* ---------------- Workbook ---------------- */
  X.readWorkbook = async function (blob) {
    const zip = await X.openZip(blob);
    const wb = await X.entryText(zip, 'xl/workbook.xml');
    const rels = await X.entryText(zip, 'xl/_rels/workbook.xml.rels');
    const rid = {};
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /Id="([^"]+)"/.exec(m[0]), t = /Target="([^"]+)"/.exec(m[0]);
      if (id && t) rid[id[1]] = t[1].replace(/^\/?xl\//, '');
    }
    const sheets = [];
    for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
      const name = X.unesc(/name="([^"]*)"/.exec(m[0])[1]);
      const r = /r:id="([^"]+)"/.exec(m[0]);
      sheets.push({ name, path: 'xl/' + rid[r[1]] });
    }
    // Strings compartilhadas (em fluxo)
    const shared = [];
    if (zip.entries.has('xl/sharedStrings.xml')) {
      const st = await X.entryStream(zip, 'xl/sharedStrings.xml');
      await scanTag(st, 'si', (el) => {
        let s = '', i = 0;
        for (;;) {
          const a = el.indexOf('<t', i); if (a < 0) break;
          const c = el.charCodeAt(a + 2); if (c !== 62 && c !== 32) { i = a + 2; continue; }
          const gt = el.indexOf('>', a), b = el.indexOf('</t>', gt);
          s += el.slice(gt + 1, b); i = b + 4;
        }
        shared.push(X.unesc(s));
      });
    }
    return { zip, sheets, shared };
  };

  X.findSheet = function (wb, ...names) {
    const n = (s) => OP.util.norm(s).replace(/[^A-Z0-9]/g, '');
    for (const want of names) {
      const s = wb.sheets.find((x) => n(x.name) === n(want));
      if (s) return s;
    }
    return null;
  };

  /* Lê uma aba em fluxo. onRow(rowNumber, values[], formulas{}) — valores já
   * resolvidos (strings compartilhadas, números). opts.formulaCols = Set de
   * colunas cujas fórmulas interessam (ex.: código em HYPERLINK na CSD).
   * Retorna { hyperlinks: {row: url} } quando opts.hyperlinks. */
  X.readSheet = async function (wb, sheet, onRow, opts = {}) {
    const st = await X.entryStream(wb.zip, sheet.path);
    const fcols = opts.formulaCols || null;
    const shared = wb.shared;
    const tail = await scanTag(st, 'row', (el, selfClosing) => {
      const rm = /^<row\b[^>]*?\br="(\d+)"/.exec(el);
      const rn = rm ? +rm[1] : 0;
      if (selfClosing) return;
      const vals = [], forms = fcols ? {} : null;
      let i = 0, seq = 0;
      for (;;) {
        const a = el.indexOf('<c', i); if (a < 0) break;
        const cc = el.charCodeAt(a + 2); if (cc !== 32 && cc !== 62) { i = a + 2; continue; }
        const gt = el.indexOf('>', a);
        const head = el.slice(a, gt);
        const rr = /\br="([A-Z]+)\d+"/.exec(head);
        const col = rr ? X.colIndex(rr[1]) : seq;
        seq = col + 1;
        if (el.charCodeAt(gt - 1) === 47) { i = gt + 1; continue; } // <c .../> vazio
        const end = el.indexOf('</c>', gt);
        const inner = el.slice(gt + 1, end);
        i = end + 4;
        const tm = /\bt="(\w+)"/.exec(head); const t = tm ? tm[1] : 'n';
        let v = null;
        const va = inner.indexOf('<v>');
        if (va >= 0) {
          const raw = inner.slice(va + 3, inner.indexOf('</v>', va));
          if (t === 's') v = shared[+raw];
          else if (t === 'str' || t === 'e') v = X.unesc(raw);
          else if (t === 'b') v = raw === '1';
          else { const num = +raw; v = isNaN(num) ? raw : num; }
        } else if (t === 'inlineStr') {
          const m = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner); v = m ? X.unesc(m[1]) : '';
        }
        vals[col] = v;
        if (fcols && fcols.has(col)) {
          const fa = inner.indexOf('<f');
          if (fa >= 0) { const fg = inner.indexOf('>', fa); forms[col] = X.unesc(inner.slice(fg + 1, inner.indexOf('</f>', fg))); }
        }
      }
      onRow(rn, vals, forms);
    }, opts.onProgress, opts.hyperlinks ? '</sheetData>' : null);
    const out = {};
    if (opts.hyperlinks) {
      const links = {};
      const relPath = sheet.path.replace(/worksheets\/(sheet\d+\.xml)$/, 'worksheets/_rels/$1.rels');
      if (wb.zip.entries.has(relPath)) {
        const rel = await X.entryText(wb.zip, relPath);
        const rid = {};
        for (const m of rel.matchAll(/<Relationship\b[^>]*>/g)) {
          const id = /Id="([^"]+)"/.exec(m[0]), t = /Target="([^"]+)"/.exec(m[0]);
          if (id && t) rid[id[1]] = X.unesc(t[1]);
        }
        for (const m of tail.matchAll(/<hyperlink\b[^>]*ref="([A-Z]+)(\d+)"[^>]*r:id="([^"]+)"/g)) links[+m[2]] = { col: m[1], url: rid[m[3]] };
      }
      out.hyperlinks = links;
    }
    return out;
  };

  /* ---------------- XLSX (escrita mínima) ---------------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  X.zipStore = function (files) { // files: [{name, data(Uint8Array|string)}] -> Blob
    const enc = new TextEncoder(); const chunks = []; const cdir = []; let off = 0;
    for (const f of files) {
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const name = enc.encode(f.name); const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      chunks.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      cdir.push(ch.buffer, name);
      off += 30 + name.length + data.length;
    }
    const cdSize = cdir.reduce((s, b) => s + (b.byteLength ?? b.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob([...chunks, ...cdir, end.buffer], { type: 'application/zip' });
  };

  const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  X.colName = colName;

  /* sheets: [{name, cols:[largura], rows:[[cell]], freeze:1}]
   * cell: valor simples ou {v, s: 'h'|'money'|'pct'|'num4'|'bold'|'moneyBold', f: 'SUM(...)'} */
  X.writeWorkbook = function (sheets) {
    const STY = { '': 0, h: 1, money: 2, pct: 3, num4: 4, bold: 5, moneyBold: 6, num2: 7 };
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/><numFmt numFmtId="166" formatCode="#,##0.0000"/></numFmts>
<fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EAED"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs></styleSheet>`;
    const files = [];
    const wsXml = sheets.map((sh) => {
      let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
      if (sh.freeze) x += `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
      if (sh.cols) x += '<cols>' + sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
      x += '<sheetData>';
      sh.rows.forEach((row, ri) => {
        x += `<row r="${ri + 1}">`;
        row.forEach((cell, ci) => {
          if (cell == null || cell === '') return;
          const c = typeof cell === 'object' ? cell : { v: cell };
          const ref = colName(ci) + (ri + 1); const s = STY[c.s || ''] || 0;
          if (c.f) x += `<c r="${ref}" s="${s}"><f>${xmlEsc(c.f)}</f>${c.v != null && typeof c.v === 'number' ? `<v>${c.v}</v>` : ''}</c>`;
          else if (typeof c.v === 'number' && isFinite(c.v)) x += `<c r="${ref}" s="${s}"><v>${c.v}</v></c>`;
          else x += `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
        });
        x += '</row>';
      });
      return x + '</sheetData></worksheet>';
    });
    files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
    files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
    files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    files.push({ name: 'xl/styles.xml', data: styles });
    wsXml.forEach((x, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x }));
    const blob = X.zipStore(files);
    return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };
})(typeof window !== 'undefined' ? window : globalThis);


