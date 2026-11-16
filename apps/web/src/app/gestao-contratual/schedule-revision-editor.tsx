"use client";
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { date, formatNumber, money } from './sheet-math';
import { decimalInput } from './decimal-input';
import type { Detail, Row } from './contract-types';
import type { Plan } from './contract-planning';
import { DiscardChangesDialog } from './discard-changes-dialog';
import s from './contract.module.css';

type Line={itemId:string;status:string;start:string|null;end:string|null;teams:string|null};
type Proposal={effectiveDate:string;amendmentId:string;calendar:Row;lines:Line[];warnings:string[];notice:string};
type Preview={requestId:string;expectedVersion:number;previewHash:string;result:{number:number;end:string;baseValue:string;lines:Row[]}};
export function ScheduleRevisionEditor({plan,detail,onSaved,onCancel,onDirty,onBusy}:{plan:Plan;detail:Detail;onSaved:()=>Promise<void>;onCancel:()=>void;onDirty:(v:boolean)=>void;onBusy:(v:boolean)=>void}){
 const [day,setDay]=useState(plan.asOf),[title,setTitle]=useState(`Reprogramação ${Number(plan.revisions?.length||0)+1}`),[reason,setReason]=useState(''),[formal,setFormal]=useState(''),[proposal,setProposal]=useState<Proposal|null>(null),[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[onlyRemaining,setOnlyRemaining]=useState(false),[discard,setDiscard]=useState(false);
 const path=`/contract-management/contracts/${detail.contract.id}`;
 const change=()=>{setPreview(null);onDirty(true);};
 async function operation(task:()=>Promise<void>){setError('');setBusy(true);onBusy(true);try{await task();}catch(e){setError(e instanceof Error?e.message:'Não foi possível conferir a reprogramação.');}finally{setBusy(false);onBusy(false);}}
 const payload=()=>({title,reason,formalReference:formal,effectiveDate:proposal?.effectiveDate,amendmentId:proposal?.amendmentId,calendar:proposal?.calendar,lines:proposal?.lines.map(({itemId,start,end,teams})=>({itemId,start,end,teams:teams?decimalInput(teams):null}))});
 const generate=()=>operation(async()=>{const p=await apiFetch<Proposal>(`${path}/planning/proposal`,{method:'POST',body:JSON.stringify({expectedVersion:detail.contract.version,effectiveDate:day})});setProposal(p);change();});
 const review=()=>operation(async()=>{const p=await apiFetch<Preview>(`${path}/preview`,{method:'POST',body:JSON.stringify({kind:'schedule-revision',expectedVersion:detail.contract.version,requestId:crypto.randomUUID(),payload:payload()})});setPreview(p);});
 const save=()=>operation(async()=>{if(!preview)return;await apiFetch(`${path}/actions`,{method:'POST',body:JSON.stringify({kind:'schedule-revision',expectedVersion:preview.expectedVersion,requestId:preview.requestId,previewHash:preview.previewHash,payload:payload()})});onDirty(false);await onSaved();onCancel();});
 const edit=(itemId:string,key:'start'|'end'|'teams',v:string)=>{change();setProposal(p=>p?{...p,lines:p.lines.map(l=>l.itemId===itemId?{...l,[key]:v}:l)}:p);};
 const lines=proposal?.lines.filter(l=>{const r=plan.rows.find(r=>r.itemId===l.itemId);return (!onlyRemaining||l.status==='REMAINING'||l.status==='UNREPORTED')&&`${r?.number} ${r?.description} ${r?.code}`.toLowerCase().includes(query.toLowerCase());})||[];
 return <section className={s.sheetSection}>
  {discard&&<DiscardChangesDialog onCancel={()=>setDiscard(false)} onDiscard={onCancel}/>}
  <div className={s.sheetHeading}><h3>Reprogramar após aditivo</h3><button className={s.button} disabled={busy} onClick={()=>{if(proposal||reason||formal)setDiscard(true);else onCancel();}}>Fechar reprogramação</button></div>
  <p className={s.sheetHint}>A revisão preserva a linha de base original e as revisões anteriores. Datas dos serviços concluídos ficam protegidas. As datas editáveis se referem ao saldo após o corte, inclusive acréscimos e serviços novos.</p>
  {error&&<p role="alert" className={`${s.notice} ${s.error}`}>{error}</p>}
  <div className={s.metadata}><label>Título da revisão<input value={title} disabled={busy} onChange={e=>{setTitle(e.target.value);change();}}/></label><label>Data de corte da revisão<input type="date" value={day} disabled={busy||!!proposal} onInput={e=>{setDay(e.currentTarget.value);change();}} onChange={e=>{setDay(e.target.value);change();}}/></label><label>Referência formal<input value={formal} disabled={busy} placeholder="Aditivo e autorização de reprogramação" onChange={e=>{setFormal(e.target.value);change();}}/></label></div>
  {!proposal&&<div className={s.sheetTools}><button className={`${s.button} ${s.primary}`} disabled={busy||!day} onClick={()=>void generate()}>Gerar proposta para conferência</button></div>}
  {proposal&&<>
   <p className={s.sheetHint}>{proposal.notice} Aditivo: {String((detail.amendments||[]).find(a=>a.id===proposal.amendmentId)?.title||proposal.amendmentId)}.</p>
   {proposal.warnings.length>0&&<details className={s.panel}><summary>Orientações da proposta · {proposal.warnings.length}</summary>{proposal.warnings.map(x=><p key={x}>{x}</p>)}</details>}
   <div className={s.sheetTools}><label className={s.search}>Localizar na reprogramação<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Item, código ou descrição"/></label><label className={s.check}><input type="checkbox" checked={onlyRemaining} onChange={e=>setOnlyRemaining(e.target.checked)}/>Somente saldo a executar</label><span>{lines.length} de {proposal.lines.length} serviços</span></div>
   <div className={s.sheetViewport}><table className={`${s.table} ${s.spreadsheet}`} aria-label="Planilha de reprogramação"><thead><tr>{['Item','Serviço','Qtd. vigente','Executado','Fim original','Início do saldo / real','Fim reprogramado / real','Equipes','Situação'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{lines.map(l=>{const r=plan.rows.find(r=>r.itemId===l.itemId)!;const locked=busy||l.status!=='REMAINING';return <tr key={l.itemId}><td>{r.number}</td><td className={s.description}>{r.description}</td><td>{formatNumber(r.quantity,6)}</td><td>{r.executedPercent==null?'Sem apontamento':`${formatNumber(r.executedPercent)}%`}</td><td>{date(r.end)}</td>{(['start','end','teams'] as const).map(k=><td key={k}><input aria-label={`${k==='start'?'Início reprogramado':k==='end'?'Fim reprogramado':'Equipes reprogramadas'} ${r.number}`} type={k==='teams'?'text':'date'} value={l[k]||''} disabled={locked} onInput={e=>edit(l.itemId,k,e.currentTarget.value)} onChange={e=>edit(l.itemId,k,e.target.value)}/></td>)}<td>{l.status==='SUPPRESSED'?'Suprimido':l.status==='COMPLETE'?'Concluído · protegido':l.status==='UNREPORTED'?'Apontamento obrigatório':'Saldo a programar'}</td></tr>;})}</tbody></table></div>
   <div className={s.commitRibbon}><label>Justificativa da revisão<textarea disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);change();}}/></label><button className={s.button} disabled={busy||!reason.trim()||!formal.trim()||!title.trim()} onClick={()=>void review()}>Conferir reprogramação</button>
   {preview&&<><p role="status">Revisão {preview.result.number} conferida · {preview.result.lines.length} serviços · escopo {money(preview.result.baseValue)} · término {date(preview.result.end)}. A aprovação registra uma nova linha de base, sem alterar valores ou medições.</p><button className={`${s.button} ${s.primary}`} disabled={busy} onClick={()=>void save()}>Aprovar e registrar revisão</button></>}</div>
  </>}
 </section>;
}
