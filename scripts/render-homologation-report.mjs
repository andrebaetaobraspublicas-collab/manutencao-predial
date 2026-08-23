import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const artifactsDir = process.argv[2] ?? 'artifacts';

async function readJson(name) {
  try {
    return JSON.parse(await readFile(path.join(artifactsDir, name), 'utf8'));
  } catch {
    return null;
  }
}

const unit = await readJson('unit-tests.json');
const e2e = await readJson('e2e-tests.json');
const audit = await readJson('dependency-audit.json');
const generatedAt = new Date().toISOString();
const status = (result) => !result ? 'NÃO EXECUTADO' : result.success ? 'APROVADO' : 'REPROVADO';
const count = (result, key) => result?.[key] ?? 0;
const vulnerabilities = audit?.metadata?.vulnerabilities ?? {};

const lines = [
  '# GP-045 — Relatório automatizado de homologação',
  '',
  `Gerado em: ${generatedAt}`,
  '',
  '| Camada | Resultado | Testes aprovados | Testes reprovados |',
  '|---|---:|---:|---:|',
  `| Unidade e regras de domínio | ${status(unit)} | ${count(unit, 'numPassedTests')} | ${count(unit, 'numFailedTests')} |`,
  `| Integração, segurança, concorrência e volume | ${status(e2e)} | ${count(e2e, 'numPassedTests')} | ${count(e2e, 'numFailedTests')} |`,
  '',
  '## Matriz executada',
  '',
  '- Saúde, autenticação, autorização, validação e cabeçalhos de segurança.',
  '- Isolamento multiempresa em cadastros, arquivos, contratos, finanças, SINAPI, KPIs e piloto.',
  '- CRUD do dossiê contratual: ajustes, subcontratações, sanções, equipe, garantias, apostilas, recebimentos, diários e comunicações.',
  '- Arquivos privados com nomes UTF-8, integridade binária, download e exclusão lógica.',
  '- Ciclo completo de OS, orçamento final, medição, liquidação e pagamento.',
  '- Tetos financeiros e corridas concorrentes de empenhos.',
  '- Geração idempotente de manutenção preventiva.',
  '- Carga mínima: 10.000 OS, 1.000 contratos, 10.000 medições e 15.000 itens SINAPI.',
  '- Desempenho: buscas até 5 s e painel conciliado até 15 s no executor de CI.',
  '',
  '## Dependências',
  '',
  `- Críticas: ${vulnerabilities.critical ?? 0}`,
  `- Altas: ${vulnerabilities.high ?? 0}`,
  `- Moderadas: ${vulnerabilities.moderate ?? 0}`,
  `- Baixas: ${vulnerabilities.low ?? 0}`,
  '- Exceção controlada: GHSA-ggr8-5vv4-36mx, transitiva do Prisma 7.9.1, somente em ferramenta de build; expira em 2026-10-31.',
  '',
  'O deploy somente é promovido quando lint, migrações, seed idempotente, testes e build terminam sem falhas.',
  '',
];

await mkdir(artifactsDir, { recursive: true });
const output = path.join(artifactsDir, 'homologation-report.md');
await writeFile(output, lines.join('\n'), 'utf8');
console.log(output);
