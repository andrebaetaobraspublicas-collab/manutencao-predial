import { loadLegacyRuntime } from './legacy/legacy-runtime';

/** Tiny fictional official-layout XLSX for parser/HTTP regression tests. */
export async function sinapiWorkbookFixture(ref = '09/2036', names = ['ISD','CSD','Analítico']) {
  const xml = (value: unknown) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const sheet = (rows: unknown[][]) => `<worksheet><sheetData>${rows.map((row, i) => `<row r="${i + 1}">${row.map((value, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}"${typeof value === 'number' ? '' : ' t="inlineStr"'}>${typeof value === 'number' ? `<v>${value}</v>` : `<is><t>${xml(value)}</t></is>`}</c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const files = [
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: 'xl/workbook.xml', data: `<workbook xmlns:r="relationships"><sheets>${names.map((name,i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="r${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<Relationships>${names.map((_,i) => `<Relationship Id="r${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>` },
    { name: 'xl/worksheets/sheet1.xml', data: sheet([['MÊS DE REFERÊNCIA',ref], ['CLASSIFICAÇÃO','CÓDIGO','DESCRIÇÃO','UNIDADE','ORIGEM','AC','SP'], ['MATERIAL',991001,'Aço — material de teste','KG','C',100,200]]) },
    { name: 'xl/worksheets/sheet2.xml', data: sheet([['','','','','AC','SP'],['GRUPO','CÓDIGO','DESCRIÇÃO','UNIDADE','CUSTO','CUSTO'],['Grupo fictício',991003,'Composição fictícia','KG',200,400]]) },
    { name: 'xl/worksheets/sheet3.xml', data: sheet([['GRUPO','CÓDIGO','TIPO','CÓDIGO ITEM','DESCRIÇÃO','UNIDADE','COEFICIENTE','SITUAÇÃO'],['Grupo fictício',991003,'','','Composição fictícia','KG','','COM CUSTO'],['',991003,'INSUMO',991001,'Aço — material de teste','KG',2,'ATIVO']]) },
  ];
  return Buffer.from(await loadLegacyRuntime().OP.xlsx.zipStore(files).arrayBuffer());
}
