'use client';

import Image from 'next/image';
import { ArrowRight, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { isContractDevelopmentHost } from '@/lib/product-config';
import { productionProgram } from '@/lib/program-navigation';

export function ContractManagementLink({ cardClassName, logoClassName, statusClassName }: { cardClassName?: string; logoClassName?: string; statusClassName?: string } = {}) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('Verificando disponibilidade…');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [production, setProduction] = useState(false);
  useEffect(() => {
    if (productionProgram(window.location.hostname)) {
      let active = true;
      void Promise.resolve().then(() => { if (active) { setProduction(true); setVisible(true); setMessage('Assinatura adicional para assinantes ativos do OrçaPro ou do Infra.'); } });
      return () => { active = false; };
    }
    if (!isContractDevelopmentHost(window.location.hostname)) return;
    let active = true;
    void Promise.resolve().then(() => { if (active) setVisible(true); });
    void apiFetch<{ enabled: boolean; databaseConfigured: boolean; entitled?: boolean }>('/contract-management/access')
      .then(access => {
        if (!active) return;
        setFailed(false);
        setMessage(!access.enabled || !access.databaseConfigured ? 'Módulo temporariamente indisponível.' : access.entitled === false ? 'Consulte sua assinatura para habilitar o acesso.' : 'Disponível para sua conta.');
      }).catch(() => { if (active) { setFailed(true); setMessage('Não foi possível consultar a disponibilidade. Você pode abrir o módulo ou tentar novamente.'); } });
    return () => { active = false; };
  }, [attempt]);
  if (!visible) return null;
  // Cross-product navigation loads the current release instead of retaining a stale prefetched page.
  const link = <a className={cardClassName ? 'btn btn-primary' : undefined} href={production ? 'https://www.orcaprogestaocontratual.com.br/gestao-contratual/' : '/gestao-contratual/'}>{!cardClassName && <FileSpreadsheet size={16} />}Acessar Gestão Contratual{cardClassName && <ArrowRight size={16} />}</a>;
  return cardClassName ? <article className={cardClassName}>
    <Image src="/orcapro-brand/logo.png" alt="OrçaPro Gestão Contratual" width={180} height={39} className={logoClassName} />
    <h2>OrçaPro Gestão Contratual</h2>
    <p>Analise planilhas de medições, aditivos e reajustes. Acompanhe descontos, eventos e pagamentos dos seus contratos.</p>
    <span className={statusClassName} role="status">{message}</span>
    {link}
    {failed && <button type="button" className="auth-link" onClick={() => { setMessage('Verificando disponibilidade…'); setAttempt(n => n + 1); }}><RefreshCw size={14} /> Verificar novamente</button>}
  </article> : link;
}
