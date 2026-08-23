import { BadRequestException } from '@nestjs/common';
import * as XLSX from '@e965/xlsx';
import { PDFParse } from 'pdf-parse';
import { ContractBudgetItemKind, ContractBudgetSourceFormat } from '../../generated/prisma/client';

type Sheet = XLSX.WorkSheet;
type Cell = XLSX.CellObject & { w?: string; f?: string };

export type ParsedContractBudgetItem = {
  kind: ContractBudgetItemKind;
  source: string;
  sectionCode?: string;
  sectionName?: string;
  code: string;
  description: string;
  technicalReference?: string;
  unit: string;
  quantity: number;
  laborUnitCost: number;
  materialUnitCost: number;
  unitCost: number;
  bdiPercentage: number;
  totalCost: number;
  includedInTotal: boolean;
  sourceSheet?: string;
  sourceRow?: number;
  sourceData?: Record<string, unknown>;
};

export type ParsedLaborComponent = {
  module?: string;
  submodule?: string;
  code?: string;
  description: string;
  percentage?: number;
  amount: number;
  basis?: string;
  sourceRow?: number;
  sortOrder: number;
  sourceData?: Record<string, unknown>;
};

export type ParsedLaborPost = {
  code: string;
  title: string;
  unit: string;
  postQuantity: number;
  employeesPerPost: number;
  professionalQuantity: number;
  months: number;
  cbo?: string;
  collectiveAgreement?: string;
  mteRegistration?: string;
  categoryBaseDate?: string;
  shift?: string;
  baseSalary: number;
  monthlyCostBeforeBdi: number;
  bdiAmount: number;
  monthlyCost: number;
  annualCost: number;
  includedInTotal: boolean;
  sourceSheet?: string;
  sourceData?: Record<string, unknown>;
  components: ParsedLaborComponent[];
};

export type ParsedContractBudgetSheet = {
  name: string;
  orderIndex: number;
  rowCount: number;
  columnCount: number;
  role: string;
  importedRows: number;
  ignoredRows: number;
};

export type ParsedContractBudget = {
  format: ContractBudgetSourceFormat;
  sheets: ParsedContractBudgetSheet[];
  items: ParsedContractBudgetItem[];
  laborPosts: ParsedLaborPost[];
  sourceTotal?: number;
  warnings: string[];
};

const LABOR_TITLE = 'PLANILHA ANALITICA DE CUSTOS E FORMACAO DE PRECOS';
const SYNTHETIC_TITLE = 'SERVICOS POR DEMANDA';

export async function parseContractBudgetFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<ParsedContractBudget> {
  const extension = originalName.toLowerCase().split('.').pop();
  if (extension === 'pdf' || mimeType === 'application/pdf') return parsePdf(buffer);
  if (!['xlsx', 'xlsb'].includes(extension ?? '')) {
    throw new BadRequestException('Envie uma planilha .xlsx ou .xlsb, ou um documento PDF textual.');
  }
  return parseWorkbook(buffer, extension === 'xlsb' ? ContractBudgetSourceFormat.XLSB : ContractBudgetSourceFormat.XLSX);
}

function parseWorkbook(buffer: Buffer, format: ContractBudgetSourceFormat): ParsedContractBudget {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellFormula: true, cellNF: false });
  } catch {
    throw new BadRequestException('Não foi possível ler a planilha. Verifique se o arquivo não está protegido ou corrompido.');
  }
  if (!workbook.SheetNames.length) throw new BadRequestException('A planilha não possui abas legíveis.');

  const items: ParsedContractBudgetItem[] = [];
  const laborPosts: ParsedLaborPost[] = [];
  const sheets: ParsedContractBudgetSheet[] = [];
  const warnings: string[] = [];
  let sourceTotal: number | undefined;

  workbook.SheetNames.forEach((name, orderIndex) => {
    const sheet = workbook.Sheets[name];
    const dimensions = sheetDimensions(sheet);
    let role = 'AUXILIARY';
    let importedRows = 0;
    const title = normalize(sheetText(sheet, 2, 1, 8));

    if (name.toLowerCase().startsWith('totaliza')) {
      role = 'SUMMARY';
      const parsed = parseSupportItems(sheet, name);
      items.push(...parsed.items);
      importedRows += parsed.items.length;
      sourceTotal = parsed.sourceTotal ?? sourceTotal;
    } else if (title.includes(LABOR_TITLE)) {
      role = 'LABOR';
      const post = parseLaborPost(sheet, name, laborPosts.length + 1);
      laborPosts.push(post);
      importedRows += 1 + post.components.length;
    } else if (title.includes(SYNTHETIC_TITLE) || name.toUpperCase().includes('PLAN ORC_')) {
      role = 'ON_DEMAND_SERVICE';
      const parsed = parseSyntheticServices(sheet, name);
      items.push(...parsed);
      importedRows += parsed.length;
    } else {
      const parsed = parseRepeatedItemTables(sheet, name);
      if (parsed.length) {
        role = materialRole(name);
        items.push(...parsed);
        importedRows += parsed.length;
      }
    }

    sheets.push({
      name,
      orderIndex,
      rowCount: dimensions.rows,
      columnCount: dimensions.columns,
      role,
      importedRows,
      ignoredRows: Math.max(0, dimensions.rows - importedRows),
    });
  });

  if (!items.length && !laborPosts.length) {
    throw new BadRequestException('Nenhum item, serviço ou posto de trabalho foi reconhecido na planilha.');
  }
  if (!sourceTotal) warnings.push('O valor global não foi identificado automaticamente na aba de totalização.');
  const duplicateKeys = new Set<string>();
  const uniqueItems = items.filter((item) => {
    const key = [item.sourceSheet, item.sourceRow, item.code, item.description].join('|');
    if (duplicateKeys.has(key)) return false;
    duplicateKeys.add(key);
    return true;
  });
  return { format, sheets, items: uniqueItems, laborPosts, sourceTotal, warnings };
}

async function parsePdf(buffer: Buffer): Promise<ParsedContractBudget> {
  if (buffer.subarray(0, 4).toString('ascii') !== '%PDF') throw new BadRequestException('O arquivo enviado não é um PDF válido.');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const lines = result.text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const items: ParsedContractBudgetItem[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const parsed = parsePdfLine(lines[index], index + 1);
      if (parsed) items.push(parsed);
    }
    if (!items.length) {
      throw new BadRequestException('O PDF foi lido, mas nenhuma linha orçamentária estruturada foi reconhecida. Use PDF textual com código, descrição, unidade, quantidade e preço, ou importe Excel.');
    }
    return {
      format: ContractBudgetSourceFormat.PDF,
      sheets: [{ name: 'PDF', orderIndex: 0, rowCount: lines.length, columnCount: 1,
        role: 'IMPORTED_PDF', importedRows: items.length, ignoredRows: lines.length - items.length }],
      items,
      laborPosts: [],
      warnings: ['A importação de PDF depende da camada textual; confira unidades, quantidades e preços antes de ativar o orçamento.'],
    };
  } finally {
    await parser.destroy();
  }
}

function parsePdfLine(line: string, row: number): ParsedContractBudgetItem | undefined {
  const match = line.match(/^([\w./-]{1,40})\s+(.{3,}?)\s+([A-Za-zÀ-ÿ²³./-]{1,15})\s+([\d.,]+)\s+(?:R\$\s*)?([\d.,]+)(?:\s+(?:R\$\s*)?([\d.,]+))?$/u);
  if (!match) return undefined;
  const quantity = localizedNumber(match[4]);
  const unitCost = localizedNumber(match[5]);
  if (quantity === undefined || unitCost === undefined) return undefined;
  return {
    kind: ContractBudgetItemKind.OTHER,
    source: 'PDF',
    code: match[1],
    description: match[2],
    unit: match[3].toUpperCase(),
    quantity,
    laborUnitCost: 0,
    materialUnitCost: 0,
    unitCost,
    bdiPercentage: 0,
    totalCost: localizedNumber(match[6]) ?? roundMoney(quantity * unitCost),
    includedInTotal: true,
    sourceSheet: 'PDF',
    sourceRow: row,
    sourceData: { rawLine: line },
  };
}

function parseSupportItems(sheet: Sheet, name: string) {
  const items: ParsedContractBudgetItem[] = [];
  for (let row = 1; row <= 20; row += 1) {
    const code = cellText(sheet, row, 2);
    const description = cellText(sheet, row, 3);
    const quantity = cellNumber(sheet, row, 5);
    const unitCost = cellNumber(sheet, row, 8);
    const annualTotal = cellNumber(sheet, row, 10);
    if (!/^1\.\d+$/.test(code) || !description || quantity === undefined || unitCost === undefined) continue;
    items.push({
      kind: ContractBudgetItemKind.SUPPORT_SERVICE,
      source: 'IMPORT',
      sectionCode: '1',
      sectionName: 'Serviços de apoio',
      code,
      description,
      unit: cellText(sheet, row, 4) || 'UN',
      quantity: quantity * 12,
      laborUnitCost: 0,
      materialUnitCost: 0,
      unitCost,
      bdiPercentage: 0,
      totalCost: annualTotal ?? roundMoney(quantity * 12 * unitCost),
      includedInTotal: true,
      sourceSheet: name,
      sourceRow: row,
      sourceData: cellSource(sheet, row, [6, 7, 8, 9, 10]),
    });
  }
  let sourceTotal: number | undefined;
  const dimensions = sheetDimensions(sheet);
  for (let row = 1; row <= dimensions.rows; row += 1) {
    const label = normalize(sheetText(sheet, row, 1, Math.min(12, dimensions.columns)));
    if (!/(VALOR (TOTAL|GLOBAL|ESTIMATIVO)|TOTAL GERAL|TOTAL ESTIMADO)/.test(label)) continue;
    for (let column = Math.min(dimensions.columns, 20); column >= 1; column -= 1) {
      const value = cellNumber(sheet, row, column);
      if (value !== undefined && value > (sourceTotal ?? 0)) sourceTotal = value;
    }
  }
  return { items, sourceTotal };
}

function parseLaborPost(sheet: Sheet, name: string, index: number): ParsedLaborPost {
  const dimensions = sheetDimensions(sheet);
  let module: string | undefined;
  let submodule: string | undefined;
  const components: ParsedLaborComponent[] = [];
  let monthlyCostBeforeBdi = 0;
  let bdiAmount = 0;
  let monthlyCost = 0;
  let annualCost = 0;
  for (let row = 14; row <= dimensions.rows; row += 1) {
    const colA = cellText(sheet, row, 1);
    const description = cellText(sheet, row, 2) || colA;
    const normalizedDescription = normalize(`${colA} ${description}`);
    if (/^MODULO \d/.test(normalizedDescription)) module = description || colA;
    if (/^SUBMODULO /.test(normalizedDescription)) submodule = description || colA;
    const amount = cellNumber(sheet, row, 4);
    const percentage = cellNumber(sheet, row, 3);
    if (amount !== undefined && description && !/^(NOTA|BASE DE CALCULO)/.test(normalize(description))) {
      components.push({
        module,
        submodule,
        code: colA || undefined,
        description,
        percentage: percentage !== undefined && percentage <= 1 ? percentage : undefined,
        amount,
        sourceRow: row,
        sortOrder: components.length,
        sourceData: cellSource(sheet, row, [1, 2, 3, 4]),
      });
    }
    if (normalizedDescription.includes('TOTAL DO MODULO 1') && normalizedDescription.includes('MODULO 5')) monthlyCostBeforeBdi = amount ?? monthlyCostBeforeBdi;
    if (normalizedDescription.includes('MODULO 6') && amount !== undefined) bdiAmount = amount;
    if (normalizedDescription.includes('VALOR TOTAL MENSAL POR EMPREGADO')) monthlyCost = amount ?? monthlyCost;
    if (normalizedDescription.includes('VALOR TOTAL ANUAL POR POSTO')) annualCost = amount ?? annualCost;
  }
  const postQuantity = cellNumber(sheet, 5, 4) ?? 1;
  const employeesPerPost = cellNumber(sheet, 6, 4) ?? 1;
  const months = cellNumber(sheet, 7, 4) ?? 12;
  const professionalQuantity = postQuantity * employeesPerPost;
  if (!monthlyCost) monthlyCost = roundMoney((monthlyCostBeforeBdi + bdiAmount));
  if (!annualCost) annualCost = roundMoney(monthlyCost * professionalQuantity * months);
  return {
    code: `POSTO-${String(index).padStart(3, '0')}`,
    title: cellText(sheet, 3, 1) || name,
    unit: cellText(sheet, 4, 4) || 'POSTO',
    postQuantity,
    employeesPerPost,
    professionalQuantity,
    months,
    cbo: cellText(sheet, 8, 4) || undefined,
    collectiveAgreement: cellText(sheet, 9, 4) || undefined,
    mteRegistration: cellText(sheet, 10, 4) || undefined,
    categoryBaseDate: cellText(sheet, 11, 4) || undefined,
    shift: cellText(sheet, 12, 4) || undefined,
    baseSalary: cellNumber(sheet, 17, 4) ?? 0,
    monthlyCostBeforeBdi,
    bdiAmount,
    monthlyCost,
    annualCost,
    includedInTotal: true,
    sourceSheet: name,
    sourceData: { dimensions, sourceTitle: cellText(sheet, 2, 1) },
    components,
  };
}

function parseSyntheticServices(sheet: Sheet, name: string): ParsedContractBudgetItem[] {
  const dimensions = sheetDimensions(sheet);
  const header = findHeader(sheet, ['DESCRICAO', 'QUANTIDADE']);
  if (!header) return [];
  const descriptionColumn = header.columns.get('DESCRICAO')!;
  const codeColumn = descriptionColumn - 1;
  const unitColumn = descriptionColumn + 1;
  const quantityColumn = descriptionColumn + 2;
  const laborColumn = descriptionColumn + 3;
  const materialColumn = descriptionColumn + 4;
  const unitCostColumn = descriptionColumn + 5;
  const totalColumn = descriptionColumn + 8;
  const referenceColumn = descriptionColumn + 9;
  const serviceTypeColumn = descriptionColumn + 10;
  const completionColumn = descriptionColumn + 11;
  const items: ParsedContractBudgetItem[] = [];
  let sectionCode: string | undefined;
  let sectionName: string | undefined;
  for (let row = header.row + 1; row <= dimensions.rows; row += 1) {
    const code = cellText(sheet, row, codeColumn);
    const description = cellText(sheet, row, descriptionColumn);
    const unit = cellText(sheet, row, unitColumn);
    const quantity = cellNumber(sheet, row, quantityColumn);
    const labor = cellNumber(sheet, row, laborColumn) ?? 0;
    const material = cellNumber(sheet, row, materialColumn) ?? 0;
    const unitCost = cellNumber(sheet, row, unitCostColumn) ?? roundMoney(labor + material);
    if (description && (!unit || quantity === undefined)) {
      sectionCode = code || sectionCode;
      sectionName = description;
      continue;
    }
    if (!description || !unit || quantity === undefined || (!labor && !material && !unitCost)) continue;
    items.push({
      kind: ContractBudgetItemKind.ON_DEMAND_SERVICE,
      source: 'IMPORT',
      sectionCode,
      sectionName,
      code: code || `${name}-${row}`,
      description,
      technicalReference: cellText(sheet, row, referenceColumn) || undefined,
      unit: unit.toUpperCase(),
      quantity,
      laborUnitCost: labor,
      materialUnitCost: material,
      unitCost,
      bdiPercentage: 0,
      totalCost: cellNumber(sheet, row, totalColumn) ?? roundMoney(quantity * unitCost),
      includedInTotal: true,
      sourceSheet: name,
      sourceRow: row,
      sourceData: {
        serviceType: cellText(sheet, row, serviceTypeColumn) || undefined,
        maximumCompletionHours: cellText(sheet, row, completionColumn) || undefined,
        cells: cellSource(sheet, row, [codeColumn, descriptionColumn, unitColumn, quantityColumn,
          laborColumn, materialColumn, unitCostColumn, totalColumn, referenceColumn]),
      },
    });
  }
  return items;
}

function parseRepeatedItemTables(sheet: Sheet, name: string): ParsedContractBudgetItem[] {
  const dimensions = sheetDimensions(sheet);
  const items: ParsedContractBudgetItem[] = [];
  let sectionName = '';
  for (let row = 1; row <= dimensions.rows; row += 1) {
    const descriptions: number[] = [];
    for (let column = 1; column <= Math.min(dimensions.columns, 220); column += 1) {
      if (normalize(cellText(sheet, row, column)) === 'DESCRICAO') descriptions.push(column);
    }
    if (!descriptions.length) continue;
    for (let tableIndex = 0; tableIndex < descriptions.length; tableIndex += 1) {
      const descriptionColumn = descriptions[tableIndex];
      const start = tableIndex === 0 ? Math.max(1, descriptionColumn - 3) : descriptions[tableIndex - 1] + 1;
      const end = tableIndex + 1 < descriptions.length ? descriptions[tableIndex + 1] - 1 : Math.min(dimensions.columns, descriptionColumn + 8);
      const columns = detectColumns(sheet, row, start, end, descriptionColumn);
      if (!columns.quantity || !columns.unitCost) continue;
      sectionName = nearestSectionTitle(sheet, row, start, end) || sectionName || name;
      let emptyRun = 0;
      for (let dataRow = row + 1; dataRow <= dimensions.rows && emptyRun < 8; dataRow += 1) {
        if (normalize(cellText(sheet, dataRow, descriptionColumn)) === 'DESCRICAO') break;
        const description = cellText(sheet, dataRow, descriptionColumn);
        const quantity = cellNumber(sheet, dataRow, columns.quantity);
        const unitCost = cellNumber(sheet, dataRow, columns.unitCost);
        if (!description) { emptyRun += 1; continue; }
        emptyRun = 0;
        if (quantity === undefined || unitCost === undefined || /^(TOTAL|SUBTOTAL)/.test(normalize(description))) continue;
        const code = cellText(sheet, dataRow, columns.code ?? columns.item ?? start);
        const unit = columns.unit ? cellText(sheet, dataRow, columns.unit) : 'UN';
        const total = columns.total ? cellNumber(sheet, dataRow, columns.total) : undefined;
        items.push({
          kind: ContractBudgetItemKind.MATERIAL,
          source: 'IMPORT',
          sectionName,
          code: code || `${name}-${dataRow}-${tableIndex + 1}`,
          description,
          technicalReference: columns.reference ? cellText(sheet, dataRow, columns.reference) || undefined : undefined,
          unit: (unit || 'UN').toUpperCase(),
          quantity,
          laborUnitCost: 0,
          materialUnitCost: unitCost,
          unitCost,
          bdiPercentage: 0,
          totalCost: total ?? roundMoney(quantity * unitCost),
          includedInTotal: materialIncludedInTotal(name),
          sourceSheet: name,
          sourceRow: dataRow,
          sourceData: cellSource(sheet, dataRow, Object.values(columns).filter((value): value is number => Boolean(value))),
        });
      }
    }
  }
  return items;
}

function detectColumns(sheet: Sheet, row: number, start: number, end: number, descriptionColumn: number) {
  const columns: Record<string, number> = { description: descriptionColumn };
  for (let column = start; column <= end; column += 1) {
    const header = normalize(cellText(sheet, row, column));
    if (['ITEM'].includes(header)) columns.item = column;
    if (['CODIGO'].includes(header)) columns.code = column;
    if (header.includes('REFERENCIA')) columns.reference = column;
    if (['UNIDADE', 'UNID', 'UND'].includes(header)) columns.unit = column;
    if (header.includes('QUANTIDADE') || header === 'QTDE') columns.quantity = column;
    if (header.includes('CUSTO UNITARIO') || header.includes('VALOR UNITARIO')) columns.unitCost = column;
    if (header === 'TOTAL' || header.includes('CUSTO TOTAL') || header.includes('VALOR TOTAL')) columns.total = column;
  }
  return columns;
}

function findHeader(sheet: Sheet, required: string[]) {
  const dimensions = sheetDimensions(sheet);
  for (let row = 1; row <= Math.min(20, dimensions.rows); row += 1) {
    const columns = new Map<string, number>();
    for (let column = 1; column <= Math.min(40, dimensions.columns); column += 1) {
      const value = normalize(cellText(sheet, row, column));
      if (value.includes('DESCRICAO')) columns.set('DESCRICAO', column);
      if (value.includes('QUANTIDADE')) columns.set('QUANTIDADE', column);
    }
    if (required.every((key) => columns.has(key))) return { row, columns };
  }
  return undefined;
}

function nearestSectionTitle(sheet: Sheet, headerRow: number, start: number, end: number) {
  for (let row = headerRow - 1; row >= Math.max(1, headerRow - 4); row -= 1) {
    const value = sheetText(sheet, row, start, end);
    if (value && !/TRIBUNAL DE CONTAS|CUSTO COM|CUSTOS RELACIONADOS/.test(normalize(value))) return value;
  }
  return '';
}

function sheetDimensions(sheet: Sheet) {
  if (!sheet['!ref']) return { rows: 0, columns: 0 };
  const range = XLSX.utils.decode_range(sheet['!ref']);
  return { rows: range.e.r + 1, columns: range.e.c + 1 };
}

function cell(sheet: Sheet, row: number, column: number): Cell | undefined {
  return sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })] as Cell | undefined;
}

function cellText(sheet: Sheet, row: number, column: number) {
  const value = cell(sheet, row, column);
  if (!value) return '';
  if (typeof value.w === 'string' && value.w.trim()) return value.w.replace(/\s+/g, ' ').trim();
  return String(value.v ?? '').replace(/\s+/g, ' ').trim();
}

function cellNumber(sheet: Sheet, row: number, column: number) {
  const value = cell(sheet, row, column);
  if (!value) return undefined;
  if (typeof value.v === 'number' && Number.isFinite(value.v)) return value.v;
  return localizedNumber(String(value.v ?? value.w ?? ''));
}

function sheetText(sheet: Sheet, row: number, start: number, end: number) {
  const values: string[] = [];
  for (let column = start; column <= end; column += 1) {
    const value = cellText(sheet, row, column);
    if (value) values.push(value);
  }
  return values.join(' ');
}

function cellSource(sheet: Sheet, row: number, columns: number[]) {
  const cells: Record<string, unknown> = {};
  for (const column of [...new Set(columns)]) {
    const value = cell(sheet, row, column);
    if (!value) continue;
    cells[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })] = {
      value: value.v instanceof Date ? value.v.toISOString() : value.v,
      formatted: value.w,
      formula: value.f,
    };
  }
  return cells;
}

function localizedNumber(value: string) {
  const cleaned = value.replace(/R\$/gi, '').replace(/\s/g, '').replace(/%$/, '');
  if (!cleaned || cleaned === '-') return undefined;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,(?=\d{3}(?:\D|$))/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function materialIncludedInTotal(name: string) {
  return !/(UNIFORM|FERRAMENT|EPI)/i.test(normalize(name));
}
function materialRole(name: string) {
  if (/UNIFORM/i.test(normalize(name))) return 'UNIFORM';
  if (/FERRAMENT/i.test(normalize(name))) return 'TOOL';
  if (/EPI/i.test(normalize(name))) return 'PPE';
  return 'MATERIAL';
}
