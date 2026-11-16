export type ProductionProgram = 'ORCAPRO' | 'INFRA' | 'GESTAO';

export const productionPrograms = [
  { id: 'ORCAPRO', title: 'OrçaPro', href: 'https://sistema.orcaproobras.com.br/orcapro/', description: 'Prepare orçamentos de obras com o catálogo SINAPI e a referência de cada projeto.' },
  { id: 'INFRA', title: 'OrçaPro Infraestrutura', href: 'https://orcaproinfra.com.br/orcapro-infraestrutura/', description: 'Orçamentos e planejamento com SICRO, DMT, FIT, FIC, administração local, canteiro, mobilização e riscos.' },
  { id: 'GESTAO', title: 'OrçaPro Gestão Contratual', href: 'https://www.orcaprogestaocontratual.com.br/gestao-contratual/', description: 'Analise medições, aditivos e reajustes. Acompanhe descontos, eventos, pagamentos e o cronograma dos contratos.' },
] as const;

export function productionProgram(hostname: string): ProductionProgram | null {
  if (hostname === 'sistema.orcaproobras.com.br') return 'ORCAPRO';
  if (['orcaproinfra.com.br', 'www.orcaproinfra.com.br'].includes(hostname)) return 'INFRA';
  if (['orcaprogestaocontratual.com.br', 'www.orcaprogestaocontratual.com.br'].includes(hostname)) return 'GESTAO';
  return null;
}
