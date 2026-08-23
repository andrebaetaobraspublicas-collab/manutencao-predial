import * as XLSX from '@e965/xlsx';
import { ContractBudgetSourceFormat } from '../../generated/prisma/client';
import { parseContractBudgetFile } from './contract-budget-parser';

describe('parseContractBudgetFile', () => {
  it('preserva o manifesto e importa a totalização de uma planilha XLSB', async () => {
    const workbook = XLSX.utils.book_new();
    const summary = XLSX.utils.aoa_to_sheet<Array<string | number>>([]);
    XLSX.utils.sheet_add_aoa(summary, [['ANEXO II - ORÇAMENTO ESTIMATIVO - TOTALIZAÇÃO']], { origin: 'B2' });
    XLSX.utils.sheet_add_aoa(summary, [[
      '1.1', 'Serviço de apoio administrativo', 'MÊS', 2, '', '', 1500, '', 36000,
    ]], { origin: 'B6' });
    XLSX.utils.sheet_add_aoa(summary, [['VALOR ESTIMATIVO ANUAL DO CONTRATO', '', 36000]], { origin: 'B81' });
    XLSX.utils.book_append_sheet(workbook, summary, 'Totalização');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Memória auxiliar']]), 'Memória');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsb' }) as Buffer;

    const parsed = await parseContractBudgetFile(
      buffer,
      'Orçamento estimativo.xlsb',
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    );

    expect(parsed.format).toBe(ContractBudgetSourceFormat.XLSB);
    expect(parsed.sheets).toHaveLength(2);
    expect(parsed.sheets[0]).toEqual(expect.objectContaining({ name: 'Totalização', role: 'SUMMARY' }));
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toEqual(expect.objectContaining({
      code: '1.1',
      description: 'Serviço de apoio administrativo',
      totalCost: 36000,
    }));
    expect(parsed.sourceTotal).toBe(36000);
  });

  it('rejeita formatos que não sejam planilha ou PDF', async () => {
    await expect(parseContractBudgetFile(Buffer.from('texto'), 'orcamento.csv', 'text/csv'))
      .rejects.toThrow('Envie uma planilha');
  });
});
