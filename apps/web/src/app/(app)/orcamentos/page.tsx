'use client';

import { Calculator, Database, Plus, Send, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { StatusBadge } from '@/components/badge';
import { apiFetch, ApiError } from '@/lib/api';
import { BRL } from '@/lib/format';
import type { WorkOrder } from '@/lib/types';

type Stage = 'PLANNED' | 'APPROVED' | 'FINAL_EXECUTED';
type Catalog = { id:string; referenceMonth:string; state:string; version:string; itemCount:number; source:string; priceRegime:string; catalogKind:string };
type CatalogItem = { id:string; type:string; code:string; description:string; unit:string; unitCost:string };
type Budget = { id:string; stage:Stage; status:string; version:number; subtotal:string; bdiPercentage:string; total:string; workOrder:{id:string;number:string;title:string}; catalog?:Catalog|null; _count:{items:number;revisions:number} };
type Line = { catalogItemId?:string; code:string; description:string; unit:string; unitCost:string; quantity:string };

const STAGE_LABEL: Record<Stage,string> = { PLANNED:'Previsto', APPROVED:'Aprovado', FINAL_EXECUTED:'Final executado' };
const NEXT:Record<string,string[]> = { DRAFT:['SUBMITTED','CANCELED'], SUBMITTED:['APPROVED','REJECTED','CANCELED'], REJECTED:['DRAFT','CANCELED'] };
const emptyLine = ():Line => ({ code:'', description:'', unit:'UN', unitCost:'0', quantity:'1' });

export default function BudgetsPage() {
  const search = useSearchParams();
  const [budgets,setBudgets] = useState<Budget[]>([]); const [catalogs,setCatalogs] = useState<Catalog[]>([]);
  const [catalogItems,setCatalogItems] = useState<CatalogItem[]>([]); const [orders,setOrders] = useState<WorkOrder[]>([]);
  const [form,setForm] = useState({ workOrderId:'', stage:'PLANNED' as Stage, catalogId:'', bdiPercentage:'0', items:[] as Line[] });
  const [selectedItem,setSelectedItem] = useState('');
  const [importForm,setImport] = useState({ sourceType:'SINAPI', referenceMonth:new Date().toISOString().slice(0,7), state:'MG', version:'2026.04' });
  const [importFile,setImportFile] = useState<File|null>(null); const [importResult,setImportResult] = useState('');
  const [loading,setLoading] = useState(true); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const load = useCallback(() => Promise.all([
    apiFetch<Budget[]>('/budgets'), apiFetch<Catalog[]>('/budgets/sinapi/catalogs'), apiFetch<{items:WorkOrder[]}>('/work-orders?pageSize=100'),
  ]).then(([b,c,o]) => { setBudgets(b); setCatalogs(c); setOrders(o.items); setForm((value) => ({ ...value,
    workOrderId: search.get('workOrderId') || value.workOrderId || o.items[0]?.id || '', catalogId:value.catalogId || c[0]?.id || '' }));
  }).catch((cause:Error) => setError(cause.message)).finally(() => setLoading(false)), [search]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!form.catalogId) return;
    apiFetch<CatalogItem[]>(`/budgets/sinapi/catalogs/${form.catalogId}/items`).then(setCatalogItems).catch((cause:Error) => setError(cause.message));
  }, [form.catalogId]);

  const total = useMemo(() => form.items.reduce((sum,item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0),0) * (1 + Number(form.bdiPercentage || 0) / 100), [form.items,form.bdiPercentage]);
  function addCatalogItem() { const item = catalogItems.find((value) => value.id === selectedItem); if (!item) return;
    setForm((value) => ({ ...value, items:[...value.items,{ catalogItemId:item.id, code:item.code, description:item.description, unit:item.unit, unitCost:item.unitCost, quantity:'1' }] })); setSelectedItem(''); }
  function patchLine(index:number, patch:Partial<Line>) { setForm((value) => ({ ...value, items:value.items.map((line,i) => i === index ? { ...line,...patch } : line) })); }
  async function save(event:FormEvent) { event.preventDefault(); setBusy(true); setError(''); try {
    await apiFetch(`/budgets/work-orders/${form.workOrderId}?stage=${form.stage}`, { method:'PUT', body:JSON.stringify({
      catalogId:form.catalogId || undefined, referenceMonth:catalogs.find((item) => item.id === form.catalogId)?.referenceMonth,
      state:catalogs.find((item) => item.id === form.catalogId)?.state, bdiPercentage:Number(form.bdiPercentage),
      items:form.items.map((item) => item.catalogItemId ? { catalogItemId:item.catalogItemId, quantity:Number(item.quantity) }
        : { code:item.code, description:item.description, unit:item.unit, unitCost:Number(item.unitCost), quantity:Number(item.quantity) }),
    }) }); setForm((value) => ({ ...value, items:[] })); setLoading(true); await load();
  } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Falha ao salvar orçamento.'); } finally { setBusy(false); } }
  async function transition(budget:Budget,status:string) { let note:string|undefined; if (['REJECTED','CANCELED'].includes(status)) { note=window.prompt('Justificativa:')?.trim(); if (!note) return; }
    setBusy(true); try { await apiFetch(`/budgets/${budget.id}/transitions`, { method:'POST', body:JSON.stringify({ status,version:budget.version,note }) }); setLoading(true); await load(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Falha na transição.'); } finally { setBusy(false); } }
  async function importCatalog(event:FormEvent) { event.preventDefault(); if (!importFile) return; setBusy(true); setError(''); setImportResult(''); try {
    const body=new FormData(); body.set('file',importFile); body.set('sourceType',importForm.sourceType); body.set('state',importForm.state.toUpperCase()); body.set('version',importForm.version); if(importForm.sourceType==='CUSTOM') body.set('referenceMonth',importForm.referenceMonth);
    const result=await apiFetch<{totalItems:number;catalogs:unknown[]}>('/budgets/catalogs/import-file',{method:'POST',body}); setImportResult(`${result.totalItems.toLocaleString('pt-BR')} itens importados em ${result.catalogs.length} catálogo(s).`); setLoading(true); await load();
  } catch(cause) { setError(cause instanceof Error ? cause.message : 'Falha na importação.'); } finally { setBusy(false); } }

  return <div className="page-container"><header className="page-header"><div className="page-title"><h1>Orçamentos e SINAPI</h1><p>Cada OS possui orçamento previsto, aprovado e final executado; a medição utiliza o estágio final aprovado.</p></div></header>
    {error ? <div className="notice error" style={{marginBottom:18}}>{error}</div> : null}
    <div className="grid grid-2" style={{marginBottom:18}}><form className="card form-card" onSubmit={save}><div className="card-header"><div><h2>Compor orçamento da OS</h2><p>Use itens do catálogo ou acrescente serviços e insumos coletados pelo usuário.</p></div><Calculator size={19}/></div><div className="card-body"><div className="form-grid">
      <F c="col-6" l="Ordem de serviço"><select className="select" required value={form.workOrderId} onChange={(e)=>setForm({...form,workOrderId:e.target.value})}>{orders.map((item)=><option key={item.id} value={item.id}>{item.number} — {item.title}</option>)}</select></F>
      <F c="col-3" l="Estágio"><select className="select" value={form.stage} onChange={(e)=>setForm({...form,stage:e.target.value as Stage})}><option value="PLANNED">Previsto</option><option value="APPROVED">Aprovado</option><option value="FINAL_EXECUTED">Final executado</option></select></F>
      <F c="col-3" l="BDI (%)"><input className="input" type="number" min="0" step="0.01" value={form.bdiPercentage} onChange={(e)=>setForm({...form,bdiPercentage:e.target.value})}/></F>
      <F c="col-6" l="Catálogo"><select className="select" value={form.catalogId} onChange={(e)=>setForm({...form,catalogId:e.target.value})}><option value="">Sem catálogo</option>{catalogs.map((item)=><option key={item.id} value={item.id}>{item.source} {item.state} {item.referenceMonth} — {item.version}</option>)}</select></F>
      <F c="col-6" l="Serviço/insumo cadastrado"><div className="actions"><select className="select" value={selectedItem} onChange={(e)=>setSelectedItem(e.target.value)}><option value="">Selecione</option>{catalogItems.map((item)=><option key={item.id} value={item.id}>{item.code} — {item.description}</option>)}</select><button className="btn btn-secondary" type="button" disabled={!selectedItem} onClick={addCatalogItem}><Plus size={14}/>Incluir</button></div></F>
      <div className="field col-12"><label>Itens</label>{form.items.map((item,index)=><div className="form-grid" key={`${item.catalogItemId || 'free'}-${index}`} style={{marginBottom:10}}><F c="col-2" l="Código"><input className="input" disabled={Boolean(item.catalogItemId)} required value={item.code} onChange={(e)=>patchLine(index,{code:e.target.value})}/></F><F c="col-4" l="Descrição"><input className="input" disabled={Boolean(item.catalogItemId)} required value={item.description} onChange={(e)=>patchLine(index,{description:e.target.value})}/></F><F c="col-1" l="Unidade"><input className="input" disabled={Boolean(item.catalogItemId)} required value={item.unit} onChange={(e)=>patchLine(index,{unit:e.target.value})}/></F><F c="col-2" l="Custo unitário"><input className="input" type="number" min="0" step="0.000001" disabled={Boolean(item.catalogItemId)} value={item.unitCost} onChange={(e)=>patchLine(index,{unitCost:e.target.value})}/></F><F c="col-2" l="Quantidade"><input className="input" type="number" min="0.000001" step="0.000001" value={item.quantity} onChange={(e)=>patchLine(index,{quantity:e.target.value})}/></F><div className="field col-1"><label>&nbsp;</label><button className="btn btn-ghost" type="button" onClick={()=>setForm((value)=>({...value,items:value.items.filter((_,i)=>i!==index)}))}><Trash2 size={15}/></button></div></div>)}</div>
    </div><div className="actions"><button className="btn btn-secondary" type="button" onClick={()=>setForm((value)=>({...value,items:[...value.items,emptyLine()]}))}><Plus size={14}/>Item próprio</button><button className="btn btn-primary" disabled={busy || !form.items.length}>Salvar {BRL.format(total)}</button></div></div></form>
    <form className="card form-card" onSubmit={importCatalog}><div className="card-header"><div><h2>Importar catálogo XLSX</h2><p>SINAPI oficial ou tabela própria.</p></div><Database size={19}/></div><div className="card-body"><div className="form-grid"><F c="col-4" l="Origem"><select className="select" value={importForm.sourceType} onChange={(e)=>setImport({...importForm,sourceType:e.target.value})}><option value="SINAPI">SINAPI</option><option value="CUSTOM">Tabela própria</option></select></F><F c="col-2" l="UF"><input className="input" maxLength={2} value={importForm.state} onChange={(e)=>setImport({...importForm,state:e.target.value})}/></F><F c="col-3" l="Competência"><input className="input" type="month" disabled={importForm.sourceType==='SINAPI'} value={importForm.referenceMonth} onChange={(e)=>setImport({...importForm,referenceMonth:e.target.value})}/></F><F c="col-3" l="Versão"><input className="input" value={importForm.version} onChange={(e)=>setImport({...importForm,version:e.target.value})}/></F><F c="col-12" l="Arquivo"><input className="input" type="file" accept=".xlsx" onChange={(e)=>setImportFile(e.target.files?.[0]??null)}/></F></div>{importResult?<div className="notice success">{importResult}</div>:null}<div className="actions" style={{marginTop:16}}><button className="btn btn-primary" disabled={busy||!importFile}>Importar XLSX</button></div></div></form></div>
    {loading?<LoadingPanel/>:<section className="card table-card">{budgets.length?<div className="table-wrapper"><table className="data-table"><thead><tr><th>OS</th><th>Estágio</th><th>Status</th><th>Versão</th><th>Itens</th><th>Total</th><th>Ações</th></tr></thead><tbody>{budgets.map((budget)=><tr key={budget.id}><td><span className="table-primary">{budget.workOrder.number}</span><span className="table-secondary">{budget.workOrder.title}</span></td><td><span className="badge neutral">{STAGE_LABEL[budget.stage]}</span></td><td><StatusBadge value={budget.status}/></td><td>v{budget.version}</td><td>{budget._count.items}</td><td>{BRL.format(Number(budget.total))}</td><td><div className="actions">{(NEXT[budget.status]??[]).map((status)=><button key={status} type="button" className={status==='APPROVED'?'btn btn-primary':'btn btn-secondary'} disabled={busy} onClick={()=>void transition(budget,status)}><Send size={14}/>{status}</button>)}</div></td></tr>)}</tbody></table></div>:<EmptyState icon={Calculator} title="Nenhum orçamento" description="Componha o orçamento previsto da primeira OS."/>}</section>}
  </div>;
}

function F({c,l,children}:{c:string;l:string;children:React.ReactNode}) { return <div className={`field ${c}`}><label>{l}</label>{children}</div>; }
