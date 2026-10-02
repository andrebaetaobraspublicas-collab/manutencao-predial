import { readFile } from 'node:fs/promises';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('Informe o arquivo JSON produzido por npm audit.');

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const counts = report.metadata?.vulnerabilities;
if ('error' in report || report.auditReportVersion !== 2 || !isRecord(report.vulnerabilities)
  || !isRecord(counts) || ['info', 'low', 'moderate', 'high', 'critical', 'total'].some(key => !Number.isInteger(counts[key]) || counts[key] < 0)) {
  throw new Error('Relatório npm audit inválido ou indisponível. A auditoria não pode ser considerada aprovada.');
}
const allowedUntil = new Date('2026-10-31T23:59:59.999Z');
const expectedAdvisory = 'GHSA-ggr8-5vv4-36mx';
const allowedChain = new Set(['deepmerge-ts', '@prisma/config', 'prisma']);

const vulnerabilities = Object.entries(report.vulnerabilities);
if (vulnerabilities.some(([, value]) => !isRecord(value) || !['info', 'low', 'moderate', 'high', 'critical'].includes(value.severity))
  || ['info', 'low', 'moderate', 'high', 'critical'].some(severity => vulnerabilities.filter(([, value]) => value.severity === severity).length !== counts[severity])) {
  throw new Error('Contadores npm audit divergentes do relatório de vulnerabilidades.');
}
const highOrCritical = vulnerabilities.filter(([, vulnerability]) =>
  vulnerability.severity === 'high' || vulnerability.severity === 'critical');

const isExpectedPrismaChain = ([name, vulnerability]) => {
  if (!allowedChain.has(name)) return false;
  const advisoryUrls = (vulnerability.via ?? [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => String(item.url ?? item.source ?? ''));
  if (name === 'deepmerge-ts') {
    return advisoryUrls.length > 0 && advisoryUrls.every((value) => value.includes(expectedAdvisory));
  }
  return advisoryUrls.length === 0
    && (vulnerability.via ?? []).every((item) => typeof item === 'string' && allowedChain.has(item));
};

const unexpected = highOrCritical.filter((entry) => !isExpectedPrismaChain(entry));
if (unexpected.length) {
  const names = unexpected.map(([name, vulnerability]) => `${name} (${vulnerability.severity})`).join(', ');
  throw new Error(`Auditoria encontrou vulnerabilidade alta/crítica fora da exceção controlada: ${names}.`);
}
if (highOrCritical.length && Date.now() > allowedUntil.getTime()) {
  throw new Error(`A exceção temporária do Prisma expirou em ${allowedUntil.toISOString()}. Atualize a dependência.`);
}

const metadata = counts;
console.log(
  `Auditoria validada: critical=${metadata.critical ?? 0}, high=${metadata.high ?? 0}, `
  + `moderate=${metadata.moderate ?? 0}, low=${metadata.low ?? 0}.`,
);
if (highOrCritical.length) {
  console.warn(
    `Risco aceito temporariamente até ${allowedUntil.toISOString().slice(0, 10)}: `
    + `${expectedAdvisory} em dependência transitiva de build do Prisma 7.9.1.`,
  );
}
