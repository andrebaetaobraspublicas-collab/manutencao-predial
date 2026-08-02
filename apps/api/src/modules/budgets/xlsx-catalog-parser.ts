import { BadRequestException } from '@nestjs/common';
import { SaxesParser, SaxesTag } from 'saxes';
import * as unzipper from 'unzipper';
import { SinapiItemType } from '../../generated/prisma/client';

type ZipEntry = { path: string; buffer(): Promise<Buffer>; stream(): NodeJS.ReadableStream };
type CellMap = Map<number, string>;

export type ParsedCatalogItem = {
  type: SinapiItemType;
  code: string;
  description: string;
  unit: string;
  unitCost: number;
  compositionData?: Record<string, unknown>;
};

export type ParsedCatalog = {
  sheet: string;
  referenceMonth: string;
  priceRegime: 'NON_EXEMPT' | 'EXEMPT' | 'NOT_APPLICABLE';
  catalogKind: 'INPUTS' | 'COMPOSITIONS' | 'MIXED';
  items: ParsedCatalogItem[];
  skipped: number;
};

const OFFICIAL_SHEETS = [
  { sheet: 'ISD', priceRegime: 'NON_EXEMPT', catalogKind: 'INPUTS', type: SinapiItemType.INPUT },
  { sheet: 'ICD', priceRegime: 'EXEMPT', catalogKind: 'INPUTS', type: SinapiItemType.INPUT },
  { sheet: 'CSD', priceRegime: 'NON_EXEMPT', catalogKind: 'COMPOSITIONS', type: SinapiItemType.COMPOSITION },
  { sheet: 'CCD', priceRegime: 'EXEMPT', catalogKind: 'COMPOSITIONS', type: SinapiItemType.COMPOSITION },
] as const;

export async function parseOfficialSinapiWorkbook(buffer: Buffer, state: string): Promise<ParsedCatalog[]> {
  const workbook = await openWorkbook(buffer);
  const sharedStrings = await readSharedStrings(workbook.entries.get('xl/sharedStrings.xml'));
  const sheetEntries = await resolveSheets(workbook.entries, sharedStrings);
  const normalizedState = state.trim().toUpperCase();
  const parsed: ParsedCatalog[] = [];

  for (const definition of OFFICIAL_SHEETS) {
    const entry = sheetEntries.get(definition.sheet);
    if (!entry) throw new BadRequestException(`A planilha oficial não possui a aba ${definition.sheet}.`);
    let stateColumn: number | undefined;
    let referenceMonth = '';
    let skipped = 0;
    const items: ParsedCatalogItem[] = [];
    await readRows(entry, sharedStrings, (rowNumber, cells) => {
      if (rowNumber === 3) referenceMonth = normalizeReferenceMonth(cells.get(2) ?? '');
      if (rowNumber === 4 || rowNumber === 9) {
        for (const [column, value] of cells) {
          if (value.trim().toUpperCase() === normalizedState) stateColumn = column;
        }
      }
      if (rowNumber < 11 || !stateColumn) return;
      const cost = numberValue(cells.get(stateColumn));
      const code = clean(cells.get(definition.type === SinapiItemType.INPUT ? 2 : 2));
      const description = clean(cells.get(definition.type === SinapiItemType.INPUT ? 3 : 3));
      const unit = clean(cells.get(definition.type === SinapiItemType.INPUT ? 4 : 4)).toUpperCase();
      if (!code || !description || !unit || cost === undefined) {
        skipped += 1;
        return;
      }
      const classification = clean(cells.get(1));
      const metadata: Record<string, unknown> = classification ? { classification } : {};
      if (definition.type === SinapiItemType.INPUT) {
        const origin = clean(cells.get(5));
        if (origin) metadata.priceOrigin = origin;
      } else {
        const attributed = numberValue(cells.get(stateColumn + 1));
        if (attributed !== undefined) metadata.socialChargesAttributedPercentage = attributed;
      }
      items.push({ type: definition.type, code: code.toUpperCase(), description, unit, unitCost: cost,
        compositionData: Object.keys(metadata).length ? metadata : undefined });
    });
    if (!stateColumn) throw new BadRequestException(`A UF ${normalizedState} não foi encontrada na aba ${definition.sheet}.`);
    if (!referenceMonth) throw new BadRequestException(`A competência não foi identificada na aba ${definition.sheet}.`);
    if (!items.length) throw new BadRequestException(`Nenhum item com preço para ${normalizedState} foi encontrado na aba ${definition.sheet}.`);
    parsed.push({ sheet: definition.sheet, referenceMonth, priceRegime: definition.priceRegime,
      catalogKind: definition.catalogKind, items, skipped });
  }
  return parsed;
}

export async function parseCustomWorkbook(buffer: Buffer): Promise<ParsedCatalog> {
  const workbook = await openWorkbook(buffer);
  const sharedStrings = await readSharedStrings(workbook.entries.get('xl/sharedStrings.xml'));
  const sheets = await resolveSheets(workbook.entries, sharedStrings);
  const first = sheets.values().next().value as ZipEntry | undefined;
  if (!first) throw new BadRequestException('A planilha não possui abas legíveis.');
  let columns: Record<string, number> | undefined;
  let skipped = 0;
  const items: ParsedCatalogItem[] = [];
  await readRows(first, sharedStrings, (rowNumber, cells) => {
    if (!columns && rowNumber <= 20) {
      const detected = detectCustomColumns(cells);
      if (detected.code && detected.description && detected.unit && detected.unitCost) columns = detected;
      return;
    }
    if (!columns) return;
    const code = clean(cells.get(columns.code));
    const description = clean(cells.get(columns.description));
    const unit = clean(cells.get(columns.unit)).toUpperCase();
    const unitCost = numberValue(cells.get(columns.unitCost));
    if (!code || !description || !unit || unitCost === undefined) {
      if ([...cells.values()].some(Boolean)) skipped += 1;
      return;
    }
    const rawType = clean(columns.type ? cells.get(columns.type) : '').toUpperCase();
    const type = rawType.includes('INSUM') || rawType === 'INPUT' ? SinapiItemType.INPUT
      : rawType.includes('COMPOS') ? SinapiItemType.COMPOSITION : SinapiItemType.SERVICE;
    items.push({ type, code: code.toUpperCase(), description, unit, unitCost });
  });
  if (!columns) throw new BadRequestException('Cabeçalho não reconhecido. Use: Código, Descrição, Unidade, Custo Unitário e, opcionalmente, Tipo.');
  if (!items.length) throw new BadRequestException('A planilha não contém itens válidos.');
  return { sheet: 'CUSTOM', referenceMonth: '', priceRegime: 'NOT_APPLICABLE', catalogKind: 'MIXED', items, skipped };
}

async function openWorkbook(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new BadRequestException('O arquivo enviado não é uma planilha XLSX válida.');
  }
  const directory = await unzipper.Open.buffer(buffer);
  const entries = new Map<string, ZipEntry>();
  for (const file of directory.files) entries.set(file.path.replaceAll('\\', '/'), file as ZipEntry);
  if (!entries.has('xl/workbook.xml')) throw new BadRequestException('Estrutura XLSX inválida.');
  return { entries };
}

async function resolveSheets(entries: Map<string, ZipEntry>, sharedStrings: string[]) {
  const workbook = await entries.get('xl/workbook.xml')!.buffer();
  const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
  if (!relsEntry) throw new BadRequestException('Relacionamentos da planilha não encontrados.');
  const rels = await relsEntry.buffer();
  const relationshipTargets = new Map<string, string>();
  parseXml(rels.toString('utf8'), 'opentag', (tag) => {
    if (localName(tag.name) === 'Relationship') {
      relationshipTargets.set(attribute(tag, 'Id'), attribute(tag, 'Target'));
    }
  });
  const result = new Map<string, ZipEntry>();
  parseXml(workbook.toString('utf8'), 'opentag', (tag) => {
    if (localName(tag.name) !== 'sheet') return;
    const name = attribute(tag, 'name');
    const relationId = attribute(tag, 'r:id') || attribute(tag, 'id');
    const target = relationshipTargets.get(relationId);
    if (!name || !target) return;
    const normalized = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const entry = entries.get(normalized.replaceAll('\\', '/'));
    if (entry) result.set(name, entry);
  });
  void sharedStrings;
  return result;
}

async function readSharedStrings(entry?: ZipEntry): Promise<string[]> {
  if (!entry) return [];
  const strings: string[] = [];
  let current = '';
  let insideText = false;
  await parseXmlStream(entry, {
    opentag(tag) {
      if (localName(tag.name) === 'si') current = '';
      if (localName(tag.name) === 't') insideText = true;
    },
    text(value) { if (insideText) current += value; },
    closetag(tag) {
      if (localName(tag.name) === 't') insideText = false;
      if (localName(tag.name) === 'si') strings.push(current);
    },
  });
  return strings;
}

async function readRows(entry: ZipEntry, sharedStrings: string[], onRow: (row: number, cells: CellMap) => void) {
  let rowNumber = 0;
  let cells: CellMap = new Map();
  let cellColumn = 0;
  let cellType = '';
  let cellValue = '';
  let captureValue = false;
  await parseXmlStream(entry, {
    opentag(tag) {
      const name = localName(tag.name);
      if (name === 'row') {
        rowNumber = Number(attribute(tag, 'r')) || rowNumber + 1;
        cells = new Map();
      } else if (name === 'c') {
        cellColumn = columnNumber(attribute(tag, 'r'));
        cellType = attribute(tag, 't');
        cellValue = '';
      } else if (name === 'v' || name === 't') captureValue = true;
    },
    text(value) { if (captureValue) cellValue += value; },
    closetag(tag) {
      const name = localName(tag.name);
      if (name === 'v' || name === 't') captureValue = false;
      if (name === 'c' && cellColumn) {
        const value = cellType === 's' ? sharedStrings[Number(cellValue)] ?? '' : cellValue;
        cells.set(cellColumn, value);
      }
      if (name === 'row') onRow(rowNumber, cells);
    },
  });
}

async function parseXmlStream(entry: ZipEntry, handlers: {
  opentag?(tag: SaxesTag): void; text?(value: string): void; closetag?(tag: SaxesTag): void;
}) {
  const parser = new SaxesParser({ xmlns: false });
  if (handlers.opentag) parser.on('opentag', handlers.opentag);
  if (handlers.text) parser.on('text', handlers.text);
  if (handlers.closetag) parser.on('closetag', handlers.closetag);
  for await (const chunk of entry.stream() as AsyncIterable<Buffer | string>) parser.write(chunk.toString());
  parser.close();
}

function parseXml(xml: string, event: 'opentag', handler: (tag: SaxesTag) => void) {
  const parser = new SaxesParser({ xmlns: false });
  parser.on(event, handler);
  parser.write(xml).close();
}

function attribute(tag: SaxesTag, name: string): string {
  const raw = tag.attributes[name] ?? tag.attributes[Object.keys(tag.attributes).find((key) => localName(key) === localName(name)) ?? ''];
  return typeof raw === 'string' ? raw : raw?.value ?? '';
}

function localName(name: string) { return name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name; }
function columnNumber(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? '';
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}
function clean(value?: string) { return (value ?? '').replace(/\s+/g, ' ').trim(); }
function numberValue(value?: string) {
  const cleanValue = clean(value).replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  if (!cleanValue) return undefined;
  const number = Number(cleanValue);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}
function normalizeReferenceMonth(value: string) {
  const match = clean(value).match(/(0?[1-9]|1[0-2])\/(20\d{2})/);
  return match ? `${match[2]}-${match[1].padStart(2, '0')}` : '';
}
function normalizeHeader(value: string) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function detectCustomColumns(cells: CellMap) {
  const result: Record<string, number> = {};
  for (const [column, value] of cells) {
    const header = normalizeHeader(value);
    if (['codigo', 'code', 'item'].includes(header)) result.code = column;
    if (['descricao', 'description'].includes(header)) result.description = column;
    if (['unidade', 'unit'].includes(header)) result.unit = column;
    if (['custounitario', 'precounitario', 'unitcost', 'preco'].includes(header)) result.unitCost = column;
    if (['tipo', 'type'].includes(header)) result.type = column;
  }
  return result;
}
