'use client';

import { BadgeCheck, Ban, CheckCircle2, ClipboardCheck, Download, FileCheck2, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, apiFileUrl, ApiError } from '@/lib/api';
import type { CurrentSession } from '@/lib/types';

type AutomaticStatus = 'PASSED' | 'PENDING' | 'MANUAL';
type DecisionOutcome = 'PASSED' | 'FAILED' | 'BLOCKED' | 'PENDING';
type Scenario = {
  code: string; title: string; category: string; description: string; href: string;
  automatic: { status: AutomaticStatus; message: string; metrics: Record<string, string | number | boolean> };
  decision: { outcome: DecisionOutcome; note: string; evidenceReference?: string | null; recordedAt: string; recordedBy?: { name: string } | null } | null;
};
type PilotOverview = {
  tenant: { name: string };
  environment: { name: string; stagingExcluded: boolean; notice: string };
  qualityGate: { release: string; status: 'PASSED'; evidence: string; coverage: string[] };
  summary: { status: string; canAccept: boolean; total: number; automaticPassed: number; automaticPending: number; manualOnly: number; decisionsPassed: number; progressPercentage: number };
  scenarios: Scenario[];
  acceptance: { outcome: 'APPROVED' | 'REJECTED'; note: string; recordedAt: string; recordedBy?: { name: string } | null } | null;
  generatedAt: string;
};

const OUTCOME_LABEL: Record<DecisionOutcome, string> = { PASSED: 'Homologado', FAILED: 'Reprovado', BLOCKED: 'Bloqueado', PENDING: 'Pendente' };
const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: 'Piloto em execução', BLOCKED: 'Piloto bloqueado', FAILED: 'Falhas de homologação',
  READY_FOR_ACCEPTANCE: 'Pronto para aceite final', APPROVED: 'Piloto aprovado', REJECTED: 'Piloto rejeitado',
  REGRESSION_DETECTED: 'Regressão após aceite',
};

export default function PilotPage() {
  const [overview, setOverview] = useState<PilotOverview | null>(null);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeCode, setActiveCode] = useState('');
  const [outcome, setOutcome] = useState<DecisionOutcome>('PASSED');
  const [note, setNote] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [acceptanceNote, setAcceptanceNote] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([apiFetch<PilotOverview>('/pilot/overview'), apiFetch<CurrentSession>('/auth/me')])
      .then(([pilot, current]) => {
        if (!active) return;
        setOverview(pilot); setSession(current);
        setActiveCode(pilot.scenarios[0]?.code || '');
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof ApiError ? cause.message : 'Não foi possível carregar o piloto.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const canWrite = Boolean(session && ['OWNER', 'ADMIN', 'MANAGER'].includes(session.role));
  const activeScenario = useMemo(() => overview?.scenarios.find((scenario) => scenario.code === activeCode) ?? null, [activeCode, overview]);

  function selectScenario(scenario: Scenario) {
    setActiveCode(scenario.code); setOutcome(scenario.decision?.outcome ?? 'PASSED');
    setNote(scenario.decision?.note ?? ''); setEvidenceReference(scenario.decision?.evidenceReference ?? '');
    setError(''); setSuccess('');
  }

  async function saveDecision(event: React.FormEvent) {
    event.preventDefault(); if (!activeScenario) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const updated = await apiFetch<PilotOverview>(`/pilot/scenarios/${activeScenario.code}/decision`, { method: 'POST', body: JSON.stringify({ outcome, note, evidenceReference: evidenceReference || undefined }) });
      setOverview(updated); setSuccess('Decisão registrada na trilha de auditoria. O histórico anterior foi preservado.');
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Não foi possível registrar a decisão.'); }
    finally { setBusy(false); }
  }

  async function acceptPilot(result: 'APPROVED' | 'REJECTED') {
    setBusy(true); setError(''); setSuccess('');
    try {
      const updated = await apiFetch<PilotOverview>('/pilot/acceptance', { method: 'POST', body: JSON.stringify({ outcome: result, note: acceptanceNote }) });
      setOverview(updated); setSuccess(result === 'APPROVED' ? 'Piloto aprovado formalmente.' : 'Rejeição final registrada.');
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Não foi possível registrar o aceite.'); }
    finally { setBusy(false); }
  }

  if (loading) return <LoadingPanel label="Consolidando evidências do piloto…" />;
  if (!overview) return <div className="page-container"><div className="notice error">{error || 'Piloto indisponível.'}</div></div>;

  return <div className="page-container">
    <header className="page-header"><div className="page-title"><h1>GP-044 — Piloto operacional e homologação</h1><p>Execução controlada, evidências automáticas e aceite humano no ambiente atual de testes.</p></div><div className="actions"><a className="btn btn-secondary" href={apiFileUrl('/pilot/exports/homologation.csv')}><Download size={16}/> CSV</a><a className="btn btn-secondary" href={apiFileUrl('/pilot/exports/homologation.pdf')} target="_blank" rel="noreferrer"><Download size={16}/> PDF</a></div></header>
    <div className="notice"><ShieldAlert size={17}/>{overview.environment.notice} O staging não integra este ciclo.</div>
    <div className="notice success"><CheckCircle2 size={17}/><strong>Gate automático {overview.qualityGate.release} aprovado.</strong> {overview.qualityGate.evidence}</div>
    {error ? <div className="notice error pilot-feedback">{error}</div> : null}{success ? <div className="notice success pilot-feedback">{success}</div> : null}
    <section className="pilot-summary-grid"><div className="card pilot-summary-main"><div><span className="badge info">{overview.summary.status}</span><h2>{STATUS_LABEL[overview.summary.status] ?? overview.summary.status}</h2><p>{overview.summary.decisionsPassed} de {overview.summary.total} cenários homologados.</p></div><strong>{overview.summary.progressPercentage}%</strong><div className="pilot-progress"><span style={{width:`${overview.summary.progressPercentage}%`}}/></div></div><PilotStat icon={<CheckCircle2 size={20}/>} value={overview.summary.automaticPassed} label="verificações automáticas aptas"/><PilotStat icon={<ClipboardCheck size={20}/>} value={overview.summary.manualOnly} label="cenários exclusivamente manuais"/><PilotStat icon={<Ban size={20}/>} value={overview.summary.automaticPending} label="pendências automáticas"/></section>
    <div className="pilot-layout"><section className="pilot-scenarios">{overview.scenarios.map((scenario) => <button className={`card pilot-scenario ${scenario.code===activeCode?'selected':''}`} type="button" key={scenario.code} onClick={()=>selectScenario(scenario)}><div className="pilot-scenario-head"><span className="badge info">{scenario.category}</span><span className={`badge ${scenario.automatic.status==='PASSED'?'success':scenario.automatic.status==='PENDING'?'warning':'info'}`}>{scenario.automatic.status==='PASSED'?'Automático apto':scenario.automatic.status==='PENDING'?'Automático pendente':'Validação manual'}</span></div><h3>{scenario.title}</h3><p>{scenario.description}</p><div className="pilot-decision-line">{scenario.decision?<><BadgeCheck size={15}/><strong>{OUTCOME_LABEL[scenario.decision.outcome]}</strong><span>{scenario.decision.recordedBy?.name ?? 'Responsável'} · {new Date(scenario.decision.recordedAt).toLocaleString('pt-BR')}</span></>:<><FileCheck2 size={15}/><span>Sem decisão registrada</span></>}</div></button>)}</section>
      <aside className="card pilot-review">{activeScenario ? <><div className="card-header"><div><h2>{activeScenario.title}</h2><p>{activeScenario.automatic.message}</p></div></div><div className="pilot-metrics">{Object.entries(activeScenario.automatic.metrics).map(([key,value])=><div key={key}><span>{key.replaceAll(/([A-Z])/g,' $1')}</span><strong>{String(value)}</strong></div>)}</div><a className="btn btn-ghost" href={activeScenario.href}>Abrir módulo relacionado</a>{canWrite ? <form className="pilot-review-form" onSubmit={saveDecision}><div className="field"><label htmlFor="pilotOutcome">Decisão</label><select id="pilotOutcome" className="select" value={outcome} onChange={(event)=>setOutcome(event.target.value as DecisionOutcome)}><option value="PASSED">Homologado</option><option value="PENDING">Pendente</option><option value="BLOCKED">Bloqueado</option><option value="FAILED">Reprovado</option></select></div><div className="field"><label htmlFor="pilotEvidence">Referência da evidência</label><input id="pilotEvidence" className="input" value={evidenceReference} onChange={(event)=>setEvidenceReference(event.target.value)} placeholder="OS, relatório, hash ou chamado" maxLength={300}/></div><div className="field"><label htmlFor="pilotNote">Parecer de homologação</label><textarea id="pilotNote" className="textarea" value={note} onChange={(event)=>setNote(event.target.value)} minLength={3} maxLength={2000} required/></div><button className="btn btn-primary" disabled={busy}><FileCheck2 size={16}/>{busy?'Registrando…':'Registrar decisão'}</button></form>:<div className="notice">Seu perfil possui acesso de consulta à homologação.</div>}</>:null}</aside></div>
    {canWrite ? <section className="card pilot-acceptance"><div><span className="badge success">Aceite final</span><h2>Encerramento formal do piloto</h2><p>A aprovação somente é aceita quando todos os cenários estão aptos e homologados.</p>{overview.acceptance?<small>Último registro: {overview.acceptance.outcome} por {overview.acceptance.recordedBy?.name ?? 'responsável'} em {new Date(overview.acceptance.recordedAt).toLocaleString('pt-BR')}.</small>:null}</div><div><textarea className="textarea" value={acceptanceNote} onChange={(event)=>setAcceptanceNote(event.target.value)} minLength={3} maxLength={2000} placeholder="Parecer final obrigatório"/><div className="actions"><button className="btn btn-secondary" disabled={busy||acceptanceNote.trim().length<3} onClick={()=>void acceptPilot('REJECTED')}>Rejeitar piloto</button><button className="btn btn-primary" disabled={busy||!overview.summary.canAccept||acceptanceNote.trim().length<3} onClick={()=>void acceptPilot('APPROVED')}><BadgeCheck size={16}/>Aprovar piloto</button></div></div></section>:null}
  </div>;
}

function PilotStat({icon,value,label}:{icon:React.ReactNode;value:number;label:string}){return <div className="card pilot-stat">{icon}<strong>{value}</strong><span>{label}</span></div>}
